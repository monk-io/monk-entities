import { WorkOSEntity, WorkOSEntityDefinition, WorkOSEntityState, action } from "./workos-base.ts";
import cli from "cli";

export interface WorkOSOrganizationDefinition extends WorkOSEntityDefinition {
    /**
     * @description Organization name
     * @minLength 1
     * @maxLength 256
     */
    name: string;
    /**
     * @description Optional: adopt existing organization by ID
     */
    organization_id?: string;
    /**
     * @description Verified domains for the organization
     */
    domains?: string[];
    /**
     * @description Organization metadata key-value pairs
     */
    metadata?: Record<string, any>;
}

export interface WorkOSOrganizationState extends WorkOSEntityState {
    /**
     * @description WorkOS organization ID (org_...)
     */
    organization_id?: string;
    /**
     * @description Organization name
     */
    name?: string;
}

/**
 * @description WorkOS Organization entity.
 * Creates and manages WorkOS organizations for B2B multi-tenant applications.
 * Organizations are the top-level tenant grouping for SSO connections, directories, and users.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - WorkOS API key
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.organization_id` - WorkOS organization ID (org_...)
 * - `state.name` - Organization name
 *
 * ## Composing with Other Entities
 * Works with:
 * - `workos/credentials` - Shares API credentials
 * - `workos/connection` - SSO connections belong to organizations
 */
export class Organization extends WorkOSEntity<WorkOSOrganizationDefinition, WorkOSOrganizationState> {
    protected getEntityName(): string {
        return this.definition.name;
    }

    override create(): void {
        // Adopt existing by ID
        if (this.definition.organization_id) {
            const org = this.makeRequest("GET", `/organizations/${this.definition.organization_id}`);
            this.state = {
                organization_id: org?.id,
                name: org?.name,
                existing: true,
            };
            cli.output(`Adopted existing WorkOS organization ${org?.id}`);
            return;
        }

        // Try find by name
        let found: any = null;
        try {
            const list = this.makeRequest("GET", `/organizations?limit=100`);
            const items = Array.isArray(list?.data) ? list.data : [];
            found = items.find((it: any) => it.name === this.definition.name);
        } catch { /* ignore search errors */ }

        if (found) {
            this.state = {
                organization_id: found.id,
                name: found.name,
                existing: true,
            };
            cli.output(`Reusing existing WorkOS organization ${found.id}`);
            return;
        }

        const body: Record<string, any> = {
            name: this.definition.name,
        };
if (this.definition.domains && this.definition.domains.length > 0) {
            body["domains"] = this.definition.domains.map((d: string) => ({ domain: d, state: "verified" }));
        }
        if (this.definition.metadata) body["metadata"] = this.definition.metadata;

        const created = this.makeRequest("POST", "/organizations", body);
        this.state = {
            organization_id: created?.id,
            name: created?.name,
            existing: false,
        };
        cli.output(`Created WorkOS organization ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.organization_id) {
            this.create();
            return;
        }
        const body: Record<string, any> = { name: this.definition.name };
if (this.definition.domains && this.definition.domains.length > 0) {
            body["domains"] = this.definition.domains.map((d: string) => ({ domain: d, state: "verified" }));
        }
        if (this.definition.metadata) body["metadata"] = this.definition.metadata;

        const updated = this.makeRequest("PUT", `/organizations/${this.state.organization_id}`, body);
        this.state = {
            ...this.state,
            name: updated?.name,
        };
        cli.output(`Updated WorkOS organization ${this.state.organization_id}`);
    }

    override delete(): void {
        if (!this.state?.organization_id || this.state.existing) return;
        try {
            this.makeRequest("DELETE", `/organizations/${this.state.organization_id}`);
            cli.output(`Deleted WorkOS organization ${this.state.organization_id}`);
        } catch { /* ignore deletion errors */ }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.organization_id);
    }

    @action("get-info")
    /**
     * @description Get organization details
     */
    getInfo(): void {
        if (!this.state?.organization_id) {
            cli.output("Organization not created yet");
            return;
        }
        const org = this.makeRequest("GET", `/organizations/${this.state.organization_id}`);
        cli.output(JSON.stringify(org, null, 2));
    }

    @action("get-cost-estimate")
    /**
     * @description Get estimated monthly cost
     */
    getCostEstimate(): void {
        cli.output("WorkOS pricing: Free up to 1M MAU. Pro plan is usage-based for SSO, Directory Sync, and Audit Logs. See https://workos.com/pricing");
    }

    @action("costs")
    /**
     * @description Get cost data in JSON format for billing
     */
    costs(): void {
        cli.output(JSON.stringify({
            type: "workos-organization",
            costs: {
                month: {
                    amount: "0.00",
                    currency: "USD",
                },
            },
        }));
    }
}
