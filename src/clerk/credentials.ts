import { ClerkEntity, ClerkEntityDefinition, ClerkEntityState } from "./clerk-base.ts";
import cli from "cli";

export interface ClerkCredentialsDefinition extends ClerkEntityDefinition {
    /**
     * @description Optional publishable key (pk_test_... or pk_live_...) for client-side use
     */
    publishable_key?: string;
}

export interface ClerkCredentialsState extends ClerkEntityState {
    /**
     * @description Clerk instance ID
     */
    instance_id?: string;
    /**
     * @description API mode derived from secret key (test or live)
     */
    mode?: "test" | "live";
    /**
     * @description Publishable key echoed to state for env wiring
     */
    publishable_key?: string;
    /**
     * @description Original secret ref name for consumers to read via secret()
     */
    secret_ref?: string;
}

/**
 * @description Clerk Credentials entity.
 * Validates Clerk API credentials and exposes instance information.
 * Verifies the API key by fetching the instance configuration.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Clerk secret API key (defaults to `clerk-secret-key`)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.instance_id` - Clerk instance ID
 * - `state.mode` - API mode ("test" or "live")
 * - `state.publishable_key` - Publishable key for client-side use
 * - `state.secret_ref` - Original secret ref name for consumers
 *
 * ## Consuming Credentials in Runnables
 * ```yaml
 * app:
 *   defines: runnable
 *   connections:
 *     clerk:
 *       target: my-namespace/clerk-creds
 *       service: data
 *   variables:
 *     clerk_secret_ref:
 *       type: string
 *       value: <- connection-target("clerk") entity get-member("secret_ref")
 *     CLERK_SECRET_KEY:
 *       env: CLERK_SECRET_KEY
 *       type: string
 *       value: <- secret($clerk_secret_ref)
 *     CLERK_PUBLISHABLE_KEY:
 *       env: CLERK_PUBLISHABLE_KEY
 *       type: string
 *       value: <- connection-target("clerk") entity-state get-member("publishable_key")
 * ```
 *
 * ## Composing with Other Entities
 * Validates credentials for use with:
 * - `clerk/organization` - Organization management
 * - `clerk/jwt-template` - JWT template configuration
 * - `clerk/domain` - Custom domain management
 * - `clerk/oauth-application` - OAuth application management
 */
export class Credentials extends ClerkEntity<ClerkCredentialsDefinition, ClerkCredentialsState> {
    protected getEntityName(): string {
        return "clerk-credentials";
    }

    override create(): void {
        const mode = this.deriveMode();

        // Validate key by fetching instance info
        // The /instance endpoint is available on the Clerk Backend API
        // If the key is invalid, this will throw
        let instanceId: string | undefined;
        try {
            // Use a lightweight endpoint to validate the key
            const result = this.makeRequest("GET", "/instance");
            instanceId = result?.id || undefined;
        } catch {
            // Fallback: try listing users with limit 1 to validate the key
            this.makeRequest("GET", "/users?limit=1");
            instanceId = undefined;
        }

        this.state = {
            instance_id: instanceId,
            mode,
            publishable_key: this.definition.publishable_key,
            secret_ref: this.definition.secret_ref,
            existing: false,
        };
        cli.output(`Clerk credentials valid (mode: ${mode})`);
    }

    override update(): void {
        this.create();
    }

    override delete(): void {
        cli.output("Clerk credentials entity has no remote resources to delete");
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.secret_ref);
    }
}
