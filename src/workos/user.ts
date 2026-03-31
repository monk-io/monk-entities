import { WorkOSEntity, WorkOSEntityDefinition, WorkOSEntityState, action } from "./workos-base.ts";
import secret from "secret";
import cli from "cli";

export interface WorkOSUserDefinition extends WorkOSEntityDefinition {
    /**
     * @description User email address
     * @minLength 1
     * @maxLength 320
     */
    email: string;
    /**
     * @description Optional: adopt existing user by ID
     */
    user_id?: string;
    /**
     * @description User first name
     */
    first_name?: string;
    /**
     * @description User last name
     */
    last_name?: string;
    /**
     * @description Whether the email is pre-verified
     */
    email_verified?: boolean;
    /**
     * @description Secret name storing the user password (optional)
     */
    password_secret_ref?: string;
    /**
     * @description User metadata key-value pairs
     */
    metadata?: Record<string, any>;
}

export interface WorkOSUserState extends WorkOSEntityState {
    /**
     * @description WorkOS user ID (user_...)
     */
    user_id?: string;
    /**
     * @description User email address
     */
    email?: string;
    /**
     * @description User first name
     */
    first_name?: string;
    /**
     * @description User last name
     */
    last_name?: string;
    /**
     * @description Whether email has been verified
     */
    email_verified?: boolean;
}

/**
 * @description WorkOS User entity.
 * Creates and manages WorkOS users via the User Management API.
 * Users can be assigned to organizations via memberships and authenticated via SSO, magic auth, or password.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - WorkOS API key; optionally `password_secret_ref` for user password
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.user_id` - WorkOS user ID (user_...)
 * - `state.email` - User email address
 * - `state.first_name` - User first name
 * - `state.last_name` - User last name
 * - `state.email_verified` - Whether email is verified
 *
 * ## Composing with Other Entities
 * Works with:
 * - `workos/credentials` - Shares API credentials
 * - `workos/organization` - Users join organizations via memberships
 * - `workos/role` - Users are assigned roles within organizations
 */
export class User extends WorkOSEntity<WorkOSUserDefinition, WorkOSUserState> {
    protected getEntityName(): string {
        return this.definition.email;
    }

    override create(): void {
        // Adopt existing by ID
        if (this.definition.user_id) {
            const user = this.makeRequest("GET", `/user_management/users/${this.definition.user_id}`);
            this.state = {
                user_id: user?.id,
                email: user?.email,
                first_name: user?.first_name,
                last_name: user?.last_name,
                email_verified: user?.email_verified,
                existing: true,
            };
            cli.output(`Adopted existing WorkOS user ${user?.id}`);
            return;
        }

        // Try find by email
        let found: any = null;
        try {
            const list = this.makeRequest("GET", `/user_management/users?email=${encodeURIComponent(this.definition.email)}&limit=1`);
            const items = Array.isArray(list?.data) ? list.data : [];
            if (items.length > 0) found = items[0];
        } catch { /* ignore search errors */ }

        if (found) {
            this.state = {
                user_id: found.id,
                email: found.email,
                first_name: found.first_name,
                last_name: found.last_name,
                email_verified: found.email_verified,
                existing: true,
            };
            cli.output(`Reusing existing WorkOS user ${found.id}`);
            return;
        }

        const body: Record<string, any> = {
            email: this.definition.email,
        };
        if (this.definition.first_name) body["first_name"] = this.definition.first_name;
        if (this.definition.last_name) body["last_name"] = this.definition.last_name;
        if (this.definition.email_verified !== undefined) body["email_verified"] = this.definition.email_verified;
        if (this.definition.password_secret_ref) {
            const password = secret.get(this.definition.password_secret_ref);
            if (password) body["password"] = password;
        }
        if (this.definition.metadata) body["metadata"] = this.definition.metadata;

        const created = this.makeRequest("POST", "/user_management/users", body);
        this.state = {
            user_id: created?.id,
            email: created?.email,
            first_name: created?.first_name,
            last_name: created?.last_name,
            email_verified: created?.email_verified,
            existing: false,
        };
        cli.output(`Created WorkOS user ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.user_id) {
            this.create();
            return;
        }
        const body: Record<string, any> = {};
        if (this.definition.first_name) body["first_name"] = this.definition.first_name;
        if (this.definition.last_name) body["last_name"] = this.definition.last_name;
        if (this.definition.email_verified !== undefined) body["email_verified"] = this.definition.email_verified;
        if (this.definition.metadata) body["metadata"] = this.definition.metadata;

        const updated = this.makeRequest("PUT", `/user_management/users/${this.state.user_id}`, body);
        this.state = {
            ...this.state,
            email: updated?.email,
            first_name: updated?.first_name,
            last_name: updated?.last_name,
            email_verified: updated?.email_verified,
        };
        cli.output(`Updated WorkOS user ${this.state.user_id}`);
    }

    override delete(): void {
        if (!this.state?.user_id || this.state.existing) return;
        try {
            this.makeRequest("DELETE", `/user_management/users/${this.state.user_id}`);
            cli.output(`Deleted WorkOS user ${this.state.user_id}`);
        } catch { /* ignore deletion errors */ }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.user_id);
    }

    @action("get-info")
    /**
     * @description Get user details
     */
    getInfo(): void {
        if (!this.state?.user_id) {
            cli.output("User not created yet");
            return;
        }
        const user = this.makeRequest("GET", `/user_management/users/${this.state.user_id}`);
        cli.output(JSON.stringify(user, null, 2));
    }
}
