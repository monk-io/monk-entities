import { AzureCosmosDBEntity, AzureCosmosDBDefinition, AzureCosmosDBState } from "./azure-cosmosdb-base.ts";
import cli from "cli";
import http from "http";
import crypto from "crypto";

/**
 * @description Defines the desired state for an Azure Cosmos DB Database.
 */
export interface DatabaseDefinition extends AzureCosmosDBDefinition {
    /**
     * @description The name of the database account that contains this database
     */
    database_account_name: string;

    /**
     * @description The user-generated unique name for the database
     * @minLength 1
     * @maxLength 255
     * @pattern ^[^/?#\\r\\n\\t]*$
     */
    database_id: string;

    /**
     * @description Manual throughput (RU/s) for shared throughput database
     * @minimum 400
     * @maximum 1000000
     */
    manual_throughput?: number;

    /**
     * @description Autoscale settings for shared throughput database
     */
    autoscale_settings?: {
        /**
         * @description Maximum throughput (RU/s) for autoscale
         * @minimum 4000
         */
        max_throughput: number;
    };
}

/**
 * @description Represents the runtime state of an Azure Cosmos DB Database.
 */
export interface DatabaseState extends AzureCosmosDBState {
    /**
     * @description The database ID
     */
    database_id?: string;

    /**
     * @description System-generated resource ID
     */
    resource_id?: string;

    /**
     * @description System-generated timestamp
     */
    timestamp?: number;

    /**
     * @description System-generated self link
     */
    self_link?: string;

    /**
     * @description System-generated ETag
     */
    etag?: string;

    /**
     * @description Collections resource path
     */
    collections_path?: string;

    /**
     * @description Users resource path
     */
    users_path?: string;

    /**
     * @description Current throughput offer details
     */
    offer_details?: {
        throughput?: number;
        offer_type?: string;
        autoscale_max_throughput?: number;
    };
}

export class Database extends AzureCosmosDBEntity<DatabaseDefinition, DatabaseState> {

    private _masterKey?: string;

    protected getEntityName(): string {
        return this.definition.database_id;
    }

    protected getResourceType(): string {
        return "dbs";
    }

    /**
     * Build the Cosmos DB data plane endpoint
     */
    protected buildDataPlaneEndpoint(): string {
        return `https://${this.definition.database_account_name}.documents.azure.com`;
    }

