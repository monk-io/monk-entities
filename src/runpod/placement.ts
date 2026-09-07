import { type Args } from "monkec/base";
import {
    RunpodEntity,
    type RunpodEntityDefinition,
    type RunpodEntityState,
    action,
} from "./runpod-base.ts";
import { rankByAvailability, type CatalogAvailability, type VolumeType } from "./common.ts";
import cli from "cli";

/**
 * Definition interface for the RunPod Placement entity.
 * @see https://api.runpod.io/v2/openapi.json
 */
export interface RunpodPlacementDefinition extends RunpodEntityDefinition {
    /** @description GPU catalog ID to resolve placement for, e.g. `NVIDIA GeForce RTX 4090`. Exactly one of gpu_type_id/cpu_flavor_id is required. */
    gpu_type_id?: string;
    /** @description CPU flavor ID to resolve placement for, e.g. `cpu3c`. Exactly one of gpu_type_id/cpu_flavor_id is required. */
    cpu_flavor_id?: string;
    /** @description Availability product context. Defaults to POD. */
    product?: "POD" | "CLUSTER" | "SERVERLESS";
    /** @description Cloud tier for the availability query. Omitted lets the API default to SECURE. Ignored for CPU (not accepted by the CPU availability filter). */
    cloud?: "SECURE" | "COMMUNITY";
    /** @description GPU count for the availability query. Omitted lets the API default to 1. Ignored for CPU. */
    count?: number;
    /** @description When set, only datacenters supporting this network volume tier are considered — set this whenever the resolved datacenter will host a network volume. */
    volume_type?: VolumeType;
    /** @description Optional allow-list. When set, only these datacenters are considered — still ranked by live availability, never assumed available. */
    candidate_data_center_ids?: string[];
}

/**
 * State interface for the RunPod Placement entity.
 */
export interface RunpodPlacementState extends RunpodEntityState {
    /** @description Resolved datacenter ID. Wire runpod-network-volume's data_center and runpod-pod's data_center_ids from this. */
    data_center?: string;
    /** @description Resolved datacenter's display name */
    data_center_name?: string;
    /** @description The resolved datacenter's stock level for the requested resource. Never NONE — a NONE-only result set fails create() instead of being chosen. */
    availability?: "LOW" | "MEDIUM" | "HIGH";
    /** @description Every candidate considered, ranked, for get-info visibility and debugging */
    candidates?: CatalogAvailability[];
}

/**
 * @description RunPod placement — resolves and freezes a datacenter choice for a GPU or
 * CPU type, based on live catalog stock, so runpod-network-volume and runpod-pod can be
 * created directly into a datacenter known to have capacity instead of guessing a region
 * up front.
 *
 * This entity manages no remote resource: it only reads RunPod's catalog. `create()`
 * resolves once and writes the result to state; the resolution then never changes again,
 * even across `update()` — a network volume created against the resolved datacenter is
 * immutable, so re-resolving later would silently strand it. There is nothing to delete
 * remotely; `delete()` clears the resolution so a later `create()` starts fresh.
 *
 * ## Required Permissions
 * A RunPod API key with read access to the account's catalog. RunPod does not offer
 * scoped API keys, so the key grants full account access.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `runpod-api-token`)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.data_center` - Resolved datacenter ID; wire into a pod's `data_center_ids` and/or
 *   a network volume's `data_center`
 *
 * ## Composing with Other Entities
 * Works with:
 * - `runpod/runpod-network-volume` - wire `data_center` to `state.data_center`
 * - `runpod/runpod-pod` - wire `data_center_ids` to `[state.data_center]`
 */
export class RunpodPlacement extends RunpodEntity<
    RunpodPlacementDefinition,
    RunpodPlacementState
> {
    static readonly readiness = { period: 2, initialDelay: 1, attempts: 10 };

    protected getEntityName(): string {
        return `RunPod placement (${this.definition.gpu_type_id ?? this.definition.cpu_flavor_id ?? "unresolved"})`;
    }

    override create(): void {
        if (this.state.data_center) {
            cli.output(`Placement already resolved to ${this.state.data_center}; resolution is frozen once made.`);
            return;
        }

        const gpuTypeId = this.definition.gpu_type_id;
        const cpuFlavorId = this.definition.cpu_flavor_id;
        if (!gpuTypeId && !cpuFlavorId) {
            throw new Error("runpod-placement needs exactly one of gpu_type_id or cpu_flavor_id.");
        }

        const product = this.definition.product || "POD";
        const result = gpuTypeId
            ? this.gpuAvailability(gpuTypeId, product, this.definition.cloud, this.definition.count)
            : this.cpuAvailability(cpuFlavorId!, product);
        if (!result) {
            throw new Error(`No catalog entry found for ${gpuTypeId ?? cpuFlavorId} (product=${product}).`);
        }

        let candidates: CatalogAvailability[] = (result.dataCenters ?? []).slice();

        if (this.definition.volume_type) {
            const compatible = this.catalogDatacenters(this.definition.volume_type);
            const compatibleIds = new Set(compatible.map((dc) => dc.id));
            candidates = candidates.filter((c) => compatibleIds.has(c.id));
        }
        if (this.definition.candidate_data_center_ids && this.definition.candidate_data_center_ids.length > 0) {
            const allow = new Set(this.definition.candidate_data_center_ids);
            candidates = candidates.filter((c) => allow.has(c.id));
        }

        const ranked = rankByAvailability(candidates).filter((c) => c.availability !== "NONE");
        this.state.candidates = ranked;

        if (ranked.length === 0) {
            throw new Error(
                `No datacenter has ${gpuTypeId ?? cpuFlavorId} available` +
                (this.definition.volume_type ? ` with ${this.definition.volume_type} volume support` : "") +
                (this.definition.candidate_data_center_ids
                    ? ` within [${this.definition.candidate_data_center_ids.join(", ")}]`
                    : "") +
                ". Try again later, widen candidate_data_center_ids, or drop volume_type."
            );
        }

        const chosen = ranked[0];
        this.state.data_center = chosen.id;
        this.state.data_center_name = chosen.name;
        this.state.availability = chosen.availability as "LOW" | "MEDIUM" | "HIGH";
        cli.output(`✅ Resolved placement: ${chosen.id} (${chosen.availability})`);
    }

    override update(): void {
        if (this.state.data_center) {
            cli.output(
                `Placement already resolved to ${this.state.data_center}; definition changes are ignored. ` +
                `Delete and recreate this entity to re-resolve.`
            );
            return;
        }
        this.create();
    }

    override delete(): void {
        cli.output("RunPod placement entity has no remote resources to delete; clearing resolution.");
        this.state.data_center = undefined;
        this.state.data_center_name = undefined;
        this.state.availability = undefined;
        this.state.candidates = undefined;
    }

    override checkReadiness(): boolean {
        return Boolean(this.state.data_center);
    }

    /**
     * Reads local state only — unlike every other get-info in this package, there is no
     * remote resource to re-fetch from.
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.data_center) {
            cli.output("Placement not resolved yet");
            return;
        }
        cli.output("=== Placement ===");
        cli.output(`Resolved: ${this.state.data_center} (${this.state.data_center_name ?? ""}) — ${this.state.availability}`);
        cli.output("Candidates considered:");
        for (const c of this.state.candidates ?? []) {
            cli.output(`  ${c.id} — ${c.availability}`);
        }
    }
}
