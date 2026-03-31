import { WorkOSEntity, WorkOSEntityDefinition, WorkOSEntityState } from "./workos-base.ts";
import cli from "cli";

export interface WorkOSCredentialsDefinition extends WorkOSEntityDefinition {
    /**
     * @description Optional WorkOS Client ID for OAuth/SSO flows
     */
    client_id?: string;
}

export interface WorkOSCredentialsState extends WorkOSEntityState {
    /**
     * @description API mode derived from secret key (test or production)
     */
    mode?: "test" | "production";
    /**
     * @description Client ID echoed to state for consumer wiring
     */
    client_id?: string;
    /**
     * @description Original secret ref name for consumers to read via secret()
     */
    secret_ref?: string;
}

/**
 * @description WorkOS Credentials entity.
 * Validates WorkOS API credentials and exposes environment information.
 * Verifies the API key by listing organizations with a limit of 1.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - WorkOS API key (defaults to `workos-api-key`)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.mode` - API mode ("test" or "production")
 * - `state.client_id` - Client ID for OAuth/SSO flows
 * - `state.secret_ref` - Original secret ref name for consumers
 *
 * ## Consuming Credentials in Runnables
 * ```yaml
 * app:
 *   defines: runnable
 *   connections:
 *     workos:
 *       target: my-namespace/workos-creds
 *       service: data
 *   variables:
 *     workos_secret_ref:
 *       type: string
 *       value: <- connection-target("workos") entity get-member("secret_ref")
 *     WORKOS_API_KEY:
 *       env: WORKOS_API_KEY
 *       type: string
 *       value: <- secret($workos_secret_ref)
 *     WORKOS_CLIENT_ID:
 *       env: WORKOS_CLIENT_ID
 *       type: string
 *       value: <- connection-target("workos") entity-state get-member("client_id")
 * ```
 *
 * ## Composing with Other Entities
 * Validates credentials for use with:
 * - `workos/organization` - Organization management
 * - `workos/connection` - SSO connection management
 * - `workos/role` - RBAC role management
 * - `workos/user` - User management
 */
export class Credentials extends WorkOSEntity<WorkOSCredentialsDefinition, WorkOSCredentialsState> {
    protected getEntityName(): string {
        return "workos-credentials";
    }

    override create(): void {
        const mode = this.deriveMode();

        // Validate key by listing organizations with limit 1
        this.makeRequest("GET", "/organizations?limit=1");

        this.state = {
            mode,
            client_id: this.definition.client_id,
            secret_ref: this.definition.secret_ref,
            existing: false,
        };
        cli.output(`WorkOS credentials valid (mode: ${mode})`);
    }

    override update(): void {
        this.create();
    }

    override delete(): void {
        cli.output("WorkOS credentials entity has no remote resources to delete");
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.secret_ref);
    }
}