    /**
     * Get the master key for the Cosmos DB account
     */
    private getMasterKey(): string {
        if (this._masterKey) {
            return this._masterKey;
        }

        // Get the master key from the Management Plane API
        const keysPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DocumentDB/databaseAccounts/${this.definition.database_account_name}/listKeys?api-version=${this.apiVersion}`;
        
        try {
            const response = this.makeAzureRequest("POST", keysPath);
            
            if (response.statusCode !== 200) {
                throw new Error(`Failed to retrieve master key: ${response.statusCode} - ${response.error || response.body}`);
            }
            
            const responseData = this.parseResponseBody(response);
            if (!responseData || typeof responseData !== 'object') {
                throw new Error('Invalid response from listKeys API');
            }
            
            const keysData = responseData as Record<string, unknown>;
            const primaryMasterKey = keysData.primaryMasterKey;
            
            if (typeof primaryMasterKey !== 'string') {
                throw new Error('Primary master key not found in response');
            }
            
            this._masterKey = primaryMasterKey;
            return this._masterKey;
        } catch (error) {
            throw new Error(`Failed to retrieve Cosmos DB master key: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate authorization signature for Cosmos DB Data Plane API
     * Implements the Azure Cosmos DB REST API authentication as per:
     * https://docs.microsoft.com/en-us/rest/api/cosmos-db/access-control-on-cosmosdb-resources
     */
    private generateAuthorizationSignature(verb: string, resourceType: string, resourceLink: string, date: string): string {
        const masterKey = this.getMasterKey();
        
        // Construct the string to sign as per Azure documentation:
        // verb + "\n" + resourceType + "\n" + resourceLink + "\n" + date + "\n\n"
        // IMPORTANT: Azure docs state date "must be all lowercase" in string-to-sign
        const stringToSign = (verb || "").toLowerCase() + "\n" + 
                           (resourceType || "").toLowerCase() + "\n" + 
                           (resourceLink || "") + "\n" + 
                           date.toLowerCase() + "\n" + 
                           "" + "\n";
        
        // Generate HMAC using base64 key (Go will auto-decode it)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hmacHash = (crypto as any).hmac(masterKey, stringToSign);
        
        // Convert hex HMAC directly to base64 using proper byte conversion
        const signature = this.hexToBase64Fixed(hmacHash);
        
        const masterToken = "master";
        const tokenVersion = "1.0";
        const authString = "type=" + masterToken + "&ver=" + tokenVersion + "&sig=" + signature;
        
        // Azure expects lowercase URL encoding (e.g., %3d not %3D)
        return encodeURIComponent(authString).replace(/%[0-9A-F]{2}/g, match => match.toLowerCase());
    }
    
    /**
     * Convert hex string directly to base64 (FIXED - proper byte handling)
     */
    private hexToBase64Fixed(hex: string): string {
        // Manual base64 encoding to avoid UTF-8 issues with high-value bytes
        const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        
        // Convert hex to bytes, then directly to base64 without going through strings
        for (let i = 0; i < hex.length; i += 6) {
            // Take 3 bytes (6 hex chars) at a time
            let bytes = '';
            for (let j = 0; j < 6 && i + j < hex.length; j += 2) {
                const byte = parseInt(hex.substr(i + j, 2), 16);
                bytes += String.fromCharCode(byte & 0xFF); // Keep only lower 8 bits
            }
            
            // Pad with nulls if needed
            while (bytes.length < 3) {
                bytes += '\0';
            }
            
            // Convert 3 bytes to 4 base64 chars
            const b1 = bytes.charCodeAt(0);
            const b2 = bytes.charCodeAt(1);
            const b3 = bytes.charCodeAt(2);
            
            result += base64Chars[(b1 >> 2) & 0x3F];
            result += base64Chars[((b1 & 0x3) << 4) | ((b2 >> 4) & 0xF)];
            result += base64Chars[((b2 & 0xF) << 2) | ((b3 >> 6) & 0x3)];
            result += base64Chars[b3 & 0x3F];
        }
        
        // Add padding if needed
        const padding = hex.length % 6;
        if (padding === 2) {
            result = result.substr(0, result.length - 2) + '==';
        } else if (padding === 4) {
            result = result.substr(0, result.length - 1) + '=';
        }
        
        return result;
    }
    

    /**
     * Build headers for Cosmos DB data plane requests
     */
    protected buildCosmosHeaders(verb: string, resourceType: string, resourceLink: string, additionalHeaders: Record<string, string> = {}): Record<string, string> {
        // Generate proper RFC 7231 date format for Azure (case-sensitive)
        const date = new Date().toUTCString();
        cli.output(`🔐 Generated date: ${date}`);
        const authSignature = this.generateAuthorizationSignature(verb, resourceType, resourceLink, date);
        
        const headers: Record<string, string> = {
            "Authorization": authSignature,  // Required - MUST be capitalized per Azure docs
            "Content-Type": "application/json",  // Required for POST/PUT operations
            "User-Agent": "MonkEC-AzureCosmosDB/1.0.0",  // Recommended format per docs
            "x-ms-date": date,  // Required - RFC 1123 format
            "x-ms-version": "2018-12-31",  // Required - API version
            ...additionalHeaders
        };

        // Add throughput headers only for POST/PUT operations (creating resources)
        if ((verb.toUpperCase() === "POST" || verb.toUpperCase() === "PUT") && this.definition.manual_throughput) {
            headers["x-ms-offer-throughput"] = this.definition.manual_throughput.toString();
        } else if ((verb.toUpperCase() === "POST" || verb.toUpperCase() === "PUT") && this.definition.autoscale_settings) {
            headers["x-ms-cosmos-offer-autopilot-settings"] = JSON.stringify({
                maxThroughput: this.definition.autoscale_settings.max_throughput
            });
        }

        return headers;
    }

    /**
     * Make a request to Cosmos DB data plane API using raw HTTP client
     * Uses direct HTTP client instead of cloud/azure module to avoid request corruption
     */
    protected makeCosmosRequest(method: string, path: string, body?: unknown): unknown {
        const url = `${this.buildDataPlaneEndpoint()}/${path}`;
        
        // Determine resource type and resource link for authorization
        let resourceType = "";
        let resourceLink = "";
        
        if (path === "dbs") {
            // Creating database
            resourceType = "dbs";
            resourceLink = "";
        } else if (path.startsWith("dbs/")) {
            // Operating on specific database
            resourceType = "dbs";
            resourceLink = path;
        }
        
        const headers = this.buildCosmosHeaders(method, resourceType, resourceLink);
        const bodyString = body ? JSON.stringify(body) : undefined;

        // Use raw HTTP client instead of cloud/azure module for Cosmos DB requests  
        let response;
        try {
            const requestOptions = {
                method: method.toUpperCase(),
                headers,
                body: bodyString,
                timeout: 30000 // 30 second timeout
            };

            switch (method.toUpperCase()) {
                case "GET":
                    response = http.get(url, { headers });
                    break;
                case "POST":
                    response = http.post(url, requestOptions);
                    break;
                case "PUT":
                    response = http.put(url, requestOptions);
                    break;
                case "DELETE":
                    response = http.delete(url, { headers });
                    break;
                default:
                    throw new Error(`Unsupported HTTP method: ${method}`);
            }
        } catch (error) {
            throw new Error(`Cosmos DB ${method} request failed: ${error}`);
        }

        if (response.error) {
            throw new Error(`Cosmos DB API error: ${response.statusCode} - ${response.error} - ${response.body}`);
        }

        if (response.statusCode >= 400) {
            throw new Error(`Cosmos DB API error: ${response.statusCode} - ${response.body}`);
        }

        return response.body ? JSON.parse(response.body) : null;
    }

    /**
     * Check if database exists
     */
    protected checkDatabaseExists(): unknown | null {
        try {
            const response = this.makeCosmosRequest("GET", `dbs/${this.definition.database_id}`);
            return response;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return null;
            }
            throw new Error(`Failed to check if database exists: ${errorMessage}`);
        }
    }

