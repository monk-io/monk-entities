/**
 * GCP Compute Engine Persistent Disk Entity
 *
 * Creates a zonal Persistent Disk: blank, cloned from another disk, or
 * restored from a snapshot. The disk is ready once it is READY, which for a
 * clone of a large disk takes some minutes.
 *
 * @see https://cloud.google.com/compute/docs/reference/rest/v1/disks
 */

import { action, Args } from "monkec/base";
import { ensureCreated, deleteIfExists } from "monkec/resilience";
import cli from "cli";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import { COMPUTE_API_URL } from "./common.ts";
import {
    OWNER_LABEL,
    ownerLabel,
    lastSegment,
    computeUrl,
    operationDone,
    operationErrors,
    hasStatus,
    DISK_PRICE_PER_GIB_MONTH,
    HOURS_PER_MONTH,
} from "./compute-common.ts";

/**
 * Persistent Disk definition
 */
export interface ComputeDiskDefinition extends GcpEntityDefinition {
    /**
     * @description Disk name, unique in the zone (1-63 chars: lowercase letters, digits, dashes; starts with a letter)
     */
    name: string;

    /**
     * @description Zone the disk lives in, e.g. europe-west1-b. A source disk must be in the same zone.
     */
    zone: string;

    /**
     * @description Disk to clone: a name (in this project and zone), a path
     * (projects/P/zones/Z/disks/D) or a self-link. Mutually exclusive with
     * source_snapshot. Leave both unset for a blank disk.
     */
    source_disk?: string;

    /**
     * @description Snapshot to restore: a name (in this project), a path
     * (projects/P/global/snapshots/S) or a self-link. Mutually exclusive with
     * source_disk.
     */
    source_snapshot?: string;

    /**
     * @description Disk type, e.g. pd-standard, pd-balanced, pd-ssd, hyperdisk-balanced.
     * Defaults to the source disk's type when cloning, and to GCP's default (pd-standard) otherwise.
     */
    disk_type?: string;

    /**
     * @description Size in GB. Defaults to the source's size when cloning or
     * restoring; must not be smaller than it. Required for a blank disk.
     * Raising it later resizes the disk; disks cannot shrink.
     * @minimum 1
     */
    size_gb?: number;

    /**
     * @description Labels to put on the disk. The disk also gets a
     * monk-owner label naming the Monk instance that created it.
     */
    labels?: Record<string, string>;
}

/**
 * Persistent Disk state
 */
export interface ComputeDiskState extends GcpEntityState {
    /** @description Disk name */
    name?: string;

    /** @description Numeric disk ID */
    id?: string;

    /** @description Full self-link of the disk */
    self_link?: string;

    /** @description Zone of the disk */
    zone?: string;

    /** @description Size in GB */
    size_gb?: number;

    /** @description Disk type (short name, e.g. pd-standard) */
    disk_type?: string;

    /** @description CREATING, RESTORING, READY, FAILED or DELETING */
    status?: string;

    /** @description Self-link of the disk this one was cloned from, if any */
    source_disk?: string;

    /** @description Self-link of the snapshot this disk was restored from, if any */
    source_snapshot?: string;

    /** @description Instances the disk is attached to (self-links) */
    users?: string[];
}

