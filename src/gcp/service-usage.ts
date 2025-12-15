/**
 * GCP Service Usage Entity
 *
 * Enables Google Cloud APIs for a project. This is typically the first
 * entity to run before using other GCP services.
 *
 * Most GCP services require their APIs to be enabled before they can be used.
 * This entity handles enabling one or more APIs and waiting for them to be ready.
 *
 * @see https://cloud.google.com/service-usage/docs/overview
 * @see https://cloud.google.com/apis/docs/getting-started
 */

import { MonkEntity } from "monkec/base";
import gcp from "cloud/gcp";
import cli from "cli";
import {
  SERVICE_USAGE_API_URL,
  parseGcpError,
  isOperationDone,
} from "./common.ts";

/**
 * Common GCP API names for reference (not exhaustive)
 *
 * Compute & Infrastructure:
 * - compute.googleapis.com: Compute Engine
 * - container.googleapis.com: Google Kubernetes Engine (GKE)
 * - cloudresourcemanager.googleapis.com: Resource Manager
 * - run.googleapis.com: Cloud Run
 * - cloudfunctions.googleapis.com: Cloud Functions
 * - appengine.googleapis.com: App Engine Admin
 *
 * Databases & Storage:
 * - sqladmin.googleapis.com: Cloud SQL Admin
 * - storage.googleapis.com: Cloud Storage (usually enabled by default)
 * - storage-component.googleapis.com: Cloud Storage Component
 * - bigquery.googleapis.com: BigQuery
 * - firestore.googleapis.com: Cloud Firestore
 * - redis.googleapis.com: Cloud Memorystore for Redis
 * - spanner.googleapis.com: Cloud Spanner
 *
 * Networking:
 * - dns.googleapis.com: Cloud DNS
 * - networkservices.googleapis.com: Network Services
 * - servicenetworking.googleapis.com: Service Networking
 *
 * Security & Identity:
 * - iam.googleapis.com: Identity and Access Management
 * - iamcredentials.googleapis.com: IAM Service Account Credentials
 * - secretmanager.googleapis.com: Secret Manager
 * - cloudkms.googleapis.com: Cloud Key Management Service
 *
 * Monitoring & Logging:
 * - logging.googleapis.com: Cloud Logging
 * - monitoring.googleapis.com: Cloud Monitoring
 * - cloudtrace.googleapis.com: Cloud Trace
 * - clouderrorreporting.googleapis.com: Error Reporting
 *
 * Messaging & Events:
 * - pubsub.googleapis.com: Cloud Pub/Sub
 * - cloudtasks.googleapis.com: Cloud Tasks
 * - cloudscheduler.googleapis.com: Cloud Scheduler
 * - eventarc.googleapis.com: Eventarc
 *
 * AI/ML:
 * - aiplatform.googleapis.com: Vertex AI
 * - ml.googleapis.com: AI Platform Training & Prediction
 * - vision.googleapis.com: Cloud Vision
 * - language.googleapis.com: Natural Language
 *
 * @see https://cloud.google.com/apis/docs/enabled-apis for full list
 */

/**
 * Service Usage entity definition
 * @interface ServiceUsageDefinition
 */
export interface ServiceUsageDefinition {
  /**
   * @description Single API name to enable.
   * Use this for enabling just one API.
   * Format: {service}.googleapis.com (e.g., "sqladmin.googleapis.com")
   */
  name?: string;

  /**
   * @description Array of API names to batch enable.
   * Use this for enabling multiple APIs efficiently.
   * APIs are enabled concurrently in a single operation.
   * @example ["sqladmin.googleapis.com", "bigquery.googleapis.com"]
   */
  apis?: string[];

  /**
   * @description Override the GCP project ID.
   * If not specified, uses the project from environment/credentials.
   */
  project?: string;
}

/**
 * Service Usage entity state
 * @interface ServiceUsageState
 */
export interface ServiceUsageState {
  /**
   * @description Indicates if all requested APIs are enabled and ready
   */
  ready?: boolean;

  /**
   * @description Operation name for tracking async enable operation
   */
  operation?: string;

  /**
   * @description List of APIs that were enabled by this entity
   */
  enabled_apis?: string[];

  /**
   * @description Indicates if APIs were already enabled (adopted)
   */
  existing?: boolean;
}

