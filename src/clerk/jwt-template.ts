import { ClerkEntity, ClerkEntityDefinition, ClerkEntityState, action } from "./clerk-base.ts";
import cli from "cli";

export interface ClerkJwtTemplateDefinition extends ClerkEntityDefinition {
    /**
     * @description Template name (unique identifier)
     * @minLength 1
     * @maxLength 256
     */
    name: string;
    /**
     * @description Optional: adopt existing template by ID
     */
    template_id?: string;
    /**
     * @description Custom claims as a JSON object (required by Clerk API)
     */
    claims: Record<string, any>;
    /**
     * @description Token lifetime in seconds
     */
    lifetime?: number;
    /**
     * @description Clock skew tolerance in seconds
     */
    clock_skew_in_seconds?: number;
    /**
     * @description Custom signing algorithm (e.g., RS256, HS256)
     */
    signing_algorithm?: string;
    /**
     * @description Allowed clock skew in seconds
     */
    allowed_clock_skew?: number;
}

export interface ClerkJwtTemplateState extends ClerkEntityState {
    /**
     * @description JWT template ID
     */
    template_id?: string;
    /**
     * @description Template name
     */
    name?: string;
}

/**
 * @description Clerk JWT Template entity.
 * Creates and manages JWT templates for generating custom tokens.
 * JWT templates define the claims, lifetime, and signing configuration for tokens.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Clerk secret API key
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.template_id` - JWT template ID
 * - `state.name` - Template name
 *
 * ## Composing with Other Entities
 * Works with:
 * - `clerk/credentials` - Shares API credentials
 */
export class JwtTemplate extends ClerkEntity<ClerkJwtTemplateDefinition, ClerkJwtTemplateState> {
    protected getEntityName(): string {
        return this.definition.name;
    }

    override create(): void {
        // Adopt existing by ID
        if (this.definition.template_id) {
            const tmpl = this.makeRequest("GET", `/jwt_templates/${this.definition.template_id}`);
            this.state = {
                template_id: tmpl?.id,
                name: tmpl?.name,
                existing: true,
            };
            cli.output(`Adopted existing Clerk JWT template ${tmpl?.id}`);
            return;
        }

        // Try find by name
        let found: any = null;
        try {
            const list = this.makeRequest("GET", "/jwt_templates");
            const items = Array.isArray(list) ? list : [];
            found = items.find((it: any) => it.name === this.definition.name);
        } catch { /* ignore search errors */ }

        if (found) {
            this.state = {
                template_id: found.id,
                name: found.name,
                existing: true,
            };
            cli.output(`Reusing existing Clerk JWT template ${found.id}`);
            return;
        }

        const body: Record<string, any> = {
            name: this.definition.name,
            claims: this.definition.claims,
        };
        if (this.definition.lifetime !== undefined) body["lifetime"] = this.definition.lifetime;
        if (this.definition.clock_skew_in_seconds !== undefined) body["clock_skew_in_seconds"] = this.definition.clock_skew_in_seconds;
        if (this.definition.signing_algorithm) body["signing_algorithm"] = this.definition.signing_algorithm;
        if (this.definition.allowed_clock_skew !== undefined) body["allowed_clock_skew"] = this.definition.allowed_clock_skew;

        const created = this.makeRequest("POST", "/jwt_templates", body);
        this.state = {
            template_id: created?.id,
            name: created?.name,
            existing: false,
        };
        cli.output(`Created Clerk JWT template ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.template_id) {
            this.create();
            return;
        }
        const body: Record<string, any> = {
            name: this.definition.name,
            claims: this.definition.claims,
        };
        if (this.definition.lifetime !== undefined) body["lifetime"] = this.definition.lifetime;
        if (this.definition.clock_skew_in_seconds !== undefined) body["clock_skew_in_seconds"] = this.definition.clock_skew_in_seconds;
        if (this.definition.signing_algorithm) body["signing_algorithm"] = this.definition.signing_algorithm;
        if (this.definition.allowed_clock_skew !== undefined) body["allowed_clock_skew"] = this.definition.allowed_clock_skew;

        const updated = this.makeRequest("PATCH", `/jwt_templates/${this.state.template_id}`, body);
        this.state = {
            ...this.state,
            name: updated?.name,
        };
        cli.output(`Updated Clerk JWT template ${this.state.template_id}`);
    }

    override delete(): void {
        if (!this.state?.template_id || this.state.existing) return;
        try {
            this.makeRequest("DELETE", `/jwt_templates/${this.state.template_id}`);
            cli.output(`Deleted Clerk JWT template ${this.state.template_id}`);
        } catch { /* ignore deletion errors */ }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.template_id);
    }

    @action("get-info")
    /**
     * @description Get JWT template details
     */
    getInfo(): void {
        if (!this.state?.template_id) {
            cli.output("JWT template not created yet");
            return;
        }
        const tmpl = this.makeRequest("GET", `/jwt_templates/${this.state.template_id}`);
        cli.output(JSON.stringify(tmpl, null, 2));
    }
}