/**
 * @description Manages a zonal Compute Engine Persistent Disk: a blank disk,
 * a clone of another disk in the same zone, or a disk restored from a
 * snapshot. Create returns as soon as GCP accepts the request; the entity is
 * ready when the disk is READY (a clone of a large disk takes minutes).
 * A runnable can then name the disk in its `volumes:` block: Monk finds the
 * disk by name, mounts it as it is, and formats only a disk with no
 * filesystem, so cloned data is kept.
 *
 * Deleting removes the disk and waits until it is gone. A disk still
 * attached to an instance is not deleted: the error names the instances.
 * A disk that existed before the entity created it is adopted and left in
 * place on delete, unless `force_ownership` is set.
 *
 * ## Required Permissions
 * - `compute.disks.create`, `compute.disks.get`, `compute.disks.delete`
 * - `compute.disks.resize`, `compute.disks.setLabels` — update
 * - `compute.disks.useReadOnly` on the source disk — cloning
 * - `compute.snapshots.get`, `compute.snapshots.useReadOnly` — restoring
 * - `compute.disks.createSnapshot`, `compute.snapshots.create` — `snapshot` action
 * - `compute.zoneOperations.get` — operation status
 *
 * ## Secrets
 * - Reads: none (authenticated via gcp provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name` - disk name, for a runnable's `volumes:` block
 * - `state.self_link` - full disk URL
 * - `state.zone`, `state.size_gb`, `state.disk_type`, `state.status`
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/compute-snapshot` - restore a disk from a snapshot (`source_snapshot`)
 * - `gcp/service-usage` - enable compute.googleapis.com
 */
export class ComputeDisk extends GcpEntity<ComputeDiskDefinition, ComputeDiskState> {

