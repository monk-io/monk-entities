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
  dataset_description?: string;

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
   * @description Maximum time travel duration in hours (168 to 168*7 = 1176). Default is 168 hours (7 days).
   * Only applicable when storage_billing_model is PHYSICAL.
   * @default 168
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
    return this.checkResourceExists(
      `${this.apiUrl}/datasets/${this.definition.dataset}`
    );
  }

  /**
   * List tables in the dataset
   */
  private listTables(): any {
    return this.get(
      `${this.apiUrl}/datasets/${this.definition.dataset}/tables`
    );
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
        this.httpDelete(
          `${this.apiUrl}/datasets/${this.definition.dataset}/tables/${tableId}`
        );
      }
    }
  }

  override create(): void {
    // Check if dataset already exists
    const existing = this.getDataset();

    if (existing) {
      cli.output(
        `Dataset ${this.definition.dataset} already exists, adopting...`
      );
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

    if (this.definition.dataset_description) {
      body.description = this.definition.dataset_description;
    }

    if (this.definition.location) {
      body.location = this.definition.location;
    }

    if (this.definition.default_table_expiration_ms) {
      body.defaultTableExpirationMs =
        this.definition.default_table_expiration_ms.toString();
    }

    if (this.definition.default_partition_expiration_ms) {
      body.defaultPartitionExpirationMs =
        this.definition.default_partition_expiration_ms.toString();
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
      body.maxTimeTravelHours =
        this.definition.max_time_travel_hours.toString();
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

      this.post(
        `${this.apiUrl}/datasets/${this.definition.dataset}/tables`,
        body
      );
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

    if (this.definition.dataset_description) {
      body.description = this.definition.dataset_description;
    }

    if (this.definition.labels) {
      body.labels = this.definition.labels;
    }

    if (this.definition.default_table_expiration_ms) {
      body.defaultTableExpirationMs =
        this.definition.default_table_expiration_ms.toString();
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
      cli.output(
        `Dataset ${this.definition.dataset} was not created by this entity, skipping delete`
      );
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

    cli.output(
      `Dataset ${this.definition.dataset} is ready in ${dataset.location}`
    );
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

    this.post(
      `${this.apiUrl}/datasets/${this.definition.dataset}/tables`,
      body
    );
    cli.output(`Table ${args.name} created`);
  }

  @action("delete-table")
  deleteTable(args?: Args): void {
    if (!args?.name) {
      throw new Error("Required argument: name");
    }

    this.httpDelete(
      `${this.apiUrl}/datasets/${this.definition.dataset}/tables/${args.name}`
    );
    cli.output(`Table ${args.name} deleted`);
  }

  // =========================================================================
  // Backup & Restore Interface (Table Snapshots & Time Travel)
  // =========================================================================

  /**
   * Get backup configuration and status information for the BigQuery dataset
   *
   * Shows current time travel settings and storage billing model which affect
   * how long historical data is retained for recovery.
   *
   * Usage:
   * - monk do namespace/dataset get-backup-info
   */
  @action("get-backup-info")
  getBackupInfo(_args?: Args): void {
    cli.output(`==================================================`);
    cli.output(`📦 Backup Information for BigQuery dataset`);
    cli.output(`Dataset: ${this.definition.dataset}`);
    cli.output(`Project: ${this.projectId}`);
    cli.output(`==================================================`);

    const dataset = this.getDataset();
    if (!dataset) {
      throw new Error(`Dataset ${this.definition.dataset} not found`);
    }

    cli.output(`\n🔧 Dataset Configuration:`);
    cli.output(`   Location: ${dataset.location || 'US'}`);
    cli.output(`   Storage Billing Model: ${dataset.storageBillingModel || 'LOGICAL'}`);

    const maxTimeTravelHours = dataset.maxTimeTravelHours || 168;
    const maxTimeTravelDays = Math.floor(maxTimeTravelHours / 24);
    cli.output(`   Time Travel Window: ${maxTimeTravelHours} hours (${maxTimeTravelDays} days)`);

    if (dataset.defaultTableExpirationMs) {
      const expDays = Math.floor(Number(dataset.defaultTableExpirationMs) / (1000 * 60 * 60 * 24));
      cli.output(`   Default Table Expiration: ${expDays} days`);
    }

    cli.output(`\n📋 BigQuery Backup Capabilities:`);
    cli.output(`   ✅ Time Travel: Query data from up to ${maxTimeTravelDays} days ago`);
    cli.output(`   ✅ Table Snapshots: Create point-in-time copies of tables`);
    cli.output(`   ✅ Table Clones: Create lightweight copies for testing`);

    cli.output(`\n📋 Available operations:`);
    cli.output(`   monk do namespace/dataset create-snapshot table="my_table" snapshot="my_table_backup"`);
    cli.output(`   monk do namespace/dataset list-snapshots`);
    cli.output(`   monk do namespace/dataset restore snapshot="my_table_backup" target="restored_table"`);
    cli.output(`\n==================================================`);
  }

  /**
   * Create a table snapshot (point-in-time backup)
   *
   * Creates a snapshot of a table that preserves its state at a specific point in time.
   * Snapshots are read-only and only store data that differs from the base table.
   *
   * Usage:
   * - monk do namespace/dataset create-snapshot table="source_table" snapshot="snapshot_name"
   * - monk do namespace/dataset create-snapshot table="source_table" snapshot="snapshot_name" expiration_days=30
   * - monk do namespace/dataset create-snapshot table="source_table" snapshot="snapshot_name" snapshot_time="2024-01-15T10:00:00Z"
   *
   * @param args Required/Optional arguments:
   *   - table: Source table name to snapshot (required)
   *   - snapshot: Name for the snapshot table (required)
   *   - expiration_days: Days until snapshot expires (optional)
   *   - snapshot_time: Point-in-time to snapshot from, for time travel (optional, ISO 8601)
   *   - target_dataset: Dataset for the snapshot (optional, defaults to current dataset)
   */
  @action("create-snapshot")
  createSnapshot(args?: Args): void {
    cli.output(`==================================================`);
    cli.output(`Creating table snapshot in BigQuery`);
    cli.output(`Dataset: ${this.definition.dataset}`);
    cli.output(`Project: ${this.projectId}`);
    cli.output(`==================================================`);

    const sourceTable = args?.table as string | undefined;
    const snapshotName = args?.snapshot as string | undefined;

    if (!sourceTable) {
      throw new Error(
        "'table' is required.\n" +
        "Usage: monk do namespace/dataset create-snapshot table=\"source_table\" snapshot=\"snapshot_name\""
      );
    }

    if (!snapshotName) {
      throw new Error(
        "'snapshot' is required.\n" +
        "Usage: monk do namespace/dataset create-snapshot table=\"source_table\" snapshot=\"snapshot_name\""
      );
    }

    const targetDataset = (args?.target_dataset as string) || this.definition.dataset;
    const expirationDays = args?.expiration_days ? Number(args.expiration_days) : undefined;
    const snapshotTime = args?.snapshot_time as string | undefined;

    cli.output(`Source Table: ${sourceTable}`);
    cli.output(`Snapshot Name: ${snapshotName}`);
    cli.output(`Target Dataset: ${targetDataset}`);
    if (expirationDays) {
      cli.output(`Expiration: ${expirationDays} days`);
    }
    if (snapshotTime) {
      cli.output(`Snapshot Time: ${snapshotTime}`);
    }

    // Use BigQuery jobs API to create a snapshot via copy job
    const jobBody: any = {
      configuration: {
        copy: {
          sourceTable: {
            projectId: this.projectId,
            datasetId: this.definition.dataset,
            tableId: sourceTable,
          },
          destinationTable: {
            projectId: this.projectId,
            datasetId: targetDataset,
            tableId: snapshotName,
          },
          operationType: "SNAPSHOT",
        },
      },
    };

    // Add snapshot time for point-in-time snapshot
    if (snapshotTime) {
      jobBody.configuration.copy.sourceTable.snapshotTime = snapshotTime;
    }

    // Add expiration time if specified
    if (expirationDays) {
      const expirationMs = Date.now() + (expirationDays * 24 * 60 * 60 * 1000);
      jobBody.configuration.copy.destinationExpirationTime = new Date(expirationMs).toISOString();
    }

    try {
      // Submit the copy job
      const jobResult = this.post(`${this.apiUrl}/jobs`, jobBody);
      
      cli.output(`\nJob submitted: ${jobResult.jobReference?.jobId}`);
      cli.output(`Status: ${jobResult.status?.state || 'PENDING'}`);

      // Wait for job completion (polling)
      const jobId = jobResult.jobReference?.jobId;
      if (jobId) {
        let attempts = 0;
        const maxAttempts = 30;
        let jobStatus = jobResult;
        
        while (jobStatus.status?.state !== 'DONE' && attempts < maxAttempts) {
          // Wait 2 seconds between checks
          const start = Date.now();
          while (Date.now() - start < 2000) {
            // busy wait
          }
          
          jobStatus = this.get(`${this.apiUrl}/jobs/${jobId}`);
          attempts++;
          
          if (jobStatus.status?.state === 'DONE') {
            break;
          }
          cli.output(`   Waiting for job... (attempt ${attempts}/${maxAttempts})`);
        }

        if (jobStatus.status?.errorResult) {
          throw new Error(jobStatus.status.errorResult.message || 'Job failed');
        }

        if (jobStatus.status?.state === 'DONE') {
          cli.output(`\n✅ Snapshot created successfully!`);
          cli.output(`Snapshot: ${snapshotName}`);
          cli.output(`Dataset: ${targetDataset}`);
          
          cli.output(`\n📋 To restore from this snapshot:`);
          cli.output(`   monk do namespace/dataset restore snapshot="${snapshotName}" target="restored_table"`);
        } else {
          cli.output(`\n⏳ Job still running. Check status with:`);
          cli.output(`   Use BigQuery console to monitor job ${jobId}`);
        }
      }

      cli.output(`==================================================`);
    } catch (error) {
      cli.output(`\n❌ Failed to create snapshot`);
      throw new Error(`Snapshot creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all table snapshots in the dataset
   *
   * Shows all SNAPSHOT type tables in the dataset.
   *
   * Usage:
   * - monk do namespace/dataset list-snapshots
   * - monk do namespace/dataset list-snapshots limit=20
   *
   * @param args Optional arguments:
   *   - limit: Maximum number of snapshots to display (default: 10)
   */
  @action("list-snapshots")
  listSnapshots(args?: Args): void {
    cli.output(`==================================================`);
    cli.output(`Listing table snapshots in BigQuery dataset`);
    cli.output(`Dataset: ${this.definition.dataset}`);
    cli.output(`Project: ${this.projectId}`);
    cli.output(`==================================================`);

    const limit = Number(args?.limit) || 10;

    try {
      const response = this.listTables();
      const allTables = response.tables || [];

      // Filter for snapshots only
      const snapshots = allTables.filter((t: any) => t.type === 'SNAPSHOT');

      cli.output(`\nTotal snapshots found: ${snapshots.length}`);
      cli.output(`Showing: ${Math.min(snapshots.length, limit)} snapshot(s)\n`);

      if (snapshots.length === 0) {
        cli.output(`No snapshots found in this dataset.`);
        cli.output(`\n📋 To create a snapshot:`);
        cli.output(`   monk do namespace/dataset create-snapshot table="source_table" snapshot="snapshot_name"`);
      } else {
        const displaySnapshots = snapshots.slice(0, limit);

        for (let i = 0; i < displaySnapshots.length; i++) {
          const snapshot = displaySnapshots[i];
          const tableRef = snapshot.tableReference || {};

          cli.output(`📸 Snapshot #${i + 1}`);
          cli.output(`   Name: ${tableRef.tableId || 'unknown'}`);
          cli.output(`   Type: ${snapshot.type}`);
          cli.output(`   Created: ${snapshot.creationTime ? new Date(Number(snapshot.creationTime)).toISOString() : 'N/A'}`);

          if (snapshot.expirationTime) {
            cli.output(`   Expires: ${new Date(Number(snapshot.expirationTime)).toISOString()}`);
          }

          if (snapshot.snapshotDefinition?.baseTableReference) {
            const baseRef = snapshot.snapshotDefinition.baseTableReference;
            cli.output(`   Base Table: ${baseRef.datasetId}.${baseRef.tableId}`);
          }

          if (snapshot.snapshotDefinition?.snapshotTime) {
            cli.output(`   Snapshot Time: ${snapshot.snapshotDefinition.snapshotTime}`);
          }

          cli.output(``);
        }

        if (snapshots.length > limit) {
          cli.output(`... and ${snapshots.length - limit} more snapshot(s)`);
          cli.output(`Increase limit with: monk do namespace/dataset list-snapshots limit=${snapshots.length}`);
        }
      }

      cli.output(`==================================================`);
    } catch (error) {
      cli.output(`\n❌ Failed to list snapshots`);
      throw new Error(`List snapshots failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get detailed information about a specific snapshot
   *
   * Usage:
   * - monk do namespace/dataset describe-snapshot snapshot="snapshot_name"
   *
   * @param args Required arguments:
   *   - snapshot: Snapshot table name
   */
  @action("describe-snapshot")
  describeSnapshot(args?: Args): void {
    cli.output(`==================================================`);
    cli.output(`📸 Snapshot Details`);
    cli.output(`==================================================`);

    const snapshotName = args?.snapshot as string | undefined;
    if (!snapshotName) {
      throw new Error(
        "'snapshot' is required.\n" +
        "Usage: monk do namespace/dataset describe-snapshot snapshot=\"snapshot_name\"\n" +
        "\nTo find snapshots, run: monk do namespace/dataset list-snapshots"
      );
    }

    try {
      const url = `${this.apiUrl}/datasets/${this.definition.dataset}/tables/${snapshotName}`;
      const snapshot = this.get(url);

      if (snapshot.type !== 'SNAPSHOT') {
        cli.output(`\n⚠️  Warning: Table '${snapshotName}' is not a snapshot (type: ${snapshot.type})`);
      }

      cli.output(`\n📸 Snapshot Information`);
      cli.output(`--------------------------------------------------`);
      cli.output(`Name: ${snapshot.tableReference?.tableId || snapshotName}`);
      cli.output(`Type: ${snapshot.type || 'TABLE'}`);
      cli.output(`Dataset: ${snapshot.tableReference?.datasetId}`);
      cli.output(`Project: ${snapshot.tableReference?.projectId}`);
      cli.output(`Created: ${snapshot.creationTime ? new Date(Number(snapshot.creationTime)).toISOString() : 'N/A'}`);
      cli.output(`Last Modified: ${snapshot.lastModifiedTime ? new Date(Number(snapshot.lastModifiedTime)).toISOString() : 'N/A'}`);

      if (snapshot.expirationTime) {
        cli.output(`Expires: ${new Date(Number(snapshot.expirationTime)).toISOString()}`);
      }

      if (snapshot.numBytes) {
        const sizeGB = (Number(snapshot.numBytes) / (1024 * 1024 * 1024)).toFixed(4);
        cli.output(`Size: ${sizeGB} GB`);
      }

      if (snapshot.numRows) {
        cli.output(`Rows: ${snapshot.numRows}`);
      }

      if (snapshot.snapshotDefinition) {
        const snapDef = snapshot.snapshotDefinition;
        cli.output(`\n📋 Snapshot Source:`);
        if (snapDef.baseTableReference) {
          const baseRef = snapDef.baseTableReference;
          cli.output(`   Base Table: ${baseRef.projectId}.${baseRef.datasetId}.${baseRef.tableId}`);
        }
        if (snapDef.snapshotTime) {
          cli.output(`   Snapshot Time: ${snapDef.snapshotTime}`);
        }
      }

      cli.output(`\n📋 To restore from this snapshot:`);
      cli.output(`   monk do namespace/dataset restore snapshot="${snapshotName}" target="restored_table"`);
      cli.output(`\n==================================================`);
    } catch (error) {
      cli.output(`\n❌ Failed to get snapshot details`);
      throw new Error(`Describe snapshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a table snapshot
   *
   * ⚠️ WARNING: This permanently deletes the snapshot. This action cannot be undone.
   *
   * Usage:
   * - monk do namespace/dataset delete-snapshot snapshot="snapshot_name"
   *
   * @param args Required arguments:
   *   - snapshot: Snapshot table name to delete
   */
  @action("delete-snapshot")
  deleteSnapshot(args?: Args): void {
    cli.output(`==================================================`);
    cli.output(`🗑️ DELETE SNAPSHOT - READ CAREFULLY!`);
    cli.output(`==================================================`);

    const snapshotName = args?.snapshot as string | undefined;
    if (!snapshotName) {
      throw new Error(
        "'snapshot' is required.\n" +
        "Usage: monk do namespace/dataset delete-snapshot snapshot=\"snapshot_name\"\n" +
        "\nTo find snapshots, run: monk do namespace/dataset list-snapshots"
      );
    }

    try {
      // First verify the snapshot exists
      const url = `${this.apiUrl}/datasets/${this.definition.dataset}/tables/${snapshotName}`;
      const snapshot = this.get(url);

      cli.output(`\n⚠️  WARNING: This will permanently delete the snapshot!`);
      cli.output(`   Snapshot: ${snapshotName}`);
      cli.output(`   Type: ${snapshot.type || 'TABLE'}`);
      cli.output(`   Created: ${snapshot.creationTime ? new Date(Number(snapshot.creationTime)).toISOString() : 'N/A'}`);
      cli.output(`--------------------------------------------------`);

      // Delete the snapshot
      this.httpDelete(url);

      cli.output(`\n✅ Snapshot deleted successfully!`);
      cli.output(`==================================================`);
    } catch (error) {
      cli.output(`\n❌ Failed to delete snapshot`);
      throw new Error(`Delete snapshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Restore a table from a snapshot (creates a clone)
   *
   * Creates a new writable table from a snapshot. The original snapshot
   * is NOT affected.
   *
   * Usage:
   * - monk do namespace/dataset restore snapshot="snapshot_name" target="restored_table"
   * - monk do namespace/dataset restore snapshot="snapshot_name" target="restored_table" target_dataset="other_dataset"
   *
   * @param args Required/Optional arguments:
   *   - snapshot: Source snapshot table name (required)
   *   - target: Name for the restored table (required)
   *   - target_dataset: Dataset for the restored table (optional, defaults to current dataset)
   */
  @action("restore")
  restoreSnapshot(args?: Args): void {
    cli.output(`==================================================`);
    cli.output(`🔄 RESTORE TABLE FROM SNAPSHOT`);
    cli.output(`==================================================`);
    cli.output(`Dataset: ${this.definition.dataset}`);
    cli.output(`Project: ${this.projectId}`);

    const snapshotName = args?.snapshot as string | undefined;
    const targetTable = args?.target as string | undefined;

    if (!snapshotName) {
      throw new Error(
        "'snapshot' is required.\n" +
        "Usage: monk do namespace/dataset restore snapshot=\"snapshot_name\" target=\"restored_table\"\n" +
        "\nTo find snapshots, run: monk do namespace/dataset list-snapshots"
      );
    }

    if (!targetTable) {
      throw new Error(
        "'target' is required.\n" +
        "Specify a name for the restored table."
      );
    }

    const targetDataset = (args?.target_dataset as string) || this.definition.dataset;

    cli.output(`\n📋 Restore Configuration:`);
    cli.output(`   Source Snapshot: ${snapshotName}`);
    cli.output(`   Target Table: ${targetTable}`);
    cli.output(`   Target Dataset: ${targetDataset}`);
    cli.output(`--------------------------------------------------`);

    cli.output(`\n⚠️  NOTE: This will create a NEW writable table.`);
    cli.output(`   The original snapshot will NOT be affected.`);

    // Use BigQuery jobs API to restore/clone from snapshot
    const jobBody: any = {
      configuration: {
        copy: {
          sourceTable: {
            projectId: this.projectId,
            datasetId: this.definition.dataset,
            tableId: snapshotName,
          },
          destinationTable: {
            projectId: this.projectId,
            datasetId: targetDataset,
            tableId: targetTable,
          },
          operationType: "RESTORE",
        },
      },
    };

    try {
      // Submit the copy job
      const jobResult = this.post(`${this.apiUrl}/jobs`, jobBody);
      
      cli.output(`\nJob submitted: ${jobResult.jobReference?.jobId}`);
      cli.output(`Status: ${jobResult.status?.state || 'PENDING'}`);

      // Wait for job completion (polling)
      const jobId = jobResult.jobReference?.jobId;
      if (jobId) {
        let attempts = 0;
        const maxAttempts = 30;
        let jobStatus = jobResult;
        
        while (jobStatus.status?.state !== 'DONE' && attempts < maxAttempts) {
          // Wait 2 seconds between checks
          const start = Date.now();
          while (Date.now() - start < 2000) {
            // busy wait
          }
          
          jobStatus = this.get(`${this.apiUrl}/jobs/${jobId}`);
          attempts++;
          
          if (jobStatus.status?.state === 'DONE') {
            break;
          }
          cli.output(`   Waiting for job... (attempt ${attempts}/${maxAttempts})`);
        }

        if (jobStatus.status?.errorResult) {
          throw new Error(jobStatus.status.errorResult.message || 'Job failed');
        }

        if (jobStatus.status?.state === 'DONE') {
          cli.output(`\n✅ Table restored successfully!`);
          cli.output(`Restored Table: ${targetTable}`);
          cli.output(`Dataset: ${targetDataset}`);
          
          cli.output(`\n📋 The restored table is now available for queries:`);
          cli.output(`   SELECT * FROM \`${this.projectId}.${targetDataset}.${targetTable}\``);
        } else {
          cli.output(`\n⏳ Job still running. Check status with BigQuery console.`);
        }
      }

      cli.output(`\n==================================================`);
    } catch (error) {
      cli.output(`\n❌ Failed to restore from snapshot`);
      throw new Error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Query a table at a specific point in time (time travel)
   *
   * Shows how to query historical data using BigQuery's time travel feature.
   * Time travel allows accessing data from up to 7 days ago (or longer with PHYSICAL billing).
   *
   * Usage:
   * - monk do namespace/dataset time-travel-info table="my_table"
   *
   * @param args Required arguments:
   *   - table: Table name to show time travel info for
   */
  @action("time-travel-info")
  timeTravelInfo(args?: Args): void {
    cli.output(`==================================================`);
    cli.output(`⏰ Time Travel Information`);
    cli.output(`==================================================`);

    const tableName = args?.table as string | undefined;
    if (!tableName) {
      throw new Error(
        "'table' is required.\n" +
        "Usage: monk do namespace/dataset time-travel-info table=\"my_table\""
      );
    }

    const dataset = this.getDataset();
    if (!dataset) {
      throw new Error(`Dataset ${this.definition.dataset} not found`);
    }

    const maxTimeTravelHours = dataset.maxTimeTravelHours || 168;
    const maxTimeTravelDays = Math.floor(maxTimeTravelHours / 24);

    cli.output(`\n📋 Time Travel Configuration:`);
    cli.output(`   Dataset: ${this.definition.dataset}`);
    cli.output(`   Table: ${tableName}`);
    cli.output(`   Storage Billing: ${dataset.storageBillingModel || 'LOGICAL'}`);
    cli.output(`   Max Time Travel: ${maxTimeTravelHours} hours (${maxTimeTravelDays} days)`);

    cli.output(`\n📋 Time Travel Query Examples:`);
    cli.output(`\n   Query data from 1 hour ago:`);
    cli.output(`   SELECT * FROM \`${this.projectId}.${this.definition.dataset}.${tableName}\``);
    cli.output(`   FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)`);

    cli.output(`\n   Query data from 1 day ago:`);
    cli.output(`   SELECT * FROM \`${this.projectId}.${this.definition.dataset}.${tableName}\``);
    cli.output(`   FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)`);

    cli.output(`\n   Query data at a specific time:`);
    cli.output(`   SELECT * FROM \`${this.projectId}.${this.definition.dataset}.${tableName}\``);
    cli.output(`   FOR SYSTEM_TIME AS OF TIMESTAMP("2024-01-15 10:00:00 UTC")`);

    cli.output(`\n📋 Create a snapshot from a point in time:`);
    cli.output(`   monk do namespace/dataset create-snapshot table="${tableName}" snapshot="${tableName}_backup" snapshot_time="2024-01-15T10:00:00Z"`);

    cli.output(`\n==================================================`);
  }
}
