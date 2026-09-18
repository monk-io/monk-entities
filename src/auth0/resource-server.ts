import { action, type Args } from "monkec/base";
import { Auth0Entity, type Auth0EntityDefinition, type Auth0EntityState } from "./auth0-base.ts";
import { collectArray } from "./common.ts";
import cli from "cli";

export interface ResourceServerScope {
    /**
     * @description Permission string, e.g. "read:data"
     */
    value: string;
    /**
     * @description Human-readable explanation of the scope
     */
    scope_description?: string;
}

export interface ResourceServerDefinition extends Auth0EntityDefinition {
    /**
     * @description Friendly name for the resource server
     * @minLength 1
     */
    name: string;
    /**
     * @description Unique identifier (audience) for the API, e.g. https://api.example.com. Immutable once set.
     * @minLength 1
     */
    identifier: string;
    /**
     * @description Scopes (permissions) exposed by this API
     */
    scopes?: ResourceServerScope[];
}

export interface ResourceServerState extends Auth0EntityState {
    /**
     * @description Auth0-generated resource server ID
     */
    resource_server_id?: string;
    /**
     * @description API identifier (audience)
     */
    identifier?: string;
    /**
     * @description Friendly name for the resource server
     */
    name?: string;
}

/**
 * @description Auth0 Resource Server (API) entity.
 * Creates and manages Auth0 resource servers via the Management API. Resource servers
 * have no client secret of their own (that's an Application/client concept), so there
 * is no rotate-secret action here.
 *
 * ## State Fields for Composition
 * - `state.resource_server_id` - Auth0-generated resource server ID
 * - `state.identifier` - API identifier (audience), usable by `application` entities' grant configuration
 */
export class ResourceServer extends Auth0Entity<ResourceServerDefinition, ResourceServerState> {
    protected getEntityName(): string {
        return `Auth0 Resource Server ${this.definition.name}`;
    }

    private mapScopes(): Array<{ value: string; description?: string }> | undefined {
        const scopes = collectArray<ResourceServerScope>(this.definition, "scopes");
        if (scopes.length === 0) return undefined;
        return scopes.map((s) => ({ value: s.value, description: s.scope_description }));
    }

    private applyResponse(rs: any, existing: boolean): void {
        this.state.resource_server_id = rs.id;
        this.state.identifier = rs.identifier;
        this.state.name = rs.name;
        this.state.existing = existing;
    }

    override create(): void {
        // GET /resource-servers/{id} accepts either the generated id or the identifier itself,
        // so this doubles as an existence check by identifier.
        let existing: any = null;
        try {
            existing = this.makeRequest("GET", `/resource-servers/${encodeURIComponent(this.definition.identifier)}`);
        } catch {
            existing = null;
        }

        if (existing) {
            this.applyResponse(existing, true);
            cli.output(`Adopted existing Auth0 resource server ${existing.id}`);
            return;
        }

        const body: Record<string, any> = {
            name: this.definition.name,
            identifier: this.definition.identifier,
        };
        const scopes = this.mapScopes();
        if (scopes) body.scopes = scopes;

        const created = this.makeRequest("POST", "/resource-servers", body);
        this.applyResponse(created, false);
        cli.output(`Created Auth0 resource server ${this.state.resource_server_id}`);
    }

    override update(): void {
        if (!this.state.resource_server_id) {
            this.create();
            return;
        }
        // identifier is immutable once set; only name and scopes are updatable
        const body: Record<string, any> = { name: this.definition.name };
        const scopes = this.mapScopes();
        if (scopes) body.scopes = scopes;

        const updated = this.makeRequest("PATCH", `/resource-servers/${this.state.resource_server_id}`, body);
        this.applyResponse(updated, this.state.existing ?? false);
        cli.output(`Updated Auth0 resource server ${this.state.resource_server_id}`);
    }

    override delete(): void {
        if (!this.state.resource_server_id) return;
        if (this.state.existing) {
            cli.output("Resource server was pre-existing, skipping deletion");
            return;
        }
        try {
            this.makeRequest("DELETE", `/resource-servers/${this.state.resource_server_id}`);
            cli.output(`Deleted Auth0 resource server ${this.state.resource_server_id}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes("404")) throw err;
        }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state.resource_server_id);
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.resource_server_id) {
            cli.output("Resource server not created yet");
            return;
        }
        const rs = this.makeRequest("GET", `/resource-servers/${this.state.resource_server_id}`);
        cli.output(JSON.stringify(rs, null, 2));
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        cli.output(
            "Auth0 billing is tenant-wide (MAU-based subscription tier), not attributable to an " +
            "individual resource server. No per-entity cost estimate is available."
        );
    }

    @action("costs")
    costs(): void {
        cli.output(JSON.stringify({
            type: "auth0-resource-server",
            costs: {
                month: {
                    amount: "0",
                    currency: "USD",
                    error: "Auth0 billing is tenant-wide (MAU-based), not attributable to an individual resource server",
                },
            },
        }));
    }
}
