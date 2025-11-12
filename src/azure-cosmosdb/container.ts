import { AzureCosmosDBEntity, AzureCosmosDBDefinition, AzureCosmosDBState } from "./azure-cosmosdb-base.ts";
import cli from "cli";
import http from "http";
import crypto from "crypto";

// Use runtime require to avoid TS type resolution for cloud/azure
declare const require: (module: string) => unknown;
// @ts-ignore: Runtime provided module, no type definitions available
const _azure = require("cloud/azure"); // Renamed to _azure as it's only used indirectly

/**
 * Partition key configuration
 */
export interface PartitionKeyDefinition {
    paths: string[];
    kind: "Hash" | "Range";
    version?: number;
}

/**
 * Indexing policy configuration
 */
export interface IndexingPolicy {
    indexingMode: "consistent" | "lazy" | "none";
    automatic?: boolean;
    includedPaths?: Array<{
        path: string;
        indexes?: Array<{
            kind: "Hash" | "Range" | "Spatial";
            dataType: "String" | "Number" | "Point" | "Polygon" | "LineString";
            precision?: number;
        }>;
    }>;
    excludedPaths?: Array<{
        path: string;
    }>;
}

/**
 * Autoscale settings for container throughput
 */
export interface AutoscaleSettings {
    max_throughput: number;
}

/**
 * Container definition interface
 */
export interface ContainerDefinition extends AzureCosmosDBDefinition {
    /**
     * Name of the parent Cosmos DB database account
     */
    database_account_name: string;

    /**
     * ID of the parent database
     */
    database_id: string;

    /**
     * Unique container identifier
     * Must be 1-255 characters, no trailing spaces, no /, \, ?, #
     */
    container_id: string;

    /**
     * Partition key configuration
     */
    partition_key: PartitionKeyDefinition;

    /**
     * Manual throughput in RU/s (400-1000000)
     * Mutually exclusive with autoscale_settings
     */
    manual_throughput?: number;

    /**
     * Autoscale throughput configuration
     * Mutually exclusive with manual_throughput
     */
    autoscale_settings?: AutoscaleSettings;

    /**
     * Indexing policy configuration
     * If not specified, uses default policy (index all paths)
     */
    indexing_policy?: IndexingPolicy;

    /**
     * Default time to live for documents in seconds
     * -1 means never expire, 0 means no default TTL
     */
    default_ttl?: number;

    /**
     * Unique key policy for the container
     */
    unique_key_policy?: {
        uniqueKeys: Array<{
            paths: string[];
        }>;
    };

    /**
     * Conflict resolution policy
     */
    conflict_resolution_policy?: {
        mode: "LastWriterWins" | "Custom";
        conflictResolutionPath?: string;
        conflictResolutionProcedure?: string;
    };
}

/**
 * Container state interface
 */
export interface ContainerState extends AzureCosmosDBState {
    /**
     * Container identifier
     */
    container_id?: string;

    /**
     * Azure resource ID
     */
    resource_id?: string;

    /**
     * Self-reference link
     */
    self_link?: string;

    /**
     * Entity tag for optimistic concurrency
     */
    etag?: string;

    /**
     * Last modification timestamp
     */
    timestamp?: number;

    /**
     * Documents endpoint path
     */
    documents_path?: string;

    /**
     * Stored procedures endpoint path
     */
    stored_procedures_path?: string;

    /**
     * Triggers endpoint path
     */
    triggers_path?: string;

    /**
     * User-defined functions endpoint path
     */
    user_defined_functions_path?: string;

    /**
     * Conflicts endpoint path
     */
    conflicts_path?: string;

    /**
     * Current throughput settings
     */
    current_throughput?: number;

    /**
     * Current autoscale max throughput
     */
    current_autoscale_max_throughput?: number;

    /**
     * Whether the container existed before entity management
     */
    existing?: boolean;
}

/**
 * Azure Cosmos DB Container entity
 * Manages individual containers within Cosmos DB databases using the Data Plane API
 */
