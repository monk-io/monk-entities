/**
 * GCP Cloud Run Service Entity
 *
 * Creates and manages Google Cloud Run services using the v2 API.
 * Cloud Run services deploy containerized applications that scale automatically.
 *
 * @see https://cloud.google.com/run/docs/reference/rest/v2/projects.locations.services
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import gcp from "cloud/gcp";
import http from "http";
import blobs from "blobs";
import {
    CLOUD_RUN_API_URL,
    ARTIFACT_REGISTRY_API_URL,
    GcpRegion,
    CloudRunIngress,
    CloudRunExecutionEnvironment,
    extractPriceFromSku,
    parseMemoryMb,
} from "./common.ts";

const CLOUD_BUILD_API_URL = "https://cloudbuild.googleapis.com/v1";

/**
 * Cloud Run Service definition
 */
export interface CloudRunServiceDefinition extends GcpEntityDefinition {
    /**
     * @description Service name (must be unique within project/region).
     * 1-49 characters, lowercase letters, numbers, and hyphens.
     */
    name: string;

    /**
     * @description GCP region for the service
     */
    location: GcpRegion;

    /**
     * @description Container image URI (e.g., gcr.io/project/image:tag).
     * Required when blob_name is not set.
     */
    image?: string;

    /**
     * @description Name of the blob containing source code to deploy.
     * When set, the source is zipped, uploaded to GCS, and Cloud Run builds the image automatically.
     * Cannot be used together with image.
     */
    blob_name?: string;

    /**
     * @description Container port (default 8080)
     * @default 8080
     */
    port?: number;

    /**
     * @description Environment variables as key-value pairs
     */
    env_vars?: Record<string, string>;

    /**
     * @description Container entrypoint command override
     */
    command?: string[];

    /**
     * @description Container command arguments
     */
    container_args?: string[];

    /**
     * @description CPU limit (e.g., "1", "2", "4")
     * @default "1"
     */
    cpu?: string;

    /**
     * @description Memory limit (e.g., "512Mi", "1Gi", "2Gi")
     * @default "512Mi"
     */
    memory?: string;

    /**
     * @description Maximum request timeout in seconds (1-3600)
     * @default 300
     */
    timeout_seconds?: number;

    /**
     * @description Maximum concurrent requests per instance
     * @default 80
     */
    concurrency?: number;

    /**
     * @description Minimum number of instances (reduces cold starts)
     * @default 0
     */
    min_instances?: number;

    /**
     * @description Maximum number of instances
     * @default 100
     */
    max_instances?: number;

    /**
     * @description IAM service account email for the service
     */
    service_account?: string;

    /**
     * @description Ingress traffic restriction
     * @default INGRESS_TRAFFIC_ALL
     */
    ingress?: CloudRunIngress;

    /**
     * @description Throttle CPU when idle (request-based billing when true)
     * @default true
     */
    cpu_idle?: boolean;

    /**
     * @description Boost CPU allocation during container startup
     */
    startup_cpu_boost?: boolean;

    /**
     * @description Execution environment generation
     */
    execution_environment?: CloudRunExecutionEnvironment;

    /**
     * @description Allow unauthenticated (public) access by setting allUsers as invoker
     */
    allow_unauthenticated?: boolean;

    /**
     * @description Resource labels as key-value pairs
     */
    labels?: Record<string, string>;

    /**
     * @description Description of the service (maps to API description field)
     */
    service_description?: string;
}

/**
 * Cloud Run Service state
 */
export interface CloudRunServiceState extends GcpEntityState {
    /**
     * @description Service name
     */
    name?: string;

    /**
     * @description Service HTTPS endpoint URL (*.run.app)
     */
    url?: string;

    /**
     * @description Latest ready revision name
     */
    latest_revision?: string;

    /**
     * @description Latest created revision name
     */
    latest_created_revision?: string;

    /**
     * @description Whether the service is currently reconciling
     */
    reconciling?: boolean;
}