/**
 * Service Usage entity for enabling GCP APIs
 *
 * Enables one or more Google Cloud APIs for a project. This is typically
 * the first entity in a stack, as other GCP resources require their APIs
 * to be enabled before they can be created.
 *
 * ## Secrets
 * This entity does NOT write any secrets.
 *
 * ## Dependencies
 * This is a standalone entity with no dependencies on other entities.
 * However, other GCP entities typically depend on this entity to ensure
 * required APIs are enabled before creating resources.
 *
 * ## Composing with Other Entities
 * Use this entity as a dependency for other GCP entities that require
 * specific APIs to be enabled. No state fields need to be passed to
 * dependent entities - they just need to wait for this entity to be ready.
 *
 * @see https://cloud.google.com/service-usage/docs/overview
 *
 * @example Enable a single API
 * ```yaml
 * enable-cloudsql:
 *   defines: gcp/service-usage
 *   name: sqladmin.googleapis.com
 * ```
 *
 * @example Enable multiple APIs for a data platform
 * ```yaml
 * enable-data-apis:
 *   defines: gcp/service-usage
 *   apis:
 *     - sqladmin.googleapis.com
 *     - bigquery.googleapis.com
 *     - storage.googleapis.com
 *     - pubsub.googleapis.com
 * ```
 *
 * @example Enable APIs for a GKE workload
 * ```yaml
 * enable-gke-apis:
 *   defines: gcp/service-usage
 *   apis:
 *     - container.googleapis.com
 *     - compute.googleapis.com
 *     - iam.googleapis.com
 *     - logging.googleapis.com
 *     - monitoring.googleapis.com
 * ```
 *
 * @example Enable APIs for a serverless application
 * ```yaml
 * enable-serverless-apis:
 *   defines: gcp/service-usage
 *   apis:
 *     - run.googleapis.com
 *     - cloudbuild.googleapis.com
 *     - secretmanager.googleapis.com
 *     - cloudtasks.googleapis.com
 *     - cloudscheduler.googleapis.com
 * ```
 *
 * @example Compose with Cloud SQL (ensure API is enabled first)
 * ```yaml
 * enable-sql-api:
 *   defines: gcp/service-usage
 *   name: sqladmin.googleapis.com
 *
 * my-postgres:
 *   defines: gcp/cloud-sql-instance
 *   name: my-instance
 *   depends:
 *     wait-for:
 *       runnables:
 *         - gcp/service-usage/enable-sql-api
 *       timeout: 300
 * ```
 */
export class ServiceUsage extends MonkEntity<
  ServiceUsageDefinition,
  ServiceUsageState
