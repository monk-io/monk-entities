import { type Args } from "monkec/base";
import {
    RunpodEntity,
    type RunpodEntityDefinition,
    type RunpodEntityState,
    action,
} from "./runpod-base.ts";
import { toApiBody, validateVolumeSize, HOURS_PER_MONTH, type VolumeType } from "./common.ts";
import cli from "cli";

/**
 * Definition interface for the RunPod Network Volume entity.
 * @see https://api.runpod.io/v2/openapi.json
 */
export interface RunpodNetworkVolumeDefinition extends RunpodEntityDefinition {
    /** @description Volume name. Used to adopt a pre-existing volume. */
    name: string;
    /** @description Volume size in GB (10–4096). Can be grown later, never shrunk. */
    size: number;
    /** @description Data center ID the volume lives in. Pods must run in this same data center to attach it. */
    data_center: string;
    /** @description Storage tier. Omit to use the data center's default tier. */
    volume_type?: VolumeType;
    /** @description When false, delete() refuses to destroy the volume and its data. Defaults to true. */
    allow_destructive_delete?: boolean;
}

/**
 * State interface for the RunPod Network Volume entity.
 */
export interface RunpodNetworkVolumeState extends RunpodEntityState {
    /** @description Volume ID assigned by RunPod */
    id?: string;
    /** @description Volume name */
    name?: string;
    /** @description Current size in GB */
    size?: number;
    /** @description Data center the volume resides in */
    data_center?: string;
    /** @description Active storage tier */
    volume_type?: string;
}

/**
 * @description RunPod network volume — persistent storage that survives pod termination and
 * can be mounted by pods in the same data center.
 *
 * ## Required Permissions
 * A RunPod API key with read/write access to the account. RunPod does not offer
 * scoped API keys, so the key grants full account access.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `runpod-api-token`)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.id` - Volume ID; pass to a pod's `network_volume_id` to mount it
 * - `state.data_center` - Data center ID; a consuming pod must pin the same value in
 *   `data_center_ids`, because volumes can only attach within their own data center
 *
 * ## Composing with Other Entities
 * Works with:
 * - `runpod/runpod-pod` - mount this volume by wiring `network_volume_id` to `state.id`
 *   and `data_center_ids` to `state.data_center`
 */
export class RunpodNetworkVolume extends RunpodEntity<
    RunpodNetworkVolumeDefinition,
    RunpodNetworkVolumeState
