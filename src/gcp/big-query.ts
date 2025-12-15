/**
 * GCP BigQuery Dataset Entity
 *
 * Creates and manages BigQuery datasets and tables.
 *
 * @see https://cloud.google.com/bigquery/docs/datasets
 * @see https://cloud.google.com/bigquery/docs/reference/rest/v2/datasets
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import {
    BIGQUERY_API_URL,
    BigQueryLocation,
    BigQueryStorageBillingModel,
} from "./common.ts";

/**
 * BigQuery table definition for creating tables with a dataset
 */
export interface BigQueryTableDefinition {
    /**
     * @description Table name (must be unique within the dataset)
     */
    name: string;

    /**
     * @description Table schema as JSON string. Array of field objects with properties:
     * - name (string, required): Field name
     * - type (string, required): Data type (STRING, INTEGER, FLOAT, BOOLEAN, TIMESTAMP, DATE, TIME, DATETIME, BYTES, NUMERIC, BIGNUMERIC, GEOGRAPHY, JSON, RECORD/STRUCT)
     * - mode (string, optional): NULLABLE (default), REQUIRED, or REPEATED
     * - description (string, optional): Field description
     * - fields (array, optional): Nested fields for RECORD/STRUCT types
     * - maxLength (number, optional): Max length for STRING/BYTES
     * - precision (number, optional): Precision for NUMERIC/BIGNUMERIC
     * - scale (number, optional): Scale for NUMERIC/BIGNUMERIC
     *
     * @example Simple schema:
     * '[{"name":"id","type":"STRING","mode":"REQUIRED"},{"name":"created","type":"TIMESTAMP"}]'
     *
     * @example Nested RECORD schema:
     * '[{"name":"user","type":"RECORD","fields":[{"name":"id","type":"STRING"},{"name":"email","type":"STRING"}]}]'
     */
    schema: string;

    /**
     * @description Table description
     */
    description?: string;

    /**
     * @description Partition field name (for time-based partitioning)
     */
    partitionField?: string;

    /**
     * @description Clustering fields (up to 4 fields)
     */
    clusteringFields?: string[];

    /**
     * @description Table expiration time in milliseconds from creation
     */
    expirationMs?: number;
}

/**
 * BigQuery Dataset entity definition
 * @interface BigQueryDefinition
 */
export interface BigQueryDefinition extends GcpEntityDefinition {
    /**
     * @description Dataset ID (must be unique within the project).
     * Must contain only letters, numbers, and underscores.
     */
    dataset: string;

    /**
     * @description Human-readable description for the dataset
     */
    description?: string;

    /**
     * @description Default table expiration time in milliseconds.
     * Tables created in this dataset will expire after this duration.
     */
    default_table_expiration_ms?: number;

    /**
     * @description Default partition expiration time in milliseconds.
     * Partitions older than this will be automatically deleted.
     */
    default_partition_expiration_ms?: number;

    /**
     * @description Location for the dataset.
     * Use multi-regions (US, EU) for high availability or regional locations for data residency.
     * @default US
     * @see BigQueryLocation for valid values
     */
    location?: BigQueryLocation;

    /**
     * @description Key-value labels for organizing and filtering datasets
     */
    labels?: Record<string, string>;

    /**
     * @description JSON string defining tables to create with the dataset.
     * Array of BigQueryTableDefinition objects.
     * @example '[{"name": "events", "fields": [{"name": "id", "type": "STRING"}]}]'
     */
    tables?: string;

    /**
     * @description Storage billing model for the dataset.
     * LOGICAL: Billed on uncompressed size, time travel included.
     * PHYSICAL: Billed on compressed size, time travel charged separately.
     * @default LOGICAL
     */
    storage_billing_model?: BigQueryStorageBillingModel;

    /**
     * @description Maximum time travel duration in hours (168 to 168*7 = 1176).
     * Only applicable when storage_billing_model is PHYSICAL.
     * @default 168 (7 days)
     */
    max_time_travel_hours?: number;

    /**
     * @description Enable case-insensitive table names
     * @default false
     */
    is_case_insensitive?: boolean;

    /**
     * @description Default collation for STRING fields (e.g., "und:ci" for case-insensitive)
     */
    default_collation?: string;
}

/**
 * BigQuery Dataset entity state
 * @interface BigQueryState
 */
export interface BigQueryState extends GcpEntityState {
    /**
     * @description Dataset ID
     */
    dataset_id?: string;

