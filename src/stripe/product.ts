import { StripeEntity, StripeEntityDefinition, StripeEntityState } from "./stripe-base.ts";
import cli from "cli";

export interface StripeProductDefinition extends StripeEntityDefinition {
    /** Human-readable product name */
    name: string;
    /** Optional idempotency: adopt existing by product ID if provided */
    product_id?: string;
    /** Optional product description */
    product_description?: string;
    /** Optional metadata (flat map) */
    metadata?: Record<string, string>;
}

export interface StripeProductState extends StripeEntityState {
    product_id?: string;
    name?: string;
}

/**
 * @description Stripe Product entity.
 * Creates and manages Stripe products for billing and subscriptions.
 * Products represent goods or services available for purchase.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Stripe API key (defaults to `stripe-api-key`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.product_id` - Stripe product ID
 * - `state.name` - Product name
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `stripe/price` - Create prices for this product
 */
export class Product extends StripeEntity<StripeProductDefinition, StripeProductState> {
    protected getEntityName(): string { return this.definition.name; }

    override create(): void {
        // Adopt existing by ID
        if (this.definition.product_id) {
            const p = this.makeRequest("GET", `/products/${this.definition.product_id}`);
            this.state = { product_id: p?.id, name: p?.name, existing: true };
            cli.output(`ℹ️ Adopted existing Stripe product ${p?.id}`);
            return;
        }

        // Try find by name
        let found: any = null;
        try {
            const list = this.makeRequest("GET", "/products?limit=100");
            const items = Array.isArray(list?.data) ? list.data : [];
            found = items.find((it: any) => it.name === this.definition.name);
        } catch {}
        if (found) {
            this.state = { product_id: found.id, name: found.name, existing: true };
            cli.output(`ℹ️ Reusing existing Stripe product ${found.id}`);
            return;
        }

        const params: Record<string, string> = { name: this.definition.name };
        if (this.definition.product_description) params["description"] = this.definition.product_description;
        if (this.definition.metadata) {
            for (const [k, v] of Object.entries(this.definition.metadata)) {
                params[`metadata[${k}]`] = v;
            }
        }
        const created = this.makeRequest("POST", "/products", params);
        this.state = { product_id: created?.id, name: created?.name, existing: false };
        cli.output(`✅ Created Stripe product ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.product_id) { this.create(); return; }
        const params: Record<string, string> = {};
        if (this.definition.product_description) params["description"] = this.definition.product_description;
        if (this.definition.metadata) {
            for (const [k, v] of Object.entries(this.definition.metadata)) {
                params[`metadata[${k}]`] = v;
            }
        }
        if (Object.keys(params).length > 0) {
            const updated = this.makeRequest("POST", `/products/${this.state.product_id}`, params);
            this.state = { ...this.state, name: updated?.name };
            cli.output(`🔄 Updated Stripe product ${this.state.product_id}`);
        }
    }

    override delete(): void {
        if (!this.state?.product_id || this.state.existing) return;
        try {
            this.makeRequest("DELETE", `/products/${this.state.product_id}`);
            cli.output(`🗑️ Deleted Stripe product ${this.state.product_id}`);
        } catch {}
    }

    override checkReadiness(): boolean { return Boolean(this.state?.product_id); }
}


