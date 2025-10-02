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