    /**
     * @description Full dataset reference (project:dataset)
     */
    dataset_reference?: string;

    /**
     * @description Self-link URL for the dataset
     */
    self_link?: string;

    /**
     * @description Dataset location (e.g., US, EU, us-central1)
     */
    location?: string;

    /**
     * @description Dataset creation timestamp (milliseconds since epoch)
     */
    creation_time?: string;

    /**
     * @description Last modified timestamp (milliseconds since epoch)
     */
    last_modified_time?: string;

    /**
     * @description Current storage billing model
     */
    storage_billing_model?: string;
}

/**
 * BigQuery Dataset entity
 *
 * Creates and manages BigQuery datasets for storing and analyzing data.
 * Supports automatic table creation, storage billing configuration, and time travel settings.
 *
 * ## Secrets
 * This entity does NOT write any secrets.
 *
 * ## Dependencies
 * - Requires `bigquery.googleapis.com` API to be enabled (use `gcp/service-usage` entity)
 *
 * ## State Fields for Composition
 * The following state fields can be used by other entities or applications:
 * - `state.dataset_id` - Dataset ID for queries and references
 * - `state.dataset_reference` - Full dataset reference (format: project:dataset)
 * - `state.location` - Dataset location (needed for cross-region queries)
 * - `state.self_link` - Full resource URL
 *
 * ## Composing with Other Entities
 * BigQuery datasets work well with:
 * - `gcp/service-account` - Create a service account with BigQuery roles for access
 * - `gcp/cloud-storage` - Export/import data between GCS and BigQuery
 *
 * ## Accessing BigQuery Data
 * Applications can query BigQuery using:
 * - Dataset reference: `{project}.{dataset_id}.{table_name}`
 * - Full path: `state.dataset_reference` + `.{table_name}`
 *
 * @see https://cloud.google.com/bigquery/docs/datasets
 *
 * @example Basic dataset
 * ```yaml
 * my-dataset:
 *   defines: gcp/big-query
 *   dataset: analytics_data
 *   location: US
 *   description: Analytics data warehouse
 * ```
 *
 * @example Dataset with physical storage billing
 * ```yaml
 * cost-optimized-dataset:
 *   defines: gcp/big-query
 *   dataset: compressed_data
 *   location: us-central1
 *   storage_billing_model: PHYSICAL
 *   max_time_travel_hours: 48
 *   labels:
 *     environment: production
 *     team: data-engineering
 * ```
 *
 * @example Dataset with tables
 * ```yaml
 * events-dataset:
 *   defines: gcp/big-query
 *   dataset: events
 *   location: EU
 *   tables: |
 *     [
 *       {
 *         "name": "page_views",
 *         "schema": "[{\"name\":\"event_id\",\"type\":\"STRING\",\"mode\":\"REQUIRED\"},{\"name\":\"timestamp\",\"type\":\"TIMESTAMP\",\"mode\":\"REQUIRED\"},{\"name\":\"user_id\",\"type\":\"STRING\"},{\"name\":\"page_url\",\"type\":\"STRING\"},{\"name\":\"metadata\",\"type\":\"JSON\"}]"
 *       }
 *     ]
 * ```
 *
 * @example Dataset with nested RECORD schema
 * ```yaml
 * users-dataset:
 *   defines: gcp/big-query
 *   dataset: users
 *   location: US
 *   tables: |
 *     [
 *       {
 *         "name": "profiles",
 *         "schema": "[{\"name\":\"id\",\"type\":\"STRING\",\"mode\":\"REQUIRED\"},{\"name\":\"address\",\"type\":\"RECORD\",\"fields\":[{\"name\":\"street\",\"type\":\"STRING\"},{\"name\":\"city\",\"type\":\"STRING\"},{\"name\":\"zip\",\"type\":\"STRING\"}]}]"
 *       }
 *     ]
 * ```
 *
 * @example BigQuery with service account access
 * ```yaml
 * # Enable BigQuery API
 * enable-bq-api:
 *   defines: gcp/service-usage
 *   name: bigquery.googleapis.com
 *
 * # Create dataset
 * analytics:
 *   defines: gcp/big-query
 *   dataset: analytics
 *   location: US
 *   depends:
 *     wait-for:
 *       runnables:
 *         - gcp/service-usage/enable-bq-api
 *       timeout: 300
 *
 * # Service account for data pipeline
 * pipeline-sa:
 *   defines: gcp/service-account
 *   name: data-pipeline
 *   roles:
 *     - roles/bigquery.dataEditor
 *     - roles/bigquery.jobUser
 * ```
 */