> {
  protected projectId!: string;

  static readonly readiness = { period: 10, initialDelay: 2, attempts: 30 };

  protected override before(): void {
    this.projectId = this.definition.project || gcp.getProject();
    if (!this.projectId) {
      throw new Error("GCP project ID not available");
    }
  }

  /**
   * Check if a single API is enabled
   */
  private checkApi(apiName: string): boolean {
    const url = `${SERVICE_USAGE_API_URL}/projects/${this.projectId}/services/${apiName}`;
    const response = gcp.get(url);

    if (response.error) {
      throw new Error(
        `Failed to check API ${apiName}: ${parseGcpError(response)}`
      );
    }

    const data = JSON.parse(response.body);
    return data.state === "ENABLED";
  }

  /**
   * Enable a single API
   */
  private enableApi(apiName: string): any {
    cli.output(`Enabling API: ${apiName}`);
    const url = `${SERVICE_USAGE_API_URL}/projects/${this.projectId}/services/${apiName}:enable`;
    const response = gcp.post(url);

    if (response.error) {
      throw new Error(
        `Failed to enable API ${apiName}: ${parseGcpError(response)}`
      );
    }

    return JSON.parse(response.body);
  }

  /**
   * Check which APIs from a list are not yet enabled
   */
  private checkApis(apiNames: string[]): string[] {
    const names = apiNames
      .map((api) => `names=projects/${this.projectId}/services/${api}`)
      .join("&");

    const url = `${SERVICE_USAGE_API_URL}/projects/${this.projectId}/services/:batchGet?${names}`;
    const response = gcp.get(url);

    if (response.error) {
      throw new Error(`Failed to batch check APIs: ${parseGcpError(response)}`);
    }

    const data = JSON.parse(response.body);
    const enabledApis = new Set<string>();

    if (data.services) {
      for (const service of data.services) {
        if (service.state === "ENABLED") {
          // Extract API name from full resource name
          const parts = service.name.split("/");
          enabledApis.add(parts[parts.length - 1]);
        }
      }
    }

    // Return APIs that are not enabled
    return apiNames.filter((api) => !enabledApis.has(api));
  }

  /**
   * Batch enable multiple APIs
   */
  private enableApis(apiNames: string[]): any {
    cli.output(`Enabling ${apiNames.length} APIs: ${apiNames.join(", ")}`);

    const url = `${SERVICE_USAGE_API_URL}/projects/${this.projectId}/services/:batchEnable`;
    const body = { serviceIds: apiNames };
    const response = gcp.post(url, { body: JSON.stringify(body) });

    if (response.error) {
      throw new Error(
        `Failed to batch enable APIs: ${parseGcpError(response)}`
      );
    }

    return JSON.parse(response.body);
  }

  override create(): void {
    if (this.definition.apis && this.definition.apis.length > 0) {
      // Batch enable mode
      // Copy to mutable array
      const apis = [...this.definition.apis];
      const toEnable = this.checkApis(apis);

      if (toEnable.length === 0) {
        cli.output("All APIs are already enabled");
        this.state.ready = true;
        this.state.enabled_apis = apis;
        return;
      }

      const result = this.enableApis(toEnable);
      this.state.ready = false;
      this.state.operation = result.name;
      this.state.enabled_apis = apis;
    } else if (this.definition.name) {
      // Single API mode
      if (this.checkApi(this.definition.name)) {
        cli.output(`API ${this.definition.name} is already enabled`);
        this.state.ready = true;
        this.state.enabled_apis = [this.definition.name];
        return;
      }

      const result = this.enableApi(this.definition.name);
      this.state.ready = false;
      this.state.operation = result.name;
      this.state.enabled_apis = [this.definition.name];
    } else {
      throw new Error("Either 'name' or 'apis' must be specified");
    }
  }

  override update(): void {
    // Re-run create to ensure APIs are enabled
    this.create();
  }

  override delete(): void {
    // APIs are typically not disabled on delete
    // as they may be used by other resources
    cli.output("Service Usage entity does not disable APIs on delete");
  }

  override checkReadiness(): boolean {
    // If already marked ready, verify APIs are still enabled
    if (this.state.ready) {
      return true;
    }

    // Check operation status if we have one
    if (this.state.operation) {
      // Service Usage Operations.get endpoint is:
      //   GET https://serviceusage.googleapis.com/v1/{name}
      // where {name} is the operation resource name (e.g. "operations/abc123").
      // Do NOT prefix with "projects/{projectId}/" or the request will 404.
      const opName = `${this.state.operation}`.replace(/^\/+/, "");
      const url = `${SERVICE_USAGE_API_URL}/${opName}`;
      const response = gcp.get(url);

      if (response.error) {
        cli.output(`Error checking operation: ${parseGcpError(response)}`);
        return false;
      }

      const operation = JSON.parse(response.body);

      if (isOperationDone(operation)) {
        cli.output("API enablement operation completed");
        this.state.ready = true;
        this.state.operation = undefined;
        return true;
      }

      const statusInfo =
        operation.status ||
        (operation.done === false ? "in progress" : "unknown");
      cli.output(`Operation status: ${statusInfo}`);
      return false;
    }

    // Verify APIs are enabled
    if (this.definition.apis && this.definition.apis.length > 0) {
      const notEnabled = this.checkApis([...this.definition.apis]);
      if (notEnabled.length === 0) {
        this.state.ready = true;
        return true;
      }
      cli.output(`APIs not yet enabled: ${notEnabled.join(", ")}`);
      return false;
    } else if (this.definition.name) {
      if (this.checkApi(this.definition.name)) {
        this.state.ready = true;
        return true;
      }
      cli.output(`API ${this.definition.name} not yet enabled`);
      return false;
    }

    return false;
  }

  checkLiveness(): boolean {
    return this.checkReadiness();
  }
}
