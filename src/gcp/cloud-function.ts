/**
 * GCP Cloud Functions (Gen 2) Entity
 *
 * Creates and manages Google Cloud Functions using the v2 API (2nd generation).
 * Gen 2 functions run on Cloud Run and support improved concurrency, scaling,
 * and event handling.
 *
 * @see https://cloud.google.com/functions/docs/concepts/version-comparison
 * @see https://cloud.google.com/functions/docs/reference/rest/v2
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import http from "http";
import blobs from "blobs";
import {
    CLOUD_FUNCTIONS_API_URL,
    GcpRegion,
    CloudFunctionRuntime,
    CloudFunctionIngress,
    CloudFunctionVpcEgress,
    CloudFunctionTriggerType,
} from "./common.ts";

/**
 * Event trigger configuration for Cloud Functions
 */
export interface EventTriggerConfig {
    /**
     * @description Event type that triggers the function
     * @see CloudFunctionTriggerType
     */
    event_type: CloudFunctionTriggerType;

    /**
     * @description Pub/Sub topic (for Pub/Sub triggers)
     * Format: projects/{project}/topics/{topic}
     */
    pubsub_topic?: string;

    /**
     * @description Event filters for filtering events
     * Key-value pairs like bucket: my-bucket for storage triggers
     */
    event_filters?: Record<string, string>;

    /**
     * @description Event filters with path patterns
     * For document path patterns in Firestore triggers
     */
    event_filters_path_pattern?: Record<string, string>;

    /**
     * @description Retry policy on event failure
     * @default RETRY_POLICY_DO_NOT_RETRY
     */
    retry_policy?: "RETRY_POLICY_UNSPECIFIED" | "RETRY_POLICY_DO_NOT_RETRY" | "RETRY_POLICY_RETRY";

    /**
     * @description Service account email for trigger identity
     */
    service_account_email?: string;

    /**
     * @description Channel for 3rd-party event providers
     */
    channel?: string;
}

/**
 * Service configuration for Cloud Functions
 */
export interface ServiceConfig {
    /**
     * @description Maximum number of concurrent instances
     * @default 100
     */
    max_instance_count?: number;

    /**
     * @description Minimum number of instances (for reduced cold starts)
     * @default 0
     */
    min_instance_count?: number;

    /**
     * @description Memory available to the function (e.g., "256Mi", "1Gi", "2Gi")
     * @default "256Mi"
     */
    available_memory?: string;

    /**
     * @description Maximum request timeout in seconds (1-3600)
     * @default 60
     */
    timeout_seconds?: number;

    /**
     * @description Available CPU (e.g., "1", "2", "4" or fractional like "0.083")
     */
    available_cpu?: string;

    /**
     * @description Maximum concurrent requests per instance (1-1000)
     * @default 1
     */
    max_instance_request_concurrency?: number;

    /**
     * @description Environment variables for the function
     */
    environment_variables?: Record<string, string>;

    /**
     * @description Secret environment variables
     * Maps env var names to secret references (projects/{project}/secrets/{secret}/versions/{version})
     */
    secret_environment_variables?: Record<string, string>;

    /**
     * @description VPC connector for VPC access
     * Format: projects/{project}/locations/{location}/connectors/{connector}
     */
    vpc_connector?: string;

    /**
     * @description VPC connector egress settings
     */
    vpc_connector_egress_settings?: CloudFunctionVpcEgress;

    /**
     * @description Ingress settings
     * @default ALLOW_ALL
     */
    ingress_settings?: CloudFunctionIngress;

    /**
     * @description Service account email for function execution
     */
    service_account_email?: string;

    /**
     * @description Whether all traffic should be routed through VPC
     */
    all_traffic_on_latest_revision?: boolean;
}

/**
 * Build configuration for Cloud Functions
 */
export interface BuildConfig {
    /**
     * @description Runtime for the function (e.g., "nodejs20", "python311", "go122")
     * @see CloudFunctionRuntime
     */
    runtime: CloudFunctionRuntime;

    /**
     * @description Function entry point name
     * @default Function name matching the file export
     */
    entry_point?: string;

    /**
     * @description Build environment variables
     */
    environment_variables?: Record<string, string>;

    /**
     * @description Docker repository for storing built images
     * Format: projects/{project}/locations/{location}/repositories/{repository}
     */
    docker_repository?: string;

    /**
     * @description Worker pool for builds
     * Format: projects/{project}/locations/{location}/workerPools/{pool}
     */
    worker_pool?: string;
}

/**
 * Cloud Function Gen 2 entity definition
 * @interface CloudFunctionDefinition
 */
