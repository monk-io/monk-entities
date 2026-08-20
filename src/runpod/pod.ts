import { type Args } from "monkec/base";
import {
    RunpodEntity,
    type RunpodEntityDefinition,
    type RunpodEntityState,
    action,
} from "./runpod-base.ts";
import { toApiBody, HOURS_PER_MONTH } from "./common.ts";
import cli from "cli";

/**
 * Definition interface for the RunPod Pod entity.
 * @see https://api.runpod.io/v2/openapi.json
 */
export interface RunpodPodDefinition extends RunpodEntityDefinition {
    /** @description Pod name. Used to adopt a pre-existing pod. */
    name: string;
    /** @description Container image, e.g. `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04`. Required unless `template_id` is set. */
    image?: string;
    /** @description GPU catalog ID from `GET /v2/catalog/gpus`, e.g. `NVIDIA GeForce RTX 4090`. Immutable after creation. */
    gpu_type_id?: string;
    /** @description Number of GPUs to attach (minimum 1). Defaults to 1 for GPU pods. */
    gpu_count?: number;
    /** @description CPU flavor ID from `GET /v2/catalog/cpus`, e.g. `cpu3c`. Immutable after creation. */
    cpu_flavor_id?: string;
    /** @description vCPU count for CPU pods. Minimum 2 and must be a power of two. Immutable after creation. */
    vcpu_count?: number;
    /** @description Cloud tier: SECURE is RunPod-owned hardware, COMMUNITY is community-hosted. Defaults to SECURE. */
    cloud?: "SECURE" | "COMMUNITY";
    /** @description Ephemeral container disk size in GB. Wiped on pod restart. */
    disk?: number;
    /** @description Container entrypoint arguments */
    args?: string;
    /** @description Exposed ports in `port/protocol` form, e.g. `["8888/http", "22/tcp"]` */
    ports?: string[];
    /** @description Environment variables passed to the container. Do NOT put secrets here: RunPod returns `env` in full from the API, so anything in it is readable by every holder of the account's API key. `MONK_RUNPOD_ENTITY_PATH` is reserved — this entity stamps it at create time to prove ownership on a later adoption, overriding any value set here. */
    env?: Record<string, string>;
    /** @description Network volume ID to mount. The volume must live in one of `data_center_ids`. Immutable after creation. */
    network_volume_id?: string;
    /** @description Mount path for the network volume. Defaults to `/runpod-volume`. */
    network_volume_path?: string;
    /** @description Host-local persistent disk in GB (minimum 10). Mutually exclusive with `network_volume_id`, and rejected on CPU pods. Prefer a network volume for data you cannot recreate. */
    persistent_disk_size?: number;
    /** @description Mount path for the host-local persistent disk. Defaults to `/workspace`. */
    persistent_disk_path?: string;
    /** @description Template ID to inherit container config from. Explicit fields here override the template. */
    template_id?: string;
    /** @description Container registry credential ID for pulling private images */
    registry_id?: string;
    /** @description Preferred data center IDs. Must include the network volume's data center when mounting one. */
    data_center_ids?: string[];
    /** @description Acceptable CUDA versions as `major.minor`, e.g. `["12.8"]`. CPU pods ignore this. */
    allowed_cuda_versions?: string[];
    /** @description Minimum acceptable CUDA version as `major.minor` */
    min_cuda_version?: string;
    /** @description Inject a generated JUPYTER_PASSWORD to start JupyterLab. Expose `8888/http` to reach it. */
    start_jupyter?: boolean;
    /** @description Inject PUBLIC_KEY from the account's registered SSH keys. Needs `22/tcp` in ports for direct SSH. */
    start_ssh?: boolean;
    /** @description Prevent the pod from being stopped or reset. Applied on update only — RunPod does not accept it at create time. */
    locked?: boolean;
    /** @description Enable global networking. Limited availability. */
    global_networking?: boolean;
    /** @description When false, delete() refuses to terminate the pod. Defaults to true. */
    allow_destructive_delete?: boolean;
}

/**
 * State interface for the RunPod Pod entity.
 */