/**
 * @description Deploys and manages serverless containers on Google Cloud Run.
 * Supports container images or source-based deployment (via blob_name),
 * auto-scaling, traffic management, IAM, and cost estimation.
 *
 * ## Required Permissions
 * - `run.services.create` — create services
 * - `run.services.get` — check service status
 * - `run.services.update` — update services
 * - `run.services.delete` — delete services
 * - `run.services.getIamPolicy` — read IAM policy
 * - `run.services.setIamPolicy` — set public access
 * - `run.operations.get` — poll long-running operations
 * - `monitoring.timeSeries.list` — cost estimation metrics
 *
 * ## Secrets
 * - Reads: none (authenticated via gcp provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.url` - HTTPS endpoint URL for the service
 * - `state.name` - Service name
 * - `state.latest_revision` - Latest ready revision name
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/service-usage` — enable run.googleapis.com API
 * - `gcp/service-account` — custom service account for the service
 */
export class CloudRunService extends GcpEntity<CloudRunServiceDefinition, CloudRunServiceState> {

    static readonly readiness = { period: 10, initialDelay: 5, attempts: 60 };

    protected getEntityName(): string {
        return `Cloud Run Service ${this.definition.name || 'unnamed'}`;
    }

    private getServiceUrl(): string {
        return `${CLOUD_RUN_API_URL}/projects/${this.projectId}/locations/${this.definition.location}/services/${this.definition.name}`;
    }

    private getParentUrl(): string {
        return `${CLOUD_RUN_API_URL}/projects/${this.projectId}/locations/${this.definition.location}`;
    }

    private getService(): any | null {
        return this.checkResourceExists(this.getServiceUrl());
    }

    private populateState(service: any): void {
        this.state.name = this.definition.name;
        this.state.url = service.uri || undefined;
        this.state.latest_revision = service.latestReadyRevision?.split("/").pop() || undefined;
        this.state.latest_created_revision = service.latestCreatedRevision?.split("/").pop() || undefined;
        this.state.reconciling = service.reconciling ?? false;
    }