export interface CloudFunctionDefinition extends GcpEntityDefinition {
    /**
     * @description Function name (must be unique within project/region)
     * Names must be 1-63 characters, start with a letter, and contain only
     * lowercase letters, numbers, and hyphens.
     */
    name: string;

    /**
     * @description GCP region for the function
     * @see GcpRegion
     */
    location: GcpRegion;

    /**
     * @description Name of the blob containing the function source code
     * The blob will be zipped and uploaded to GCS for deployment.
     */
    blob_name: string;

    /**
     * @description Build configuration (runtime, entry point)
     */
    build: BuildConfig;

    /**
     * @description Service configuration (memory, timeout, scaling)
     */
    service?: ServiceConfig;

    /**
     * @description Event trigger configuration (for non-HTTP functions)
     * If not specified, function is HTTP-triggered.
     */
    event_trigger?: EventTriggerConfig;

    /**
     * @description Description of the function
     */
    function_description?: string;

    /**
     * @description Key-value labels for organizing functions
     */
    labels?: Record<string, string>;

    /**
     * @description KMS key for customer-managed encryption
     * Format: projects/{project}/locations/{location}/keyRings/{keyRing}/cryptoKeys/{key}
     */
    kms_key_name?: string;
}

/**
 * Cloud Function Gen 2 entity state
 * @interface CloudFunctionState
 */
export interface CloudFunctionState extends GcpEntityState {
    /**
     * @description Function name
     */
    name?: string;

    /**
     * @description Full resource name
     */
    resource_name?: string;

    /**
     * @description Function state (ACTIVE, FAILED, DEPLOYING, etc.)
     */
    state?: string;

    /**
     * @description Function HTTPS endpoint URL (for HTTP triggers)
     */
    url?: string;

    /**
     * @description Cloud Run service name
     */
    service?: string;

    /**
     * @description Creation timestamp
     */
    create_time?: string;

    /**
     * @description Last update timestamp
     */
    update_time?: string;

    /**
     * @description Build ID of the current deployment
     */
    build_id?: string;

    /**
     * @description Current generation/version
     */
    generation?: string;

    /**
     * @description Underlying Cloud Run service URL
     */
    service_url?: string;
}

/**
 * GCP Cloud Function Gen 2 Entity
 *
 * Deploys and manages serverless functions using Cloud Functions 2nd generation,
 * which runs on Cloud Run infrastructure for improved performance.
 *
 * ## Function Code Deployment
 * Source code is provided via a blob (directory of function code). The entity
 * will automatically:
 * 1. Zip the blob contents
 * 2. Upload to a GCS staging bucket via signed URL
 * 3. Deploy the function from the staged source
 *
 * ## Trigger Types
 * - **HTTP**: Default trigger, provides HTTPS endpoint
 * - **Pub/Sub**: Triggered by Pub/Sub messages
 * - **Cloud Storage**: Triggered by bucket events (create, delete, etc.)
 * - **Firestore**: Triggered by document changes
 * - **Firebase Auth**: Triggered by user lifecycle events
 *
 * ## Secrets
 * This entity does NOT write any secrets directly.
 *
 * ## Dependencies
 * Required APIs:
 * - `cloudfunctions.googleapis.com`
 * - `cloudbuild.googleapis.com`
 * - `artifactregistry.googleapis.com`
 * - `run.googleapis.com`
 *
 * ## State Fields for Composition
 * - `state.url` - HTTPS endpoint URL for invoking HTTP-triggered functions
 * - `state.service_url` - Cloud Run service URL
 * - `state.service` - Cloud Run service name
 * - `state.resource_name` - Full resource name for IAM bindings
 *
 * ## Composing with Other Entities
 * - `gcp/service-account` - Create dedicated SA with `roles/cloudfunctions.invoker`
 * - `gcp/cloud-storage` - Trigger functions on storage events
 * - `gcp/service-usage` - Enable required APIs before deployment
 *
 * @see https://cloud.google.com/functions/docs
 *
 * @example HTTP-triggered function
 * ```yaml
 * my-function:
 *   defines: gcp/cloud-function
 *   name: hello-world
 *   location: us-central1
 *   blob_name: my-function-code
 *   build:
 *     runtime: nodejs20
 *     entry_point: helloWorld
 *   service:
 *     available_memory: 256Mi
 *     timeout_seconds: 60
 *     max_instance_count: 10
 * ```
 *
 * @example Pub/Sub triggered function
 * ```yaml
 * pubsub-handler:
 *   defines: gcp/cloud-function
 *   name: process-messages
 *   location: us-central1
 *   blob_name: processor-code
 *   build:
 *     runtime: python311
 *     entry_point: process_message
 *   service:
 *     available_memory: 512Mi
 *   event_trigger:
 *     event_type: google.cloud.pubsub.topic.v1.messagePublished
 *     pubsub_topic: projects/my-project/topics/my-topic
 * ```
 *
 * @example Storage triggered function
 * ```yaml
 * image-processor:
 *   defines: gcp/cloud-function
 *   name: resize-images
 *   location: us-central1
 *   blob_name: image-processor-code
 *   build:
 *     runtime: nodejs20
 *     entry_point: processImage
 *   service:
 *     available_memory: 1Gi
 *     timeout_seconds: 300
 *   event_trigger:
 *     event_type: google.cloud.storage.object.v1.finalized
 *     event_filters:
 *       bucket: my-upload-bucket
 * ```
 */