export class Container extends AzureCosmosDBEntity<ContainerDefinition, ContainerState> {

    private _masterKey?: string;

    protected getEntityName(): string {
        return this.definition.container_id;
    }

    protected getResourceType(): string {
        // This entity uses the data plane API, not the management plane resource type
        return "colls";
    }

    protected buildDataPlaneEndpoint(): string {
        return `https://${this.definition.database_account_name}.documents.azure.com`;
    }

    /**
     * Retrieve the master key for the Cosmos DB account from the Azure Management API.
     */
    private getMasterKey(): string {
        if (this._masterKey) {
            return this._masterKey;
        }

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
        let i = 0;
        while (i < hex.length) {
            const byte1 = parseInt(hex.substr(i, 2), 16);
            const byte2 = parseInt(hex.substr(i + 2, 2), 16);
            const byte3 = parseInt(hex.substr(i + 4, 2), 16);

            const enc1 = byte1 >> 2;
            const enc2 = ((byte1 & 3) << 4) | (byte2 >> 4);
            const enc3 = ((byte2 & 15) << 2) | (byte3 >> 6);
            const enc4 = byte3 & 63;

            if (isNaN(byte2)) {
                result += base64Chars.charAt(enc1) + base64Chars.charAt(enc2) + '==';
            } else if (isNaN(byte3)) {
                result += base64Chars.charAt(enc1) + base64Chars.charAt(enc2) + base64Chars.charAt(enc3) + '=';
            } else {
                result += base64Chars.charAt(enc1) + base64Chars.charAt(enc2) + base64Chars.charAt(enc3) + base64Chars.charAt(enc4);
            }
            i += 6;
        }
        return result;
    }

    /**
     * Build Cosmos DB specific headers including authorization and date.
     */
    protected buildCosmosHeaders(verb: string, resourceType: string, resourceLink: string, additionalHeaders: Record<string, string> = {}): Record<string, string> {
        const date = new Date().toUTCString(); // RFC 1123 format
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

        if (path === `dbs/${this.definition.database_id}/colls`) {
            // Creating container
            resourceType = "colls";
            resourceLink = `dbs/${this.definition.database_id}`;
        } else if (path.startsWith(`dbs/${this.definition.database_id}/colls/`)) {
            // Operating on specific container
            resourceType = "colls";
            resourceLink = path;
        }

        const headers = this.buildCosmosHeaders(method, resourceType, resourceLink);
        const bodyString = body ? JSON.stringify(body) : undefined;

        // Use raw HTTP client instead of cloud/azure module for Cosmos DB requests
        let response: any;
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
     * Check if container exists
     */
    protected checkContainerExists(): unknown | null {
        try {
            const response = this.makeCosmosRequest("GET", `dbs/${this.definition.database_id}/colls/${this.definition.container_id}`);
            return response;
        } catch (_error) {
            const errorMessage = _error instanceof Error ? _error.message : 'Unknown error';
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return null;
            }
            throw new Error(`Failed to check if container exists: ${errorMessage}`);
        }
    }

