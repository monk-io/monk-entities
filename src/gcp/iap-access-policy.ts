/**
 * GCP IAP Access Policy Entity
 *
 * Manages IAM role bindings on IAP-protected resources. Each instance manages
 * one (target, role) pair. On delete, only members added by this entity are
 * removed; pre-existing members are left intact.
 *
 * @see https://cloud.google.com/iap/docs/reference/rest/v1/v1/setIamPolicy
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import {
    IAP_API_URL,
    IapTarget,
    IapTargetKind,
    buildIapTargetPath,
    resolveProjectNumber,
} from "./iap-common.ts";
import { IamPolicy } from "./common.ts";

/**
 * IAP Access Policy entity definition
 */
export interface IapAccessPolicyDefinition extends GcpEntityDefinition {
    /**
     * @description Kind of IAP-protected resource to bind the role on
     */
    target_kind: IapTargetKind;

    /**
     * @description App Engine application ID (for target_kind: app-engine, app-engine-service)
     */
    app_id?: string;

    /**
     * @description App Engine service name (for target_kind: app-engine-service)
     */
    app_engine_service?: string;

    /**
     * @description Compute Engine backend service ID (for target_kind: compute, compute-regional)
     */
    backend_service?: string;

    /**
     * @description GCP region (for target_kind: compute-regional, cloud-run)
     */
    region?: string;

    /**
     * @description Cloud Run service name (for target_kind: cloud-run)
     */
    cloud_run_service?: string;

    /**
     * @description Organization numeric ID (for target_kind: organization)
     */
    organization_id?: string;

    /**
     * @description Folder numeric ID (for target_kind: folder)
     */
    folder_id?: string;

    /**
     * @description Verbatim IAP resource path (for target_kind: raw)
     */
    resource_path?: string;

    /**
     * @description IAM role to grant, e.g., "roles/iap.httpsResourceAccessor",
     * "roles/iap.tunnelResourceAccessor"
     */
    role: string;

    /**
     * @description List of members to grant the role. Format: "user:alice@example.com",
     * "serviceAccount:svc@proj.iam.gserviceaccount.com", "group:...", "domain:...",
     * "allUsers", "allAuthenticatedUsers".
     */
    members: string[];
}

/**
 * IAP Access Policy entity state
 */
export interface IapAccessPolicyState extends GcpEntityState {
    /**
     * @description Full target resource path
     */
    resource_name?: string;

    /**
     * @description Role this entity manages
     */
    managed_role?: string;

    /**
     * @description Members this entity added (tracked for clean removal on delete)
     */
    added_members?: string[];

    /**
     * @description Whether a binding for this role existed before this entity ran
     */
    prior_had_binding?: boolean;

    /**
     * @description Cached project number
     */
    project_number?: string;
}

/**
 * @description GCP IAP Access Policy entity. Manages a single (target, role) pair on an
 * IAP-protected resource. Members listed in the definition are added to the binding; members
 * added by this entity are tracked in state so they can be cleanly removed on delete without
 * affecting pre-existing members.
 *
 * ## Required Permissions
 * - `iap.webTypes.getIamPolicy` / `iap.webTypes.setIamPolicy` (web targets)
 * - `iap.tunnelInstances.getIamPolicy` / `iap.tunnelInstances.setIamPolicy` (tunnel targets)
 * - `resourcemanager.projects.get` (resolves project number)
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.resource_name` — target IAP resource path
 * - `state.managed_role` — role being managed
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/iap-settings` — typically apply settings first, then grant access via this entity
 * - `gcp/iap-tunnel-dest-group` — used as target for tunnel-related role bindings
 */
export class IapAccessPolicy extends GcpEntity<IapAccessPolicyDefinition, IapAccessPolicyState> {

    static readonly readiness = { period: 5, initialDelay: 1, attempts: 3 };

    protected getEntityName(): string {
        return `GCP IAP Access Policy (${this.definition.role} on ${this.definition.target_kind})`;
    }

    private asTarget(): IapTarget {
        return {
            target_kind: this.definition.target_kind,
            app_id: this.definition.app_id,
            app_engine_service: this.definition.app_engine_service,
            backend_service: this.definition.backend_service,
            region: this.definition.region,
            cloud_run_service: this.definition.cloud_run_service,
            organization_id: this.definition.organization_id,
            folder_id: this.definition.folder_id,
            resource_path: this.definition.resource_path,
        };
    }

    private getResourceName(): string {
        if (this.state.resource_name) return this.state.resource_name;
        if (!this.state.project_number) {
            this.state.project_number = resolveProjectNumber(this.projectId);
        }
        const name = buildIapTargetPath(this.asTarget(), this.state.project_number);
        this.state.resource_name = name;
        return name;
    }

    private getPolicy(): IamPolicy {
        const resp = this.post(`${IAP_API_URL}/${this.getResourceName()}:getIamPolicy`, {}) as IamPolicy;
        if (!resp.bindings) resp.bindings = [];
        return resp;
    }

    private setPolicy(policy: IamPolicy): void {
        this.post(`${IAP_API_URL}/${this.getResourceName()}:setIamPolicy`, { policy });
    }