export class CloudFunction extends GcpEntity<CloudFunctionDefinition, CloudFunctionState> {

    static readonly readiness = { period: 10, initialDelay: 5, attempts: 60 };

    protected getEntityName(): string {
        return `Cloud Function ${this.definition.name}`;
    }

    /**
     * Get the base API URL for this function's location
     */
    private getBaseUrl(): string {
        return `${CLOUD_FUNCTIONS_API_URL}/projects/${this.projectId}/locations/${this.definition.location}`;
    }

    /**
     * Get full function resource URL
     */
    private getFunctionUrl(): string {
        return `${this.getBaseUrl()}/functions/${this.definition.name}`;
    }

    /**
     * Get function details from API
     */
    private getFunction(): any | null {
        return this.checkResourceExists(this.getFunctionUrl());
    }

    /**
     * Generate upload URL for function source code
     */
    private generateUploadUrl(): { uploadUrl: string; storageSource: any } {
        const url = `${this.getBaseUrl()}/functions:generateUploadUrl`;
        const response = this.post(url, {});

        if (!response.uploadUrl) {
            throw new Error("Failed to generate upload URL: No uploadUrl in response");
        }

        return {
            uploadUrl: response.uploadUrl,
            storageSource: response.storageSource,
        };
    }

    /**
     * Upload function source code from blob to GCS
     */
    private uploadSourceCode(): any {
        // Verify blob exists
        const blobMeta = blobs.get(this.definition.blob_name);
        if (!blobMeta) {
            throw new Error(`Blob not found: ${this.definition.blob_name}`);
        }

        // Get ZIP content from blob
        const zipContent = blobs.zip(this.definition.blob_name);
        if (!zipContent) {
            throw new Error(`Failed to zip blob: ${this.definition.blob_name}`);
        }

        // Generate upload URL
        const { uploadUrl, storageSource } = this.generateUploadUrl();

        // Upload to signed URL (no GCP auth needed, URL contains auth)
        cli.output(`Uploading function source code...`);
        const uploadResponse = http.put(uploadUrl, {
            headers: {
                "content-type": "application/zip",
            },
            body: zipContent,
        });

        if (uploadResponse.error || uploadResponse.statusCode >= 400) {
            const errorMsg = uploadResponse.error || uploadResponse.body || "Unknown error";
            throw new Error(`Failed to upload source code: ${errorMsg}`);
        }

        return storageSource;
    }

