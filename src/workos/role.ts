import { WorkOSEntity, WorkOSEntityDefinition, WorkOSEntityState, action } from "./workos-base.ts";
import cli from "cli";

export interface WorkOSRoleDefinition extends WorkOSEntityDefinition {
    /**
     * @description Role name
     * @minLength 1
     * @maxLength 256
     */
    name: string;
    /**
     * @description URL-friendly slug for the role (lowercase, numbers, hyphens, underscores)
     */
    slug: string;
    /**
     * @description Human-readable role summary
     */
    role_description?: string;
    /**
     * @description List of permission slugs assigned to this role
     */
    permissions?: string[];
}

export interface WorkOSRoleState extends WorkOSEntityState {
    /**
     * @description WorkOS role ID (role_...)
     */
    role_id?: string;
    /**
     * @description Role name
     */
    name?: string;
    /**
     * @description Role slug
     */
    slug?: string;
}

/**
 * @description WorkOS Role entity.
 * Creates and manages WorkOS environment-level roles for role-based access control (RBAC).
 * Roles group permissions and can be assigned to organization memberships.
 * Uses the /authorization/roles API with slug-based identification.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - WorkOS API key
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.role_id` - WorkOS role ID (role_...)
 * - `state.name` - Role name
 * - `state.slug` - Role slug
 *
 * ## Composing with Other Entities
 * Works with:
 * - `workos/credentials` - Shares API credentials
 * - `workos/organization` - Roles are used within organizations
 * - `workos/user` - Users are assigned roles via organization memberships
 */
export class Role extends WorkOSEntity<WorkOSRoleDefinition, WorkOSRoleState> {
    protected getEntityName(): string {
        return this.definition.name;
    }

    override create(): void {
        // Try find by slug
        let found: any = null;
        try {
            const list = this.makeRequest("GET", `/authorization/roles?limit=100`);
            const items = Array.isArray(list?.data) ? list.data : [];
            found = items.find((it: any) => it.slug === this.definition.slug || it.name === this.definition.name);
        } catch { /* ignore search errors */ }

        if (found) {
            this.state = {
                role_id: found.id,
                name: found.name,
                slug: found.slug,
                existing: true,
            };
            cli.output(`Reusing existing WorkOS role ${found.slug}`);
            return;
        }

        const body: Record<string, any> = {
            name: this.definition.name,
            slug: this.definition.slug,
        };
        if (this.definition.role_description) body["description"] = this.definition.role_description;

        const created = this.makeRequest("POST", "/authorization/roles", body);
        this.state = {
            role_id: created?.id,
            name: created?.name,
            slug: created?.slug,
            existing: false,
        };

        // Set permissions separately if provided
        if (this.definition.permissions && this.definition.permissions.length > 0) {
            try {
                this.makeRequest("PUT", `/authorization/roles/${this.definition.slug}/permissions`, {
                    permissions: this.definition.permissions,
                });
            } catch { /* permissions may not exist yet */ }
        }

        cli.output(`Created WorkOS role ${created?.slug}`);
    }

    override update(): void {
        if (!this.state?.slug) {
            this.create();
            return;
        }
        const body: Record<string, any> = {
            name: this.definition.name,
        };
        if (this.definition.role_description) body["description"] = this.definition.role_description;

        const updated = this.makeRequest("PATCH", `/authorization/roles/${this.state.slug}`, body);
        this.state = {
            ...this.state,
            name: updated?.name,
            slug: updated?.slug,
        };

        // Update permissions if provided
        if (this.definition.permissions && this.definition.permissions.length > 0) {
            try {
                this.makeRequest("PUT", `/authorization/roles/${this.state.slug}/permissions`, {
                    permissions: this.definition.permissions,
                });
            } catch { /* ignore permission errors */ }
        }

        cli.output(`Updated WorkOS role ${this.state.slug}`);
    }

    override delete(): void {
        if (!this.state?.slug || this.state.existing) return;
        try {
            this.makeRequest("DELETE", `/authorization/roles/${this.state.slug}`);
            cli.output(`Deleted WorkOS role ${this.state.slug}`);
        } catch { /* ignore deletion errors */ }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.slug);
    }

    @action("get-info")
    /**
     * @description Get role details
     */
    getInfo(): void {
        if (!this.state?.slug) {
            cli.output("Role not created yet");
            return;
        }
        const role = this.makeRequest("GET", `/authorization/roles/${this.state.slug}`);
        cli.output(JSON.stringify(role, null, 2));
    }
}
