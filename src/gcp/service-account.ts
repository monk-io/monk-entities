/**
 * GCP Service Account Entity
 *
 * Creates and manages Google Cloud service accounts with optional IAM role bindings.
 * Service accounts are special accounts used by applications and services to authenticate
 * and access GCP resources.
 *
 * @see https://cloud.google.com/iam/docs/service-accounts
 * @see https://cloud.google.com/iam/docs/understanding-roles
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { IAM_API_URL, RESOURCE_MANAGER_API_URL, IamPolicy } from "./common.ts";

/**
 * Common GCP IAM predefined roles (reference list, not exhaustive)
 *
 * Storage roles:
 * - roles/storage.admin: Full control of GCS resources
 * - roles/storage.objectAdmin: Full control of GCS objects
 * - roles/storage.objectViewer: Read GCS objects
 * - roles/storage.objectCreator: Create GCS objects
 *
 * BigQuery roles:
 * - roles/bigquery.admin: Full control of BigQuery resources
 * - roles/bigquery.dataOwner: Create/update/delete datasets and tables
 * - roles/bigquery.dataEditor: Read/update table data
 * - roles/bigquery.dataViewer: Read table data and metadata
 * - roles/bigquery.jobUser: Run BigQuery jobs
 * - roles/bigquery.user: Run jobs and create datasets
 *
 * Cloud SQL roles:
 * - roles/cloudsql.admin: Full control of Cloud SQL
 * - roles/cloudsql.editor: Manage Cloud SQL instances
 * - roles/cloudsql.viewer: View Cloud SQL resources
 * - roles/cloudsql.client: Connect to Cloud SQL instances
 *
 * Compute Engine roles:
 * - roles/compute.admin: Full control of Compute Engine
 * - roles/compute.instanceAdmin.v1: Manage Compute Engine instances
 * - roles/compute.viewer: View Compute Engine resources
 *
 * Pub/Sub roles:
 * - roles/pubsub.admin: Full control of Pub/Sub
 * - roles/pubsub.publisher: Publish messages to topics
 * - roles/pubsub.subscriber: Consume messages from subscriptions
 *
 * @see https://cloud.google.com/iam/docs/understanding-roles for complete list
 */

/**
 * Service Account entity definition
 * @interface ServiceAccountDefinition
 */
export interface ServiceAccountDefinition extends GcpEntityDefinition {
    /**
     * @description Service account ID (will form part of the email address).
     * Must be 6-30 characters, start with a letter, and contain only lowercase letters,
     * numbers, and hyphens.
     * The email will be: {name}@{project}.iam.gserviceaccount.com
     */
    name: string;

    /**
     * @description Human-readable display name for the service account.
     * Shown in the Cloud Console. Max 100 characters.
     */
    display_name?: string;

    /**
     * @description Description of the service account's purpose.
     * Max 256 characters.
     */
    account_description?: string;

    /**
     * @description List of IAM roles to grant to this service account at the project level.
     * Use predefined roles (e.g., "roles/storage.admin") or custom roles.
     * @see https://cloud.google.com/iam/docs/understanding-roles
     * @example ["roles/storage.objectViewer", "roles/bigquery.dataViewer"]
     */
    roles?: string[];
}

/**
 * Service Account entity state
 * @interface ServiceAccountState
 */
export interface ServiceAccountState extends GcpEntityState {
    /**
     * @description Unique ID of the service account (numeric)
     */
    unique_id?: string;

    /**
     * @description Email address of the service account.
     * Format: {name}@{project}.iam.gserviceaccount.com
     */
    email?: string;

    /**
     * @description Full resource name of the service account.
     * Format: projects/{project}/serviceAccounts/{email}
     */
    name?: string;

    /**
     * @description Human-readable display name
     */
    display_name?: string;

    /**
     * @description Whether the service account is disabled
     */
    disabled?: boolean;

    /**
     * @description OAuth2 client ID for web applications
     */
    oauth2_client_id?: string;
}

