import { StripeEntity, StripeEntityDefinition, StripeEntityState } from "./stripe-base.ts";
import cli from "cli";

export interface StripeCredentialsDefinition extends StripeEntityDefinition {
    /**
     * @description Optional publishable key (pk_test_... or pk_live_...), for convenience
     */
    publishable_key?: string;
}

export interface StripeCredentialsState extends StripeEntityState {
    /** Stripe account ID (acct_...) */
    account_id?: string;
    /** test|live derived from secret key */
    mode?: "test" | "live";
    /** Echo publishable key to state for env wiring */
    publishable_key?: string;
    /** Original secret ref for consumers to read via secret() */
    secret_ref?: string;
}

/**
 * @description Stripe Credentials entity.
 * Validates and manages Stripe API credentials.
 * Verifies the API key and provides account information.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Stripe API key (defaults to `stripe-api-key`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.account_id` - Stripe account ID (acct_...)
 * - `state.mode` - API mode ("test" or "live")
 * - `state.publishable_key` - Publishable key for client-side use
 * - `state.secret_ref` - Original secret ref name for consumers to read via secret()
 * 
 * ## Consuming Credentials in Runnables
 * ```yaml
 * app:
 *   defines: runnable
 *   connections:
 *     stripe:
 *       target: my-namespace/stripe-creds
 *       service: data
 *   variables:
 *     stripe_secret_ref:
 *       type: string
 *       value: <- connection-target("stripe") entity get-member("secret_ref")
 *     STRIPE_SECRET_KEY:
 *       env: STRIPE_SECRET_KEY
 *       type: string
 *       value: <- secret($stripe_secret_ref)
 *     STRIPE_PUBLISHABLE_KEY:
 *       env: STRIPE_PUBLISHABLE_KEY
 *       type: string
 *       value: <- connection-target("stripe") entity-state get-member("publishable_key")
 * ```
 * 
 * ## Composing with Other Entities
 * Validates credentials for use with:
 * - `stripe/product` - Product management
 * - `stripe/price` - Price management
 * - `stripe/webhook-endpoint` - Webhook configuration
 */
export class Credentials extends StripeEntity<StripeCredentialsDefinition, StripeCredentialsState> {
    protected getEntityName(): string {
        return "stripe-credentials";
    }

    override create(): void {
        // Derive mode
        const mode = this.deriveMode();

        // Validate key by fetching account
        const account = this.makeRequest("GET", "/account");
        const accountId = account?.id || undefined;

        this.state = {
            account_id: accountId,
            mode,
            publishable_key: this.definition.publishable_key,
            secret_ref: this.definition.secret_ref,
            existing: false,
        };
        cli.output(`✅ Stripe credentials valid for account ${accountId} (mode: ${mode})`);
    }

    override update(): void {
        // Same as create: validate and refresh state
        this.create();
    }

    override delete(): void {
        // No external resource to delete
        cli.output("Stripe credentials entity has no remote resources to delete");
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.account_id);
    }
}