    /** Create a new Cosmos DB container */
    override create(): void {
        // Check if container already exists
        const existingContainer = this.checkContainerExists();

        if (existingContainer) {
            // Container already exists
            const container = existingContainer as Record<string, unknown>;
            this.state = {
                container_id: typeof container.id === 'string' ? container.id : this.definition.container_id,
                resource_id: typeof container._rid === 'string' ? container._rid : undefined,
                timestamp: typeof container._ts === 'number' ? container._ts : undefined,
                self_link: typeof container._self === 'string' ? container._self : undefined,
                etag: typeof container._etag === 'string' ? container._etag : undefined,
                documents_path: typeof container._docs === 'string' ? container._docs : undefined,
                stored_procedures_path: typeof container._sprocs === 'string' ? container._sprocs : undefined,
                triggers_path: typeof container._triggers === 'string' ? container._triggers : undefined,
                user_defined_functions_path: typeof container._udfs === 'string' ? container._udfs : undefined,
                conflicts_path: typeof container._conflicts === 'string' ? container._conflicts : undefined,
                existing: true
            };
            cli.output(`✅ Container ${this.definition.container_id} already exists`);
            return;
        }

        // Validate partition key configuration
        if (!this.definition.partition_key || !this.definition.partition_key.paths || this.definition.partition_key.paths.length === 0) {
            throw new Error("Partition key configuration is required for container creation");
        }

        // Validate mutual exclusivity of throughput settings
        if (this.definition.manual_throughput && this.definition.autoscale_settings) {
            throw new Error("Cannot specify both manual_throughput and autoscale_settings");
        }

        // Build container creation request
        const requestBody: Record<string, unknown> = {
            id: this.definition.container_id,
            partitionKey: this.definition.partition_key
        };

        // Add optional properties
        if (this.definition.indexing_policy) {
            requestBody.indexingPolicy = this.definition.indexing_policy;
        }

        if (this.definition.default_ttl !== undefined) {
            requestBody.defaultTtl = this.definition.default_ttl;
        }

        if (this.definition.unique_key_policy) {
            requestBody.uniqueKeyPolicy = this.definition.unique_key_policy;
        }

        if (this.definition.conflict_resolution_policy) {
            requestBody.conflictResolutionPolicy = this.definition.conflict_resolution_policy;
        }

        const response = this.makeCosmosRequest("POST", `dbs/${this.definition.database_id}/colls`, requestBody);
        const container = response as Record<string, unknown>;

        // Set state from created container
        this.state = {
            container_id: typeof container.id === 'string' ? container.id : this.definition.container_id,
            resource_id: typeof container._rid === 'string' ? container._rid : undefined,
            timestamp: typeof container._ts === 'number' ? container._ts : undefined,
            self_link: typeof container._self === 'string' ? container._self : undefined,
            etag: typeof container._etag === 'string' ? container._etag : undefined,
            documents_path: typeof container._docs === 'string' ? container._docs : undefined,
            stored_procedures_path: typeof container._sprocs === 'string' ? container._sprocs : undefined,
            triggers_path: typeof container._triggers === 'string' ? container._triggers : undefined,
            user_defined_functions_path: typeof container._udfs === 'string' ? container._udfs : undefined,
            conflicts_path: typeof container._conflicts === 'string' ? container._conflicts : undefined,
            existing: false
        };
        cli.output(`✅ Created Cosmos DB container: ${this.definition.container_id}`);
    }

    override update(): void {
        if (!this.state.container_id) {
            this.create();
            return;
        }

        // For containers, most properties cannot be updated after creation
        // Throughput can be modified through offer operations (separate API)
        // Indexing policy can be updated through replace operations
        cli.output(`Container ${this.definition.container_id} properties cannot be updated after creation`);
        cli.output(`Use Azure portal or separate scripts to modify throughput or indexing policy`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Container ${this.definition.container_id} wasn't created by this entity, skipping delete`);
            return;
        }

        if (!this.state.container_id) {
            cli.output("Container does not exist, nothing to delete");
            return;
        }

        try {
            this.makeCosmosRequest("DELETE", `dbs/${this.definition.database_id}/colls/${this.definition.container_id}`);
            cli.output(`Successfully deleted Cosmos DB container: ${this.definition.container_id}`);
        } catch (_error) {
            const errorMessage = _error instanceof Error ? _error.message : 'Unknown error';

            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return;  // Container already deleted
            }

            throw new Error(`Failed to delete container ${this.definition.container_id}: ${errorMessage}`);
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.container_id) {
            return false;
        }

        try {
            const container = this.checkContainerExists();

            if (!container) {
                return false;
            }

            // Update state with current information
            const containerData = container as Record<string, unknown>;
            this.state.resource_id = typeof containerData._rid === 'string' ? containerData._rid : undefined;
            this.state.timestamp = typeof containerData._ts === 'number' ? containerData._ts : undefined;
            this.state.etag = typeof containerData._etag === 'string' ? containerData._etag : undefined;

            return true;
        } catch (_error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }
}
