/**
 * GCP Artifact Registry Repository Entity
 *
 * Creates and manages Artifact Registry repositories for storing
 * container images, language packages, and OS packages.
 *
 * @see https://cloud.google.com/artifact-registry/docs/reference/rest/v1/projects.locations.repositories
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { ARTIFACT_REGISTRY_API_URL, extractPriceFromSku } from "./common.ts";

/**
 * Repository format — determines what kind of artifacts can be stored
 */
export type RepositoryFormat =
    | "DOCKER"
    | "MAVEN"
    | "NPM"
    | "PYTHON"
    | "APT"
    | "YUM"
    | "GO"
    | "GENERIC";

/**
 * Repository mode
 */
export type RepositoryMode =
    | "STANDARD_REPOSITORY"
    | "VIRTUAL_REPOSITORY"
    | "REMOTE_REPOSITORY";

/**
 * Maven version policy for Maven-format repositories
 */
export type MavenVersionPolicy =
    | "VERSION_POLICY_UNSPECIFIED"
    | "RELEASE"
    | "SNAPSHOT";

/**
 * Public upstream for remote repositories
 */
export type RemoteRepositoryUpstream =
    | "DOCKER_HUB"
    | "MAVEN_CENTRAL"
    | "NPMJS"
    | "PYPI";

/**
 * Definition for an Artifact Registry Repository entity
 */
export interface ArtifactRegistryRepositoryDefinition extends GcpEntityDefinition {
    /**
     * @description Repository ID (lowercase letters, digits, hyphens; 1-63 characters)
     */
    name: string;

    /**
     * @description GCP region for the repository (e.g., "us-central1", "us", "europe")
     */
    location: string;

    /**
     * @description Package format: DOCKER, MAVEN, NPM, PYTHON, APT, YUM, GO, or GENERIC
     */
    repo_format: RepositoryFormat;

    /**
     * @description Repository mode: STANDARD_REPOSITORY, VIRTUAL_REPOSITORY, or REMOTE_REPOSITORY. Default: STANDARD_REPOSITORY
     */
    mode?: RepositoryMode;

    /**
     * @description Human-readable description of the repository
     */
    repo_description?: string;

    /**
     * @description Labels to apply to the repository
     */
    labels?: Record<string, string>;

    /**
     * @description Cloud KMS key for customer-managed encryption (full resource name)
     */
    kms_key_name?: string;

    /**
     * @description Enable dry-run mode for cleanup policies (log but don't delete)
     */
    cleanup_policy_dry_run?: boolean;

    /**
     * @description Docker-specific: make tags immutable once pushed
     */
    docker_immutable_tags?: boolean;

    /**
     * @description Maven-specific: version policy (RELEASE or SNAPSHOT)
     */
    maven_version_policy?: MavenVersionPolicy;

    /**
     * @description Maven-specific: allow overwriting snapshot versions
     */
    maven_allow_snapshot_overwrites?: boolean;

    /**
     * @description Remote mode: public upstream repository (DOCKER_HUB, MAVEN_CENTRAL, NPMJS, PYPI)
     */
    remote_upstream?: RemoteRepositoryUpstream;
}

/**
 * State for an Artifact Registry Repository entity
 */
export interface ArtifactRegistryRepositoryState extends GcpEntityState {
    /**
     * @description Full resource name (projects/{project}/locations/{location}/repositories/{repo})
     */
    resource_name?: string;

    /**
     * @description Registry URI for pushing/pulling artifacts (e.g., us-docker.pkg.dev/proj/repo)
     */
    registry_uri?: string;

    /**
     * @description Total storage size in bytes
     */
    size_bytes?: string;

    /**
     * @description Creation timestamp
     */
    create_time?: string;
}