    /**
     * Build the function request body
     */
    private buildFunctionBody(storageSource: any): any {
        const body: any = {
            buildConfig: {
                source: {
                    storageSource: storageSource,
                },
                runtime: this.definition.build.runtime,
                entryPoint: this.definition.build.entry_point || this.definition.name,
            },
            serviceConfig: {
                maxInstanceCount: this.definition.service?.max_instance_count || 100,
                minInstanceCount: this.definition.service?.min_instance_count || 0,
                availableMemory: this.definition.service?.available_memory || "256Mi",
                timeoutSeconds: this.definition.service?.timeout_seconds || 60,
            },
        };

        // Build config options
        if (this.definition.build.environment_variables) {
            body.buildConfig.environmentVariables = this.definition.build.environment_variables;
        }
        if (this.definition.build.docker_repository) {
            body.buildConfig.dockerRepository = this.definition.build.docker_repository;
        }
        if (this.definition.build.worker_pool) {
            body.buildConfig.workerPool = this.definition.build.worker_pool;
        }

        // Service config options
        if (this.definition.service?.available_cpu) {
            body.serviceConfig.availableCpu = this.definition.service.available_cpu;
        }
        if (this.definition.service?.max_instance_request_concurrency) {
            body.serviceConfig.maxInstanceRequestConcurrency =
                this.definition.service.max_instance_request_concurrency;
        }
        if (this.definition.service?.environment_variables) {
            body.serviceConfig.environmentVariables = this.definition.service.environment_variables;
        }
        if (this.definition.service?.secret_environment_variables) {
            body.serviceConfig.secretEnvironmentVariables = Object.entries(
                this.definition.service.secret_environment_variables
            ).map(([key, value]) => ({
                key: key,
                secret: value,
            }));
        }
        if (this.definition.service?.vpc_connector) {
            body.serviceConfig.vpcConnector = this.definition.service.vpc_connector;
        }
        if (this.definition.service?.vpc_connector_egress_settings) {
            body.serviceConfig.vpcConnectorEgressSettings =
                this.definition.service.vpc_connector_egress_settings;
        }
        if (this.definition.service?.ingress_settings) {
            body.serviceConfig.ingressSettings = this.definition.service.ingress_settings;
        }
        if (this.definition.service?.service_account_email) {
            body.serviceConfig.serviceAccountEmail = this.definition.service.service_account_email;
        }
        if (this.definition.service?.all_traffic_on_latest_revision !== undefined) {
            body.serviceConfig.allTrafficOnLatestRevision =
                this.definition.service.all_traffic_on_latest_revision;
        }

        // Event trigger configuration
        if (this.definition.event_trigger) {
            body.eventTrigger = {
                eventType: this.definition.event_trigger.event_type,
            };

            if (this.definition.event_trigger.pubsub_topic) {
                body.eventTrigger.pubsubTopic = this.definition.event_trigger.pubsub_topic;
            }

            if (this.definition.event_trigger.event_filters) {
                body.eventTrigger.eventFilters = Object.entries(
                    this.definition.event_trigger.event_filters
                ).map(([attribute, value]) => ({
                    attribute: attribute,
                    value: value,
                }));
            }

            if (this.definition.event_trigger.event_filters_path_pattern) {
                const pathFilters = Object.entries(
                    this.definition.event_trigger.event_filters_path_pattern
                ).map(([attribute, value]) => ({
                    attribute: attribute,
                    value: value,
                    operator: "match-path-pattern",
                }));
                body.eventTrigger.eventFilters = [
                    ...(body.eventTrigger.eventFilters || []),
                    ...pathFilters,
                ];
            }

            if (this.definition.event_trigger.retry_policy) {
                body.eventTrigger.retryPolicy = this.definition.event_trigger.retry_policy;
            }

            if (this.definition.event_trigger.service_account_email) {
                body.eventTrigger.serviceAccountEmail =
                    this.definition.event_trigger.service_account_email;
            }

            if (this.definition.event_trigger.channel) {
                body.eventTrigger.channel = this.definition.event_trigger.channel;
            }
        }

        // Optional metadata
        if (this.definition.function_description) {
            body.description = this.definition.function_description;
        }
        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }
        if (this.definition.kms_key_name) {
            body.kmsKeyName = this.definition.kms_key_name;
        }

