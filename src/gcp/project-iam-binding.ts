/**
 * GCP Project IAM Binding Entity
 *
 * Grants a single IAM role to a single member at the project level.
 * Each entity instance manages exactly one (role, member) pair plus an
 * optional IAM Condition. This decouples identity lifecycle (gcp/service-account)
 * from access lifecycle (this entity), letting you:
 *
 *   - Grant roles to non-service-account members (users, groups, allUsers, ...)
 *   - Track ownership per binding so delete() only removes grants we added
 *   - Independently add/remove a single role without recomputing the rest
 *
 * ## Concurrency model
 *
 * Project IAM policy is a single document guarded by an etag. Two entities
 * racing to add distinct bindings both read → mutate → write and one loses
 * with 409 Conflict. We handle this with an etag retry loop on create/delete.
 *
 * ## Required permissions
 *
 * Caller needs:
 *   - `resourcemanager.projects.getIamPolicy`
 *   - `resourcemanager.projects.setIamPolicy`
 *
 * Typically bundled in `roles/resourcemanager.projectIamAdmin` or `roles/owner`.
 *
 * @see https://cloud.google.com/iam/docs/granting-changing-revoking-access
 */

import { Args, action } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { RESOURCE_MANAGER_API_URL, IamPolicy } from "./common.ts";

/**
 * Optional IAM Condition attached to the binding.
 * @see https://cloud.google.com/iam/docs/conditions-overview
 */
export interface IamBindingCondition {
    /**
     * @description Short title for the condition (shown in Cloud Console)
     */
    title: string;

    /**
     * @description Optional longer description
     */
    condition_description?: string;

    /**
     * @description CEL expression evaluated on each request. Examples:
     *   `request.time < timestamp("2026-12-31T00:00:00Z")`
     *   `resource.name.startsWith("projects/_/buckets/public-")`
     */
    expression: string;
}

/**
 * Project IAM Binding definition
 */
export interface ProjectIamBindingDefinition extends GcpEntityDefinition {
    /**
     * @description IAM role to grant. Predefined
     * (e.g. `roles/bigquery.dataViewer`) or custom
     * (`projects/<project>/roles/<id>`).
     */
    role: string;

    /**
     * @description Principal receiving the role. Must include the IAM prefix:
     *   `user:alice@example.com`
     *   `group:engineers@example.com`
     *   `serviceAccount:foo@project.iam.gserviceaccount.com`
     *   `domain:example.com`
     *   `allAuthenticatedUsers` / `allUsers` (no prefix — special)
     */
    member: string;

    /**
     * @description Optional IAM Condition (CEL-gated access). Two bindings
     * for the same (role, member) but different conditions are distinct.
     */
    binding_condition?: IamBindingCondition;
}

/**
 * Project IAM Binding state
 */
export interface ProjectIamBindingState extends GcpEntityState {
    /**
     * @description Resolved project ID this binding targets
     */
    project?: string;

    /**
     * @description Role granted
     */
    role?: string;

    /**
     * @description Principal the role was granted to
     */
    member?: string;

    /**
     * @description True iff the binding for (role, member) was already
     * present when this entity first ran `create()` — i.e. we adopted it.
     * False iff this entity instance actually appended the member.
     * `delete()` keys off this: we never remove a grant we didn't add.
     *
     * Sticky: once set on the first create, subsequent updates never flip
     * it, so a mid-deploy retry that finds its own just-added member can't
     * mistakenly re-classify the binding as adopted.
     */
    existing?: boolean;

    /**
     * @description Etag observed on the most recent successful write.
     * Informational only; each call re-reads before writing.
     */
    last_etag?: string;
}

// Retry tuning for etag conflicts on setIamPolicy.
const MAX_POLICY_ATTEMPTS = 6;
const POLICY_BACKOFF_MS = 2000;

/**
 * @description Manages a single project-level IAM binding (role + member).
 * Decoupled from the entity that owns the identity, so you can grant roles
 * to any principal type and clean up individual grants without touching the
 * identity itself.
 */
export class ProjectIamBinding extends GcpEntity<
    ProjectIamBindingDefinition,
    ProjectIamBindingState