    /** Create a new Cosmos DB database */
    override create(): void {
        // Check if database already exists
        const existingDatabase = this.checkDatabaseExists();

        if (existingDatabase) {
            // Database already exists
            const db = existingDatabase as Record<string, unknown>;
            this.state = {
                database_id: typeof db.id === 'string' ? db.id : this.definition.database_id,
                resource_id: typeof db._rid === 'string' ? db._rid : undefined,
                timestamp: typeof db._ts === 'number' ? db._ts : undefined,
                self_link: typeof db._self === 'string' ? db._self : undefined,
                etag: typeof db._etag === 'string' ? db._etag : undefined,
                collections_path: typeof db._colls === 'string' ? db._colls : undefined,
                users_path: typeof db._users === 'string' ? db._users : undefined,
                existing: true
            };
            cli.output(`✅ Database ${this.definition.database_id} already exists`);
            return;
        }

        // Skip creation if create_when_missing is false
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Database ${this.definition.database_id} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Create the database
        const requestBody = {
            id: this.definition.database_id
        };

        const response = this.makeCosmosRequest("POST", "dbs", requestBody);
        const db = response as Record<string, unknown>;

        // Set state from created database
        this.state = {
            database_id: typeof db.id === 'string' ? db.id : this.definition.database_id,
            resource_id: typeof db._rid === 'string' ? db._rid : undefined,
            timestamp: typeof db._ts === 'number' ? db._ts : undefined,
            self_link: typeof db._self === 'string' ? db._self : undefined,
            etag: typeof db._etag === 'string' ? db._etag : undefined,
            collections_path: typeof db._colls === 'string' ? db._colls : undefined,
            users_path: typeof db._users === 'string' ? db._users : undefined,
            existing: false
        };

        cli.output(`✅ Created Cosmos DB database: ${this.definition.database_id}`);
    }

    override update(): void {
        if (!this.state.database_id) {
            this.create();
            return;
        }

        // For databases, most properties cannot be updated after creation
        // Throughput can be modified through offer operations (separate API)
        cli.output(`Database ${this.definition.database_id} properties cannot be updated`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Database ${this.definition.database_id} wasn't created by this entity, skipping delete`);
            return;
        }

        if (!this.state.database_id) {
            cli.output("Database does not exist, nothing to delete");
            return;
        }

        try {
            this.makeCosmosRequest("DELETE", `dbs/${this.definition.database_id}`);
            cli.output(`Successfully deleted Cosmos DB database: ${this.definition.database_id}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return;  // Database already deleted
            }

            throw new Error(`Failed to delete database ${this.definition.database_id}: ${errorMessage}`);
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.database_id) {
            return false;
        }

        try {
            const database = this.checkDatabaseExists();

            if (!database) {
                return false;
            }

            // Update state with current information
            const db = database as Record<string, unknown>;
            this.state.resource_id = typeof db._rid === 'string' ? db._rid : undefined;
            this.state.timestamp = typeof db._ts === 'number' ? db._ts : undefined;
            this.state.etag = typeof db._etag === 'string' ? db._etag : undefined;

            return true;
        } catch (_error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }


}