export interface RunpodPodState extends RunpodEntityState {
    /** @description Pod ID assigned by RunPod */
    id?: string;
    /** @description Pod name */
    name?: string;
    /** @description True when this pod's env carries this entity's ownership marker — proof it was created by this entity, even if adopted after a state loss. Only meaningful when `existing` is true; a freshly created pod is trivially owned. */
    owned?: boolean;
    /** @description Current lifecycle state: PROVISIONING, STARTING, RUNNING, EXITED, ERROR, TERMINATED */
    pod_status?: string;
    /** @description Exposed ports as reported at runtime, each `{ip, private, public, type}`. Empty until the pod is running. */
    ports?: any[];
    /** @description Ready-to-use direct SSH command, when the pod exposes 22/tcp */
    ssh_command?: string;
    /** @description Current hourly cost in USD; 0 while the pod is stopped or terminated */
    cost_per_hr?: number;
    /** @description Data center the pod was placed in */
    data_center?: string;
    /** @description Pod state transitions currently valid, as advertised by the API */
    available_actions?: string[];
    /** @description GPU type actually assigned */
    gpu_type_id?: string;
    /** @description Creation timestamp */
    created_at?: string;
}

/**
 * @description RunPod pod — a persistent GPU or CPU container instance for training,
 * inference, or interactive development. Billed hourly while running.
 *
 * ## Required Permissions
 * A RunPod API key with read/write access to the account. RunPod does not offer
 * scoped API keys, so the key grants full account access. The cost actions additionally
 * read `GET /v2/catalog/gpus` and `GET /v2/billing/pods`.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `runpod-api-token`)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.id` - Pod ID; used by pod actions and billing lookups
 * - `state.ports` - Runtime port list, each `{ip, private, public, type}` — the handle for
 *   building connection URLs to services on the pod. Populated once the pod is running.
 * - `state.ssh_command` - Ready-to-use direct SSH command when `22/tcp` is exposed
 * - `state.data_center` - Data center the pod landed in
 * - `state.pod_status` - Lifecycle state; `RUNNING` means the container is live
 *
 * ## Composing with Other Entities
 * Works with:
 * - `runpod/runpod-network-volume` - wire `network_volume_id` to the volume's `state.id`
 *   and `data_center_ids` to its `state.data_center`; a volume only attaches inside its
 *   own data center
 * - `runpod/runpod-template` - wire `template_id` to the template's `state.id` to inherit
 *   image, ports, and env
 */
