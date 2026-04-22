/**
 * GCP Resource IAM Binding Entity
 *
 * Grants a single IAM role to a single member at a *specific resource's*
 * scope (bucket, dataset, etc.) — the companion to `gcp/project-iam-binding`
 * which grants at the project level.
 *
 * ## Supported resource types
 *
 * Initially: `storage_bucket`. Each supported type maps to the GCP API that
 * exposes that resource's IAM policy. Others to add as needed:
 * `bigquery_dataset`, `pubsub_topic`, `pubsub_subscription`, `kms_cryptokey`,
 * `secretmanager_secret`.
 *
 * ## Semantics
 *
 * Identical to `gcp/project-iam-binding`:
 *   - One entity per (resource, role, member) triple
 *   - Sticky `existing` flag — set on first create, never flipped by retry
 *   - Etag-retry loop for concurrent policy writes
 *   - Optional IAM Condition
 *
 * @see https://cloud.google.com/iam/docs/granting-changing-revoking-access
 */

import { Args, action } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { CLOUD_STORAGE_API_URL, IamPolicy } from "./common.ts";

/**
 * Optional IAM Condition attached to the binding.
 */
export interface ResourceIamBindingCondition {
    title: string;
    condition_description?: string;
    expression: string;
}

type ResourceKind = "storage_bucket";

/**
 * Resource IAM Binding definition
 */
export interface ResourceIamBindingDefinition extends GcpEntityDefinition {
    /**
     * @description Kind of resource whose IAM policy this binding modifies.
     * Currently: `storage_bucket` (GCS bucket IAM).
     */
    resource_type: ResourceKind;

    /**
     * @description Resource identifier. For `storage_bucket` this is the
     * bucket name (not a `gs://` URL, just the name).
     */
    resource_id: string;

    /**
     * @description IAM role to grant. Predefined
     * (e.g. `roles/storage.objectViewer`) or custom.
     */
    role: string;

    /**
     * @description Principal receiving the role. Must include the IAM prefix:
     *   `user:alice@example.com`
     *   `group:engineers@example.com`
     *   `serviceAccount:foo@project.iam.gserviceaccount.com`
     *   `domain:example.com`
     *   `allAuthenticatedUsers` / `allUsers`
     */
    member: string;

    /**
     * @description Optional IAM Condition (CEL-gated access).
     */
    binding_condition?: ResourceIamBindingCondition;
}

/**
 * Resource IAM Binding state
 */
export interface ResourceIamBindingState extends GcpEntityState {
    resource_type?: string;
    resource_id?: string;
    role?: string;
    member?: string;

    /**
     * @description Sticky ownership flag. `true` if the binding was
     * already present when this entity first ran create() (adopted);
     * `false` if we appended the member. Once set, never flipped —
     * a retry cannot reclassify.
     */
    existing?: boolean;

    /**
     * @description Most recently observed etag for informational use.
     */
    last_etag?: string;
}

const MAX_POLICY_ATTEMPTS = 6;
const POLICY_BACKOFF_MS = 2000;

/**
 * @description Manages a single IAM binding at a specific resource's scope.
 * Complements `gcp/project-iam-binding` — use this when you need to grant a
 * role on one bucket (or dataset, etc.) without polluting the project policy.
 */
export class ResourceIamBinding extends GcpEntity<
    ResourceIamBindingDefinition,
    ResourceIamBindingState