export class BigQuery extends GcpEntity<BigQueryDefinition, BigQueryState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `BigQuery Dataset ${this.definition.dataset}`;
    }

    /**
     * Get the API base URL for this project
     */
    private get apiUrl(): string {
        return `${BIGQUERY_API_URL}/projects/${this.projectId}`;
    }

    /**
     * Get dataset details from API
     */
    private getDataset(): any | null {
        return this.checkResourceExists(`${this.apiUrl}/datasets/${this.definition.dataset}`);
    }

    /**
     * List tables in the dataset
     */
    private listTables(): any {
        return this.get(`${this.apiUrl}/datasets/${this.definition.dataset}/tables`);
    }

    /**
     * Delete all tables in the dataset
     */
    private deleteAllTables(): void {
        const tableList = this.listTables();

        if (tableList.tables && tableList.tables.length > 0) {
            cli.output(`Deleting ${tableList.tables.length} tables from dataset`);

            for (const table of tableList.tables) {
                const tableId = table.tableReference.tableId;
                cli.output(`Deleting table: ${tableId}`);
                this.httpDelete(`${this.apiUrl}/datasets/${this.definition.dataset}/tables/${tableId}`);
            }
        }
    }

    override create(): void {
        // Check if dataset already exists
        const existing = this.getDataset();

        if (existing) {
            cli.output(`Dataset ${this.definition.dataset} already exists, adopting...`);
            this.state.existing = true;
            this.state.dataset_id = existing.datasetReference.datasetId;
            this.state.dataset_reference = `${this.projectId}:${existing.datasetReference.datasetId}`;
            this.state.self_link = existing.selfLink;
            this.state.location = existing.location;
            this.state.creation_time = existing.creationTime;
            this.state.last_modified_time = existing.lastModifiedTime;
            this.state.storage_billing_model = existing.storageBillingModel;
            return;
        }

        // Build dataset configuration
        const body: any = {
            datasetReference: {
                datasetId: this.definition.dataset,
                projectId: this.projectId,
            },
        };

        if (this.definition.description) {
            body.description = this.definition.description;
        }

        if (this.definition.location) {
            body.location = this.definition.location;
        }

        if (this.definition.default_table_expiration_ms) {
            body.defaultTableExpirationMs = this.definition.default_table_expiration_ms.toString();
        }

        if (this.definition.default_partition_expiration_ms) {
            body.defaultPartitionExpirationMs = this.definition.default_partition_expiration_ms.toString();
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        // Storage billing model (LOGICAL or PHYSICAL)
        if (this.definition.storage_billing_model) {
            body.storageBillingModel = this.definition.storage_billing_model;
        }

        // Max time travel hours (only for PHYSICAL billing)
        if (this.definition.max_time_travel_hours) {
            body.maxTimeTravelHours = this.definition.max_time_travel_hours.toString();
        }

        // Case-insensitive table names
        if (this.definition.is_case_insensitive !== undefined) {
            body.isCaseInsensitive = this.definition.is_case_insensitive;
        }

        // Default collation for STRING fields
        if (this.definition.default_collation) {
            body.defaultCollation = this.definition.default_collation;
        }

        cli.output(`Creating BigQuery dataset: ${this.definition.dataset}`);

        const result = this.post(`${this.apiUrl}/datasets`, body);

        this.state.dataset_id = result.datasetReference.datasetId;
        this.state.dataset_reference = `${this.projectId}:${result.datasetReference.datasetId}`;
        this.state.self_link = result.selfLink;
        this.state.location = result.location;
        this.state.creation_time = result.creationTime;
        this.state.last_modified_time = result.lastModifiedTime;
        this.state.storage_billing_model = result.storageBillingModel;
        this.state.existing = false;

        cli.output(`Dataset created: ${this.state.dataset_reference}`);

        // Create tables if defined
        if (this.definition.tables) {
            this.createTables();
        }
    }

    /**
     * Create tables from definition
     */
    private createTables(): void {
        if (!this.definition.tables) return;

        let tables: BigQueryTableDefinition[];
        try {
            tables = JSON.parse(this.definition.tables);
        } catch (error) {
            cli.output(`Error parsing tables definition: ${error}`);
            return;
        }

        for (const table of tables) {
            cli.output(`Creating table: ${table.name}`);

            // Parse the schema JSON string to get fields array
            let fields: any[];
            try {
                fields = JSON.parse(table.schema);
            } catch (error) {
                cli.output(`Error parsing schema for table ${table.name}: ${error}`);
                continue;
            }

            const body: any = {
                tableReference: {
                    projectId: this.projectId,
                    datasetId: this.definition.dataset,
                    tableId: table.name,
                },
                schema: {
                    fields: fields,
                },
            };

            // Add optional table properties
            if (table.description) {
                body.description = table.description;
            }

            if (table.expirationMs) {
                body.expirationTime = (Date.now() + table.expirationMs).toString();
            }

            // Time partitioning
            if (table.partitionField) {
                body.timePartitioning = {
                    type: "DAY",
                    field: table.partitionField,
                };
            }

            // Clustering
            if (table.clusteringFields && table.clusteringFields.length > 0) {
                body.clustering = {
                    fields: table.clusteringFields,
                };
            }

            this.post(`${this.apiUrl}/datasets/${this.definition.dataset}/tables`, body);
            cli.output(`Table ${table.name} created`);
        }
    }

    override update(): void {
        const existing = this.getDataset();

        if (!existing) {
            cli.output("Dataset not found, creating...");
            this.create();
            return;
        }

        // Update dataset metadata
        const body: any = {};

        if (this.definition.description) {
            body.description = this.definition.description;
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        if (this.definition.default_table_expiration_ms) {
            body.defaultTableExpirationMs = this.definition.default_table_expiration_ms.toString();
        }

        if (Object.keys(body).length > 0) {
            this.patch(`${this.apiUrl}/datasets/${this.definition.dataset}`, body);
            cli.output(`Dataset ${this.definition.dataset} updated`);
        }

        this.state.dataset_id = existing.datasetReference.datasetId;
        this.state.dataset_reference = `${this.projectId}:${existing.datasetReference.datasetId}`;
        this.state.self_link = existing.selfLink;
        this.state.location = existing.location;
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Dataset ${this.definition.dataset} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getDataset();
        if (!existing) {
            cli.output(`Dataset ${this.definition.dataset} does not exist`);
            return;
        }

        // Delete all tables first
        this.deleteAllTables();

        cli.output(`Deleting BigQuery dataset: ${this.definition.dataset}`);
        this.httpDelete(`${this.apiUrl}/datasets/${this.definition.dataset}`);
        cli.output(`Dataset ${this.definition.dataset} deleted`);
    }

    override checkReadiness(): boolean {
        const dataset = this.getDataset();
        if (!dataset) {
            cli.output("Dataset not found");
            return false;
        }

        this.state.dataset_id = dataset.datasetReference.datasetId;
        this.state.dataset_reference = `${this.projectId}:${dataset.datasetReference.datasetId}`;
        this.state.self_link = dataset.selfLink;
        this.state.location = dataset.location;
        this.state.creation_time = dataset.creationTime;
        this.state.last_modified_time = dataset.lastModifiedTime;
        this.state.storage_billing_model = dataset.storageBillingModel;

        cli.output(`Dataset ${this.definition.dataset} is ready in ${dataset.location}`);
        return true;
    }

    checkLiveness(): boolean {
        return this.getDataset() !== null;
    }

    @action("get")
    getInfo(_args?: Args): void {
        const dataset = this.getDataset();
        if (!dataset) {
            throw new Error("Dataset not found");
        }
        cli.output(JSON.stringify(dataset, null, 2));
    }

    @action("list-tables")
    listAllTables(_args?: Args): void {
        const tables = this.listTables();
        cli.output(JSON.stringify(tables, null, 2));
    }

    @action("create-table")
    createTable(args?: Args): void {
        if (!args?.name || !args?.schema) {
            throw new Error("Required arguments: name, schema (JSON string)");
        }

        const fields = JSON.parse(args.schema);
        const body = {
            tableReference: {
                projectId: this.projectId,
                datasetId: this.definition.dataset,
                tableId: args.name,
            },
            schema: {
                fields: fields,
            },
        };

        this.post(`${this.apiUrl}/datasets/${this.definition.dataset}/tables`, body);
        cli.output(`Table ${args.name} created`);
    }

    @action("delete-table")
    deleteTable(args?: Args): void {
        if (!args?.name) {
            throw new Error("Required argument: name");
        }

        this.httpDelete(`${this.apiUrl}/datasets/${this.definition.dataset}/tables/${args.name}`);
        cli.output(`Table ${args.name} deleted`);
    }
}