/**
 * Service Account entity
 *
 * Creates and manages GCP service accounts with optional project-level IAM bindings.
 * Service accounts are identities used by applications, VMs, and other GCP services.
 *
 * ## Secrets
 * This entity does NOT write any secrets. To generate credentials for a service account,
 * use the `gcp/service-account-key` entity which will write the private key to a Monk secret.
 *
 * ## Dependencies
 * - Requires `iam.googleapis.com` API to be enabled (use `gcp/service-usage` entity)
 *
 * ## State Fields for Composition
 * The following state fields can be used by other entities:
 * - `state.email` - Service account email for IAM bindings and authentication
 * - `state.unique_id` - Numeric ID used by `gcp/service-account-key` to create keys
 * - `state.name` - Full resource name (projects/{project}/serviceAccounts/{email})
 *
 * ## Composing with Other Entities
 * This entity is typically composed with:
 * - `gcp/service-account-key` - Pass `state.unique_id` to generate credentials
 *
 * The `state.email` can be used for:
 * - IAM policy bindings on other resources (buckets, datasets, etc.)
 * - Workload Identity bindings for Kubernetes
 * - Cloud SQL IAM authentication
 *
 * @see https://cloud.google.com/iam/docs/service-accounts
 *
 * @example Basic service account
 * ```yaml
 * my-sa:
 *   defines: gcp/service-account
 *   name: my-app-service-account
 *   display_name: My Application Service Account
 *   description: Service account for my application
 * ```
 *
 * @example Service account with IAM roles
 * ```yaml
 * data-pipeline-sa:
 *   defines: gcp/service-account
 *   name: data-pipeline-worker
 *   display_name: Data Pipeline Worker
 *   description: Service account for data pipeline jobs
 *   roles:
 *     - roles/storage.objectViewer
 *     - roles/bigquery.dataEditor
 *     - roles/bigquery.jobUser
 *     - roles/pubsub.subscriber
 * ```
 *
 * @example Cloud SQL client service account
 * ```yaml
 * app-database-sa:
 *   defines: gcp/service-account
 *   name: app-database-client
 *   display_name: Application Database Client
 *   roles:
 *     - roles/cloudsql.client
 *     - roles/secretmanager.secretAccessor
 * ```
 *
 * @example Service account with key for application credentials
 * ```yaml
 * # Create the service account
 * app-sa:
 *   defines: gcp/service-account
 *   name: my-application
 *   display_name: My Application
 *   roles:
 *     - roles/storage.objectViewer
 *     - roles/bigquery.dataViewer
 *
 * # Create a key and store in secret (writes secret!)
 * app-sa-key:
 *   defines: gcp/service-account-key
 *   service_account_id: <- connection-target("sa") entity-state get-member("unique_id")
 *   secret: app-credentials
 *   permitted-secrets:
 *     app-credentials: true
 *   connections:
 *     sa:
 *       runnable: gcp/service-account/app-sa
 *       service: service-account
 *
 * # Application can use the 'app-credentials' secret as GOOGLE_APPLICATION_CREDENTIALS
 * ```
 */