> {
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Project IAM Binding ${this.definition.role} -> ${this.definition.member}`;
    }

    // ---------- Policy I/O ----------

    private getIamPolicy(): IamPolicy {
        const url = `${RESOURCE_MANAGER_API_URL}/projects/${this.projectId}:getIamPolicy`;
        // v1 API accepts an empty GetIamPolicyRequest
        return this.post(url, { options: { requestedPolicyVersion: 3 } });
    }

    private setIamPolicy(policy: IamPolicy): any {
        const url = `${RESOURCE_MANAGER_API_URL}/projects/${this.projectId}:setIamPolicy`;
        return this.post(url, { policy });
    }

    /**
     * Read→mutate→write with etag-based optimistic concurrency retry.
     * `mutate` must be pure (no external side effects) — we may call it
     * several times with fresh policies. Returns the updated policy that
     * was successfully written.
     */
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
                const written = this.setIamPolicy(policy);
                return written;
            } catch (err) {
                lastErr = err;
                const msg = err instanceof Error ? err.message : String(err);
                const isConflict =
                    /409/.test(msg) ||
                    /ABORTED/i.test(msg) ||
                    /etag/i.test(msg) ||
                    /CONDITION_NOT_MET/i.test(msg);
                if (!isConflict || attempt === MAX_POLICY_ATTEMPTS) {
                    throw err;
                }
                cli.output(
                    `${describe}: etag conflict (attempt ${attempt}/${MAX_POLICY_ATTEMPTS}), retrying in ${POLICY_BACKOFF_MS / 1000}s...`,
                );
                const until = Date.now() + POLICY_BACKOFF_MS;
                // Busy wait — Goja runtime lacks setTimeout.
                while (Date.now() < until) { /* spin */ }
            }
        }
        throw lastErr ?? new Error(`${describe}: unreachable`);
    }

    // ---------- Binding matching ----------

    /**
     * Two bindings are "the same slot" if they share role AND condition.
     * An unconditional binding (no condition on either side) matches only
     * other unconditional bindings.
     */
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
        this.state.project = this.projectId;
        this.state.role = this.definition.role;
        this.state.member = this.definition.member;

        const describe = `grant ${this.definition.role} to ${this.definition.member}`;
        cli.output(`Applying IAM binding: ${describe} on ${this.projectId}`);

        // Snapshot the `existing` flag from prior state so a mid-deploy retry
        // can't flip false → true after our first successful create.
        const firstRun = this.state.existing === undefined;
        let alreadyPresent = false;

        const written = this.withRetriedPolicy(describe, (policy) => {
            const idx = this.findSlot(policy);
            if (idx < 0) {
                // Fresh binding slot — create it with just our member.
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
            // First time we've been asked to create this binding.
            // `force_ownership: true` reclaims an existing binding so
            // delete() will remove it on teardown.
            if (alreadyPresent && this.definition.force_ownership) {
                this.state.existing = false;
                cli.output(
                    `Binding already present; reclaiming ownership (force_ownership=true)`,
                );
            } else {
                this.state.existing = alreadyPresent;
                if (alreadyPresent) {
                    cli.output(
                        `Binding already present; adopting (will not remove on delete)`,
                    );
                } else {
                    cli.output(`Binding applied`);
                }
            }
        } else {
            // Re-run: keep whatever `existing` said the first time. This
            // prevents a retry from reclassifying our own just-added
            // binding as "adopted".
            cli.output(
                `Binding reconciled (existing=${this.state.existing ? "adopted" : "owned"})`,
            );
        }
        this.state.last_etag = written?.etag;
    }

    override update(): void {
        // IAM bindings are idempotent — re-apply is the same as create.
        // (If role or member changed in the YAML, the prior binding becomes
        // orphaned; future improvement: detect role/member diff in state and
        // remove the old one. For now, users should delete+recreate on role
        // changes.)
        this.create();
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(
                `IAM binding was already present when adopted; skipping delete`,
            );
            return;
        }

        const describe = `revoke ${this.state.role} from ${this.state.member}`;
        cli.output(`Removing IAM binding: ${describe}`);

        // When a GCP service account is deleted, existing IAM bindings
        // referencing it get rewritten by the IAM service as
        //   deleted:serviceAccount:<same-email>?uid=<numeric>
        // Our entity's create() added the binding via the live email; on
        // delete we clean both forms to prevent zombie accumulation across
        // SA rotations.
        const liveMember = this.definition.member;
        const zombiePrefix = `deleted:${liveMember}?uid=`;

        this.withRetriedPolicy(describe, (policy) => {
            const idx = this.findSlot(policy);
            if (idx < 0) return; // nothing to do
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
                        project: this.projectId,
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