    /**
     * Upload blob source code to GCS for source-based deployment.
     * Returns { bucket, object } for use with Cloud Build source deploy.
     */
    private uploadBlobSource(): { bucket: string; object: string } {
        const blobName = this.definition.blob_name!;
        const blobMeta = blobs.get(blobName);
        if (!blobMeta) {
            throw new Error(`Blob not found: ${blobName}`);
        }

        const tgzContent = (blobs as any).tgz(blobName);
        if (!tgzContent) {
            throw new Error(`Failed to create tar.gz from blob: ${blobName}`);
        }

        const bucketName = `run-sources-${this.projectId}-${this.definition.location}`;
        const objectName = `${this.definition.name}/${Date.now()}.tar.gz`;

        cli.output(`Uploading source from blob "${blobName}" to gs://${bucketName}/${objectName}...`);

        // Ensure GCS bucket exists
        this.ensureGcsBucket(bucketName);

        // Step 1: Initiate resumable upload (GCP auth via builtin)
        const initUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=resumable&name=${encodeURIComponent(objectName)}`;
        const initResponse = gcp.post(initUrl, {
            headers: { "Content-Type": "application/json", "X-Upload-Content-Type": "application/gzip" },
            body: JSON.stringify({ name: objectName, contentType: "application/gzip" }),
        });

        if (initResponse.error || initResponse.statusCode >= 400) {
            throw new Error(`Failed to initiate upload (${initResponse.statusCode}): ${initResponse.error || initResponse.body}`);
        }

        // Extract the signed session URI from Location header
        const sessionUri = initResponse.headers["location"] || initResponse.headers["Location"];
        if (!sessionUri) {
            throw new Error("GCS resumable upload did not return a session URI");
        }

        // Step 2: Upload binary content via http.put (handles base64 → binary)
        const uploadResponse = http.put(sessionUri, {
            headers: { "Content-Type": "application/gzip" },
            body: tgzContent,
        });

        if (uploadResponse.error || uploadResponse.statusCode >= 400) {
            throw new Error(`Failed to upload source code (${uploadResponse.statusCode}): ${uploadResponse.error || uploadResponse.body}`);
        }

        cli.output("Source code uploaded successfully");
        return { bucket: bucketName, object: objectName };
    }

    /**
     * Ensure a GCS bucket exists, creating it if needed.
     */
    private ensureGcsBucket(bucketName: string): void {
        const checkUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}`;
        const checkResp = gcp.get(checkUrl);
        if (checkResp.statusCode === 200) return;

        cli.output(`Creating GCS bucket: ${bucketName}`);
        const createResp = gcp.post(`https://storage.googleapis.com/storage/v1/b?project=${this.projectId}`, {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: bucketName,
                location: this.definition.location,
            }),
        });
        if (createResp.error || (createResp.statusCode >= 400 && createResp.statusCode !== 409)) {
            throw new Error(`Failed to create GCS bucket ${bucketName}: ${createResp.error || createResp.body}`);
        }
    }

    private buildServiceBody(): any {
        // Validate: either image or blob_name must be set
        if (!this.definition.image && !this.definition.blob_name) {
            throw new Error("Either 'image' or 'blob_name' must be set");
        }
        if (this.definition.image && this.definition.blob_name) {
            throw new Error("Cannot set both 'image' and 'blob_name' — use one or the other");
        }

        // Resolve image: build from source via Cloud Build, or use provided image URI
        let resolvedImage: string;
        if (this.definition.blob_name) {
            const sourceRef = this.uploadBlobSource();
            resolvedImage = this.buildImageFromSource(sourceRef);
        } else {
            resolvedImage = this.definition.image!;
        }

        const container: any = {
            image: resolvedImage,
            ports: [{ containerPort: this.definition.port ?? 8080 }],
            resources: {
                limits: {
                    cpu: this.definition.cpu || "1",
                    memory: this.definition.memory || "512Mi",
                },
                cpuIdle: this.definition.cpu_idle ?? true,
            },
        };

        if (this.definition.startup_cpu_boost) {
            container.resources.startupCpuBoost = true;
        }

        if (this.definition.env_vars) {
            container.env = Object.entries(this.definition.env_vars).map(([name, value]) => ({
                name,
                value,
            }));
        }

        if (this.definition.command) {
            container.command = this.definition.command;
        }

        if (this.definition.container_args) {
            container.args = this.definition.container_args;
        }

        const template: any = {
            containers: [container],
            scaling: {},
        };

        if (this.definition.min_instances !== undefined) {
            template.scaling.minInstanceCount = this.definition.min_instances;
        }
        if (this.definition.max_instances !== undefined) {
            template.scaling.maxInstanceCount = this.definition.max_instances;
        }
        if (this.definition.timeout_seconds) {
            template.timeout = `${this.definition.timeout_seconds}s`;
        }
        if (this.definition.concurrency !== undefined) {
            template.maxInstanceRequestConcurrency = this.definition.concurrency;
        }
        if (this.definition.service_account) {
            template.serviceAccount = this.definition.service_account;
        }
        if (this.definition.execution_environment) {
            template.executionEnvironment = this.definition.execution_environment;
        }

        const body: any = {
            template,
        };

        if (this.definition.ingress) {
            body.ingress = this.definition.ingress;
        }
        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }
        if (this.definition.service_description) {
            body.description = this.definition.service_description;
        }

        return body;
    }

    private waitForServiceOperation(operationName: string): any {
        const operationUrl = `${CLOUD_RUN_API_URL}/${operationName}`;
        return this.waitForOperation(operationUrl, 120, 10000);
    }

    /** Returns the Artifact Registry image URI for a source-built service. */
    private buildImageUri(): string {
        return `${this.definition.location}-docker.pkg.dev/${this.projectId}/cloud-run-source-deploy/${this.definition.name}:latest`;
    }

    /** Ensure the cloud-run-source-deploy AR Docker repo exists, creating it if needed. */
    private ensureArtifactRegistryRepo(): void {
        const repoId = "cloud-run-source-deploy";
        const repoUrl = `${ARTIFACT_REGISTRY_API_URL}/projects/${this.projectId}/locations/${this.definition.location}/repositories/${repoId}`;
        if (this.checkResourceExists(repoUrl)) return;

        cli.output(`Creating Artifact Registry repo: ${repoId}`);
        const createUrl = `${ARTIFACT_REGISTRY_API_URL}/projects/${this.projectId}/locations/${this.definition.location}/repositories?repositoryId=${repoId}`;
        this.post(createUrl, {
            format: "DOCKER",
            description: "Cloud Run source deployments",
        });
    }

    /** Poll a Cloud Build build until SUCCESS or a terminal failure state. */
    private waitForCloudBuild(buildId: string): void {
        // Regional builds must be polled at the regional endpoint — the global
        // /projects/{project}/builds/{id} returns 404 for region-scoped builds.
        const buildUrl = `${CLOUD_BUILD_API_URL}/projects/${this.projectId}/locations/${this.definition.location}/builds/${buildId}`;
        const terminal = ["SUCCESS", "FAILURE", "INTERNAL_ERROR", "TIMEOUT", "CANCELLED"];
        const maxAttempts = 120; // 20 min at 10 s intervals
        const delayMs = 10000;

        for (let i = 0; i < maxAttempts; i++) {
            const build = this.get(buildUrl);
            const status: string = build.status || "QUEUED";
            cli.output(`Cloud Build ${buildId}: ${status} (${i + 1}/${maxAttempts})`);

            if (status === "SUCCESS") return;
            if (terminal.includes(status)) {
                throw new Error(`Cloud Build failed (${status}). Logs: ${build.logUrl || "n/a"}`);
            }

            sleep(delayMs);
        }

        throw new Error(`Cloud Build ${buildId} did not complete within ${maxAttempts * delayMs / 1000}s`);
    }

    /**
     * Build a Docker image from blob source using Cloud Build + Google Cloud Buildpacks.
     * Matches what `gcloud run deploy --source` does:
     *   upload source → submit Cloud Build with buildpack builder → wait → return image URI.
     */
    private buildImageFromSource(sourceRef: { bucket: string; object: string }): string {
        this.ensureArtifactRegistryRepo();

        const imageUri = this.buildImageUri();
        const buildUrl = `${CLOUD_BUILD_API_URL}/projects/${this.projectId}/locations/${this.definition.location}/builds`;

        const buildBody = {
            source: {
                storageSource: {
                    bucket: sourceRef.bucket,
                    object: sourceRef.object,
                },
            },
            steps: [
                {
                    // pack CLI invokes Google Cloud Buildpacks to auto-detect and build
                    // the runtime (Node.js/Python/Go/Java) from the source code.
                    // The builder runs npm install and sets the correct CMD entrypoint.
                    name: "gcr.io/k8s-skaffold/pack",
                    args: [
                        "build", imageUri,
                        "--builder", "gcr.io/buildpacks/builder:v1",
                    ],
                },
            ],
            images: [imageUri],
            options: { logging: "CLOUD_LOGGING_ONLY" },
        };

        cli.output(`Submitting Cloud Build for source deploy (image: ${imageUri})...`);
        const buildOp = this.post(buildUrl, buildBody);

        const buildId: string | undefined = buildOp?.metadata?.build?.id;
        if (!buildId) {
            throw new Error(`Cloud Build submission returned no build ID: ${JSON.stringify(buildOp)}`);
        }

        cli.output(`Cloud Build started: ${buildId}`);
        this.waitForCloudBuild(buildId);
        cli.output(`Cloud Build complete — image: ${imageUri}`);

        return imageUri;
    }

    override create(): void {
        const existing = this.getService();
        if (existing) {
            cli.output(`Cloud Run service ${this.definition.name} already exists, adopting`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        cli.output(`Creating Cloud Run service: ${this.definition.name}`);
        const body = this.buildServiceBody();
        const createUrl = `${this.getParentUrl()}/services?serviceId=${this.definition.name}`;
        const operation = this.post(createUrl, body);

        if (operation?.name) {
            this.state.operation_name = operation.name;
            cli.output(`Waiting for service creation...`);
            this.waitForServiceOperation(operation.name);
            this.state.operation_name = undefined;
        }

        const service = this.getService();
        if (service) {
            this.populateState(service);
        }
        this.state.existing = false;

        // Set IAM for public access if requested
        if (this.definition.allow_unauthenticated) {
            try {
                this.setPublicAccess(true);
            } catch (error) {
                cli.output(`Warning: could not set public access: ${(error as Error).message}`);
                cli.output(`You can manually run the 'allow-unauthenticated' action after granting run.services.setIamPolicy permission`);
            }
        }

        cli.output(`Cloud Run service ${this.definition.name} created`);
        if (this.state.url) {
            cli.output(`URL: ${this.state.url}`);
        }
    }

    override update(): void {
        if (!this.state.name) {
            this.create();
            return;
        }

        // The service may have been deleted out-of-band (e.g., manually via
        // gcloud); fall back to create() rather than PATCH'ing a missing
        // resource and 404'ing.
        const existing = this.getService();
        if (!existing) {
            cli.output(`Service ${this.definition.name} not found, creating...`);
            this.create();
            return;
        }

        cli.output(`Updating Cloud Run service: ${this.definition.name}`);
        const body = this.buildServiceBody();
        const operation = this.patch(this.getServiceUrl(), body);

        if (operation?.name) {
            this.state.operation_name = operation.name;
            cli.output(`Waiting for service update...`);
            this.waitForServiceOperation(operation.name);
            this.state.operation_name = undefined;
        }

        const service = this.getService();
        if (service) {
            this.populateState(service);
        }

        cli.output(`Cloud Run service ${this.definition.name} updated`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Service ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getService();
        if (!existing) {
            cli.output(`Service ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting Cloud Run service: ${this.definition.name}`);
        const operation = this.httpDelete(this.getServiceUrl());

        if (operation?.name) {
            cli.output(`Waiting for service deletion...`);
            this.waitForServiceOperation(operation.name);
        }

        cli.output(`Service ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        if (this.state.operation_name) {
            cli.output(`Waiting for operation to complete...`);
            return false;
        }

        const service = this.getService();
        if (!service) {
            cli.output("Service not found");
            return false;
        }

        this.populateState(service);

        if (service.reconciling) {
            cli.output(`Service ${this.definition.name} is reconciling...`);
            return false;
        }

        const terminalCondition = service.terminalCondition;
        if (terminalCondition) {
            if (terminalCondition.state === "CONDITION_SUCCEEDED") {
                cli.output(`Service ${this.definition.name} is ready`);
                if (this.state.url) {
                    cli.output(`URL: ${this.state.url}`);
                }
                return true;
            }
            if (terminalCondition.state === "CONDITION_FAILED") {
                cli.output(`Service ${this.definition.name} failed: ${terminalCondition.message || "unknown error"}`);
                return false;
            }
            cli.output(`Service ${this.definition.name} condition: ${terminalCondition.state}`);
            return false;
        }

        // Fallback: no terminal condition yet
        cli.output(`Service ${this.definition.name} is still provisioning`);
        return false;
    }

    checkLiveness(): boolean {
        const service = this.getService();
        if (!service) return false;
        return !service.reconciling && service.terminalCondition?.state === "CONDITION_SUCCEEDED";
    }

    // ==================== IAM ====================

    private setPublicAccess(allow: boolean): void {
        const url = `${this.getServiceUrl()}:setIamPolicy`;
        if (allow) {
            // Get existing policy and merge
            let existingBindings: any[] = [];
            try {
                const getUrl = `${this.getServiceUrl()}:getIamPolicy`;
                const existing = this.get(getUrl);
                existingBindings = existing.bindings || [];
            } catch {
                // No existing policy
            }

            // Merge allUsers into existing invoker binding, preserving other members
            let hasInvokerBinding = false;
            const merged = existingBindings.map((b: any) => {
                if (b.role === "roles/run.invoker") {
                    hasInvokerBinding = true;
                    const members = b.members || [];
                    if (!members.includes("allUsers")) {
                        members.push("allUsers");
                    }
                    return { ...b, members };
                }
                return b;
            });
            if (!hasInvokerBinding) {
                merged.push({
                    role: "roles/run.invoker",
                    members: ["allUsers"],
                });
            }

            this.post(url, { policy: { bindings: merged } });
            cli.output("Set service to allow unauthenticated access");
        } else {
            // Get existing policy and remove allUsers
            try {
                const getUrl = `${this.getServiceUrl()}:getIamPolicy`;
                const existing = this.get(getUrl);
                const bindings = (existing.bindings || []).map((b: any) => {
                    if (b.role === "roles/run.invoker") {
                        return {
                            ...b,
                            members: (b.members || []).filter((m: string) => m !== "allUsers"),
                        };
                    }
                    return b;
                }).filter((b: any) => b.members && b.members.length > 0);

                this.post(url, { policy: { bindings } });
                cli.output("Removed unauthenticated access from service");
            } catch (error) {
                throw new Error(`Failed to update IAM policy: ${(error as Error).message}`);
            }
        }
    }

    // ==================== ACTIONS ====================

    @action("get-info")
    getInfo(_args?: Args): void {
        const service = this.getService();
        if (!service) {
            throw new Error("Service not found");
        }
        cli.output(JSON.stringify(service, null, 2));
    }

    @action("get-revisions")
    getRevisions(_args?: Args): void {
        const url = `${this.getServiceUrl()}/revisions`;
        const response = this.get(url);
        const revisions = response.revisions || [];
        if (revisions.length === 0) {
            cli.output("No revisions found");
            return;
        }
        for (const rev of revisions) {
            const name = rev.name?.split("/").pop() || "unknown";
            const createTime = rev.createTime || "unknown";
            const ready = rev.conditions?.find((c: any) => c.type === "Ready");
            const status = ready?.state === "CONDITION_SUCCEEDED" ? "Ready" : (ready?.state || "Unknown");
            cli.output(`${name} | ${createTime} | ${status}`);
        }
    }

    @action("allow-unauthenticated")
    allowUnauthenticated(_args?: Args): void {
        this.setPublicAccess(true);
    }

    @action("deny-unauthenticated")
    denyUnauthenticated(_args?: Args): void {
        this.setPublicAccess(false);
    }

    // ==================== COST ESTIMATION ====================

    private fetchCloudRunPricing(): {
        cpuPerSecond: number;
        memoryGbPerSecond: number;
        requestPer1M: number;
        source: string;
    } {
        try {
            const billingApiUrl = 'https://cloudbilling.googleapis.com/v1';
            // Cloud Run service ID in GCP Billing Catalog
            const cloudRunServiceId = '152E-C115-5142';
            const skusUrl = `${billingApiUrl}/services/${cloudRunServiceId}/skus?currencyCode=USD`;
            const response = this.get(skusUrl);

            if (response.skus && Array.isArray(response.skus)) {
                let cpuRate = 0;
                let memoryRate = 0;
                let requestRate = 0;
                const location = this.definition.location || 'us-central1';

                for (const sku of response.skus) {
                    const desc = (sku.description || '').toLowerCase();
                    const serviceRegions = sku.serviceRegions || [];
                    if (!serviceRegions.includes(location) && !serviceRegions.includes('global')) {
                        continue;
                    }

                    const price = extractPriceFromSku(sku);
                    if (price <= 0) continue;

                    if (desc.includes('cpu') && desc.includes('time') && !desc.includes('idle')) {
                        cpuRate = price;
                    } else if (desc.includes('memory') && desc.includes('time') && !desc.includes('idle')) {
                        memoryRate = price;
                    } else if (desc.includes('request')) {
                        requestRate = price;
                    }
                }

                if (cpuRate > 0 && memoryRate > 0) {
                    return {
                        cpuPerSecond: cpuRate,
                        memoryGbPerSecond: memoryRate,
                        requestPer1M: requestRate > 0 ? requestRate * 1000000 : 0.40,
                        source: 'GCP Cloud Billing Catalog API',
                    };
                }
            }
        } catch (error) {
            // Fall through to published pricing
        }

        // Fallback to published pricing
        return {
            cpuPerSecond: 0.0000240,
            memoryGbPerSecond: 0.0000025,
            requestPer1M: 0.40,
            source: 'Published pricing (fallback)',
        };
    }

    private getCloudRunMetrics(): {
        requestCount: number;
        containerInstanceSeconds: number;
    } | null {
        try {
            const endTime = new Date().toISOString();
            const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const serviceName = this.definition.name;

            // Fetch request count
            const countFilter = encodeURIComponent(
                `metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="${serviceName}"`
            );
            const countUrl = `https://monitoring.googleapis.com/v3/projects/${this.projectId}/timeSeries?filter=${countFilter}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            let requestCount = 0;
            try {
                const countResponse = this.get(countUrl);
                if (countResponse.timeSeries && countResponse.timeSeries.length > 0) {
                    for (const ts of countResponse.timeSeries) {
                        for (const point of (ts.points || [])) {
                            requestCount += parseInt(point.value?.int64Value || point.value?.doubleValue || '0', 10);
                        }
                    }
                }
            } catch {
                // Metrics may not be available
            }

            // Fetch container instance time
            const timeFilter = encodeURIComponent(
                `metric.type="run.googleapis.com/container/billable_instance_time" AND resource.labels.service_name="${serviceName}"`
            );
            const timeUrl = `https://monitoring.googleapis.com/v3/projects/${this.projectId}/timeSeries?filter=${timeFilter}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            let containerInstanceSeconds = 0;
            try {
                const timeResponse = this.get(timeUrl);
                if (timeResponse.timeSeries && timeResponse.timeSeries.length > 0) {
                    for (const ts of timeResponse.timeSeries) {
                        for (const point of (ts.points || [])) {
                            containerInstanceSeconds += parseFloat(point.value?.doubleValue || point.value?.int64Value || '0');
                        }
                    }
                }
            } catch {
                // Metrics may not be available
            }

            return { requestCount, containerInstanceSeconds };
        } catch {
            return null;
        }
    }

    private calculateMonthlyCost(): { total: number; pricing: any; metrics: any } {
        const pricing = this.fetchCloudRunPricing();
        const metrics = this.getCloudRunMetrics();

        const cpu = parseFloat(this.definition.cpu || '1');
        const memoryGb = parseMemoryMb(this.definition.memory || '512Mi') / 1024;
        const minInstances = this.definition.min_instances ?? 0;
        let totalMonthlyCost = 0;

        if (metrics && metrics.containerInstanceSeconds > 0) {
            const cpuCost = metrics.containerInstanceSeconds * cpu * pricing.cpuPerSecond;
            const memoryCost = metrics.containerInstanceSeconds * memoryGb * pricing.memoryGbPerSecond;
            const requestCost = (metrics.requestCount / 1000000) * pricing.requestPer1M;
            totalMonthlyCost = cpuCost + memoryCost + requestCost;
        }

        // Min instances always-on cost — only when no metrics available
        // (billable_instance_time already includes idle min-instance time)
        if (minInstances > 0 && (!metrics || metrics.containerInstanceSeconds <= 0)) {
            const hoursPerMonth = 730;
            const secondsPerMonth = hoursPerMonth * 3600;
            const idleCpuCost = minInstances * cpu * secondsPerMonth * pricing.cpuPerSecond;
            const idleMemoryCost = minInstances * memoryGb * secondsPerMonth * pricing.memoryGbPerSecond;
            totalMonthlyCost += idleCpuCost + idleMemoryCost;
        }

        return { total: totalMonthlyCost, pricing, metrics };
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const serviceName = this.state.name || this.definition.name;

        cli.output(`\nCost Estimate for Cloud Run Service: ${serviceName}`);
        cli.output(`${'='.repeat(60)}`);

        const cpu = this.definition.cpu || '1';
        const memory = this.definition.memory || '512Mi';
        const minInstances = this.definition.min_instances ?? 0;
        const maxInstances = this.definition.max_instances ?? 100;
        const cpuIdle = this.definition.cpu_idle ?? true;

        cli.output(`\nConfiguration:`);
        cli.output(`  Name: ${serviceName}`);
        cli.output(`  Image: ${this.definition.image || `blob:${this.definition.blob_name}`}`);
        cli.output(`  CPU: ${cpu} vCPU`);
        cli.output(`  Memory: ${memory}`);
        cli.output(`  Min Instances: ${minInstances}`);
        cli.output(`  Max Instances: ${maxInstances}`);
        cli.output(`  CPU Idle: ${cpuIdle} (${cpuIdle ? 'request-based' : 'instance-based'} billing)`);
        cli.output(`  Location: ${this.definition.location}`);

        const { total, pricing, metrics } = this.calculateMonthlyCost();

        cli.output(`\nPricing (${pricing.source}):`);
        cli.output(`  CPU: $${pricing.cpuPerSecond.toFixed(7)}/vCPU-second`);
        cli.output(`  Memory: $${pricing.memoryGbPerSecond.toFixed(7)}/GiB-second`);
        cli.output(`  Requests: $${pricing.requestPer1M.toFixed(2)}/million`);

        if (metrics && metrics.requestCount > 0) {
            cli.output(`\nUsage (Last 30 Days from Cloud Monitoring):`);
            cli.output(`  Requests: ${metrics.requestCount.toLocaleString()}`);
            cli.output(`  Billable Instance Time: ${(metrics.containerInstanceSeconds / 3600).toFixed(2)} hours`);
        } else {
            cli.output(`\nNo usage metrics available from Cloud Monitoring`);
        }

        if (minInstances > 0 && (!metrics || metrics.containerInstanceSeconds <= 0)) {
            const memoryGb = parseMemoryMb(memory) / 1024;
            const secondsPerMonth = 730 * 3600;
            const idleCost = minInstances * (parseFloat(cpu) * pricing.cpuPerSecond + memoryGb * pricing.memoryGbPerSecond) * secondsPerMonth;
            cli.output(`\nMin Instances Estimated Cost (${minInstances} always-on, no metrics): $${idleCost.toFixed(2)}/month`);
        } else if (minInstances > 0) {
            cli.output(`\nMin Instances: ${minInstances} (idle cost included in billable instance time above)`);
        }

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`ESTIMATED MONTHLY COST: $${total.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\nNotes:`);
        cli.output(`  - Free tier: 180K vCPU-seconds, 360K GiB-seconds, 2M requests/month`);
        cli.output(`  - Network egress charged separately at standard GCP rates`);
        cli.output(`  - Does not include: Cloud Build, Artifact Registry, or Secret Manager costs`);
    }

    @action("costs")
    costs(_args?: Args): void {
        if (!this.state.name && !this.definition.name) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-run-service",
                costs: { month: { amount: "0", currency: "USD" } },
            }));
            return;
        }

        try {
            const { total } = this.calculateMonthlyCost();
            cli.output(JSON.stringify({
                type: "gcp-cloud-run-service",
                costs: { month: { amount: total.toFixed(2), currency: "USD" } },
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-run-service",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } },
            }));
        }
    }
}
