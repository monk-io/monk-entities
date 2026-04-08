/**
 * GCP Cloud Tasks Queue Entity
 *
 * Creates and manages Google Cloud Tasks queues for dispatching HTTP tasks.
 *
 * @see https://cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { CLOUD_TASKS_API_URL, base64Encode } from "./common.ts";

/**
 * Stackdriver logging level for Cloud Tasks queue
 */
export type CloudTasksLogLevel = "LOG_LEVEL_UNSPECIFIED" | "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

/**
 * Definition for a Cloud Tasks Queue entity
 */
export interface CloudTasksQueueDefinition extends GcpEntityDefinition {
    /**
     * @description Queue name (alphanumeric characters, hyphens, underscores)
     */
    name: string;

    /**
     * @description GCP region for the queue (e.g., "us-central1")
     */
    location: string;

    /**
     * @description Maximum rate at which tasks are dispatched per second (default 500)
     */
    max_dispatches_per_second?: number;

    /**
     * @description Maximum number of tasks that can be dispatched in a burst (default 100)
     */
    max_burst_size?: number;

    /**
     * @description Maximum number of concurrent task dispatches (default 1000)
     */
    max_concurrent_dispatches?: number;

    /**
     * @description Maximum number of retry attempts for a task (-1 for unlimited, default 100)
     */
    max_attempts?: number;

    /**
     * @description Minimum backoff duration between retries (e.g., "0.100s")
     */
    min_backoff?: string;

    /**
     * @description Maximum backoff duration between retries (e.g., "3600s")
     */
    max_backoff?: string;

    /**
     * @description Maximum number of times the retry interval will be doubled (default 16)
     */
    max_doublings?: number;

    /**
     * @description Maximum total time for retrying a failed task (e.g., "3600s")
     */
    max_retry_duration?: string;

    /**
     * @description Stackdriver logging level for the queue
     */
    log_level?: CloudTasksLogLevel;
}

/**
 * State for a Cloud Tasks Queue entity
 */
export interface CloudTasksQueueState extends GcpEntityState {
    /**
     * @description Full resource name of the queue (projects/{project}/locations/{location}/queues/{name})
     */
    queue_name?: string;

    /**
     * @description Current queue state (RUNNING, PAUSED, or DISABLED)
     */
    queue_state?: string;
}

/**
 * @description GCP Cloud Tasks Queue entity. Creates and manages Cloud Tasks queues
 * for dispatching HTTP tasks with configurable rate limits, retry policies, and logging.
 *
 * ## Required Permissions
 * - `cloudtasks.queues.create` — create queues
 * - `cloudtasks.queues.get` — check existence and readiness
 * - `cloudtasks.queues.update` — update configuration
 * - `cloudtasks.queues.delete` — delete queues
 * - `cloudtasks.queues.pause` — pause task dispatch
 * - `cloudtasks.queues.resume` — resume task dispatch
 * - `cloudtasks.queues.purge` — purge all tasks
 * - `cloudtasks.tasks.create` — create tasks (create-task action)
 * - `cloudtasks.tasks.list` — list tasks (list-tasks action)
 * - `monitoring.timeSeries.list` — cost estimation metrics
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.queue_name` — full queue resource name, used by other entities to reference this queue
 * - `state.queue_state` — current queue state (RUNNING, PAUSED, DISABLED)
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/service-usage` — enable `cloudtasks.googleapis.com` API
 * - `gcp/service-account` — service account for task authentication
 */
