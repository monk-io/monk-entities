/**
 * GCP Compute Engine Snapshot Entity
 *
 * Takes a standard snapshot of a Persistent Disk. The snapshot is ready
 * once it is READY; a disk can then be restored from it with
 * gcp/compute-disk's `source_snapshot`.
 *
 * @see https://cloud.google.com/compute/docs/reference/rest/v1/snapshots
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
    SNAPSHOT_PRICE_PER_GIB_MONTH,
    HOURS_PER_MONTH,
} from "./compute-common.ts";

/**
 * Snapshot definition
 */
export interface ComputeSnapshotDefinition extends GcpEntityDefinition {
    /**
     * @description Snapshot name, unique in the project (1-63 chars: lowercase letters, digits, dashes; starts with a letter)
     */
    name: string;

    /**
     * @description Disk to snapshot: a name (in this project and `zone`), a
     * path (projects/P/zones/Z/disks/D) or a self-link.
     */
    source_disk: string;

    /**
     * @description Zone of the source disk; needed when source_disk is a bare name.
     */
    zone?: string;

    /**
     * @description Where the snapshot is stored: one region (europe-west1)
     * or multi-region (eu, us, asia). Defaults to the multi-region nearest
     * the disk.
     */
    storage_locations?: string[];

    /**
     * @description Labels to put on the snapshot. It also gets a monk-owner
     * label naming the Monk instance that created it.
     */
    labels?: Record<string, string>;
}

/**
 * Snapshot state
 */
export interface ComputeSnapshotState extends GcpEntityState {
    /** @description Snapshot name */
    name?: string;

    /** @description Numeric snapshot ID */
    id?: string;

    /** @description Full self-link of the snapshot, for compute-disk's source_snapshot */
    self_link?: string;

    /** @description CREATING, UPLOADING, READY, FAILED or DELETING */
    status?: string;

    /** @description Self-link of the disk the snapshot was taken of */
    source_disk?: string;

    /** @description Size in GB of the disk the snapshot was taken of */
    disk_size_gb?: number;

    /** @description Bytes the snapshot stores (what it is billed for) */
    storage_bytes?: number;

    /** @description Where the snapshot is stored */
    storage_locations?: string[];
}

/**
 * @description Takes a standard snapshot of a zonal Persistent Disk. Create
 * returns as soon as GCP accepts the request; the entity is ready when the
 * snapshot is READY. Restore it into a new disk with gcp/compute-disk
 * (`source_snapshot` set to this snapshot's `self_link` or name).
 * Deleting removes the snapshot and waits until it is gone; disks restored
 * from it are not affected. A snapshot that existed before the entity
 * created it is adopted and left in place on delete, unless
 * `force_ownership` is set.
 *
 * ## Required Permissions
 * - `compute.snapshots.create`, `compute.snapshots.get`, `compute.snapshots.delete`
 * - `compute.snapshots.setLabels` — labels on create
 * - `compute.disks.createSnapshot` on the source disk
 * - `compute.globalOperations.get` — operation status
 *
 * ## Secrets
 * - Reads: none (authenticated via gcp provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.self_link` - for gcp/compute-disk `source_snapshot`
 * - `state.name`, `state.status`, `state.disk_size_gb`, `state.storage_bytes`
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/compute-disk` - the disk to snapshot, and disks restored from it
 */
export class ComputeSnapshot extends GcpEntity<ComputeSnapshotDefinition, ComputeSnapshotState> {