export class ServiceAccount extends GcpEntity<ServiceAccountDefinition, ServiceAccountState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Service Account ${this.definition.name}`;
    }

    /**
     * Get the IAM API base URL for this project
     */
    private get iamApiUrl(): string {
        return `${IAM_API_URL}/projects/${this.projectId}/serviceAccounts`;
    }

    /**
     * Get service account details from API
     */
    private getServiceAccount(): any | null {
        const email = `${this.definition.name}@${this.projectId}.iam.gserviceaccount.com`;
        return this.checkResourceExists(`${this.iamApiUrl}/${email}`);
    }

    /**
     * Populate state from service account response
     */
    private populateState(sa: any): void {
        this.state.unique_id = sa.uniqueId;
        this.state.email = sa.email;
        this.state.name = sa.name;
        this.state.display_name = sa.displayName;
        this.state.disabled = sa.disabled || false;
        this.state.oauth2_client_id = sa.oauth2ClientId;
    }

    /**
     * Get project IAM policy
     */
    private getIamPolicy(): IamPolicy {
        const url = `${RESOURCE_MANAGER_API_URL}/projects/${this.projectId}:getIamPolicy`;
        // POST without body - the API accepts an empty GetIamPolicyRequest
        return this.post(url, null);
    }

    /**
     * Set project IAM policy
     */
    private setIamPolicy(policy: IamPolicy): void {
        const url = `${RESOURCE_MANAGER_API_URL}/projects/${this.projectId}:setIamPolicy`;
        this.post(url, { policy });
    }

    /**
     * Add role bindings for this service account.
     *
     * Retries on transient propagation errors: newly-created service accounts
     * sometimes take a few seconds to appear to resourcemanager.setIamPolicy,
     * which returns 400 "does not exist" in that window.
     */
    private addRoleBindings(email: string): void {
        if (!this.definition.roles || this.definition.roles.length === 0) {
            return;
        }

        cli.output(`Adding ${this.definition.roles.length} role bindings...`);
        const member = `serviceAccount:${email}`;

        const maxAttempts = 6;
        const backoffMs = 5000;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const policy = this.getIamPolicy();
                if (!policy.bindings) policy.bindings = [];

                for (const role of this.definition.roles) {
                    const binding = policy.bindings.find(b => b.role === role);
                    if (binding) {
                        if (!binding.members.includes(member)) {
                            binding.members.push(member);
                        }
                    } else {
                        policy.bindings.push({ role: role, members: [member] });
                    }
                }
                this.setIamPolicy(policy);
                cli.output("Role bindings added successfully");
                return;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isPropagationRace =
                    /does not exist/i.test(msg) ||
                    /INVALID_ARGUMENT/i.test(msg) && /service account/i.test(msg);
                if (!isPropagationRace || attempt === maxAttempts) {
                    throw err;
                }
                cli.output(
                    `setIamPolicy attempt ${attempt}/${maxAttempts} hit propagation race, retrying in ${backoffMs / 1000}s...`,
                );
                sleep(backoffMs);
            }
        }
    }

    /**
     * Remove role bindings for this service account
     */
    private removeRoleBindings(email: string): void {
        if (!this.definition.roles || this.definition.roles.length === 0) {
            return;
        }

        cli.output("Removing role bindings...");

        const policy = this.getIamPolicy();
        const member = `serviceAccount:${email}`;

        // Nothing to remove if no bindings exist
        if (!policy.bindings || policy.bindings.length === 0) {
            cli.output("No role bindings to remove");
            return;
        }

        // Remove member from all bindings
        for (let i = policy.bindings.length - 1; i >= 0; i--) {
            const binding = policy.bindings[i];

            // Remove the member
            binding.members = binding.members.filter(m => m !== member);

            // Remove binding if no members left
            if (binding.members.length === 0) {
                policy.bindings.splice(i, 1);
            }
        }

        this.setIamPolicy(policy);
        cli.output("Role bindings removed successfully");
    }

    override create(): void {
        // `existing` is sticky — set on the very first create (true if we
        // adopted a pre-existing SA, false if we created it) and never
        // flipped afterwards. A mid-deploy retry that finds its own
        // just-created SA must not reclassify itself as adopted.
        const firstRun = this.state.existing === undefined;
        const found = this.getServiceAccount();

        if (found) {
            if (firstRun) {
                cli.output(`Service account ${this.definition.name} already exists, adopting...`);
                this.state.existing = true;
            } else {
                cli.output(
                    `Service account ${this.definition.name} present (existing=${this.state.existing ? "adopted" : "owned"}); reconciling`,
                );
            }
            this.populateState(found);

            // (Re)apply role bindings on every create — converges the IAM
            // policy toward the declared set. Idempotent.
            if (this.definition.roles && this.definition.roles.length > 0) {
                this.addRoleBindings(found.email);
            }
            return;
        }

        // Build service account configuration
        const body = {
            accountId: this.definition.name,
            serviceAccount: {
                displayName: this.definition.display_name || this.definition.name,
                description: this.definition.account_description,
            },
        };

        cli.output(`Creating service account: ${this.definition.name}`);

        const result = this.post(this.iamApiUrl, body);

        this.populateState(result);
        if (firstRun) {
            this.state.existing = false;
        }

        cli.output(`Service account created: ${result.email}`);

        // Add role bindings if specified
        if (this.definition.roles && this.definition.roles.length > 0) {
            this.addRoleBindings(result.email);
        }
    }

    override update(): void {
        const existing = this.getServiceAccount();

        if (!existing) {
            cli.output("Service account not found, creating...");
            this.create();
            return;
        }

        // Update service account metadata.
        // IAM v1 patch requires a ServiceAccount body nested under `serviceAccount`
        // plus an `updateMask` listing the fields being changed.
        const body = {
            serviceAccount: {
                displayName: this.definition.display_name || this.definition.name,
                description: this.definition.account_description,
            },
            updateMask: "displayName,description",
        };

        const url = `${this.iamApiUrl}/${existing.email}`;
        const result = this.patch(url, body);

        this.populateState(result);
        cli.output(`Service account ${this.definition.name} updated`);

        // Update role bindings
        if (this.definition.roles && this.definition.roles.length > 0) {
            this.addRoleBindings(existing.email);
        }
    }

    override delete(): void {
        // `existing` is sticky (set once on the first create() and never
        // flipped), so a retry that adopts its own just-created SA will
        // *not* mistakenly set existing=true. Skip delete only for
        // genuinely pre-existing SAs we adopted.
        if (this.state.existing) {
            cli.output(`Service account ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getServiceAccount();
        if (!existing) {
            cli.output(`Service account ${this.definition.name} does not exist`);
            return;
        }

        // Remove role bindings first
        this.removeRoleBindings(existing.email);

        cli.output(`Deleting service account: ${this.definition.name}`);
        this.httpDelete(`${this.iamApiUrl}/${existing.email}`);
        cli.output(`Service account ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        const sa = this.getServiceAccount();
        if (!sa) {
            cli.output("Service account not found");
            return false;
        }

        this.populateState(sa);

        if (sa.disabled) {
            cli.output("Service account is disabled");
            return false;
        }

        cli.output(`Service account ${sa.email} is ready`);
        return true;
    }

    checkLiveness(): boolean {
        const sa = this.getServiceAccount();
        return sa !== null && !sa.disabled;
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        const sa = this.getServiceAccount();
        if (!sa) {
            throw new Error("Service account not found");
        }
        cli.output(JSON.stringify(sa, null, 2));
    }

    @action("enable")
    enable(_args?: Args): void {
        const existing = this.getServiceAccount();
        if (!existing) {
            throw new Error("Service account not found");
        }

        const url = `${this.iamApiUrl}/${existing.email}:enable`;
        this.post(url);
        cli.output("Service account enabled");
    }

    @action("disable")
    disable(_args?: Args): void {
        const existing = this.getServiceAccount();
        if (!existing) {
            throw new Error("Service account not found");
        }

        const url = `${this.iamApiUrl}/${existing.email}:disable`;
        this.post(url);
        cli.output("Service account disabled");
    }
}
