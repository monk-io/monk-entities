import { action, Args } from "monkec/base";
import { NeonEntity, NeonEntityDefinition, NeonEntityState } from "./neon-base.ts";
import secret from "secret";
import cli from "cli";

/**
 * Defines the immutable configuration properties for a Neon role entity.
 * @interface NeonRoleDefinition
 */
export interface NeonRoleDefinition extends NeonEntityDefinition {
    /**
     * Project ID that this role belongs to
     * @description The Neon project ID (format: project-name-123456)
     */
    projectId: string;

    /**
     * Branch ID that this role belongs to
     * @description The Neon branch ID (format: br-name-123456)
     */
    branchId: string;

    /**
     * Role name
     * @description Name for the database role
     */
    name: string;

    /**
     * Whether the role can login
     * @description If false, creates a NOLOGIN role for permission management
     * @default true
     */
    canLogin?: boolean;

    /**
     * Secret name for storing the generated password
     * @description Name of the secret to store the role's password
     * @default app-user-password
     */
    passwordSecretName?: string;
}

/**
 * Represents the mutable runtime state of a Neon role.
 * @interface NeonRoleState
 */
export interface NeonRoleState extends NeonEntityState {
    /**
     * Role name
     * @description Name of the database role
     */
    name?: string;

    /**
     * Role password
     * @description Generated password for the role
     */
    password?: string;

    /**
     * Whether the role is protected
     * @description If true, role cannot be modified/deleted
     */
    protected?: boolean;

    /**
     * Creation timestamp
     * @description When the role was created
     * @format date-time
     */
    createdAt?: string;

    /**
     * Last update timestamp
     * @description When the role was last updated
     * @format date-time
     */
    updatedAt?: string;

    /**
     * Operation ID for tracking role creation
     * @description ID of the operation that created the role
     */
    operationId?: string;
}

/**
 * @description Neon Role entity.
 * Creates and manages PostgreSQL roles (users) within a Neon branch.
 * Roles control database access and permissions.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Neon API key (defaults to `neon-api-key`)
 * - Writes: secret name from `password_secret_ref` property - Role password (defaults to `{name}-password`)
 * 
 * ## State Fields for Composition
 * - `state.name` - Role name
 * - `state.protected` - Whether the role is protected (cannot be deleted)
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `neon/project` - The project containing this role
 * - `neon/branch` - The branch this role exists on
 */
export class Role extends NeonEntity<NeonRoleDefinition, NeonRoleState> {
    
    protected getEntityName(): string {
        return `Neon Role ${this.definition.name} in branch ${this.definition.branchId}`;
    }

    /** Get password secret name */
    private getPasswordSecretName(): string {
        return this.definition.passwordSecretName || 'app-user-password';
    }

    override create(): void {
        const roleData = {
            role: {
                name: this.definition.name,
                no_login: !this.definition.canLogin
            }
        };

        const response = this.makeRequest(
            "POST",
            `/projects/${this.definition.projectId}/branches/${this.definition.branchId}/roles`,
            roleData
        );

        const role = response.role;
        this.state.name = role.name;
        this.state.protected = role.protected;
        this.state.createdAt = role.created_at;
        this.state.updatedAt = role.updated_at;
        
        if (role.password) {
            secret.set(this.getPasswordSecretName(), role.password);
        }
        
        // Extract operation ID from operations array
        if (response.operations && response.operations.length > 0) {
            this.state.operationId = response.operations[0].id;
        }
    }

    override start(): void {
        // Wait for role operations to complete
        if (this.state.operationId) {
            this.waitForOperation(this.definition.projectId, this.state.operationId);
        }
    }

    @action("Reset role password")
    resetPassword(_args?: Args): void {
        if (!this.state.name) {
            throw new Error("Role name not available");
        }

        cli.output(`🔐 Resetting password for role ${this.state.name}...`);

        const response = this.makeRequest(
            "POST",
            `/projects/${this.definition.projectId}/branches/${this.definition.branchId}/roles/${this.state.name}/reset_password`
        );

        if (response.role && response.role.password) {
            secret.set(this.getPasswordSecretName(), response.role.password);
            cli.output(`✅ Password reset successfully for role ${this.state.name}`);
        } else {
            cli.output(`⚠️ No password returned for role ${this.state.name}`);
        }
    }

    override delete(): void {
        if (!this.state.name) {
            cli.output("No role name available for deletion");
            return;
        }

        this.deleteResource(
            `/projects/${this.definition.projectId}/branches/${this.definition.branchId}/roles/${this.state.name}`,
            `Role ${this.state.name}`
        );
    }

    override checkReadiness(): boolean {
        if (!this.state.name) {
            return false;
        }

        // Check if role is ready by getting its current status
        try {
            const role = this.makeRequest(
                "GET",
                `/projects/${this.definition.projectId}/branches/${this.definition.branchId}/roles/${this.state.name}`
            );
            
            if (role.role) {
                cli.output(`✅ Role ${this.state.name} is ready`);
                return true;
            } else {
                cli.output(`⏳ Role ${this.state.name} is not ready yet`);
                return false;
            }
        } catch (error) {
            cli.output(`❌ Error checking role readiness: ${error}`);
            return false;
        }
    }
} 