import { MonkEntity, action, Args } from "monkec/base";
import secret from "secret";
import http from "http";

/**
 * Defines the immutable configuration properties for a Neon database entity.
 * @interface NeonDatabaseDefinition
 */
export interface NeonDatabaseDefinition {
    /**
     * The secret name containing the Neon API key
     * @description Secret name for Neon API authentication
     */
    secret_ref: string;

    /**
     * Database name
     * @description Name of the database to create
     */
    name: string;

    /**
     * Project ID
     * @description The Neon project ID (format: project-name-123456)
     */
    project_id: string;

    /**
     * Branch ID
     * @description The Neon branch ID (format: br-name-123456)
     */
    branch_id: string;

    /**
     * Optional owner name
     * @description Name of the role that will own the database (optional, defaults to project owner)
     */
    owner_name?: string;
}

/**
 * Represents the mutable runtime state of a Neon database.
 * @interface NeonDatabaseState
 */
export interface NeonDatabaseState {
    /**
     * Database ID from Neon
     * @description Unique identifier for the database
     */
    id?: number;

    /**
     * Database name
     * @description Current name of the database
     */
    name?: string;

    /**
     * Branch ID
     * @description ID of the branch containing this database
     */
    branch_id?: string;

    /**
     * Owner name
     * @description Name of the role that owns the database
     */
    owner_name?: string;

    /**
     * Database creation timestamp
     * @description When the database was created
     * @format date-time
     */
    created_at?: string;

    /**
     * Last update timestamp
     * @description When the database was last updated
     * @format date-time
     */
    updated_at?: string;

    /**
     * Operation ID for tracking database operations
     * @description ID of the current operation
     */
    operation_id?: string;
}

/**
 * @description Neon Database entity.
 * Creates and manages PostgreSQL databases within a Neon branch.
 * Each database is a logical container for schemas, tables, and data.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Neon API key (defaults to `neon-api-key`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.id` - Database ID
 * - `state.name` - Database name
 * - `state.owner` - Database owner role
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `neon/project` - The project containing this database
 * - `neon/branch` - The branch this database resides on
 * - `neon/role` - Database roles for access control
 */
export class Database extends MonkEntity<NeonDatabaseDefinition, NeonDatabaseState> {
    private apiKey: string = "";
    private baseUrl = "https://console.neon.tech/api/v2";

    protected override before(): void {
        const apiKey = secret.get(this.definition.secret_ref);
        if (!apiKey) {
            throw new Error("API key not found");
        }
        this.apiKey = apiKey;
    }

    private request(method: string, path: string, body?: any): any {
        const options: any = {
            method: method,
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const fullUrl = `${this.baseUrl}${path}`;
        const response = http.do(fullUrl, options);

        if (response.statusCode >= 400) {
            throw new Error(`Neon API error: ${response.statusCode} ${response.status} - ${response.body}`);
        }

        return JSON.parse(response.body);
    }

    override create(): void {
        const databaseData = {
            database: {
                name: this.definition.name,
                owner_name: this.definition.owner_name
            }
        };

        const response = this.request(
            "POST",
            `/projects/${this.definition.project_id}/branches/${this.definition.branch_id}/databases`,
            databaseData
        );

        const database = response.database;
        this.state.id = database.id;
        this.state.name = database.name;
        this.state.branch_id = database.branch_id;
        this.state.owner_name = database.owner_name;
        this.state.created_at = database.created_at;
        this.state.updated_at = database.updated_at;

        // Extract operation ID if present
        if (response.operations && response.operations.length > 0) {
            this.state.operation_id = response.operations[0].id;
        }
    }

    override start(): void {
        // Wait for database operations to complete
        if (this.state.operation_id) {
            this.waitForOperation();
        }
    }

    private waitForOperation(): void {
        if (!this.state.operation_id) return;

        let attempts = 0;
        const maxAttempts = 40;
        const delayMs = 2000;

        while (attempts < maxAttempts) {
            try {
                const operationData = this.request("GET", `/projects/${this.definition.project_id}/operations/${this.state.operation_id}`);
                
                if (operationData.operation) {
                    if (operationData.operation.status === "finished" || operationData.operation.status === "completed") {
                        this.state.operation_id = undefined;
                        return;
                    }
                    
                    if (operationData.operation.status === "failed") {
                        throw new Error(`Database operation failed: ${operationData.operation.error || "Unknown error"}`);
                    }
                }
            } catch (error) {
                // Continue waiting
            }

            attempts++;
            if (attempts < maxAttempts) {
                sleep(delayMs);
            }
        }

        throw new Error("Database operation timed out");
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        // If we have an operation ID, check operation status first
        if (this.state.operation_id) {
            return false;
        }

        // Check if database is accessible
        try {
            const response = this.request("GET", `/projects/${this.definition.project_id}/branches/${this.definition.branch_id}/databases/${this.state.name}`);
            return !!response.database;
        } catch (error: unknown) {
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    

    override delete(): void {
        if (!this.state.name) {
            return;
        }

        try {
            this.request(
                "DELETE",
                `/projects/${this.definition.project_id}/branches/${this.definition.branch_id}/databases/${this.state.name}`
            );
        } catch (error: unknown) {
            // Ignore 404 errors (database already deleted)
            if (error instanceof Error && error.message.includes("404")) {
                return;
            }
            throw error;
        }
    }

    @action()
    updateDatabase(args: Args): void {
        if (!this.state.name) {
            throw new Error("Database name is required");
        }

        const updateData: any = {
            database: {}
        };

        if (args.name) {
            updateData.database.name = args.name;
        }
        if (args.owner_name) {
            updateData.database.owner_name = args.owner_name;
        }

        const response = this.request(
            "PATCH",
            `/projects/${this.definition.project_id}/branches/${this.definition.branch_id}/databases/${this.state.name}`,
            updateData
        );

        const database = response.database;
        this.state.name = database.name;
        this.state.owner_name = database.owner_name;
        this.state.updated_at = database.updated_at;

        // Extract operation ID if present
        if (response.operations && response.operations.length > 0) {
            this.state.operation_id = response.operations[0].id;
        }
    }
} 