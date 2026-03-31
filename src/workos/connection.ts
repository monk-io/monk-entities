import { WorkOSEntity, WorkOSEntityDefinition, WorkOSEntityState, action } from "./workos-base.ts";
import cli from "cli";

export interface WorkOSConnectionDefinition extends WorkOSEntityDefinition {
    /**
     * @description Connection name to search for (must match an existing connection)
     * @minLength 1
     * @maxLength 256
     */
    name: string;
    /**
     * @description Adopt existing connection by ID (preferred over name search)
     */
    connection_id?: string;
    /**
     * @description Organization ID to search connections within
     */
    organization_id?: string;
}

export interface WorkOSConnectionState extends WorkOSEntityState {
    /**
     * @description WorkOS connection ID (conn_...)
     */
    connection_id?: string;
    /**
     * @description Connection name
     */
    name?: string;
    /**
     * @description Connection state (draft, active, inactive, validating)
     */
    connection_state?: string;
    /**
     * @description SSO connection provider type
     */
    connection_provider?: string;
}

/**
 * @description WorkOS Connection entity.
 * Adopts and manages existing WorkOS SSO connections for enterprise single sign-on.
 * Connections represent identity provider configurations (SAML, OIDC, OAuth).
 * Note: Connections must be created via the WorkOS Dashboard or Admin Portal — this entity adopts existing ones.
 * This is a billable resource — WorkOS charges per active SSO connection per month.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - WorkOS API key
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.connection_id` - WorkOS connection ID (conn_...)
 * - `state.name` - Connection name
 * - `state.connection_state` - Connection state (draft, active, inactive, validating)
 * - `state.connection_provider` - SSO provider type
 *
 * ## Composing with Other Entities
 * Works with:
 * - `workos/credentials` - Shares API credentials
 * - `workos/organization` - Connections belong to organizations
 */
export class Connection extends WorkOSEntity<WorkOSConnectionDefinition, WorkOSConnectionState> {
    protected getEntityName(): string {
        return this.definition.name;
    }

    override create(): void {
        // Adopt by ID
        if (this.definition.connection_id) {
            const conn = this.makeRequest("GET", `/connections/${this.definition.connection_id}`);
            this.state = {
                connection_id: conn?.id,
                name: conn?.name,
                connection_state: conn?.state,
                connection_provider: conn?.connection_type,
                existing: true,
            };
            cli.output(`Adopted WorkOS connection ${conn?.id}`);
            return;
        }

        // Search by name in org
        let found: any = null;
        try {
            let path = `/connections?limit=100`;
            if (this.definition.organization_id) {
                path += `&organization_id=${this.definition.organization_id}`;
            }
            const list = this.makeRequest("GET", path);
            const items = Array.isArray(list?.data) ? list.data : [];
            found = items.find((it: any) => it.name === this.definition.name);
        } catch { /* ignore search errors */ }

        if (found) {
            this.state = {
                connection_id: found.id,
                name: found.name,
                connection_state: found.state,
                connection_provider: found.connection_type,
                existing: true,
            };
            cli.output(`Adopted WorkOS connection ${found.id}`);
            return;
        }

        throw new Error(`SSO connection "${this.definition.name}" not found. Connections must be created via the WorkOS Dashboard or Admin Portal before they can be managed by this entity.`);
    }

    override update(): void {
        if (!this.state?.connection_id) {
            this.create();
            return;
        }
        // Refresh state from API (connections are read-only via API)
        const conn = this.makeRequest("GET", `/connections/${this.state.connection_id}`);
        this.state = {
            ...this.state,
            name: conn?.name,
            connection_state: conn?.state,
            connection_provider: conn?.connection_type,
        };
        cli.output(`Refreshed WorkOS connection ${this.state.connection_id}`);
    }

    override delete(): void {
        if (!this.state?.connection_id) return;
        try {
            this.makeRequest("DELETE", `/connections/${this.state.connection_id}`);
            cli.output(`Deleted WorkOS connection ${this.state.connection_id}`);
        } catch { /* ignore deletion errors */ }
    }

    override checkReadiness(): boolean {
        if (!this.state?.connection_id) return false;
        try {
            const conn = this.makeRequest("GET", `/connections/${this.state.connection_id}`);
            this.state.connection_state = conn?.state;
            return conn?.state === "active" || conn?.state === "draft";
        } catch {
            return false;
        }
    }

    @action("get-info")
    /**
     * @description Get connection details
     */
    getInfo(): void {
        if (!this.state?.connection_id) {
            cli.output("Connection not adopted yet");
            return;
        }
        const conn = this.makeRequest("GET", `/connections/${this.state.connection_id}`);
        cli.output(JSON.stringify(conn, null, 2));
    }

    @action("get-cost-estimate")
    /**
     * @description Get estimated monthly cost for this SSO connection
     */
    getCostEstimate(): void {
        const state = this.state?.connection_state || "unknown";
        cli.output(`WorkOS SSO Connection (state: ${state})\n\nSSO connections are billed per active connection per month on the Pro plan.\nFree tier includes limited connections.\nSee https://workos.com/pricing for current rates.`);
    }

    @action("costs")
    /**
     * @description Get cost data in JSON format for billing
     */
    costs(): void {
        cli.output(JSON.stringify({
            type: "workos-connection",
            costs: {
                month: {
                    amount: "0.00",
                    currency: "USD",
                },
            },
        }));
    }
}
