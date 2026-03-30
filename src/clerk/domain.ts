import { ClerkEntity, ClerkEntityDefinition, ClerkEntityState, action } from "./clerk-base.ts";
import cli from "cli";

export interface ClerkDomainDefinition extends ClerkEntityDefinition {
    /**
     * @description Domain name to register (e.g., auth.example.com)
     * @minLength 1
     * @maxLength 256
     */
    name: string;
    /**
     * @description Optional: adopt existing domain by ID
     */
    domain_id?: string;
    /**
     * @description Whether this is a satellite domain
     */
    is_satellite: boolean;
    /**
     * @description Proxy URL for the domain (if using proxy mode)
     */
    proxy_url?: string;
}

export interface ClerkDomainState extends ClerkEntityState {
    /**
     * @description Clerk domain ID
     */
    domain_id?: string;
    /**
     * @description Domain name
     */
    name?: string;
    /**
     * @description Verification status
     */
    verification_status?: string;
}

/**
 * @description Clerk Domain entity.
 * Creates and manages custom domains for Clerk instances.
 * Custom domains allow using your own domain for authentication pages.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Clerk secret API key
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.domain_id` - Clerk domain ID
 * - `state.name` - Domain name
 * - `state.verification_status` - Domain verification status
 *
 * ## Composing with Other Entities
 * Works with:
 * - `clerk/credentials` - Shares API credentials
 */
export class Domain extends ClerkEntity<ClerkDomainDefinition, ClerkDomainState> {
    protected getEntityName(): string {
        return this.definition.name;
    }

    override create(): void {
        // Adopt existing by ID (list and filter since GET /domains/{id} returns 405)
        if (this.definition.domain_id) {
            const list = this.makeRequest("GET", "/domains");
            const items = Array.isArray(list?.data) ? list.data : [];
            const domain = items.find((it: any) => it.id === this.definition.domain_id);
            if (!domain) throw new Error(`Domain ${this.definition.domain_id} not found`);
            this.state = {
                domain_id: domain.id,
                name: domain.name,
                verification_status: domain.verification?.status,
                existing: true,
            };
            cli.output(`Adopted existing Clerk domain ${domain.id}`);
            return;
        }

        // Try find by name
        let found: any = null;
        try {
            const list = this.makeRequest("GET", "/domains");
            const items = Array.isArray(list?.data) ? list.data : [];
            found = items.find((it: any) => it.name === this.definition.name);
        } catch { /* ignore search errors */ }

        if (found) {
            this.state = {
                domain_id: found.id,
                name: found.name,
                verification_status: found.verification?.status,
                existing: true,
            };
            cli.output(`Reusing existing Clerk domain ${found.id}`);
            return;
        }

        const body: Record<string, any> = {
            name: this.definition.name,
            is_satellite: this.definition.is_satellite,
        };
        if (this.definition.proxy_url) body["proxy_url"] = this.definition.proxy_url;

        const created = this.makeRequest("POST", "/domains", body);
        this.state = {
            domain_id: created?.id,
            name: created?.name,
            verification_status: created?.verification?.status,
            existing: false,
        };
        cli.output(`Created Clerk domain ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.domain_id) {
            this.create();
            return;
        }
        const body: Record<string, any> = { name: this.definition.name };
        if (this.definition.proxy_url) body["proxy_url"] = this.definition.proxy_url;

        const updated = this.makeRequest("PATCH", `/domains/${this.state.domain_id}`, body);
        this.state = {
            ...this.state,
            name: updated?.name,
            verification_status: updated?.verification?.status,
        };
        cli.output(`Updated Clerk domain ${this.state.domain_id}`);
    }

    override delete(): void {
        if (!this.state?.domain_id || this.state.existing) return;
        try {
            this.makeRequest("DELETE", `/domains/${this.state.domain_id}`);
            cli.output(`Deleted Clerk domain ${this.state.domain_id}`);
        } catch { /* ignore deletion errors */ }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.domain_id);
    }

    @action("get-info")
    /**
     * @description Get domain details including verification status
     */
    getInfo(): void {
        if (!this.state?.domain_id) {
            cli.output("Domain not created yet");
            return;
        }
        const list = this.makeRequest("GET", "/domains");
        const items = Array.isArray(list?.data) ? list.data : [];
        const domain = items.find((it: any) => it.id === this.state?.domain_id);
        if (domain) {
            cli.output(JSON.stringify(domain, null, 2));
        } else {
            cli.output(`Domain ${this.state.domain_id} not found in domain list`);
        }
    }
}
