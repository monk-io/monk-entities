import { MongoDBAtlasEntity, MongoDBAtlasEntityDefinition, MongoDBAtlasEntityState } from "./base.ts";
import secret from "secret";
import cli from "cli";

/**
 * Represents a MongoDB Atlas database user entity.
 * This entity allows interaction with MongoDB Atlas database users via its API.
 * @interface UserDefinition
 */
export interface UserDefinition extends MongoDBAtlasEntityDefinition {
    /**
     * @description Database username
     * @minLength 1
     * @maxLength 100
     */
    name: string;

    /**
     * @description Project ID where the user will be created
     * @minLength 1
     * @maxLength 24
     */
    project_id: string;

    /**
     * @description Secret Reference for user password
     * @minLength 1
     * @maxLength 24
     */
    password_secret_ref: string;

    /**
     * @description Database role for the user
     * @default readWriteAnyDatabase
     */
    role?: string;
}

/**
 * Represents the mutable runtime state of a MongoDB Atlas user entity.
 * This state can change during the entity's lifecycle.
 * @interface UserState
 */
export interface UserState extends MongoDBAtlasEntityState {
    /**
     * @description Username
     */
    name?: string;

    /**
     * @description Project ID
     */
    project_id?: string;

    /**
     * @description Database name (always "admin" for Atlas)
     */
    database_name?: string;

    /**
     * @description User roles
     */
    roles?: Array<{
        databaseName: string;
        roleName: string;
    }>;
}

export class User extends MongoDBAtlasEntity<UserDefinition, UserState> {
    
    protected getEntityName(): string {
        return this.definition.name;
    }

    /** Create a new MongoDB Atlas database user */
    override create(): void {
        // First check if user already exists
        const existingUser = this.getExistingUser();
        if (existingUser) {
            this.state = existingUser;
            return;
        }

        // Get or generate password
        const password = this.getOrCreatePassword();

        // Set default role if not specified
        const role = this.definition.role || "readWriteAnyDatabase";

        const body = {
            "username": this.definition.name,
            "databaseName": "admin",
            "password": password,
            "roles": [
                {
                    "databaseName": "admin",
                    "roleName": role
                }
            ]
        };

        const resObj = this.makeRequest("POST", `/groups/${this.definition.project_id}/databaseUsers`, body);

        this.state = {
            name: resObj.username,
            project_id: this.definition.project_id,
            database_name: resObj.databaseName,
            roles: resObj.roles
        };
    }

    /** Get existing user if it exists */
    private getExistingUser(): UserState | null {
        const userData = this.checkResourceExists(`/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`);
        
        if (!userData || !userData.username) {
            return null;
        }

        return {
            name: userData.username,
            project_id: this.definition.project_id,
            database_name: userData.databaseName,
            roles: userData.roles,
            existing: true
        };
    }

    /** Get or create password for the user */
    private getOrCreatePassword(): string {
        if (!this.definition.password_secret_ref) {
            throw new Error("Password secret reference not defined");
        }
        
        try {
            const storedPassword = secret.get(this.definition.password_secret_ref);
            if (!storedPassword) {
                throw new Error("Password not found");
            }
            return storedPassword;
        } catch (e) {
            const password = secret.randString(16);
            secret.set(this.definition.password_secret_ref, password);
            return password;
        }
    }

    override update(): void {
        if (!this.state.name) {
            this.create();
            return;
        }

        // Check if user still exists
        const userData = this.checkResourceExists(`/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`);
        
        if (userData) {
            this.state = {
                ...this.state,
                name: userData.username,
                database_name: userData.databaseName,
                roles: userData.roles
            };
        }
    }

    override delete(): void {
        if (!this.state.name) {
            cli.output("User does not exist, nothing to delete");
            return;
        }

        // Only delete users that were created by this entity, not pre-existing ones
        if (this.state.existing) {
            cli.output(`User ${this.definition.name} was pre-existing, not deleting`);
            return;
        }

        this.deleteResource(`/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`, "Database User");
    }

    /** Check if user is ready (exists and is active) */
    isReady(): boolean {
        if (!this.state.name) {
            return false;
        }

        const userData = this.checkResourceExists(`/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`);
        return userData && userData.username === this.definition.name;
    }

    /** Update user password */
    updatePassword(newPassword?: string): void {
        if (!this.state.name) {
            throw new Error("User does not exist, cannot update password");
        }

        const password = newPassword || secret.randString(16);
        
        const body = {
            "password": password
        };

        this.makeRequest("PATCH", `/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`, body);
        
        // Update stored password
        secret.set(this.definition.password_secret_ref, password);
        
        cli.output(`Password updated for user: ${this.definition.name}`);
    }

    /** Get the current password for this user */
    getPassword(): string {
        try {
            const password = secret.get(this.definition.password_secret_ref);
            if (!password) {
                throw new Error("Password not found in secrets");
            }
            return password;
        } catch (e) {
            throw new Error(`Failed to retrieve password for user ${this.definition.name}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    }
}