        return body;
    }

    /**
     * Populate state from function response
     */
    private populateState(func: any): void {
        this.state.name = func.name?.split("/").pop();
        this.state.resource_name = func.name;
        this.state.state = func.state;
        this.state.url = func.serviceConfig?.uri;
        this.state.service = func.serviceConfig?.service;
        this.state.create_time = func.createTime;
        this.state.update_time = func.updateTime;
        this.state.build_id = func.buildConfig?.build;
        this.state.generation = func.environment;
        this.state.service_url = func.serviceConfig?.uri;
    }

    /**
     * Wait for function operation to complete
     */
    private waitForFunctionOperation(operationName: string): any {
        const operationUrl = `${CLOUD_FUNCTIONS_API_URL}/${operationName}`;
        return this.waitForOperation(operationUrl, 120, 10000); // 20 minutes max, 10s interval
    }

    override create(): void {
        // Check if function already exists
        const existing = this.getFunction();

        if (existing) {
            cli.output(`Function ${this.definition.name} already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        // Upload source code
        const storageSource = this.uploadSourceCode();

        // Build request body
        const body = this.buildFunctionBody(storageSource);

        // Create function
        cli.output(`Creating Cloud Function: ${this.definition.name}`);
        const url = `${this.getBaseUrl()}/functions?functionId=${this.definition.name}`;
        const operation = this.post(url, body);

        // Store operation name for tracking
        this.state.operation_name = operation.name;

        // Wait for operation to complete
        cli.output(`Waiting for function deployment to complete...`);
        this.waitForFunctionOperation(operation.name);

        // Get final function state
        const func = this.getFunction();
        if (func) {
            this.populateState(func);
            this.state.existing = false;
            cli.output(`Function ${this.definition.name} created successfully`);
            if (this.state.url) {
                cli.output(`Function URL: ${this.state.url}`);
            }
        }
    }

    override update(): void {
        const existing = this.getFunction();

        if (!existing) {
            cli.output("Function not found, creating...");
            this.create();
            return;
        }

        // Upload new source code
        const storageSource = this.uploadSourceCode();

        // Build request body
        const body = this.buildFunctionBody(storageSource);

        // Update function with PATCH
        cli.output(`Updating Cloud Function: ${this.definition.name}`);
        const operation = this.patch(this.getFunctionUrl(), body);

        // Store operation name for tracking
        this.state.operation_name = operation.name;

        // Wait for operation to complete
        cli.output(`Waiting for function update to complete...`);
        this.waitForFunctionOperation(operation.name);

        // Get final function state
        const func = this.getFunction();
        if (func) {
            this.populateState(func);
            cli.output(`Function ${this.definition.name} updated successfully`);
        }
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Function ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getFunction();
        if (!existing) {
            cli.output(`Function ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting Cloud Function: ${this.definition.name}`);
        const operation = this.httpDelete(this.getFunctionUrl());

        if (operation?.name) {
            cli.output(`Waiting for function deletion to complete...`);
            this.waitForFunctionOperation(operation.name);
        }

        cli.output(`Function ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        const func = this.getFunction();
        if (!func) {
            cli.output("Function not found");
            return false;
        }

        this.populateState(func);

        // Check function state
        if (func.state === "ACTIVE") {
            cli.output(`Function ${this.definition.name} is ready`);
            if (this.state.url) {
                cli.output(`URL: ${this.state.url}`);
            }
            return true;
        }

        if (func.state === "FAILED") {
            cli.output(`Function ${this.definition.name} is in FAILED state`);
            return false;
        }

        cli.output(`Function ${this.definition.name} is ${func.state}`);
        return false;
    }

    checkLiveness(): boolean {
        const func = this.getFunction();
        return func !== null && func.state === "ACTIVE";
    }

    @action("get")
    getInfo(_args?: Args): void {
        const func = this.getFunction();
        if (!func) {
            throw new Error("Function not found");
        }
        cli.output(JSON.stringify(func, null, 2));
    }

    @action("get-iam-policy")
    getIamPolicy(_args?: Args): void {
        const url = `${this.getFunctionUrl()}:getIamPolicy`;
        const policy = this.get(url);
        cli.output(JSON.stringify(policy, null, 2));
    }

    @action("set-iam-policy")
    setIamPolicy(args?: Args): void {
        if (!args?.policy) {
            throw new Error("policy argument is required (JSON string)");
        }
        const url = `${this.getFunctionUrl()}:setIamPolicy`;
        const policy = JSON.parse(args.policy);
        const result = this.post(url, { policy });
        cli.output(JSON.stringify(result, null, 2));
    }

    @action("test-iam-permissions")
    testIamPermissions(args?: Args): void {
        if (!args?.permissions) {
            throw new Error("permissions argument is required (comma-separated list)");
        }
        const url = `${this.getFunctionUrl()}:testIamPermissions`;
        const permissions = args.permissions.split(",").map((p: string) => p.trim());
        const result = this.post(url, { permissions });
        cli.output(JSON.stringify(result, null, 2));
    }

    @action("invoke")
    invokeFunction(args?: Args): void {
        if (!this.state.url) {
            throw new Error("Function URL not available. Function may not be HTTP-triggered or not yet deployed.");
        }

        const data = args?.data ? JSON.parse(args.data) : {};
        const response = http.post(this.state.url, {
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        cli.output(`Status: ${response.statusCode}`);
        cli.output(`Response: ${response.body}`);
    }

    // ==================== COST ESTIMATION ====================

    /**
     * Parse memory string to MB (e.g., "256Mi" -> 256, "1Gi" -> 1024)
     */
    private parseMemoryMb(memStr: string): number {
        if (memStr.endsWith('Gi')) {
            return parseFloat(memStr.replace('Gi', '')) * 1024;
        }
        if (memStr.endsWith('Mi')) {
            return parseFloat(memStr.replace('Mi', ''));
        }
        return 256; // default
    }

    /**
     * Get Cloud Function pricing from GCP Cloud Billing Catalog API
     */
    private fetchCloudFunctionPricing(): {
        invocationPer1M: number;
        cpuGhzSecond: number;
        memoryGbSecond: number;
        idleCpuGhzSecond: number;
        idleMemoryGbSecond: number;
        networkEgressPerGb: number;
        source: string;
    } {
        try {
            const billingApiUrl = 'https://cloudbilling.googleapis.com/v1';
            // Cloud Functions service ID
            const serviceId = '29E7-DA93-CA13';
            const skusUrl = `${billingApiUrl}/services/${serviceId}/skus?currencyCode=USD`;
            const response = this.get(skusUrl);

            if (response.skus && Array.isArray(response.skus)) {
                let invocationRate = 0;
                let cpuRate = 0;
                let memoryRate = 0;
                let idleCpuRate = 0;
                let idleMemoryRate = 0;
                let networkRate = 0;

                const location = this.definition.location || 'us-central1';

                for (const sku of response.skus) {
                    const desc = (sku.description || '').toLowerCase();
                    const serviceRegions = sku.serviceRegions || [];
                    if (!serviceRegions.includes(location) && !serviceRegions.includes('global')) {
                        continue;
                    }

                    const price = this.extractPriceFromSku(sku);
                    if (price <= 0) continue;

                    if (desc.includes('invocation')) {
                        invocationRate = price;
                    } else if (desc.includes('idle') && desc.includes('cpu')) {
                        // Idle CPU rate (for min instances)
                        idleCpuRate = price;
                    } else if (desc.includes('idle') && desc.includes('memory')) {
                        // Idle memory rate (for min instances)
                        idleMemoryRate = price;
                    } else if (desc.includes('cpu') && desc.includes('time')) {
                        cpuRate = price;
                    } else if (desc.includes('memory') && desc.includes('time')) {
                        memoryRate = price;
                    } else if (desc.includes('network') && desc.includes('egress')) {
                        networkRate = price;
                    }
                }

                if (invocationRate > 0 || cpuRate > 0) {
                    if (invocationRate <= 0 || cpuRate <= 0 || memoryRate <= 0) {
                        const missing: string[] = [];
                        if (invocationRate <= 0) missing.push('invocation');
                        if (cpuRate <= 0) missing.push('cpu');
                        if (memoryRate <= 0) missing.push('memory');
                        throw new Error(`Incomplete pricing from GCP API: missing rates for ${missing.join(', ')}`);
                    }
                    return {
                        invocationPer1M: invocationRate * 1000000,
                        cpuGhzSecond: cpuRate,
                        memoryGbSecond: memoryRate,
                        idleCpuGhzSecond: idleCpuRate,
                        idleMemoryGbSecond: idleMemoryRate,
                        networkEgressPerGb: networkRate > 0 ? networkRate : 0,
                        source: 'GCP Cloud Billing Catalog API'
                    };
                }
            }
        } catch (error) {
            throw new Error(`Failed to fetch Cloud Functions pricing from GCP API: ${(error as Error).message}`);
        }

        throw new Error('Could not retrieve Cloud Functions pricing from GCP Cloud Billing Catalog API');
    }

    /**
     * Extract price from a GCP Billing SKU
     */
    private extractPriceFromSku(sku: any): number {
        try {
            const pricingInfo = sku.pricingInfo;
            if (!pricingInfo || !Array.isArray(pricingInfo) || pricingInfo.length === 0) {
                return 0;
            }

            const tieredRates = pricingInfo[0].pricingExpression?.tieredRates;
            if (!tieredRates || !Array.isArray(tieredRates)) {
                return 0;
            }

            for (const rate of tieredRates) {
                const unitPrice = rate.unitPrice;
                if (unitPrice) {
                    const units = parseInt(unitPrice.units || '0', 10);
                    const nanos = unitPrice.nanos || 0;
                    const price = units + nanos / 1e9;
                    if (price > 0) {
                        return price;
                    }
                }
            }
        } catch (_error) {
            // Ignore parsing errors
        }
        return 0;
    }

    /**
     * Get Cloud Monitoring metrics for the function (last 30 days)
     */
    private getCloudFunctionMetrics(): {
        executionCount: number;
        executionTimeMs: number;
        networkEgressBytes: number;
    } | null {
        try {
            const endTime = new Date().toISOString();
            const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const functionName = this.definition.name;

            // Fetch execution count
            const countFilter = encodeURIComponent(
                `metric.type="cloudfunctions.googleapis.com/function/execution_count" AND resource.labels.function_name="${functionName}"`
            );
            const countUrl = `https://monitoring.googleapis.com/v3/projects/${this.projectId}/timeSeries?filter=${countFilter}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            let executionCount = 0;
            try {
                const countResponse = this.get(countUrl);
                if (countResponse.timeSeries && countResponse.timeSeries.length > 0) {
                    for (const ts of countResponse.timeSeries) {
                        for (const point of (ts.points || [])) {
                            executionCount += parseInt(point.value?.int64Value || point.value?.doubleValue || '0', 10);
                        }
                    }
                }
            } catch (_e) {
                // Metrics may not be available
            }

            // Fetch execution time
            const timeFilter = encodeURIComponent(
                `metric.type="cloudfunctions.googleapis.com/function/execution_times" AND resource.labels.function_name="${functionName}"`
            );
            const timeUrl = `https://monitoring.googleapis.com/v3/projects/${this.projectId}/timeSeries?filter=${timeFilter}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            let executionTimeMs = 0;
            try {
                const timeResponse = this.get(timeUrl);
                if (timeResponse.timeSeries && timeResponse.timeSeries.length > 0) {
                    for (const ts of timeResponse.timeSeries) {
                        for (const point of (ts.points || [])) {
                            executionTimeMs += parseFloat(point.value?.doubleValue || point.value?.int64Value || '0');
                        }
                    }
                }
            } catch (_e) {
                // Metrics may not be available
            }

            // Fetch network egress bytes
            const egressFilter = encodeURIComponent(
                `metric.type="cloudfunctions.googleapis.com/function/network_egress" AND resource.labels.function_name="${functionName}"`
            );
            const egressUrl = `https://monitoring.googleapis.com/v3/projects/${this.projectId}/timeSeries?filter=${egressFilter}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            let networkEgressBytes = 0;
            try {
                const egressResponse = this.get(egressUrl);
                if (egressResponse.timeSeries && egressResponse.timeSeries.length > 0) {
                    for (const ts of egressResponse.timeSeries) {
                        for (const point of (ts.points || [])) {
                            networkEgressBytes += parseFloat(point.value?.doubleValue || point.value?.int64Value || '0');
                        }
                    }
                }
            } catch (_e) {
                // Network egress metrics may not be available
            }

            return { executionCount, executionTimeMs, networkEgressBytes };
        } catch (error) {
            return null;
        }
    }

    /**
     * Get detailed cost estimate for the Cloud Function
     */
    @action("get-cost-estimate")
    getCostEstimate(): void {
        const funcName = this.state.name || this.definition.name;

        cli.output(`\n💰 Cost Estimate for Cloud Function: ${funcName}`);
        cli.output(`${'='.repeat(60)}`);

        const memoryStr = this.definition.service?.available_memory || '256Mi';
        const memoryMb = this.parseMemoryMb(memoryStr);
        const memoryGb = memoryMb / 1024;
        const cpuStr = this.definition.service?.available_cpu || '0.167'; // default for 256Mi
        const cpu = parseFloat(cpuStr);
        const minInstances = this.definition.service?.min_instance_count || 0;

        cli.output(`\n📊 Function Configuration:`);
        cli.output(`   Name: ${funcName}`);
        cli.output(`   Runtime: ${this.definition.build.runtime}`);
        cli.output(`   Memory: ${memoryStr} (${memoryMb} MB)`);
        cli.output(`   CPU: ${cpuStr}`);
        cli.output(`   Min Instances: ${minInstances}`);
        cli.output(`   Max Instances: ${this.definition.service?.max_instance_count || 100}`);
        cli.output(`   Location: ${this.definition.location}`);
        cli.output(`   State: ${this.state.state || 'unknown'}`);

        const pricing = this.fetchCloudFunctionPricing();

        cli.output(`\n💵 Pricing (${pricing.source}):`);
        cli.output(`   Invocations: $${pricing.invocationPer1M.toFixed(2)} per million`);
        cli.output(`   CPU: $${pricing.cpuGhzSecond.toFixed(7)}/GHz-second`);
        cli.output(`   Memory: $${pricing.memoryGbSecond.toFixed(7)}/GB-second`);
        if (pricing.idleCpuGhzSecond > 0) {
            cli.output(`   Idle CPU: $${pricing.idleCpuGhzSecond.toFixed(7)}/GHz-second`);
        }
        if (pricing.idleMemoryGbSecond > 0) {
            cli.output(`   Idle Memory: $${pricing.idleMemoryGbSecond.toFixed(7)}/GB-second`);
        }
        cli.output(`   Network Egress: $${pricing.networkEgressPerGb.toFixed(2)}/GB`);

        const metrics = this.getCloudFunctionMetrics();
        let totalMonthlyCost = 0;

        if (metrics && metrics.executionCount > 0) {
            const invocationCost = (metrics.executionCount / 1000000) * pricing.invocationPer1M;
            const executionTimeSec = metrics.executionTimeMs / 1000;
            const cpuCost = executionTimeSec * cpu * pricing.cpuGhzSecond;
            const memoryCost = executionTimeSec * memoryGb * pricing.memoryGbSecond;
            totalMonthlyCost = invocationCost + cpuCost + memoryCost;

            cli.output(`\n📈 Usage (Last 30 Days from Cloud Monitoring):`);
            cli.output(`   Invocations: ${metrics.executionCount.toLocaleString()}`);
            cli.output(`   Total Execution Time: ${(executionTimeSec / 3600).toFixed(2)} hours`);

            cli.output(`\n💵 Cost Breakdown:`);
            cli.output(`   Invocation Costs: $${invocationCost.toFixed(4)}`);
            cli.output(`   CPU Costs: $${cpuCost.toFixed(4)}`);
            cli.output(`   Memory Costs: $${memoryCost.toFixed(4)}`);

            // Network egress cost (included in total)
            if (metrics.networkEgressBytes > 0 && pricing.networkEgressPerGb > 0) {
                const egressGb = metrics.networkEgressBytes / (1024 * 1024 * 1024);
                const egressCost = egressGb * pricing.networkEgressPerGb;
                totalMonthlyCost += egressCost;
                cli.output(`   Network Egress: $${egressCost.toFixed(4)} (${egressGb.toFixed(4)} GB)`);
            }
        } else {
            cli.output(`\n⚠️ Cloud Monitoring metrics unavailable - usage costs not included`);
        }

        // Min instances idle cost using actual idle rates from the API
        if (minInstances > 0) {
            const idleHoursPerMonth = 730;
            if (pricing.idleCpuGhzSecond > 0 && pricing.idleMemoryGbSecond > 0) {
                // Use actual idle rates from the GCP Cloud Billing API
                const idleCpuCost = minInstances * cpu * idleHoursPerMonth * 3600 * pricing.idleCpuGhzSecond;
                const idleMemoryCost = minInstances * memoryGb * idleHoursPerMonth * 3600 * pricing.idleMemoryGbSecond;
                const idleCost = idleCpuCost + idleMemoryCost;
                totalMonthlyCost += idleCost;
                cli.output(`\n🔄 Min Instances Idle Cost (${minInstances} instances): $${idleCost.toFixed(2)}`);
                cli.output(`   (Using idle rates from GCP Cloud Billing API)`);
            } else {
                // Idle rates not available from API - report as unable to estimate
                cli.output(`\n⚠️ Min instances idle cost cannot be estimated: idle pricing rates not available from GCP Cloud Billing API`);
            }
        }

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`💰 ESTIMATED MONTHLY COST: $${totalMonthlyCost.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📝 Notes:`);
        cli.output(`   - Cloud Functions Gen 2 pricing (runs on Cloud Run)`);
        cli.output(`   - Free tier: 2M invocations, 400K GB-seconds, 200K GHz-seconds/month`);
        cli.output(`   - Network egress included when Cloud Monitoring metrics are available`);
        cli.output(`   - Does not include: Cloud Build costs`);
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     */
    @action("costs")
    costs(): void {
        if (!this.state.name && !this.definition.name) {
            const result = {
                type: "gcp-cloud-function",
                costs: { month: { amount: "0", currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        try {
            const pricing = this.fetchCloudFunctionPricing();
            const metrics = this.getCloudFunctionMetrics();
            let totalMonthlyCost = 0;

            if (metrics && metrics.executionCount > 0) {
                const memoryStr = this.definition.service?.available_memory || '256Mi';
                const memoryGb = this.parseMemoryMb(memoryStr) / 1024;
                const cpu = parseFloat(this.definition.service?.available_cpu || '0.167');

                totalMonthlyCost += (metrics.executionCount / 1000000) * pricing.invocationPer1M;
                const executionTimeSec = metrics.executionTimeMs / 1000;
                totalMonthlyCost += executionTimeSec * cpu * pricing.cpuGhzSecond;
                totalMonthlyCost += executionTimeSec * memoryGb * pricing.memoryGbSecond;

                // Include network egress cost
                if (metrics.networkEgressBytes > 0 && pricing.networkEgressPerGb > 0) {
                    const egressGb = metrics.networkEgressBytes / (1024 * 1024 * 1024);
                    totalMonthlyCost += egressGb * pricing.networkEgressPerGb;
                }
            }

            // Min instances idle cost using actual idle rates from the API
            const minInstances = this.definition.service?.min_instance_count || 0;
            if (minInstances > 0 && pricing.idleCpuGhzSecond > 0 && pricing.idleMemoryGbSecond > 0) {
                const memoryGb = this.parseMemoryMb(this.definition.service?.available_memory || '256Mi') / 1024;
                const cpu = parseFloat(this.definition.service?.available_cpu || '0.167');
                const idleHours = 730;
                totalMonthlyCost += minInstances * cpu * idleHours * 3600 * pricing.idleCpuGhzSecond;
                totalMonthlyCost += minInstances * memoryGb * idleHours * 3600 * pricing.idleMemoryGbSecond;
            }

            const result = {
                type: "gcp-cloud-function",
                costs: { month: { amount: totalMonthlyCost.toFixed(2), currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
        } catch (error) {
            const result = {
                type: "gcp-cloud-function",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } }
            };
            cli.output(JSON.stringify(result));
        }
    }
}