    override create(): void {
        const role = this.definition.role;
        const desired = this.definition.members || [];

        const policy = this.getPolicy();
        const existingBinding = policy.bindings.find(b => b.role === role);
        const priorMembers = existingBinding ? [...(existingBinding.members || [])] : [];
        this.state.prior_had_binding = Boolean(existingBinding);

        const addedMembers = desired.filter(m => !priorMembers.includes(m));

        if (existingBinding) {
            for (const m of addedMembers) {
                existingBinding.members.push(m);
            }
        } else if (desired.length > 0) {
            policy.bindings.push({ role, members: [...desired] });
        }

        this.setPolicy(policy);
        this.state.managed_role = role;
        this.state.added_members = addedMembers;
        this.state.existing = this.state.prior_had_binding;
        cli.output(
            `Applied IAM policy on ${this.state.resource_name}: role=${role}, added=${addedMembers.length} member(s)`
        );
    }

    override update(): void {
        const role = this.definition.role;
        const desired = this.definition.members || [];
        const previouslyAdded = this.state.added_members || [];

        const policy = this.getPolicy();
        let binding = policy.bindings.find(b => b.role === role);

        if (!binding) {
            binding = { role, members: [] };
            policy.bindings.push(binding);
        }

        const desiredSet = new Set(desired);
        binding.members = binding.members.filter(m => {
            if (previouslyAdded.includes(m) && !desiredSet.has(m)) return false;
            return true;
        });

        const newlyAdded: string[] = [];
        for (const m of desired) {
            if (!binding.members.includes(m)) {
                binding.members.push(m);
                newlyAdded.push(m);
            }
        }

        if (binding.members.length === 0) {
            // GCP IAM rejects bindings with zero members — always drop empty bindings.
            policy.bindings = policy.bindings.filter(b => b.role !== role);
        }

        this.setPolicy(policy);

        const stillAdded = previouslyAdded.filter(m => desiredSet.has(m));
        const combined: string[] = [];
        for (const m of [...stillAdded, ...newlyAdded]) {
            if (!combined.includes(m)) combined.push(m);
        }
        this.state.added_members = combined;
        cli.output(`Updated IAM policy: role=${role}, tracked=${combined.length} member(s)`);
    }

    override delete(): void {
        const role = this.state.managed_role || this.definition.role;
        const addedMembers = this.state.added_members || [];
        if (addedMembers.length === 0) {
            cli.output("No members tracked — nothing to remove");
            return;
        }

        const policy = this.getPolicy();
        const binding = policy.bindings.find(b => b.role === role);
        if (!binding) {
            cli.output(`No binding for role ${role}`);
            return;
        }

        binding.members = (binding.members || []).filter(m => !addedMembers.includes(m));
        if (binding.members.length === 0) {
            // GCP IAM rejects bindings with zero members — always drop empty bindings.
            policy.bindings = policy.bindings.filter(b => b.role !== role);
        }

        this.setPolicy(policy);
        cli.output(`Removed ${addedMembers.length} member(s) from role ${role} on ${this.state.resource_name}`);
    }

    override checkReadiness(): boolean {
        return Boolean(this.state.resource_name);
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    /**
     * Show bindings for the managed role on this target
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        const policy = this.getPolicy();
        const role = this.definition.role;
        const binding = policy.bindings.find(b => b.role === role);
        cli.output(`IAP Access Policy on ${this.state.resource_name || "(unresolved)"}`);
        cli.output(`  Role: ${role}`);
        cli.output(`  Members:`);
        const members = binding?.members || [];
        for (const m of members) cli.output(`    - ${m}`);
        if (members.length === 0) cli.output("    (none)");
        cli.output(`  etag: ${policy.etag}`);
    }

    /**
     * List members bound to the managed role
     */
    @action("list-members")
    listMembers(_args?: Args): void {
        const policy = this.getPolicy();
        const role = this.definition.role;
        const binding = policy.bindings.find(b => b.role === role);
        const members = binding?.members || [];
        cli.output(`Members with role ${role}: ${members.length}`);
        for (const m of members) cli.output(`  ${m}`);
    }

    /**
     * Add a single member to the managed role
     */
    @action("add-member")
    addMember(args?: Args): void {
        if (!args || !args.member) {
            throw new Error("Required argument: member (e.g., user:alice@example.com)");
        }
        const member = String(args.member);
        const role = this.definition.role;

        const policy = this.getPolicy();
        let binding = policy.bindings.find(b => b.role === role);
        if (!binding) {
            binding = { role, members: [] };
            policy.bindings.push(binding);
        }
        if (binding.members.includes(member)) {
            cli.output(`Member already present: ${member}`);
            return;
        }
        binding.members.push(member);
        this.setPolicy(policy);

        const added = this.state.added_members || [];
        if (!added.includes(member)) added.push(member);
        this.state.added_members = added;
        cli.output(`Added member ${member} to role ${role}`);
    }

    /**
     * Remove a single member from the managed role
     */
    @action("remove-member")
    removeMember(args?: Args): void {
        if (!args || !args.member) {
            throw new Error("Required argument: member");
        }
        const member = String(args.member);
        const role = this.definition.role;

        const policy = this.getPolicy();
        const binding = policy.bindings.find(b => b.role === role);
        if (!binding) {
            cli.output(`No binding for role ${role}`);
            return;
        }
        binding.members = binding.members.filter(m => m !== member);
        if (binding.members.length === 0) {
            // GCP IAM rejects bindings with zero members — always drop empty bindings.
            policy.bindings = policy.bindings.filter(b => b.role !== role);
        }
        this.setPolicy(policy);

        this.state.added_members = (this.state.added_members || []).filter(m => m !== member);
        cli.output(`Removed member ${member} from role ${role}`);
    }
}
