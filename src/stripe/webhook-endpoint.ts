import { StripeEntity, StripeEntityDefinition, StripeEntityState } from "./stripe-base.ts";
import cli from "cli";
import secret from "secret";

export interface StripeWebhookDefinition extends StripeEntityDefinition {
    /** URL to deliver Stripe events to */
    destination_url: string;
    /** Optional list of event types to subscribe to */
    event_types?: string[];
    /** Optional endpoint description */
    endpoint_description?: string;
    /**
     * @description Secret name to store the signing secret; defaults to stripe-webhook-secret
     * @minLength 1
     * @maxLength 64
     */
    signing_secret_ref?: string;
}

export interface StripeWebhookState extends StripeEntityState {
    webhook_endpoint_id?: string;
    webhook_url?: string;
    /** Secret name where signing secret is stored */
    webhook_signing_secret_secret?: string;
}

/**
 * @description Stripe Webhook Endpoint entity.
 * Creates and manages Stripe webhook endpoints for receiving events.
 * Webhooks notify your application of events like successful payments.
 * 
 * ## Secrets
 * - Reads: `secret_ref` - Stripe API key (defaults to `stripe-api-key`)
 * - Writes: `signing_secret_ref` - Webhook signing secret (if specified)
 * 
 * ## State Fields for Composition
 * - `state.id` - Webhook endpoint ID
 * - `state.url` - Webhook URL
 * - `state.secret` - Webhook signing secret
 * 
 * ## Composing with Other Entities
 * Stripe webhooks are typically standalone, pointing to your application's endpoint.
 */
export class WebhookEndpoint extends StripeEntity<StripeWebhookDefinition, StripeWebhookState> {
    protected getEntityName(): string {
        return "stripe-webhook";
    }

    override create(): void {
        // Try to find existing endpoint by URL
        let existing: any = null;
        try {
            const list = this.makeRequest("GET", "/webhook_endpoints");
            const data = Array.isArray(list?.data) ? list.data : [];
            existing = data.find((w: any) => w.url === this.definition.destination_url);
        } catch {}

        const signingSecretRef = this.definition.signing_secret_ref || "stripe-webhook-secret";

        if (existing) {
            this.state = {
                webhook_endpoint_id: existing.id,
                webhook_url: existing.url,
                webhook_signing_secret_secret: signingSecretRef,
                existing: true,
            };
            cli.output(`ℹ️ Reusing existing Stripe webhook endpoint ${existing.id}`);
            return;
        }

        // Build form-encoded parameters
        const flatParams: Record<string, string> = { url: this.definition.destination_url };
        if (this.definition.endpoint_description) {
            flatParams["description"] = this.definition.endpoint_description;
        }
        if (Array.isArray(this.definition.event_types) && this.definition.event_types.length > 0) {
            this.definition.event_types.forEach((eventType, index) => {
                flatParams[`enabled_events[${index}]`] = eventType;
            });
        } else {
            flatParams["enabled_events[0]"] = "*";
        }

        const created = this.makeRequest("POST", "/webhook_endpoints", flatParams);

        // Store signing secret into provided secret ref
        if (created?.secret) {
            secret.set(signingSecretRef, created.secret);
        }

        this.state = {
            webhook_endpoint_id: created?.id,
            webhook_url: created?.url,
            webhook_signing_secret_secret: signingSecretRef,
            existing: false,
        };
        cli.output(`✅ Created Stripe webhook endpoint ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.webhook_endpoint_id) {
            this.create();
            return;
        }
        // Update enabled events / url if changed
        const id = this.state.webhook_endpoint_id;
        const flatParams: Record<string, string> = {};
        if (this.definition.destination_url && this.definition.destination_url !== this.state.webhook_url) {
            flatParams["url"] = this.definition.destination_url;
        }
        if (Array.isArray(this.definition.event_types) && this.definition.event_types.length > 0) {
            this.definition.event_types.forEach((e, i) => {
                flatParams[`enabled_events[${i}]`] = e;
            });
        }
        if (this.definition.endpoint_description) {
            flatParams["description"] = this.definition.endpoint_description;
        }

        if (Object.keys(flatParams).length > 0) {
            const updated = this.makeRequest("POST", `/webhook_endpoints/${id}`, flatParams);
            this.state = {
                ...this.state,
                webhook_url: updated?.url || this.state.webhook_url,
            };
            cli.output(`🔄 Updated Stripe webhook endpoint ${id}`);
        }
    }

    override delete(): void {
        if (!this.state?.webhook_endpoint_id) return;
        const id = this.state.webhook_endpoint_id;
        try {
            this.makeRequest("DELETE", `/webhook_endpoints/${id}`);
            cli.output(`🗑️ Deleted Stripe webhook endpoint ${id}`);
        } catch (e) {
            cli.output(`⚠️ Failed to delete webhook endpoint ${id}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.webhook_endpoint_id && this.state?.webhook_url);
    }
}


