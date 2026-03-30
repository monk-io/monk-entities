import { ClerkEntity, ClerkEntityDefinition, ClerkEntityState, action } from "./clerk-base.ts";
import cli from "cli";

export interface ClerkOrganizationDefinition extends ClerkEntityDefinition {
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
     * @description Optional slug for the organization URL
     */
    slug?: string;
    /**
     * @description Maximum number of members allowed (0 for unlimited)
     */
    max_allowed_memberships?: number;
    /**
     * @description Optional public metadata (visible to frontend)
     */
    public_metadata?: Record<string, any>;
    /**
     * @description Optional private metadata (server-side only)
     */
    private_metadata?: Record<string, any>;
}

export interface ClerkOrganizationState extends ClerkEntityState {
    /**
     * @description Clerk organization ID (org_...)
     */
    organization_id?: string;
    /**
     * @description Organization name
     */
    name?: string;
    /**
     * @description Organization slug
     */
    slug?: string;
    /**
     * @description Number of current members
     */
    members_count?: number;
}

/**
 * @description Clerk Organization entity.
 * Creates and manages Clerk organizations for multi-tenant applications.
 * Organizations group users and manage roles and permissions.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Clerk secret API key
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.organization_id` - Clerk organization ID (org_...)
 * - `state.name` - Organization name
 * - `state.slug` - Organization slug
 * - `state.members_count` - Number of members
 *
 * ## Composing with Other Entities
 * Works with:
 * - `clerk/credentials` - Shares API credentials
 */
export class Organization extends ClerkEntity<ClerkOrganizationDefinition, ClerkOrganizationState> {
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
                slug: org?.slug,
                members_count: org?.members_count,
                existing: true,
            };
            cli.output(`Adopted existing Clerk organization ${org?.id}`);
            return;
        }

        // Try find by name or slug
        let found: any = null;
        try {
            const query = this.definition.slug || this.definition.name;
            const list = this.makeRequest("GET", `/organizations?limit=100&query=${encodeURIComponent(query)}`);
            const items = Array.isArray(list?.data) ? list.data : [];
            found = items.find((it: any) => it.name === this.definition.name || (this.definition.slug && it.slug === this.definition.slug));
        } catch { /* ignore search errors */ }

        if (found) {
            this.state = {
                organization_id: found.id,
                name: found.name,
                slug: found.slug,
                members_count: found.members_count,
                existing: true,
            };
            cli.output(`Reusing existing Clerk organization ${found.id}`);
            return;
        }

        const body: Record<string, any> = { name: this.definition.name };
        if (this.definition.slug) body["slug"] = this.definition.slug;
        if (this.definition.max_allowed_memberships !== undefined) body["max_allowed_memberships"] = this.definition.max_allowed_memberships;
        if (this.definition.public_metadata) body["public_metadata"] = this.definition.public_metadata;
        if (this.definition.private_metadata) body["private_metadata"] = this.definition.private_metadata;

        const created = this.makeRequest("POST", "/organizations", body);
        this.state = {
            organization_id: created?.id,
            name: created?.name,
            slug: created?.slug,
            members_count: created?.members_count,
            existing: false,
        };
        cli.output(`Created Clerk organization ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.organization_id) {
            this.create();
            return;
        }
        const body: Record<string, any> = { name: this.definition.name };
        if (this.definition.slug) body["slug"] = this.definition.slug;
        if (this.definition.max_allowed_memberships !== undefined) body["max_allowed_memberships"] = this.definition.max_allowed_memberships;
        if (this.definition.public_metadata) body["public_metadata"] = this.definition.public_metadata;
        if (this.definition.private_metadata) body["private_metadata"] = this.definition.private_metadata;

        const updated = this.makeRequest("PATCH", `/organizations/${this.state.organization_id}`, body);
        this.state = {
            ...this.state,
            name: updated?.name,
            slug: updated?.slug,
            members_count: updated?.members_count,
        };
        cli.output(`Updated Clerk organization ${this.state.organization_id}`);
    }

    override delete(): void {
        if (!this.state?.organization_id || this.state.existing) return;
        try {
            this.makeRequest("DELETE", `/organizations/${this.state.organization_id}`);
            cli.output(`Deleted Clerk organization ${this.state.organization_id}`);
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
        cli.output("Clerk pricing: Free up to 50,000 MAU. Pro plan starts at $25/mo + $0.02/additional MAU. See https://clerk.com/pricing");
    }

    @action("costs")
    /**
     * @description Get cost data in JSON format for billing
     */
    costs(): void {
        cli.output(JSON.stringify({
            provider: "clerk",
            resource: "organization",
            pricing_model: "per_mau",
            base_cost_monthly_usd: 0,
            free_tier_mau: 50000,
            pro_base_monthly_usd: 25,
            per_additional_mau_usd: 0.02,
            pricing_url: "https://clerk.com/pricing",
        }));
    }
}
