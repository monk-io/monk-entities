import { StripeEntity, StripeEntityDefinition, StripeEntityState } from "./stripe-base.ts";
import cli from "cli";

export interface StripePriceDefinition extends StripeEntityDefinition {
    /** Either provide lookup_key, or define currency+unit_amount and product reference to create */
    lookup_key?: string;
    /** If creating price */
    currency?: string;
    unit_amount?: number;
    recurring_interval?: "day" | "week" | "month" | "year";
    /** Product ID to associate this price with when creating */
    product_id?: string;
    /** Adopt existing by id if provided */
    price_id?: string;
}

export interface StripePriceState extends StripeEntityState {
    price_id?: string;
    lookup_key?: string;
}

/**
 * @description Stripe Price entity.
 * Creates and manages Stripe prices for products.
 * Prices define how much and how often to charge for products.
 * 
 * ## Secrets
 * - Reads: `secret_ref` - Stripe API key (defaults to `stripe-api-key`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.price_id` - Stripe price ID
 * - `state.unit_amount` - Price amount in cents
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `stripe/product` - The product this price is for
 */
export class Price extends StripeEntity<StripePriceDefinition, StripePriceState> {
    protected getEntityName(): string { return this.state?.price_id || (this.definition.lookup_key || "stripe-price"); }

    override create(): void {
        // Adopt by explicit id
        if (this.definition.price_id) {
            const pr = this.makeRequest("GET", `/prices/${this.definition.price_id}`);
            this.state = { price_id: pr?.id, lookup_key: pr?.lookup_key, existing: true };
            cli.output(`ℹ️ Adopted existing Stripe price ${pr?.id}`);
            return;
        }

        // Resolve by lookup_key
        if (this.definition.lookup_key) {
            const list = this.makeRequest("GET", `/prices?lookup_keys[]=${encodeURIComponent(this.definition.lookup_key)}&active=true&limit=1`);
            const pr = Array.isArray(list?.data) && list.data.length > 0 ? list.data[0] : null;
            if (pr) {
                this.state = { price_id: pr.id, lookup_key: pr.lookup_key, existing: true };
                cli.output(`ℹ️ Resolved Stripe price by lookup_key ${this.definition.lookup_key}: ${pr.id}`);
                return;
            }
        }

        // Create new price
        if (!this.definition.currency || !this.definition.unit_amount) {
            throw new Error("To create a price, currency and unit_amount are required");
        }
        const productId = this.definition.product_id;
        if (!productId) {
            throw new Error("To create a price, product_id is required");
        }

        const params: Record<string, string> = {
            currency: this.definition.currency,
            unit_amount: String(this.definition.unit_amount),
        } as any;
        if (this.definition.recurring_interval) {
            params["recurring[interval]"] = this.definition.recurring_interval;
        }
        params["product"] = productId;
        if (this.definition.lookup_key) {
            params["lookup_key"] = this.definition.lookup_key;
        }

        const created = this.makeRequest("POST", "/prices", params);
        this.state = { price_id: created?.id, lookup_key: created?.lookup_key, existing: false };
        cli.output(`✅ Created Stripe price ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.price_id) { this.create(); return; }
        // Prices are mostly immutable; nothing to update safely.
    }

    override delete(): void {
        // Prices cannot be deleted if used; skip destructive behavior by default.
    }

    override checkReadiness(): boolean { return Boolean(this.state?.price_id); }
}