export class RunpodPod extends RunpodEntity<RunpodPodDefinition, RunpodPodState> {
    /** GPU capacity is not guaranteed and provisioning is slow — allow ~10 minutes. */
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 60 };

    /**
     * Env key stamped with `this.path` at create time so a later adoption can tell "a
     * foreign pod that happens to share a name" apart from "the pod I created and then
     * lost state for" (architecture review finding 7, 2026-08-19). `this.path` is Monk's
     * own entity path (`namespace/entity-name`), stable across state loss and already
     * unique per instance — no new identity scheme needed.
     */
    private static readonly OWNERSHIP_ENV_KEY = "MONK_RUNPOD_ENTITY_PATH";

    protected getEntityName(): string {
        return `RunPod pod ${this.definition.name}`;
    }

    override create(): void {
        this.validateCompute();

        const existing = this.findByName("/pods", this.definition.name);
        if (existing) {
            const owned = this.isOwnedByThisEntity(existing);
            this.applyState(existing, true, owned);
            cli.output(`📦 Adopted existing pod ${existing.id} (${this.definition.name})`);
            if (owned) {
                cli.output(`   Ownership marker confirms this entity created it — delete() can terminate it without allow_destructive_delete: true.`);
            }
            return;
        }

        const created = this.makeRequest("POST", "/pods", this.buildCreateBody());
        this.applyState(created, false, true);
        cli.output(`✅ Created pod ${this.state.id} (${this.definition.name})`);
        if (this.state.cost_per_hr) {
            cli.output(`   Billing at $${this.state.cost_per_hr}/hr while running`);
        }
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        // Catch a definition that drifted into an invalid compute shape (both gpu and cpu set,
        // or neither) even though update() does not send compute fields — better a clear error
        // than a confusing PATCH against a definition that could never be created.
        this.validateCompute();
        this.warnOnImmutableChanges();

        // PATCH accepts only the container-level fields; compute shape is fixed at create time.
        //
        // The full desired state is sent rather than a field-by-field diff: PATCH treats
        // omitted fields as unchanged, and the base class already skips update() entirely
        // when the definition hash is unchanged (doc/entity-conventions.md:69), so this only
        // runs when something actually changed.
        // The ownership marker is included only when this pod is already known to be ours
        // (owned === true). PATCH replaces `env` wholesale (see the class comment above), so
        // omitting it here would erase the marker on every update of a pod we created — but
        // adding it here for a pod adopted *without* a marker would stamp our identity onto a
        // possibly-foreign pod, manufacturing the false ownership finding 7b warns against.
        const body = toApiBody({
            name: this.definition.name,
            image: this.definition.image,
            args: this.definition.args,
            disk: this.definition.disk,
            ports: this.definition.ports,
            env: this.state.owned ? this.withOwnershipMarker(this.definition.env) : this.definition.env,
            registry: this.definition.registry_id,
            global_networking: this.definition.global_networking,
            locked: this.definition.locked,
            template_id: this.definition.template_id,
        });

        const updated = this.makeRequest("PATCH", `/pods/${this.state.id}`, body);
        this.applyState(updated, this.state.existing, this.state.owned);
        cli.output(`✅ Updated pod ${this.state.id}`);
    }

    /**
     * Terminate the pod.
     *
     * For a pod, delete is a **correctness requirement, not cleanup**: a pod that is not
     * terminated bills indefinitely, and RunPod restarts a pod whose command exits — so a
     * skipped terminate can also re-run the job. Both failure modes are silent.
     *
     * That makes the usual "adopted resources are left alone" rule dangerous here, unlike on a
     * volume (where it protects data) or a template (which is free). An adopted pod is still a
     * meter that nobody is watching, so the two escape hatches below are explicit rather than
     * implied, and the skip path shouts instead of whispering.
     *
     * A third way out needs no escape hatch at all: if the adopted pod's env carries this
     * entity's own ownership marker (`state.owned`), adoption did not find someone else's pod —
     * it found this entity's own pod after a state loss. Termination is safe without an
     * explicit opt-in in that case; requiring one would only recreate the finding 7b bug where
     * the guardrail meant to prevent a billing leak becomes the leak.
     */
    override delete(): void {
        if (!this.state.id) return;

        if (this.definition.allow_destructive_delete === false) {
            throw new Error(
                `Pod ${this.state.id} delete is disabled. Remove allow_destructive_delete: false ` +
                `to permit termination. Note the pod continues to bill while running.`
            );
        }

        const provablyOurs = Boolean(this.state.existing && this.state.owned);

        // Adopted, unmarked pod: terminate only on an explicit opt-in, because the pod may be
        // someone else's. Without the opt-in, make the abandonment impossible to miss.
        if (this.state.existing && !provablyOurs && this.definition.allow_destructive_delete !== true) {
            const rate = this.state.cost_per_hr;
            const perHour = rate ? `$${rate}/hr` : "an unknown hourly rate";
            const perMonth = rate ? ` (~$${(rate * HOURS_PER_MONTH).toFixed(2)}/month)` : "";
            cli.output("");
            cli.output("=".repeat(72));
            cli.output(`⚠️  POD LEFT RUNNING AND STILL BILLING: ${this.state.id} (${this.state.name})`);
            cli.output("=".repeat(72));
            cli.output(`   This pod was adopted by name, not created here, so it was NOT terminated.`);
            cli.output(`   It continues to bill at ${perHour}${perMonth} until someone stops it.`);
            cli.output(`   Status at teardown: ${this.state.pod_status || "unknown"}`);
            cli.output("");
            cli.output(`   Terminate it now with either:`);
            cli.output(`     sudo monk do <namespace>/<entity>/force-terminate`);
            cli.output(`     curl -X DELETE -H "Authorization: Bearer <key>" \\`);
            cli.output(`       https://api.runpod.io/v2/pods/${this.state.id}`);
            cli.output(`   Or set allow_destructive_delete: true to let teardown terminate adopted pods.`);
            cli.output("=".repeat(72));
            cli.output("");
            return;
        }

        if (provablyOurs) {
            cli.output(
                `Terminating adopted pod ${this.state.id} — ownership marker confirms this entity created it`
            );
        } else if (this.state.existing) {
            cli.output(
                `Terminating adopted pod ${this.state.id} — allow_destructive_delete is explicitly true`
            );
        }

        this.deleteResource(`/pods/${this.state.id}`, `pod ${this.state.id}`);
    }

    /**
     * Terminate the pod regardless of how it was acquired.
     *
     * The escape hatch for the adopted-pod case above: an operator who sees the teardown
     * warning needs one command that stops the meter without editing the template first.
     */
    @action("force-terminate")
    forceTerminate(_args?: Args): void {
        if (!this.state.id) {
            cli.output("No pod to terminate");
            return;
        }
        this.deleteResource(`/pods/${this.state.id}`, `pod ${this.state.id}`);
        this.state.pod_status = "TERMINATED";
    }

    override checkReadiness(): boolean {
        if (!this.state.id) return false;

        const pod = this.findResource(`/pods/${this.state.id}`);
        if (!pod) return false;

        // Refresh through applyState so connection details (ports, SSH) land in state as soon
        // as the runtime reports them — they are absent until the pod is actually running.
        this.applyState(pod, this.state.existing, this.state.owned);
        const status = this.state.pod_status;

        // The runtime signals "not ready" by throwing (src/monkec/base.ts:210), so a throw
        // here does not abort the poll early — it retries like any other not-ready result.
        // What it does buy is a useful reason in the failure output instead of a bare
        // "not ready", which matters because a sold-out GPU looks identical otherwise.
        if (status === "ERROR") {
            throw new Error(
                `Pod ${this.state.id} is in ERROR state. ` +
                `Check the RunPod console — a common cause is the requested GPU being unavailable.`
            );
        }

        if (status !== "RUNNING") return false;

        // `status: RUNNING` arrives before the `runtime` block exists — verified live, where a
        // pod reported RUNNING with `runtime: null` and therefore no ports and no SSH. Since
        // `state.ports` is this entity's composition handle, a pod that asked for ports is not
        // useful until the runtime publishes them. Pods that expose no ports have no runtime
        // block to wait for, so they are ready as soon as they run.
        const wantsPorts = (this.definition.ports?.length ?? 0) > 0;
        if (wantsPorts && (this.state.ports?.length ?? 0) === 0) {
            cli.output(`Pod ${this.state.id} is RUNNING; waiting for the runtime to publish ports`);
            return false;
        }

        return true;
    }

    /**
     * Liveness asks "does the managed resource still exist", not "is it running".
     *
     * Deliberately **not** delegated to checkReadiness(): a pod stopped on purpose (via the
     * `stop` hook) is not dead, and reporting it as not-live would make an intentional stop look
     * like a fault. Only a terminated or vanished pod is genuinely not live.
     */
    checkLiveness(): boolean {
        if (!this.state.id) return false;

        const pod = this.findResource(`/pods/${this.state.id}`);
        if (!pod) return false;

        return this.readStatus(pod) !== "TERMINATED";
    }

    /**
     * Power the pod on.
     *
     * `start` is a Monk builtin action dispatched to this hook, so `monk start` maps to
     * powering up the pod. Guarded on current status because Monk may also invoke it right
     * after create, when the pod is already provisioning — RunPod rejects a start in that
     * state.
     */
    override start(): void {
        // Monk dispatches the builtin `start` on paths where create() has not run — e.g.
        // `monk run` against an instance it already considers created, such as one left in
        // `stopped` state. Observed live: without this, start() printed "not created yet",
        // monk reported "✔ Started", and no pod existed. Create-if-missing mirrors update().
        if (!this.state.id) {
            cli.output("No pod yet — creating it");
            this.create();
            return;
        }

        const status = this.currentStatus();
        if (status === "RUNNING" || status === "STARTING" || status === "PROVISIONING") {
            cli.output(`Pod ${this.state.id} is already ${status}; nothing to start`);
            return;
        }

        this.runPodAction("start");
    }

    /**
     * Power the pod off, which stops compute billing.
     *
     * Wired to Monk's builtin `stop` action. Guarded so stopping an already-stopped pod is
     * a no-op rather than an API error.
     */
    override stop(): void {
        if (!this.state.id) {
            cli.output("Pod not created yet");
            return;
        }

        const status = this.currentStatus();
        if (status === "EXITED" || status === "TERMINATED") {
            cli.output(`Pod ${this.state.id} is already ${status}; nothing to stop`);
            return;
        }

        this.runPodAction("stop");
    }

    @action("restart")
    restart(_args?: Args): void {
        this.runPodAction("restart");
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.id) {
            cli.output("Pod not created yet");
            return;
        }
        const info = this.makeRequest("GET", `/pods/${this.state.id}`);
        cli.output(JSON.stringify(this.redactEnv(info), null, 2));
    }

    // No `get-logs` action: `GET /v2/pods/{id}/logs` is a Server-Sent Events stream that
    // stays open indefinitely, so a request/response HttpClient never returns and the action
    // hangs the lifecycle job until it is killed (verified against a live pod). Consuming it
    // needs an SSE client monkec does not provide. Use `runpodctl` or the RunPod console for
    // logs instead — get-console-url below gets you there in one step.

    @action("get-console-url")
    getConsoleUrl(_args?: Args): void {
        if (!this.state.id) {
            cli.output("Pod not created yet");
            return;
        }
        cli.output(`https://www.runpod.io/console/pods/${this.state.id}`);
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const rate = this.hourlyRate();

        cli.output(`\n💰 Cost Estimate — RunPod Pod: ${this.definition.name}`);
        cli.output("=".repeat(60));
        cli.output(`\n📊 Configuration:`);
        cli.output(`   Pod ID:      ${this.state.id || "not created"}`);
        cli.output(`   Status:      ${this.state.pod_status || "unknown"}`);
        if (this.definition.cpu_flavor_id) {
            cli.output(`   CPU flavor:  ${this.definition.cpu_flavor_id}`);
            cli.output(`   vCPUs:       ${this.definition.vcpu_count}`);
        } else {
            cli.output(`   GPU:         ${this.state.gpu_type_id || this.definition.gpu_type_id}`);
            cli.output(`   GPU count:   ${this.definition.gpu_count ?? 1}`);
        }
        cli.output(`   Disk:        ${this.definition.disk ?? "default"} GB`);
        cli.output(`   Cloud tier:  ${this.definition.cloud || "SECURE (default)"}`);

        cli.output(`\n💵 Pricing:`);
        if (rate === null) {
            cli.output(`   ❌ Could not determine an hourly rate.`);
            cli.output(`      The pod reports no live cost and the GPU catalog lookup failed.`);
            cli.output(`\n📈 Estimated Monthly Cost: unavailable`);
        } else {
            cli.output(`   Source:      ${rate.source}`);
            cli.output(`   Hourly rate: $${rate.hourly.toFixed(4)}/hr`);
            if (rate.hypothetical) {
                cli.output(`   ⚠️  Pod is not running — this is the rate it WOULD bill at if started.`);
            }
            cli.output(`\n📈 Cost Breakdown:`);
            cli.output(`   Compute (${HOURS_PER_MONTH} hrs × $${rate.hourly.toFixed(4)}): $${(rate.hourly * HOURS_PER_MONTH).toFixed(2)}/month`);
            cli.output(`\n📈 Estimated Monthly Cost: $${(rate.hourly * HOURS_PER_MONTH).toFixed(2)}`);
        }

        const observed = this.observedSpend();
        if (observed !== null) {
            cli.output(`\n📉 Actual spend (trailing 30 days): $${observed.toFixed(2)}`);
        }

        cli.output(`\n📝 Not included:`);
        cli.output(`   • Network volume storage — see the runpod-network-volume cost actions`);
        cli.output(`   • Network egress, and any savings plans or account credits`);
        cli.output(`   • A stopped pod stops billing compute; disk may still bill`);
    }

    @action("costs")
    costs(): void {
        if (!this.state.id) {
            this.emitCosts("runpod-pod", "0");
            return;
        }

        const rate = this.hourlyRate();
        if (rate === null) {
            this.emitCosts("runpod-pod", "0", "Could not determine hourly rate from pod state or GPU catalog");
            return;
        }

        // A stopped pod accrues no compute, so reporting the running rate here would overstate
        // spend in Monk's billing — this payload is machine-consumed and carries no room for the
        // "would bill at" caveat that get-cost-estimate prints. Report 0 and say why, so a pod
        // that spends half its life stopped doesn't read as billing continuously.
        if (rate.hypothetical) {
            this.emitCosts(
                "runpod-pod",
                "0",
                `Pod is ${this.state.pod_status || "not running"} and accrues no compute; ` +
                `it would bill $${(rate.hourly * HOURS_PER_MONTH).toFixed(2)}/month if started`
            );
            return;
        }

        this.emitCosts("runpod-pod", (rate.hourly * HOURS_PER_MONTH).toFixed(2));
    }

    /**
     * Resolve the pod's hourly rate.
     *
     * Preference order: the live `cost` field on the pod (authoritative, but documented as
     * "0.0 when EXITED or TERMINATED"), then the GPU catalog's live price as a
     * would-bill-at figure. Shared by both cost actions so they cannot drift.
     *
     * `hypothetical` is keyed off the pod's **status**, not off `cost` being zero. The spec
     * claims `cost` is "0.0 when EXITED or TERMINATED", but a live stopped pod still reported
     * its running rate — trusting that would bill a stopped pod at full rate in the estimate.
     */
    private hourlyRate(): { hourly: number; source: string; hypothetical: boolean } | null {
        let pod: any = null;
        if (this.state.id) {
            pod = this.findResource(`/pods/${this.state.id}`);
        }

        const status = pod ? this.readStatus(pod) : this.state.pod_status;
        const billing = status === "RUNNING" || status === "STARTING" || status === "PROVISIONING";

        const liveCost = Number(pod?.cost ?? this.state.cost_per_hr ?? 0);
        if (liveCost > 0) {
            return {
                hourly: liveCost,
                source: billing
                    ? "pod `cost` field (live)"
                    : `pod \`cost\` field (pod is ${status}, so this is the rate it would bill at)`,
                hypothetical: !billing,
            };
        }

        const gpuTypeId = pod?.gpu?.id || this.state.gpu_type_id || this.definition.gpu_type_id;
        if (gpuTypeId) {
            const gpu = this.catalogGpu(gpuTypeId);
            // GPU catalog prices are already per GPU per hour.
            const perGpu = gpu?.price?.secure ?? gpu?.price?.community;
            if (perGpu) {
                const count = this.definition.gpu_count ?? 1;
                return {
                    hourly: perGpu * count,
                    source: "GET /v2/catalog/gpus (live catalog price)",
                    hypothetical: true,
                };
            }
        }

        const cpuFlavorId = this.definition.cpu_flavor_id;
        if (cpuFlavorId) {
            const cpu = this.catalogCpu(cpuFlavorId);
            // CPU flavors are priced per vCPU per hour, so the count is a multiplier here
            // in a way it is not for GPUs.
            const perVcpu = cpu?.price?.securePerVcpu;
            if (perVcpu) {
                const vcpus = this.definition.vcpu_count ?? cpu?.vcpu?.min ?? 2;
                return {
                    hourly: perVcpu * vcpus,
                    source: "GET /v2/catalog/cpus (live catalog price, per vCPU)",
                    hypothetical: true,
                };
            }
        }

        return null;
    }

    /**
     * Actual trailing-30-day spend from billing history. Informational only — the monthly
     * estimate is rate-based, since a pod's spend depends on how long it stays running.
     */
    private observedSpend(): number | null {
        if (!this.state.id) return null;
        const billing = this.billingHistory("pods", 30);
        return this.sumBillingRecords(billing, "podId", this.state.id);
    }

    /**
     * Exactly one compute family must be specified — the API requires `gpu` or `cpu`,
     * never both. Caught locally because the API's rejection is not self-explanatory.
     */
    private validateCompute(): void {
        const hasGpu = Boolean(this.definition.gpu_type_id);
        const hasCpu = Boolean(this.definition.cpu_flavor_id);

        if (hasGpu && hasCpu) {
            throw new Error(
                `Pod ${this.definition.name} sets both gpu_type_id and cpu_flavor_id. ` +
                `RunPod accepts exactly one compute family.`
            );
        }
        if (!hasGpu && !hasCpu) {
            throw new Error(
                `Pod ${this.definition.name} needs either gpu_type_id (GPU pod) or ` +
                `cpu_flavor_id + vcpu_count (CPU pod).`
            );
        }
        if (hasCpu && !this.definition.vcpu_count) {
            throw new Error(`CPU pod ${this.definition.name} requires vcpu_count.`);
        }
        if (!this.definition.image && !this.definition.template_id) {
            throw new Error(
                `Pod ${this.definition.name} requires image, or template_id to inherit one.`
            );
        }
    }

    private buildCreateBody(): Record<string, any> {
        // `locked` is deliberately absent: it is accepted by PATCH but not by create, and the
        // schema sets `unevaluatedProperties: false`, so sending it would 422 the whole create.
        const body: Record<string, any> = {
            name: this.definition.name,
            image: this.definition.image,
            cloud: this.definition.cloud,
            disk: this.definition.disk,
            args: this.definition.args,
            ports: this.definition.ports,
            env: this.withOwnershipMarker(this.definition.env),
            template_id: this.definition.template_id,
            registry: this.definition.registry_id,
            data_center_ids: this.definition.data_center_ids,
            allowed_cuda_versions: this.definition.allowed_cuda_versions,
            min_cuda_version: this.definition.min_cuda_version,
            start_jupyter: this.definition.start_jupyter,
            start_ssh: this.definition.start_ssh,
            global_networking: this.definition.global_networking,
        };

        // v2 takes compute as a nested object rather than flat fields, and accepts exactly one.
        if (this.definition.gpu_type_id) {
            body.gpu = {
                id: this.definition.gpu_type_id,
                count: this.definition.gpu_count ?? 1,
            };
        } else {
            body.cpu = {
                id: this.definition.cpu_flavor_id,
                vcpu_count: this.definition.vcpu_count,
            };
        }

        const mounts = this.buildMounts();
        if (mounts) body.mounts = mounts;

        return toApiBody(body);
    }

    /**
     * Build the `mounts` object.
     *
     * Storage is nested rather than flat in v2: a network volume is
     * `mounts.network[{volumeId, path}]` and host-local storage is
     * `mounts.persistent{size, path}`. The two are mutually exclusive (the handler answers 400
     * if both are present) and `network` is capped at one entry today. Mount entries must be
     * complete — a partial mount is a 422 — so paths are defaulted here rather than omitted.
     */
    private buildMounts(): Record<string, any> | null {
        const hasNetwork = Boolean(this.definition.network_volume_id);
        const hasPersistent = this.definition.persistent_disk_size !== undefined;

        if (hasNetwork && hasPersistent) {
            throw new Error(
                `Pod ${this.definition.name} sets both network_volume_id and ` +
                `persistent_disk_size. RunPod allows at most one mount kind per pod.`
            );
        }

        if (hasNetwork) {
            return {
                network: [
                    {
                        volume_id: this.definition.network_volume_id,
                        path: this.definition.network_volume_path || "/runpod-volume",
                    },
                ],
            };
        }

        if (hasPersistent) {
            if (this.definition.cpu_flavor_id) {
                throw new Error(
                    `Pod ${this.definition.name} requests a host-local persistent disk, which ` +
                    `RunPod does not allow on CPU pods. Use a network volume instead.`
                );
            }
            return {
                persistent: {
                    size: this.definition.persistent_disk_size,
                    path: this.definition.persistent_disk_path || "/workspace",
                },
            };
        }

        return null;
    }

    /**
     * Warn rather than silently recreate. GPU type, vCPU count, and data center are fixed at
     * create time; quietly destroying and rebuilding a billable GPU instance on a definition
     * edit would be a costly surprise.
     */
    private warnOnImmutableChanges(): void {
        const stateGpu = this.state.gpu_type_id;
        if (stateGpu && this.definition.gpu_type_id && stateGpu !== this.definition.gpu_type_id) {
            cli.output(
                `⚠️  GPU type is immutable — pod ${this.state.id} runs ${stateGpu}, definition says ` +
                `${this.definition.gpu_type_id}. Delete and recreate the pod to change it.`
            );
        }
        if (this.definition.network_volume_id) {
            cli.output(
                `ℹ️  Network volume attachment is set at create time; changes to ` +
                `network_volume_id require recreating the pod.`
            );
        }
    }

    /** Fetch the pod's current lifecycle state, refreshing cached state as a side effect. */
    private currentStatus(): string {
        const pod = this.findResource(`/pods/${this.state.id}`);
        if (!pod) return "unknown";
        this.state.pod_status = this.readStatus(pod);
        return this.state.pod_status;
    }

    private runPodAction(podAction: string): void {
        if (!this.state.id) {
            cli.output("Pod not created yet");
            return;
        }

        // Path is `/action` (singular) — `/actions` returns 404.
        this.makeRequest("POST", `/pods/${this.state.id}/action`, { action: podAction });
        cli.output(`✅ Sent ${podAction} to pod ${this.state.id}`);

        const pod = this.findResource(`/pods/${this.state.id}`);
        if (pod) {
            this.state.pod_status = this.readStatus(pod);
            this.state.cost_per_hr = pod.cost ?? this.state.cost_per_hr;
            cli.output(`   Status: ${this.state.pod_status}`);
        }
    }

    /**
     * Read the pod's lifecycle state.
     *
     * Verified against a live pod: v2 returns `status`. The `desiredStatus` fallback is kept
     * because v1 used that name and v2 is still in beta — it costs nothing and avoids a silent
     * "unknown" if the field is renamed.
     */
    private readStatus(pod: any): string {
        return pod?.status || pod?.desiredStatus || "unknown";
    }

    /**
     * Copy the API's pod representation into state.
     *
     * Field names verified against a live v2 pod: connection details live under `runtime.ports`
     * and `ssh`, and the data center is the singular `dataCenterId` (the request field is the
     * plural `dataCenterIds`). v2 has no `publicIp`, `portMappings`, or `machineId` — those were
     * v1 fields, so reading them would leave state permanently empty.
     */
    // RunPod returns `env` in full (see the `env` field doc above) — get-info is a
    // documented sanity-check workflow (README "Verify"), so anything it prints reaches
    // whatever captures Monk's job output. Keep the keys (useful for diagnosis) but
    // redact every value; a leaked value is a leaked secret, a leaked key name is not.
    private redactEnv(info: any): any {
        if (!info || typeof info !== "object" || !info.env || typeof info.env !== "object") {
            return info;
        }
        const redactedEnv: Record<string, string> = {};
        for (const key of Object.keys(info.env)) {
            redactedEnv[key] = "<redacted>";
        }
        return { ...info, env: redactedEnv };
    }

    private applyState(pod: any, existing?: boolean, owned?: boolean): void {
        this.state.id = pod?.id ?? this.state.id;
        this.state.name = pod?.name ?? this.definition.name;
        this.state.pod_status = this.readStatus(pod);
        this.state.ports = pod?.runtime?.ports ?? this.state.ports;
        this.state.ssh_command = pod?.ssh?.direct?.command ?? this.state.ssh_command;
        this.state.cost_per_hr = pod?.cost ?? this.state.cost_per_hr;
        this.state.data_center = pod?.dataCenterId ?? this.state.data_center;
        this.state.available_actions = pod?.actions ?? this.state.available_actions;
        this.state.gpu_type_id = pod?.gpu?.id ?? this.definition.gpu_type_id;
        this.state.created_at = pod?.createdAt ?? this.state.created_at;
        this.state.existing = existing;
        this.state.owned = owned;
    }

    /**
     * Merge the ownership marker into a user-supplied env map without mutating it.
     * No-op when `this.path` is unset (e.g. outside a real Monk context) — an entity that
     * cannot name itself must not claim ownership of anything.
     */
    private withOwnershipMarker(env?: Record<string, string>): Record<string, string> | undefined {
        if (!this.path) return env;
        return { ...env, [RunpodPod.OWNERSHIP_ENV_KEY]: this.path };
    }

    /**
     * True when `pod.env` carries this entity's own ownership marker.
     *
     * Verified against the RunPod v2 OpenAPI spec (`GET /v2/pods` — `ListPodsResponse` ->
     * `Pod`, 2026-08-20): list items resolve to the same `Pod` schema as the detail endpoint
     * and include `env` in full, so this can be checked straight off `findByName`'s result —
     * no extra `GET /pods/{id}` round trip needed to see it. The same check confirmed neither
     * `/pods` nor `/network-volumes` takes a cursor/limit parameter today, closing finding 7c
     * (unverified pagination) without a code change.
     */
    private isOwnedByThisEntity(pod: any): boolean {
        return Boolean(this.path) && pod?.env?.[RunpodPod.OWNERSHIP_ENV_KEY] === this.path;
    }
}