export class CloudTasksQueue extends GcpEntity<CloudTasksQueueDefinition, CloudTasksQueueState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

    protected getEntityName(): string {
        return `GCP Cloud Tasks Queue ${this.definition.name || 'unnamed'}`;
    }

    /**
     * Build the full resource name for this queue
     */
    private getQueueResourceName(): string {
        return `projects/${this.projectId}/locations/${this.definition.location}/queues/${this.definition.name}`;
    }

    /**
     * Build the API URL for this queue
     */
    private getQueueUrl(): string {
        return `${CLOUD_TASKS_API_URL}/${this.getQueueResourceName()}`;
    }

    /**
     * Build the parent URL for listing/creating queues
     */
    private getParentUrl(): string {
        return `${CLOUD_TASKS_API_URL}/projects/${this.projectId}/locations/${this.definition.location}/queues`;
    }

    /**
     * Build the queue request body from definition
     */
    private buildQueueBody(): Record<string, unknown> {
        const body: Record<string, unknown> = {
            name: this.getQueueResourceName(),
        };

        const rateLimits: Record<string, unknown> = {};
        if (this.definition.max_dispatches_per_second !== undefined) {
            rateLimits.maxDispatchesPerSecond = this.definition.max_dispatches_per_second;
        }
        if (this.definition.max_burst_size !== undefined) {
            rateLimits.maxBurstSize = this.definition.max_burst_size;
        }
        if (this.definition.max_concurrent_dispatches !== undefined) {
            rateLimits.maxConcurrentDispatches = this.definition.max_concurrent_dispatches;
        }
        if (Object.keys(rateLimits).length > 0) {
            body.rateLimits = rateLimits;
        }

        const retryConfig: Record<string, unknown> = {};
        if (this.definition.max_attempts !== undefined) {
            retryConfig.maxAttempts = this.definition.max_attempts;
        }
        if (this.definition.min_backoff) {
            retryConfig.minBackoff = this.definition.min_backoff;
        }
        if (this.definition.max_backoff) {
            retryConfig.maxBackoff = this.definition.max_backoff;
        }
        if (this.definition.max_doublings !== undefined) {
            retryConfig.maxDoublings = this.definition.max_doublings;
        }
        if (this.definition.max_retry_duration) {
            retryConfig.maxRetryDuration = this.definition.max_retry_duration;
        }
        if (Object.keys(retryConfig).length > 0) {
            body.retryConfig = retryConfig;
        }

        if (this.definition.log_level) {
            body.stackdriverLoggingConfig = {
                samplingRatio: 1.0,
            };
        }

        return body;
    }

    override create(): void {
        const queueUrl = this.getQueueUrl();

        // Check if queue already exists
        const existing = this.checkResourceExists(queueUrl);
        if (existing) {
            this.state.existing = true;
            this.state.queue_name = existing.name || this.getQueueResourceName();
            this.state.queue_state = existing.state || "RUNNING";
            cli.output(`Adopted existing Cloud Tasks queue: ${this.state.queue_name} (state: ${this.state.queue_state})`);
            return;
        }

        // Create the queue
        const body = this.buildQueueBody();
        const result = this.post(this.getParentUrl(), body);

        this.state.queue_name = result.name || this.getQueueResourceName();
        this.state.queue_state = result.state || "RUNNING";
        this.state.existing = false;
        cli.output(`Created Cloud Tasks queue: ${this.state.queue_name}`);
    }

    override update(): void {
        if (!this.state.queue_name) {
            this.create();
            return;
        }

        const body = this.buildQueueBody();

        // Build update mask from defined fields
        const updateMaskPaths: string[] = [];
        if (this.definition.max_dispatches_per_second !== undefined) updateMaskPaths.push("rateLimits.maxDispatchesPerSecond");
        if (this.definition.max_burst_size !== undefined) updateMaskPaths.push("rateLimits.maxBurstSize");
        if (this.definition.max_concurrent_dispatches !== undefined) updateMaskPaths.push("rateLimits.maxConcurrentDispatches");
        if (this.definition.max_attempts !== undefined) updateMaskPaths.push("retryConfig.maxAttempts");
        if (this.definition.min_backoff) updateMaskPaths.push("retryConfig.minBackoff");
        if (this.definition.max_backoff) updateMaskPaths.push("retryConfig.maxBackoff");
        if (this.definition.max_doublings !== undefined) updateMaskPaths.push("retryConfig.maxDoublings");
        if (this.definition.max_retry_duration) updateMaskPaths.push("retryConfig.maxRetryDuration");
        if (this.definition.log_level) updateMaskPaths.push("stackdriverLoggingConfig");

        if (updateMaskPaths.length === 0) {
            cli.output("No updatable fields changed, skipping update");
            return;
        }

        const patchUrl = `${this.getQueueUrl()}?updateMask=${updateMaskPaths.join(",")}`;
        const result = this.patch(patchUrl, body);

        this.state.queue_state = result.state || this.state.queue_state;
        cli.output(`Updated Cloud Tasks queue: ${this.state.queue_name}`);
    }

    override delete(): void {
        if (!this.state.queue_name) return;

        this.deleteResource(this.getQueueUrl(), `Cloud Tasks queue ${this.definition.name}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.queue_name) return false;
        try {
            const result = this.get(this.getQueueUrl());
            if (result && result.name) {
                this.state.queue_state = result.state || "RUNNING";
                return result.state !== "DISABLED";
            }
            return false;
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
     * Get queue details
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.queue_name) throw new Error("Queue not created yet");

        const info = this.get(this.getQueueUrl());
        cli.output(`\nCloud Tasks Queue: ${this.definition.name}`);
        cli.output(`  Resource Name: ${info.name}`);
        cli.output(`  Location: ${this.definition.location}`);
        cli.output(`  State: ${info.state || "RUNNING"}`);

        if (info.rateLimits) {
            cli.output(`  Rate Limits:`);
            cli.output(`    Max Dispatches/sec: ${info.rateLimits.maxDispatchesPerSecond ?? "default"}`);
            cli.output(`    Max Burst Size: ${info.rateLimits.maxBurstSize ?? "default"}`);
            cli.output(`    Max Concurrent: ${info.rateLimits.maxConcurrentDispatches ?? "default"}`);
        }

        if (info.retryConfig) {
            cli.output(`  Retry Config:`);
            cli.output(`    Max Attempts: ${info.retryConfig.maxAttempts ?? "default"}`);
            cli.output(`    Min Backoff: ${info.retryConfig.minBackoff ?? "default"}`);
            cli.output(`    Max Backoff: ${info.retryConfig.maxBackoff ?? "default"}`);
            cli.output(`    Max Doublings: ${info.retryConfig.maxDoublings ?? "default"}`);
            if (info.retryConfig.maxRetryDuration) {
                cli.output(`    Max Retry Duration: ${info.retryConfig.maxRetryDuration}`);
            }
        }

        if (info.stackdriverLoggingConfig) {
            cli.output(`  Logging: sampling ratio ${info.stackdriverLoggingConfig.samplingRatio ?? "default"}`);
        }

        if (info.purgeTime) {
            cli.output(`  Last Purge: ${info.purgeTime}`);
        }
    }

    /**
     * Pause task dispatch on the queue
     */
    @action("pause")
    pauseQueue(_args?: Args): void {
        if (!this.state.queue_name) throw new Error("Queue not created yet");

        const result = this.post(`${this.getQueueUrl()}:pause`);
        this.state.queue_state = result.state || "PAUSED";
        cli.output(`Paused Cloud Tasks queue: ${this.definition.name} (state: ${this.state.queue_state})`);
    }

    /**
     * Resume task dispatch on the queue
     */
    @action("resume")
    resumeQueue(_args?: Args): void {
        if (!this.state.queue_name) throw new Error("Queue not created yet");

        const result = this.post(`${this.getQueueUrl()}:resume`);
        this.state.queue_state = result.state || "RUNNING";
        cli.output(`Resumed Cloud Tasks queue: ${this.definition.name} (state: ${this.state.queue_state})`);
    }

    /**
     * Purge all tasks from the queue
     */
    @action("purge-tasks")
    purgeQueue(_args?: Args): void {
        if (!this.state.queue_name) throw new Error("Queue not created yet");

        this.post(`${this.getQueueUrl()}:purge`);
        cli.output(`Purged all tasks from Cloud Tasks queue: ${this.definition.name}`);
        cli.output(`Note: Purge may take up to 1 minute to take full effect`);
    }

    /**
     * Create an HTTP task in the queue
     */
    @action("create-task")
    createTask(args?: Args): void {
        if (!this.state.queue_name) throw new Error("Queue not created yet");
        if (!args || !args.url) throw new Error("Required argument: url");

        const httpRequest: Record<string, unknown> = {
            url: String(args.url),
            httpMethod: args.method ? String(args.method).toUpperCase() : "POST",
        };

        if (args.body) {
            httpRequest.body = base64Encode(String(args.body));
            httpRequest.headers = { "Content-Type": "application/json" };
        }

        if (args.service_account_email) {
            httpRequest.oidcToken = {
                serviceAccountEmail: String(args.service_account_email),
            };
        }

        const task: Record<string, unknown> = {
            httpRequest,
        };

        if (args.schedule_time) {
            task.scheduleTime = String(args.schedule_time);
        }

        const tasksUrl = `${this.getQueueUrl()}/tasks`;
        const result = this.post(tasksUrl, { task });

        const taskName = result.name || "unknown";
        cli.output(`Created task: ${taskName}`);
        cli.output(`  URL: ${args.url}`);
        cli.output(`  Method: ${httpRequest.httpMethod}`);
        if (args.schedule_time) {
            cli.output(`  Scheduled: ${args.schedule_time}`);
        }
    }

    /**
     * List tasks in the queue
     */
    @action("list-tasks")
    listTasks(args?: Args): void {
        if (!this.state.queue_name) throw new Error("Queue not created yet");

        const pageSize = args?.page_size ? parseInt(String(args.page_size), 10) : 20;
        const tasksUrl = `${this.getQueueUrl()}/tasks?pageSize=${pageSize}`;
        const result = this.get(tasksUrl);

        const tasks = result.tasks || [];
        cli.output(`\nTasks in queue ${this.definition.name}:`);
        if (tasks.length === 0) {
            cli.output("  (none)");
        } else {
            for (const task of tasks) {
                const name = task.name?.split("/").pop() || "unknown";
                const state = task.view === "BASIC" ? "" : ` [${task.scheduleTime || "immediate"}]`;
                cli.output(`  - ${name}${state} (dispatches: ${task.dispatchCount || 0}, responses: ${task.responseCount || 0})`);
            }
        }
        cli.output(`\nTotal: ${tasks.length}`);
        if (result.nextPageToken) {
            cli.output(`(more tasks available — use page_token arg to paginate)`);
        }
    }

    // =========================================================================
    // Cost Estimation
    // =========================================================================

    /**
     * Get task operation metrics from Cloud Monitoring
     */
    private getTaskMetrics(): { taskAttempts: number } {
        const metrics = { taskAttempts: 0 };

        try {
            const monitoringUrl = 'https://monitoring.googleapis.com/v3';
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const endTime = now.toISOString();
            const startTime = thirtyDaysAgo.toISOString();

            const queueId = this.definition.name;

            // Fetch task attempt count
            const filter = `metric.type="cloudtasks.googleapis.com/queue/task_attempt_count" AND resource.labels.queue_id="${queueId}"`;
            const url = `${monitoringUrl}/projects/${this.projectId}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            try {
                const resp = this.get(url);
                if (resp.timeSeries && Array.isArray(resp.timeSeries)) {
                    for (const ts of resp.timeSeries) {
                        for (const point of ts.points || []) {
                            metrics.taskAttempts += parseInt(point.value?.int64Value || point.value?.doubleValue || '0', 10);
                        }
                    }
                }
            } catch {
                // Metrics may not be available yet
            }
        } catch {
            // Return zero metrics on any error
        }

        return metrics;
    }

    /**
     * Calculate monthly cost from metrics
     */
    private calculateMonthlyCost(): { total: number; operationCost: number; metrics: any } {
        const metrics = this.getTaskMetrics();

        // Cloud Tasks pricing: $0.40 per million operations, first 1M free
        const PRICE_PER_MILLION = 0.40;
        const FREE_TIER = 1_000_000;

        const billableOps = Math.max(0, metrics.taskAttempts - FREE_TIER);
        const operationCost = (billableOps / 1_000_000) * PRICE_PER_MILLION;

        return {
            total: operationCost,
            operationCost,
            metrics,
        };
    }

    /**
     * Get detailed cost estimate for this queue
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        if (!this.state.queue_name) {
            cli.output("Queue not created yet — no cost to estimate");
            return;
        }

        const { total, operationCost, metrics } = this.calculateMonthlyCost();

        cli.output(`\nCost Estimate for Cloud Tasks Queue: ${this.definition.name}`);
        cli.output(`  Project: ${this.projectId}`);
        cli.output(`  Location: ${this.definition.location}`);

        cli.output(`\nPricing:`);
        cli.output(`  Operations: $0.40 per million (first 1M free)`);

        cli.output(`\nUsage (last 30 days):`);
        cli.output(`  Task Attempts: ${metrics.taskAttempts.toLocaleString()}`);

        cli.output(`\nCost Breakdown:`);
        cli.output(`  Operations: $${operationCost.toFixed(4)} (${metrics.taskAttempts.toLocaleString()} attempts)`);
        cli.output(`  ─────────────────`);
        cli.output(`  Estimated Monthly Total: $${total.toFixed(2)}`);

        cli.output(`\nNotes:`);
        cli.output(`  - Free tier: 1 million operations/month`);
        cli.output(`  - Each API call = 1+ billable operation`);
        cli.output(`  - Tasks over 32KB are chunked (96KB task = 3 operations)`);
    }

    /**
     * Standardized cost output for Monk billing system
     */
    @action("costs")
    costs(): void {
        if (!this.state.queue_name) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-tasks-queue",
                costs: { month: { amount: "0", currency: "USD" } }
            }));
            return;
        }

        try {
            const { total } = this.calculateMonthlyCost();
            cli.output(JSON.stringify({
                type: "gcp-cloud-tasks-queue",
                costs: { month: { amount: total.toFixed(2), currency: "USD" } }
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-tasks-queue",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } }
            }));
        }
    }

}