> {
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

    protected getEntityName(): string {
        return `RunPod network volume ${this.definition.name}`;
    }

    override create(): void {
        validateVolumeSize(this.definition.size);

        const existing = this.findByName("/network-volumes", this.definition.name);
        if (existing) {
            this.applyState(existing, true);
            cli.output(`📦 Adopted existing network volume ${existing.id} (${this.definition.name})`);
            return;
        }

        const body = toApiBody({
            name: this.definition.name,
            size: this.definition.size,
            data_center: this.definition.data_center,
            type: this.definition.volume_type,
        });

        const created = this.makeRequest("POST", "/network-volumes", body);
        this.applyState(created, false);
        cli.output(
            `✅ Created network volume ${this.state.id} — ${this.state.size} GB in ${this.state.data_center}`
        );
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        // PATCH accepts only name and size. Data center and tier are fixed at create time.
        if (this.definition.data_center !== this.state.data_center) {
            cli.output(
                `⚠️  Data center cannot be changed after creation ` +
                `(volume is in ${this.state.data_center}, definition says ${this.definition.data_center}). ` +
                `Recreate the volume to move it.`
            );
        }

        const currentSize = this.state.size ?? 0;
        const desiredSize = validateVolumeSize(this.definition.size);

        if (desiredSize < currentSize) {
            throw new Error(
                `RunPod network volumes cannot shrink: volume ${this.state.id} is ${currentSize} GB, ` +
                `definition requests ${desiredSize} GB. Raise the size or recreate the volume.`
            );
        }

        const body: Record<string, any> = {};
        if (this.definition.name !== this.state.name) body.name = this.definition.name;
        if (desiredSize > currentSize) body.size = desiredSize;

        if (Object.keys(body).length === 0) {
            cli.output("No mutable changes for network volume");
            return;
        }

        const updated = this.makeRequest("PATCH", `/network-volumes/${this.state.id}`, toApiBody(body));
        this.applyState(updated, this.state.existing);
        cli.output(`✅ Updated network volume ${this.state.id}`);
    }

    override delete(): void {
        if (!this.state.id) return;

        if (this.state.existing) {
            cli.output("Network volume pre-existed this entity; skipping delete");
            return;
        }

        if (this.definition.allow_destructive_delete === false) {
            throw new Error(
                `Network volume ${this.state.id} delete is disabled and it holds persistent data. ` +
                `Remove allow_destructive_delete: false to permit deletion.`
            );
        }

        this.deleteResource(`/network-volumes/${this.state.id}`, `network volume ${this.state.id}`);
    }

    override checkReadiness(): boolean {
        return Boolean(this.state.id);
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.id) {
            cli.output("Network volume not created yet");
            return;
        }
        const info = this.makeRequest("GET", `/network-volumes/${this.state.id}`);
        cli.output(JSON.stringify(info, null, 2));
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const sizeGb = this.state.size ?? this.definition.size;

        cli.output(`\n💰 Cost Estimate — RunPod Network Volume: ${this.definition.name}`);
        cli.output("=".repeat(60));
        cli.output(`\n📊 Configuration:`);
        cli.output(`   Volume ID:   ${this.state.id || "not created"}`);
        cli.output(`   Size:        ${sizeGb} GB`);
        cli.output(`   Data center: ${this.state.data_center || this.definition.data_center}`);
        cli.output(`   Tier:        ${this.state.volume_type || this.definition.volume_type || "data center default"}`);

        const observed = this.observedMonthlyCost();

        cli.output(`\n💵 Pricing:`);
        if (observed === null) {
            cli.output(`   RunPod does not expose a storage rate through the API — neither the`);
            cli.output(`   network volume resource nor GET /v2/catalog/datacenters returns a price.`);
            cli.output(`   Cost is derived from billing history instead, and this volume has none yet.`);
            cli.output(`\n📈 Estimated Monthly Cost: unavailable until billing history accrues`);
        } else {
            const perGb = sizeGb > 0 ? observed / sizeGb : 0;
            cli.output(`   Source: GET /v2/billing/network-volumes (trailing 30 days, daily buckets)`);
            cli.output(`   Implied rate: $${perGb.toFixed(4)}/GB/month`);
            cli.output(`\n📈 Estimated Monthly Cost: $${observed.toFixed(2)}`);
        }

        cli.output(`\n📝 Not included:`);
        cli.output(`   • Pod compute — see the runpod-pod entity's cost actions`);
        cli.output(`   • Network egress and any account-level credits or discounts`);
    }

    @action("costs")
    costs(): void {
        if (!this.state.id) {
            this.emitCosts("runpod-network-volume", "0");
            return;
        }

        const observed = this.observedMonthlyCost();
        if (observed === null) {
            this.emitCosts(
                "runpod-network-volume",
                "0",
                "RunPod exposes no storage rate via API; billing history not yet available for this volume"
            );
            return;
        }

        this.emitCosts("runpod-network-volume", observed.toFixed(2));
    }

    /**
     * Derive a monthly cost from trailing billing history.
     *
     * Shared by both cost actions so the human-readable and JSON outputs cannot drift.
     * Returns null when no history exists — which is the normal state for a volume that
     * was just created.
     */
    private observedMonthlyCost(): number | null {
        if (!this.state.id) return null;

        const billing = this.billingHistory("network-volumes", 30);
        const total = this.sumBillingRecords(billing, "networkVolumeId", this.state.id);
        if (total === null || total <= 0) return null;

        // Divide by distinct daily buckets, not record count — the response holds one record
        // per volume per bucket, so record count scales with how many volumes the account has.
        const buckets = this.countBillingBuckets(billing, "networkVolumeId", this.state.id);
        if (buckets === 0) return null;

        const perDay = total / buckets;
        return perDay * (HOURS_PER_MONTH / 24);
    }

    private applyState(volume: any, existing?: boolean): void {
        this.state.id = volume?.id ?? this.state.id;
        this.state.name = volume?.name ?? this.definition.name;
        this.state.size = volume?.size ?? this.definition.size;
        this.state.data_center = volume?.dataCenter ?? this.definition.data_center;
        this.state.volume_type = volume?.type ?? this.state.volume_type;
        this.state.existing = existing;
    }
}