> {
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Resource IAM Binding ${this.definition.resource_type}:${this.definition.resource_id} ${this.definition.role} -> ${this.definition.member}`;
    }

    // ---------- Resource → IAM URL ----------

    private iamPolicyUrl(): string {
        switch (this.definition.resource_type) {
            case "storage_bucket":
                return `${CLOUD_STORAGE_API_URL}/b/${encodeURIComponent(this.definition.resource_id)}/iam`;
            default:
                throw new Error(
                    `Unsupported resource_type: ${this.definition.resource_type}`,
                );
        }
    }

    // ---------- Policy I/O ----------

    private getIamPolicy(): IamPolicy {
        // GCS IAM policy GET uses a plain GET; some resources need
        // ?optionsRequestedPolicyVersion=3 to surface conditions.
        const url = `${this.iamPolicyUrl()}?optionsRequestedPolicyVersion=3`;
        return this.get(url);
    }

    private setIamPolicy(policy: IamPolicy): any {
        // GCS expects the v3 resource shape with `version: 3` when conditions
        // are in play; harmless for plain bindings too.
        const body = { ...policy, version: policy.version || 3 };
        return this.put(this.iamPolicyUrl(), body);
    }

    private withRetriedPolicy(
        describe: string,
        mutate: (policy: IamPolicy) => void,
    ): IamPolicy {
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= MAX_POLICY_ATTEMPTS; attempt++) {
            const policy = this.getIamPolicy();
            if (!policy.bindings) policy.bindings = [];
            try {
                mutate(policy);
                return this.setIamPolicy(policy);
            } catch (err) {
                lastErr = err;
                const msg = err instanceof Error ? err.message : String(err);
                const isConflict =
                    /409/.test(msg) ||
                    /ABORTED/i.test(msg) ||
                    /etag/i.test(msg) ||
                    /preconditionNotMet/i.test(msg);
                if (!isConflict || attempt === MAX_POLICY_ATTEMPTS) throw err;
                cli.output(
                    `${describe}: etag conflict (attempt ${attempt}/${MAX_POLICY_ATTEMPTS}), retrying in ${POLICY_BACKOFF_MS / 1000}s...`,
                );
                const until = Date.now() + POLICY_BACKOFF_MS;
                while (Date.now() < until) { /* spin */ }
            }
        }
        throw lastErr ?? new Error(`${describe}: unreachable`);
    }

    // ---------- Slot matching ----------

    private sameSlot(existing: IamPolicy["bindings"][0]): boolean {
        if (existing.role !== this.definition.role) return false;
        const declared = this.definition.binding_condition;
        const current = existing.condition;
        if (!declared && !current) return true;
        if (!declared || !current) return false;
        return (
            declared.expression === current.expression &&
            declared.title === current.title
        );
    }

    private findSlot(policy: IamPolicy): number {
        if (!policy.bindings) return -1;
        for (let i = 0; i < policy.bindings.length; i++) {
            if (this.sameSlot(policy.bindings[i])) return i;
        }
        return -1;
    }

    // ---------- Lifecycle ----------

    override create(): void {
        this.state.resource_type = this.definition.resource_type;
        this.state.resource_id = this.definition.resource_id;
        this.state.role = this.definition.role;
        this.state.member = this.definition.member;

        const describe = `grant ${this.definition.role} to ${this.definition.member} on ${this.definition.resource_type}:${this.definition.resource_id}`;
        cli.output(`Applying resource IAM binding: ${describe}`);

        const firstRun = this.state.existing === undefined;
        let alreadyPresent = false;

        const written = this.withRetriedPolicy(describe, (policy) => {
            const idx = this.findSlot(policy);
            if (idx < 0) {
                const binding: IamPolicy["bindings"][0] = {
                    role: this.definition.role,
                    members: [this.definition.member],
                };
                if (this.definition.binding_condition) {
                    binding.condition = {
                        title: this.definition.binding_condition.title,
                        description:
                            this.definition.binding_condition.condition_description || "",
                        expression: this.definition.binding_condition.expression,
                    };
                }
                policy.bindings.push(binding);
                return;
            }
            const binding = policy.bindings[idx];
            if (binding.members.includes(this.definition.member)) {
                alreadyPresent = true;
                return;
            }
            binding.members.push(this.definition.member);
        });

        if (firstRun) {
            // `force_ownership: true` reclaims an existing binding so
            // delete() will remove it on teardown.
            if (alreadyPresent && this.definition.force_ownership) {
                this.state.existing = false;
                cli.output(
                    `Binding already present; reclaiming ownership (force_ownership=true)`,
                );
            } else {
                this.state.existing = alreadyPresent;
                cli.output(
                    alreadyPresent
                        ? `Binding already present; adopting (will not remove on delete)`
                        : `Binding applied`,
                );
            }
        } else {
            cli.output(
                `Binding reconciled (existing=${this.state.existing ? "adopted" : "owned"})`,
            );
        }
        this.state.last_etag = written?.etag;
    }

    override update(): void {
        this.create();
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(
                `Resource IAM binding was already present when adopted; skipping delete`,
            );
            return;
        }

        const describe = `revoke ${this.state.role} from ${this.state.member} on ${this.state.resource_type}:${this.state.resource_id}`;
        cli.output(`Removing resource IAM binding: ${describe}`);

        // Also prune `deleted:<member>?uid=...` zombies — see
        // project-iam-binding.ts for rationale.
        const liveMember = this.definition.member;
        const zombiePrefix = `deleted:${liveMember}?uid=`;

        this.withRetriedPolicy(describe, (policy) => {
            const idx = this.findSlot(policy);
            if (idx < 0) return;
            const binding = policy.bindings[idx];
            binding.members = binding.members.filter(
                (m: string) => m !== liveMember && !m.startsWith(zombiePrefix),
            );
            if (binding.members.length === 0) {
                policy.bindings.splice(idx, 1);
            }
        });

        cli.output(`Binding removed`);
    }

    override checkReadiness(): boolean {
        try {
            const policy = this.getIamPolicy();
            const idx = this.findSlot(policy);
            if (idx < 0) {
                cli.output("Binding slot not present");
                return false;
            }
            const ok = policy.bindings[idx].members.includes(this.definition.member);
            if (!ok) cli.output("Member missing from binding slot");
            return ok;
        } catch (err) {
            cli.output(
                `Readiness check failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            return false;
        }
    }

    override checkLiveness(): boolean {
        return this.checkReadiness();
    }

    // ---------- Actions ----------

    @action("get-info")
    getInfo(_args?: Args): void {
        try {
            const policy = this.getIamPolicy();
            const idx = this.findSlot(policy);
            cli.output(
                JSON.stringify(
                    {
                        resource_type: this.definition.resource_type,
                        resource_id: this.definition.resource_id,
                        role: this.definition.role,
                        member: this.definition.member,
                        binding_condition: this.definition.binding_condition || null,
                        present: idx >= 0 &&
                            policy.bindings[idx].members.includes(this.definition.member),
                        existing: !!this.state.existing,
                        last_etag: this.state.last_etag || null,
                        current_members_in_slot:
                            idx >= 0 ? policy.bindings[idx].members : [],
                    },
                    null,
                    2,
                ),
            );
        } catch (err) {
            cli.output(
                `get-info failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
}