/**
 * @description GCP Artifact Registry Repository entity. Creates and manages
 * repositories for storing container images, language packages, and OS packages.
 *
 * ## Required Permissions
 * - `artifactregistry.repositories.create` — create repositories
 * - `artifactregistry.repositories.get` — check existence and readiness
 * - `artifactregistry.repositories.update` — update repository configuration
 * - `artifactregistry.repositories.delete` — delete repositories
 * - `artifactregistry.packages.list` — list packages (list-packages action)
 * - `monitoring.timeSeries.list` — cost estimation metrics
 * - `cloudbilling.services.list` — cost estimation pricing
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.resource_name` — full resource name for API references
 * - `state.registry_uri` — registry URI for pushing/pulling artifacts
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/service-usage` — enable `artifactregistry.googleapis.com` API
 * - `gcp/service-account` — create service accounts with Artifact Registry roles
 */
export class ArtifactRegistryRepository extends GcpEntity<
    ArtifactRegistryRepositoryDefinition,
    ArtifactRegistryRepositoryState
> {
    static readonly readiness = { period: 5, initialDelay: 3, attempts: 60 };

    protected getEntityName(): string {
        return `Artifact Registry Repository ${this.definition.name || "unnamed"}`;
    }

    /**
     * Build the parent URL for repository operations
     */
    private getParentUrl(): string {
        return `${ARTIFACT_REGISTRY_API_URL}/projects/${this.projectId}/locations/${this.definition.location}/repositories`;
    }

    /**
     * Build the URL for this specific repository
     */
    private getRepoUrl(): string {
        return `${this.getParentUrl()}/${this.definition.name}`;
    }

    /**
     * Build the repository request body from definition
     */
    private buildRepoBody(): Record<string, unknown> {
        const body: Record<string, unknown> = {
            format: this.definition.repo_format,
        };

        if (this.definition.mode) {
            body.mode = this.definition.mode;
        }

        if (this.definition.repo_description) {
            body.description = this.definition.repo_description;
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        if (this.definition.kms_key_name) {
            body.kmsKeyName = this.definition.kms_key_name;
        }

        if (this.definition.cleanup_policy_dry_run !== undefined) {
            body.cleanupPolicyDryRun = this.definition.cleanup_policy_dry_run;
        }

        // Docker-specific config
        if (this.definition.repo_format === "DOCKER" && this.definition.docker_immutable_tags !== undefined) {
            body.dockerConfig = {
                immutableTags: this.definition.docker_immutable_tags,
            };
        }

        // Maven-specific config
        if (this.definition.repo_format === "MAVEN" &&
            (this.definition.maven_version_policy || this.definition.maven_allow_snapshot_overwrites !== undefined)) {
            const mavenConfig: Record<string, unknown> = {};
            if (this.definition.maven_version_policy) {
                mavenConfig.versionPolicy = this.definition.maven_version_policy;
            }
            if (this.definition.maven_allow_snapshot_overwrites !== undefined) {
                mavenConfig.allowSnapshotOverwrites = this.definition.maven_allow_snapshot_overwrites;
            }
            body.mavenConfig = mavenConfig;
        }

        // Remote repository config
        if (this.definition.mode === "REMOTE_REPOSITORY" && this.definition.remote_upstream) {
            const remoteConfig: Record<string, unknown> = {};
            switch (this.definition.repo_format) {
                case "DOCKER":
                    remoteConfig.dockerRepository = { publicRepository: this.definition.remote_upstream };
                    break;
                case "MAVEN":
                    remoteConfig.mavenRepository = { publicRepository: this.definition.remote_upstream };
                    break;
                case "NPM":
                    remoteConfig.npmRepository = { publicRepository: this.definition.remote_upstream };
                    break;
                case "PYTHON":
                    remoteConfig.pythonRepository = { publicRepository: this.definition.remote_upstream };
                    break;
            }
            body.remoteRepositoryConfig = remoteConfig;
        }

        return body;
    }

    /**
     * Populate state from an API response
     */
    private populateState(resource: any): void {
        this.state.resource_name = resource.name || undefined;
        this.state.registry_uri = resource.registryUri || undefined;
        this.state.size_bytes = resource.sizeBytes || undefined;
        this.state.create_time = resource.createTime || undefined;
    }

    override create(): void {
        const repoUrl = this.getRepoUrl();

        // Check if repository already exists
        const existing = this.checkResourceExists(repoUrl);
        if (existing) {
            this.state.existing = true;
            this.populateState(existing);
            cli.output(`Adopted existing Artifact Registry repository: ${this.definition.name}`);
            return;
        }

        // Create the repository (returns a long-running operation)
        const createUrl = `${this.getParentUrl()}?repositoryId=${this.definition.name}`;
        const body = this.buildRepoBody();
        const operation = this.post(createUrl, body);

        // Wait for operation to complete
        if (operation.name) {
            this.state.operation_name = operation.name;
            const operationUrl = `${ARTIFACT_REGISTRY_API_URL}/${operation.name}`;
            this.waitForOperation(operationUrl, 60, 5000);
            this.state.operation_name = undefined;
        }

        // Fetch the created resource to populate state
        const resource = this.get(repoUrl);
        this.populateState(resource);
        this.state.existing = false;
        cli.output(`Created Artifact Registry repository: ${this.definition.name}`);
        if (this.state.registry_uri) {
            cli.output(`  Registry URI: ${this.state.registry_uri}`);
        }
    }

    override update(): void {
        if (!this.state.resource_name) {
            this.create();
            return;
        }

        const body: Record<string, unknown> = {};
        const updateMaskPaths: string[] = [];

        if (this.definition.repo_description !== undefined) {
            body.description = this.definition.repo_description;
            updateMaskPaths.push("description");
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
            updateMaskPaths.push("labels");
        }

        if (this.definition.cleanup_policy_dry_run !== undefined) {
            body.cleanupPolicyDryRun = this.definition.cleanup_policy_dry_run;
            updateMaskPaths.push("cleanupPolicyDryRun");
        }

        if (this.definition.repo_format === "DOCKER" && this.definition.docker_immutable_tags !== undefined) {
            body.dockerConfig = { immutableTags: this.definition.docker_immutable_tags };
            updateMaskPaths.push("dockerConfig.immutableTags");
        }

        if (updateMaskPaths.length === 0) {
            cli.output("No updatable fields changed, skipping update");
            return;
        }

        const url = `${this.getRepoUrl()}?updateMask=${updateMaskPaths.join(",")}`;
        const result = this.patch(url, body);
        this.populateState(result);
        cli.output(`Updated Artifact Registry repository: ${this.definition.name}`);
    }

    override delete(): void {
        if (!this.state.resource_name) return;

        if (this.state.existing) {
            cli.output(`Artifact Registry repository ${this.definition.name} wasn't created by this entity, skipping delete`);
            return;
        }

        // Check if repository still exists
        const existing = this.checkResourceExists(this.getRepoUrl());
        if (!existing) {
            cli.output(`Artifact Registry repository ${this.definition.name} does not exist`);
            return;
        }

        // Delete returns a long-running operation
        const operation = this.httpDelete(this.getRepoUrl());

        if (operation && operation.name) {
            const operationUrl = `${ARTIFACT_REGISTRY_API_URL}/${operation.name}`;
            this.waitForOperation(operationUrl, 60, 5000);
        }

        cli.output(`Successfully deleted Artifact Registry repository ${this.definition.name}`);
    }

    override checkReadiness(): boolean {
        // Check pending operation first
        if (this.state.operation_name) {
            try {
                const operationUrl = `${ARTIFACT_REGISTRY_API_URL}/${this.state.operation_name}`;
                const operation = this.get(operationUrl);
                if (operation.done === true) {
                    this.state.operation_name = undefined;
                } else {
                    return false;
                }
            } catch {
                return false;
            }
        }

        try {
            const resource = this.get(this.getRepoUrl());
            if (!resource || !resource.name) return false;
            this.populateState(resource);
            return true;
        } catch {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    // =========================================================================
    // Actions
    // =========================================================================

    /**
     * Get repository details
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        const info = this.get(this.getRepoUrl());

        cli.output(`\nArtifact Registry Repository: ${this.definition.name}`);
        cli.output(`  Location: ${this.definition.location}`);
        cli.output(`  Format: ${info.format || this.definition.repo_format}`);
        cli.output(`  Mode: ${info.mode || "STANDARD_REPOSITORY"}`);
        if (info.description) {
            cli.output(`  Description: ${info.description}`);
        }
        if (info.registryUri) {
            cli.output(`  Registry URI: ${info.registryUri}`);
        }
        if (info.sizeBytes) {
            const sizeGb = parseInt(info.sizeBytes, 10) / (1024 * 1024 * 1024);
            cli.output(`  Size: ${sizeGb.toFixed(3)} GB (${info.sizeBytes} bytes)`);
        }
        if (info.labels && Object.keys(info.labels).length > 0) {
            cli.output(`  Labels: ${JSON.stringify(info.labels)}`);
        }
        if (info.kmsKeyName) {
            cli.output(`  KMS Key: ${info.kmsKeyName}`);
        }
        if (info.dockerConfig) {
            cli.output(`  Docker Immutable Tags: ${info.dockerConfig.immutableTags || false}`);
        }
        if (info.mavenConfig) {
            cli.output(`  Maven Version Policy: ${info.mavenConfig.versionPolicy || "unspecified"}`);
        }
        if (info.cleanupPolicyDryRun !== undefined) {
            cli.output(`  Cleanup Policy Dry Run: ${info.cleanupPolicyDryRun}`);
        }
        cli.output(`  Created: ${info.createTime || "unknown"}`);
        cli.output(`  Updated: ${info.updateTime || "unknown"}`);
    }

    /**
     * List packages in this repository
     */
    @action("list-packages")
    listPackages(_args?: Args): void {
        const url = `${this.getRepoUrl()}/packages`;
        const result = this.get(url);

        const packages = result.packages || [];
        cli.output(`\nPackages in ${this.definition.name}:`);
        if (packages.length === 0) {
            cli.output("  (none)");
        } else {
            for (const pkg of packages) {
                const name = pkg.name?.split("/").pop() || pkg.name;
                cli.output(`  ${name}`);
                if (pkg.createTime) {
                    cli.output(`    Created: ${pkg.createTime}`);
                }
                if (pkg.updateTime) {
                    cli.output(`    Updated: ${pkg.updateTime}`);
                }
            }
        }
        cli.output(`\nTotal: ${packages.length} packages`);
    }

    // =========================================================================
    // Cost Estimation
    // =========================================================================

    /**
     * Fetch Artifact Registry pricing from GCP Cloud Billing Catalog API
     */
    private fetchPricing(): { storagePerGb: number; source: string } {
        try {
            const billingApiUrl = "https://cloudbilling.googleapis.com/v1";
            const servicesUrl = `${billingApiUrl}/services?pageSize=200`;
            const servicesResp = this.get(servicesUrl);

            let serviceId = "";
            if (servicesResp.services && Array.isArray(servicesResp.services)) {
                for (const svc of servicesResp.services) {
                    if (svc.displayName && svc.displayName.toLowerCase() === "artifact registry") {
                        serviceId = svc.name?.split("/").pop() || "";
                        break;
                    }
                }
            }

            if (!serviceId) {
                throw new Error("Artifact Registry service not found in Cloud Billing Catalog");
            }

            const skusUrl = `${billingApiUrl}/services/${serviceId}/skus?currencyCode=USD&pageSize=200`;
            const response = this.get(skusUrl);

            let storageRate = 0;
            let foundFromApi = false;

            if (response.skus && Array.isArray(response.skus)) {
                for (const sku of response.skus) {
                    const desc = (sku.description || "").toLowerCase();
                    const price = extractPriceFromSku(sku);
                    if (price <= 0) continue;

                    if (desc.includes("storage") && !desc.includes("network")) {
                        if (storageRate === 0) {
                            storageRate = price;
                            foundFromApi = true;
                        }
                    }
                }
            }

            if (storageRate === 0) storageRate = 0.10;

            return {
                storagePerGb: storageRate,
                source: foundFromApi ? "GCP Cloud Billing Catalog API" : "Fallback pricing",
            };
        } catch {
            return {
                storagePerGb: 0.10,
                source: "Fallback pricing (API error)",
            };
        }
    }

    /**
     * Get repository storage size from the API
     */
    private getStorageSize(): number {
        try {
            const resource = this.get(this.getRepoUrl());
            if (resource.sizeBytes) {
                return parseInt(resource.sizeBytes, 10);
            }
        } catch {
            // Fall through
        }
        return 0;
    }

    /**
     * Calculate monthly cost
     */
    private calculateMonthlyCost(): {
        total: number;
        storageCost: number;
        sizeBytes: number;
        pricing: { storagePerGb: number; source: string };
    } {
        const pricing = this.fetchPricing();
        const sizeBytes = this.getStorageSize();
        const sizeGb = sizeBytes / (1024 * 1024 * 1024);

        // First 0.5 GB is free
        const billableGb = Math.max(0, sizeGb - 0.5);
        const storageCost = billableGb * pricing.storagePerGb;

        return { total: storageCost, storageCost, sizeBytes, pricing };
    }

    /**
     * Get detailed cost estimate for this repository
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        if (!this.state.resource_name) {
            cli.output("Repository not created yet - no cost to estimate");
            return;
        }

        const { total, storageCost, sizeBytes, pricing } = this.calculateMonthlyCost();
        const sizeGb = sizeBytes / (1024 * 1024 * 1024);
        const billableGb = Math.max(0, sizeGb - 0.5);

        cli.output(`\nCost Estimate for Artifact Registry Repository: ${this.definition.name}`);
        cli.output(`  Project: ${this.projectId}`);
        cli.output(`  Location: ${this.definition.location}`);
        cli.output(`  Format: ${this.definition.repo_format}`);
        cli.output(`  Pricing Source: ${pricing.source}`);

        cli.output(`\nPricing Rates:`);
        cli.output(`  Storage: $${pricing.storagePerGb.toFixed(2)}/GB/month (first 0.5 GB free)`);

        cli.output(`\nUsage:`);
        cli.output(`  Total Storage: ${sizeGb.toFixed(3)} GB (${sizeBytes} bytes)`);
        cli.output(`  Billable Storage: ${billableGb.toFixed(3)} GB`);

        cli.output(`\nCost Breakdown:`);
        cli.output(`  Storage: $${storageCost.toFixed(4)}`);
        cli.output(`  ─────────────────`);
        cli.output(`  Estimated Monthly Total: $${total.toFixed(2)}`);

        cli.output(`\nNotes:`);
        cli.output(`  - First 0.5 GB of storage is free per billing account`);
        cli.output(`  - Network egress costs are not included (varies by destination)`);
        cli.output(`  - Virtual repositories are not charged (costs apply to upstream repos)`);
    }

    /**
     * Standardized cost output for Monk billing system
     */
    @action("costs")
    costs(): void {
        if (!this.state.resource_name) {
            cli.output(JSON.stringify({
                type: "gcp-artifact-registry-repository",
                costs: { month: { amount: "0", currency: "USD" } },
            }));
            return;
        }

        try {
            const { total } = this.calculateMonthlyCost();
            cli.output(JSON.stringify({
                type: "gcp-artifact-registry-repository",
                costs: { month: { amount: total.toFixed(2), currency: "USD" } },
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "gcp-artifact-registry-repository",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } },
            }));
        }
    }
}