    /** Cloning or restoring a large disk takes minutes: wait up to 30. */
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 180 };

    /** Deleting a disk takes seconds to a minute or two: wait up to 10. */
    static readonly deletion = { period: 10, attempts: 60 };

    protected getEntityName(): string {
        return `Persistent Disk ${this.definition.name}`;
    }

    private zoneUrl(): string {
        return `${COMPUTE_API_URL}/projects/${this.projectId}/zones/${this.definition.zone}`;
    }

    private diskUrl(): string {
        return `${this.zoneUrl()}/disks/${this.definition.name}`;
    }

    /** The disk, or nothing if it doesn't exist. */
    private getDisk(): any | undefined {
        try {
            return this.request("GET", this.diskUrl());
        } catch (e) {
            if (hasStatus(e, 404)) return undefined;
            throw e;
        }
    }

    /** The zone operation name, or nothing if GCP no longer has it. */
    private getOperation(name: string): any | undefined {
        try {
            return this.request("GET", `${this.zoneUrl()}/operations/${name}`);
        } catch (e) {
            if (hasStatus(e, 404)) return undefined;
            throw e;
        }
    }

    private populate(disk: any): void {
        this.state.name = disk.name;
        this.state.id = disk.id?.toString();
        this.state.self_link = disk.selfLink;
        this.state.zone = lastSegment(disk.zone);
        this.state.size_gb = disk.sizeGb !== undefined ? Number(disk.sizeGb) : undefined;
        this.state.disk_type = lastSegment(disk.type);
        this.state.status = disk.status;
        this.state.source_disk = disk.sourceDisk;
        this.state.source_snapshot = disk.sourceSnapshot;
        this.state.users = disk.users ?? [];
    }

    private desiredLabels(): Record<string, string> {
        return { ...(this.definition.labels ?? {}), [OWNER_LABEL]: ownerLabel(this.path) };
    }

    private validate(): void {
        const d = this.definition;
        if (d.source_disk && d.source_snapshot) {
            throw new Error("set source_disk or source_snapshot, not both");
        }
        if (!d.source_disk && !d.source_snapshot && d.size_gb === undefined) {
            throw new Error("size_gb is required for a blank disk (one with no source_disk or source_snapshot)");
        }
    }

    /** Reads a source disk or snapshot, saying clearly if it is missing. */
    private getSource(what: string, url: string): any {
        try {
            return this.request("GET", url);
        } catch (e) {
            if (hasStatus(e, 404)) throw new Error(`${what} ${url} does not exist`);
            throw e;
        }
    }

    /** Sends the insert request; returns the operation. */
    private insertDisk(): any {
        const d = this.definition;
        const body: any = { name: d.name, labels: this.desiredLabels() };
        let sourceSize: number | undefined;
        let sourceType: string | undefined;
        let sourceName = "";

        if (d.source_disk) {
            const url = computeUrl(d.source_disk, this.projectId, (n) => `zones/${d.zone}/disks/${n}`);
            const src = this.getSource("source disk", url);
            body.sourceDisk = src.selfLink ?? url;
            sourceSize = Number(src.sizeGb);
            sourceType = lastSegment(src.type);
            sourceName = `disk ${src.name}`;
        } else if (d.source_snapshot) {
            const url = computeUrl(d.source_snapshot, this.projectId, (n) => `global/snapshots/${n}`);
            const snap = this.getSource("source snapshot", url);
            if (snap.status && snap.status !== "READY") {
                throw new Error(`source snapshot ${snap.name} is ${snap.status}, not READY yet`);
            }
            body.sourceSnapshot = snap.selfLink ?? url;
            sourceSize = Number(snap.diskSizeGb);
            sourceName = `snapshot ${snap.name}`;
        }

        const size = d.size_gb ?? sourceSize;
        if (size !== undefined && sourceSize !== undefined && !isNaN(sourceSize) && size < sourceSize) {
            throw new Error(`size_gb ${size} is smaller than the source ${sourceName} (${sourceSize} GB)`);
        }
        if (size !== undefined && !isNaN(size)) body.sizeGb = String(size);

        const diskType = d.disk_type ? lastSegment(d.disk_type) : sourceType;
        if (diskType) body.type = `projects/${this.projectId}/zones/${d.zone}/diskTypes/${diskType}`;

        cli.output(`Creating disk ${d.name} in ${d.zone}${sourceName ? ` from ${sourceName}` : ""} (${body.sizeGb ?? "default"} GB, ${diskType ?? "default type"})`);
        return this.request("POST", `${this.zoneUrl()}/disks`, body);
    }

    /**
     * Decides who owns a disk create() found: this instance if the disk
     * carries its owner label, otherwise someone else unless
     * force_ownership. Ownership is decided once; later runs keep it.
     */
    private claim(disk: any, firstRun: boolean): void {
        const name = this.definition.name;
        if (disk.labels?.[OWNER_LABEL] === ownerLabel(this.path)) {
            if (this.state.existing !== false) cli.output(`Disk ${name} was created by this entity earlier`);
            this.state.existing = false;
        } else if (firstRun) {
            if (this.definition.force_ownership) {
                cli.output(`Disk ${name} already exists; reclaiming ownership (force_ownership=true)`);
                this.state.existing = false;
            } else {
                cli.output(`Disk ${name} already exists; adopting it (it is left in place on delete)`);
                this.state.existing = true;
            }
        }
    }

    override create(): void {
        this.validate();
        const firstRun = this.state.existing === undefined;
        const { resource, adopted } = ensureCreated({
            find: () => this.getDisk(),
            create: () => this.insertDisk(),
            what: `disk ${this.definition.name}`,
        });
        if (adopted) {
            this.claim(resource, firstRun);
            this.populate(resource);
            return;
        }
        this.state.existing = false;
        if (resource.kind === "compute#operation") {
            // Created: the operation runs on; readiness follows it.
            this.state.operation_name = resource.name;
            this.state.name = this.definition.name;
            this.state.zone = this.definition.zone;
            this.state.status = "CREATING";
            cli.output(`Disk ${this.definition.name} is being created (operation ${resource.name})`);
        } else {
            // The create failed midway but the disk was made.
            this.populate(resource);
        }
    }

    override update(): void {
        const live = this.getDisk();
        if (!live) {
            this.create();
            return;
        }
        this.populate(live);
        const d = this.definition;
        if (this.state.existing && !d.force_ownership) {
            cli.output(`Disk ${d.name} was not created by this entity; leaving it as it is`);
            return;
        }
        if (d.disk_type && lastSegment(d.disk_type) !== this.state.disk_type) {
            cli.output(`Disk ${d.name} is ${this.state.disk_type}; its type cannot change in place (recreate the disk to change it)`);
        }

        const current = Number(live.sizeGb);
        if (d.size_gb !== undefined && d.size_gb !== current) {
            if (d.size_gb < current) {
                throw new Error(`disk ${d.name} is ${current} GB; disks cannot shrink to ${d.size_gb} GB`);
            }
            cli.output(`Resizing disk ${d.name} from ${current} GB to ${d.size_gb} GB`);
            const op = this.request("POST", `${this.diskUrl()}/resize`, { sizeGb: String(d.size_gb) });
            this.state.operation_name = op.name;
            this.state.size_gb = d.size_gb;
        }

        const want = this.desiredLabels();
        const have: Record<string, string> = live.labels ?? {};
        const same = Object.keys(want).length === Object.keys(have).length &&
            Object.keys(want).every((k) => have[k] === want[k]);
        if (!same) {
            cli.output(`Setting labels on disk ${d.name}`);
            const op = this.request("POST", `${this.diskUrl()}/setLabels`, {
                labels: want,
                labelFingerprint: live.labelFingerprint,
            });
            this.state.operation_name = op.name;
        }
    }

    /**
     * Checks readiness a few times, 5 s apart, before saying not ready:
     * small disks are ready within seconds, and large ones are still
     * followed every readiness period.
     */
    override checkReadiness(): boolean {
        for (let i = 0; ; i++) {
            if (this.readyOnce()) return true;
            if (i >= 4) return false;
            sleep(5000);
        }
    }

    private readyOnce(): boolean {
        const name = this.definition.name;
        const opName = this.state.operation_name;
        if (opName) {
            const op = this.getOperation(opName);
            if (op && !operationDone(op)) {
                cli.output(`Disk ${name}: operation ${op.operationType ?? ""} is ${op.status}${op.progress ? ` (${op.progress}%)` : ""}`);
                return false;
            }
            const errs = operationErrors(op);
            if (errs) throw new Error(`disk ${name}: operation ${op.operationType ?? opName} failed: ${errs}`);
        }
        const live = this.getDisk();
        if (!live) {
            cli.output(`Disk ${name} not found yet`);
            return false;
        }
        this.populate(live);
        if (live.status === "FAILED") throw new Error(`disk ${name} failed to create`);
        if (live.status !== "READY") {
            cli.output(`Disk ${name} is ${live.status}`);
            return false;
        }
        cli.output(`Disk ${name} is READY (${this.state.size_gb} GB ${this.state.disk_type})`);
        return true;
    }

    override checkLiveness(): boolean {
        const live = this.getDisk();
        if (!live) throw new Error(`disk ${this.definition.name} does not exist`);
        return live.status === "READY";
    }

    /** Whether delete leaves the disk in place. */
    private keeps(): boolean {
        return Boolean(this.state.existing) && !this.definition.force_ownership;
    }

    override delete(): void {
        const name = this.definition.name;
        if (this.keeps()) {
            cli.output(`Disk ${name} was not created by this entity; leaving it in place`);
            return;
        }
        const live = this.getDisk();
        if (!live) {
            cli.output(`Disk ${name} is already deleted`);
            return;
        }
        const users: string[] = live.users ?? [];
        if (users.length > 0) {
            throw new Error(`disk ${name} is attached to ${users.map((u) => lastSegment(u)).join(", ")}; ` +
                `detach it (stop what mounts it) before deleting the disk`);
        }
        if (live.status === "DELETING") {
            cli.output(`Disk ${name} is being deleted`);
            return;
        }
        let op: any;
        if (deleteIfExists(() => { op = this.request("DELETE", this.diskUrl()); })) {
            this.state.operation_name = op?.name;
            this.state.status = "DELETING";
            cli.output(`Deleting disk ${name}`);
        } else {
            cli.output(`Disk ${name} is already deleted`);
        }
    }

    override checkDeleted(): boolean {
        if (this.keeps()) return true;
        const name = this.definition.name;
        const live = this.getDisk();
        if (!live) return true;
        const opName = this.state.operation_name;
        if (opName && live.status !== "DELETING") {
            const op = this.getOperation(opName);
            const errs = operationErrors(op);
            if (op?.operationType === "delete" && operationDone(op) && errs) {
                throw new Error(`deleting disk ${name} failed: ${errs}`);
            }
        }
        cli.output(`Disk ${name} is ${live.status}`);
        return false;
    }

    // ==================== ACTIONS ====================

    /** Prints the disk as GCP describes it. */
    @action("get-info")
    getInfo(_args?: Args): void {
        const live = this.getDisk();
        if (!live) throw new Error(`disk ${this.definition.name} does not exist`);
        cli.output(JSON.stringify(live, null, 2));
    }

    /**
     * Starts a snapshot of the disk. Args: `name` (default: the disk's name
     * and the current time), `storage_location` (optional, e.g. europe-west1
     * or eu). The snapshot is not managed by Monk: delete it yourself, or
     * use gcp/compute-snapshot for one Monk deletes.
     */
    @action("snapshot")
    snapshot(args?: Args): void {
        const d = this.definition;
        const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
        const name = args?.name || `${d.name}-${stamp}`.slice(0, 63);
        const body: any = { name };
        if (args?.storage_location) body.storageLocations = [args.storage_location];
        const op = this.request("POST", `${this.diskUrl()}/createSnapshot`, body);
        cli.output(`Snapshot ${name} of disk ${d.name} started (operation ${op.name}); ` +
            `it is usable once \`gcloud compute snapshots describe ${name}\` shows READY`);
    }

    // ==================== COSTS ====================

    private monthlyCost(): { size: number; diskType: string; rate?: number; month?: number } {
        const size = this.state.size_gb ?? this.definition.size_gb ?? 0;
        const diskType = this.state.disk_type ?? (this.definition.disk_type ? lastSegment(this.definition.disk_type)! : "pd-standard");
        const rate = DISK_PRICE_PER_GIB_MONTH[diskType];
        return { size, diskType, rate, month: rate === undefined ? undefined : size * rate };
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const { size, diskType, rate, month } = this.monthlyCost();
        cli.output(`Cost estimate for Persistent Disk ${this.definition.name}`);
        cli.output(`  Zone: ${this.definition.zone}`);
        cli.output(`  Type: ${diskType}`);
        cli.output(`  Size: ${size} GB`);
        if (rate === undefined || month === undefined) {
            cli.output(`  No list price known for disk type ${diskType}`);
            return;
        }
        cli.output(`  Capacity: $${rate.toFixed(3)}/GB-month (list price, us-central1 / europe-west1)`);
        cli.output(`ESTIMATED MONTHLY COST: $${month.toFixed(2)} ($${(month / HOURS_PER_MONTH).toFixed(6)}/hour)`);
        cli.output(`Not included: provisioned IOPS/throughput (pd-extreme, hyperdisk), snapshots, other regions' higher rates`);
    }

    @action("costs")
    costs(_args?: Args): void {
        const type = "gcp-compute-disk";
        if (!this.state.self_link && !this.state.operation_name) {
            cli.output(JSON.stringify({ type, costs: { month: { amount: "0", currency: "USD" } } }));
            return;
        }
        const { diskType, month } = this.monthlyCost();
        if (month === undefined) {
            cli.output(JSON.stringify({
                type,
                costs: { month: { amount: "0", currency: "USD", error: `no list price known for disk type ${diskType}` } },
            }));
            return;
        }
        cli.output(JSON.stringify({
            type,
            costs: {
                hour: { amount: (month / HOURS_PER_MONTH).toFixed(6), currency: "USD" },
                month: { amount: month.toFixed(2), currency: "USD" },
            },
        }));
    }
}