    /** A snapshot of a large disk takes minutes: wait up to 30. */
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 180 };

    /** Deleting a snapshot takes up to a few minutes: wait up to 10. */
    static readonly deletion = { period: 10, attempts: 60 };

    protected getEntityName(): string {
        return `Snapshot ${this.definition.name}`;
    }

    private globalUrl(): string {
        return `${COMPUTE_API_URL}/projects/${this.projectId}/global`;
    }

    private snapshotUrl(): string {
        return `${this.globalUrl()}/snapshots/${this.definition.name}`;
    }

    private getSnapshot(): any | undefined {
        try {
            return this.request("GET", this.snapshotUrl());
        } catch (e) {
            if (hasStatus(e, 404)) return undefined;
            throw e;
        }
    }

    private getOperation(name: string): any | undefined {
        try {
            return this.request("GET", `${this.globalUrl()}/operations/${name}`);
        } catch (e) {
            if (hasStatus(e, 404)) return undefined;
            throw e;
        }
    }

    private populate(snap: any): void {
        this.state.name = snap.name;
        this.state.id = snap.id?.toString();
        this.state.self_link = snap.selfLink;
        this.state.status = snap.status;
        this.state.source_disk = snap.sourceDisk;
        this.state.disk_size_gb = snap.diskSizeGb !== undefined ? Number(snap.diskSizeGb) : undefined;
        this.state.storage_bytes = snap.storageBytes !== undefined ? Number(snap.storageBytes) : undefined;
        this.state.storage_locations = snap.storageLocations;
    }

    private sourceDiskUrl(): string {
        const d = this.definition;
        return computeUrl(d.source_disk, this.projectId, (n) => {
            if (!d.zone) throw new Error(`zone is required when source_disk is a bare name (${n})`);
            return `zones/${d.zone}/disks/${n}`;
        });
    }

    private insertSnapshot(): any {
        const d = this.definition;
        const body: any = {
            name: d.name,
            sourceDisk: this.sourceDiskUrl(),
            labels: { ...(d.labels ?? {}), [OWNER_LABEL]: ownerLabel(this.path) },
        };
        if (d.storage_locations && d.storage_locations.length > 0) body.storageLocations = d.storage_locations;
        cli.output(`Creating snapshot ${d.name} of disk ${lastSegment(d.source_disk)}`);
        try {
            return this.request("POST", `${this.globalUrl()}/snapshots`, body);
        } catch (e) {
            if (hasStatus(e, 404)) throw new Error(`source disk ${body.sourceDisk} does not exist`);
            throw e;
        }
    }

    override create(): void {
        const d = this.definition;
        const firstRun = this.state.existing === undefined;
        const { resource, adopted } = ensureCreated({
            find: () => this.getSnapshot(),
            create: () => this.insertSnapshot(),
            what: `snapshot ${d.name}`,
        });
        if (adopted) {
            if (resource.labels?.[OWNER_LABEL] === ownerLabel(this.path)) {
                this.state.existing = false;
            } else if (firstRun) {
                this.state.existing = !d.force_ownership;
                cli.output(d.force_ownership
                    ? `Snapshot ${d.name} already exists; reclaiming ownership (force_ownership=true)`
                    : `Snapshot ${d.name} already exists; adopting it (it is left in place on delete)`);
            }
            this.populate(resource);
            return;
        }
        this.state.existing = false;
        if (resource.kind === "compute#operation") {
            this.state.operation_name = resource.name;
            this.state.name = d.name;
            this.state.status = "CREATING";
            cli.output(`Snapshot ${d.name} is being created (operation ${resource.name})`);
        } else {
            this.populate(resource);
        }
    }

    override update(): void {
        // A snapshot is fixed once taken; only make sure it exists.
        const live = this.getSnapshot();
        if (!live) {
            this.create();
            return;
        }
        this.populate(live);
        cli.output(`Snapshot ${this.definition.name} exists; snapshots cannot change (delete and recreate to take a new one)`);
    }

    /**
     * Checks readiness a few times, 5 s apart, before saying not ready:
     * small snapshots are ready within seconds, and large ones are still
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
                cli.output(`Snapshot ${name}: operation is ${op.status}${op.progress ? ` (${op.progress}%)` : ""}`);
                return false;
            }
            const errs = operationErrors(op);
            if (errs) throw new Error(`snapshot ${name}: operation ${op.operationType ?? opName} failed: ${errs}`);
        }
        const live = this.getSnapshot();
        if (!live) {
            cli.output(`Snapshot ${name} not found yet`);
            return false;
        }
        this.populate(live);
        if (live.status === "FAILED") throw new Error(`snapshot ${name} failed`);
        if (live.status !== "READY") {
            cli.output(`Snapshot ${name} is ${live.status}`);
            return false;
        }
        cli.output(`Snapshot ${name} is READY`);
        return true;
    }

    private keeps(): boolean {
        return Boolean(this.state.existing) && !this.definition.force_ownership;
    }

    override delete(): void {
        const name = this.definition.name;
        if (this.keeps()) {
            cli.output(`Snapshot ${name} was not created by this entity; leaving it in place`);
            return;
        }
        let op: any;
        if (deleteIfExists(() => { op = this.request("DELETE", this.snapshotUrl()); })) {
            this.state.operation_name = op?.name;
            this.state.status = "DELETING";
            cli.output(`Deleting snapshot ${name}`);
        } else {
            cli.output(`Snapshot ${name} is already deleted`);
        }
    }

    override checkDeleted(): boolean {
        if (this.keeps()) return true;
        const name = this.definition.name;
        const live = this.getSnapshot();
        if (!live) return true;
        const opName = this.state.operation_name;
        if (opName && live.status !== "DELETING") {
            const op = this.getOperation(opName);
            const errs = operationErrors(op);
            if (op?.operationType === "delete" && operationDone(op) && errs) {
                throw new Error(`deleting snapshot ${name} failed: ${errs}`);
            }
        }
        cli.output(`Snapshot ${name} is ${live.status}`);
        return false;
    }

    // ==================== ACTIONS ====================

    /** Prints the snapshot as GCP describes it. */
    @action("get-info")
    getInfo(_args?: Args): void {
        const live = this.getSnapshot();
        if (!live) throw new Error(`snapshot ${this.definition.name} does not exist`);
        cli.output(JSON.stringify(live, null, 2));
    }

    // ==================== COSTS ====================

    /** Stored GiB: what the snapshot stores, or the disk size until GCP reports it. */
    private storedGib(): number {
        if (this.state.storage_bytes !== undefined && this.state.status === "READY") {
            return this.state.storage_bytes / (1024 * 1024 * 1024);
        }
        return this.state.disk_size_gb ?? 0;
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const gib = this.storedGib();
        const month = gib * SNAPSHOT_PRICE_PER_GIB_MONTH;
        cli.output(`Cost estimate for Snapshot ${this.definition.name}`);
        cli.output(`  Source disk: ${lastSegment(this.definition.source_disk)} (${this.state.disk_size_gb ?? "?"} GB)`);
        cli.output(`  Stored: ${gib.toFixed(3)} GiB`);
        cli.output(`  Storage: $${SNAPSHOT_PRICE_PER_GIB_MONTH.toFixed(3)}/GiB-month (list price, us-central1 / europe-west1)`);
        cli.output(`ESTIMATED MONTHLY COST: $${month.toFixed(2)} ($${(month / HOURS_PER_MONTH).toFixed(6)}/hour)`);
        cli.output(`Not included: network egress for cross-region storage, other regions' higher rates`);
    }

    @action("costs")
    costs(_args?: Args): void {
        const type = "gcp-compute-snapshot";
        if (!this.state.self_link && !this.state.operation_name) {
            cli.output(JSON.stringify({ type, costs: { month: { amount: "0", currency: "USD" } } }));
            return;
        }
        const month = this.storedGib() * SNAPSHOT_PRICE_PER_GIB_MONTH;
        cli.output(JSON.stringify({
            type,
            costs: {
                hour: { amount: (month / HOURS_PER_MONTH).toFixed(6), currency: "USD" },
                month: { amount: month.toFixed(2), currency: "USD" },
            },
        }));
    }
}
