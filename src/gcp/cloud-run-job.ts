/**
 * GCP Cloud Run Job Entity
 *
 * Creates and manages Google Cloud Run jobs using the v2 API.
 * Cloud Run jobs execute containerized workloads to completion (batch processing).
 *
 * @see https://cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import {
    CLOUD_RUN_API_URL,
    GcpRegion,
    CloudRunExecutionEnvironment,
    extractPriceFromSku,
} from "./common.ts";

/**
 * Cloud Run Job definition
 */
export interface CloudRunJobDefinition extends GcpEntityDefinition {
    /**
     * @description Job name (must be unique within project/region).
     * 1-49 characters, lowercase letters, numbers, and hyphens.
     */
    name: string;

    /**
     * @description GCP region for the job
     */
    location: GcpRegion;

    /**
     * @description Container image URI (e.g., gcr.io/project/image:tag)
     */
    image: string;

    /**
     * @description Container entrypoint command override
     */
    command?: string[];

    /**
     * @description Container command arguments
     */
    container_args?: string[];

    /**
     * @description Environment variables as key-value pairs
     */
    env_vars?: Record<string, string>;

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
     * @description Task timeout in seconds
     * @default 600
     */
    timeout_seconds?: number;

    /**
     * @description Maximum number of retries per failed task
     * @default 3
     */
    max_retries?: number;

    /**
     * @description Number of tasks to run
     * @default 1
     */
    task_count?: number;

    /**
     * @description Maximum number of tasks to run in parallel
     * @default 0
     */
    parallelism?: number;

    /**
     * @description IAM service account email for the job
     */
    service_account?: string;

    /**
     * @description Execution environment generation
     */
    execution_environment?: CloudRunExecutionEnvironment;

    /**
     * @description Resource labels as key-value pairs
     */
    labels?: Record<string, string>;
}

/**
 * Cloud Run Job state
 */
export interface CloudRunJobState extends GcpEntityState {
    /**
     * @description Job name
     */
    name?: string;

    /**
     * @description Number of executions run
     */
    execution_count?: number;

    /**
     * @description Latest execution name
     */
    latest_execution?: string;

    /**
     * @description Whether the job is currently reconciling
     */
    reconciling?: boolean;
}

/**
 * @description Creates and manages batch container workloads on Google Cloud Run Jobs.
 * Supports task parallelism, retries, execution overrides, and cost estimation.
 *
 * ## Required Permissions
 * - `run.jobs.create` — create jobs
 * - `run.jobs.get` — check job status
 * - `run.jobs.update` — update jobs
 * - `run.jobs.delete` — delete jobs
 * - `run.jobs.run` — execute jobs
 * - `run.executions.get` — check execution status
 * - `run.executions.list` — list executions
 * - `run.operations.get` — poll long-running operations
 * - `monitoring.timeSeries.list` — cost estimation metrics
 *
 * ## Secrets
 * - Reads: none (authenticated via gcp provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name` - Job name
 * - `state.execution_count` - Number of executions
 * - `state.latest_execution` - Latest execution reference
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/service-usage` — enable run.googleapis.com API
 * - `gcp/service-account` — custom service account for the job
 */
export class CloudRunJob extends GcpEntity<CloudRunJobDefinition, CloudRunJobState> {

    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    protected getEntityName(): string {
        return `Cloud Run Job ${this.definition.name || 'unnamed'}`;
    }

    private getJobUrl(): string {
        return `${CLOUD_RUN_API_URL}/projects/${this.projectId}/locations/${this.definition.location}/jobs/${this.definition.name}`;
    }

    private getParentUrl(): string {
        return `${CLOUD_RUN_API_URL}/projects/${this.projectId}/locations/${this.definition.location}`;
    }

    private getJob(): any | null {
        return this.checkResourceExists(this.getJobUrl());
    }

    private populateState(job: any): void {
        this.state.name = this.definition.name;
        this.state.execution_count = job.executionCount ?? 0;
        this.state.reconciling = job.reconciling ?? false;
        if (job.latestCreatedExecution) {
            this.state.latest_execution = job.latestCreatedExecution.name?.split("/").pop() || undefined;
        }
    }

    private buildJobBody(): any {
        const container: any = {
            image: this.definition.image,
            resources: {
                limits: {
                    cpu: this.definition.cpu || "1",
                    memory: this.definition.memory || "512Mi",
                },
            },
        };

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

        const taskTemplate: any = {
            containers: [container],
        };

        if (this.definition.timeout_seconds) {
            taskTemplate.timeout = `${this.definition.timeout_seconds}s`;
        }
        if (this.definition.max_retries !== undefined) {
            taskTemplate.maxRetries = this.definition.max_retries;
        }
        if (this.definition.service_account) {
            taskTemplate.serviceAccount = this.definition.service_account;
        }
        if (this.definition.execution_environment) {
            taskTemplate.executionEnvironment = this.definition.execution_environment;
        }

        const executionTemplate: any = {
            template: taskTemplate,
        };

        if (this.definition.task_count !== undefined) {
            executionTemplate.taskCount = this.definition.task_count;
        }
        if (this.definition.parallelism !== undefined) {
            executionTemplate.parallelism = this.definition.parallelism;
        }

        const body: any = {
            template: executionTemplate,
        };

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        return body;
    }

    private waitForJobOperation(operationName: string): any {
        const operationUrl = `${CLOUD_RUN_API_URL}/${operationName}`;
        return this.waitForOperation(operationUrl, 60, 5000);
    }

    override create(): void {
        const existing = this.getJob();
        if (existing) {
            cli.output(`Cloud Run job ${this.definition.name} already exists, adopting`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        cli.output(`Creating Cloud Run job: ${this.definition.name}`);
        const body = this.buildJobBody();
        const createUrl = `${this.getParentUrl()}/jobs?jobId=${this.definition.name}`;
        const operation = this.post(createUrl, body);

        if (operation?.name) {
            this.state.operation_name = operation.name;
            cli.output(`Waiting for job creation...`);
            this.waitForJobOperation(operation.name);
            this.state.operation_name = undefined;
        }

        const job = this.getJob();
        if (job) {
            this.populateState(job);
        }
        this.state.existing = false;

        cli.output(`Cloud Run job ${this.definition.name} created`);
    }

    override update(): void {
        if (!this.state.name) {
            this.create();
            return;
        }

        cli.output(`Updating Cloud Run job: ${this.definition.name}`);
        const body = this.buildJobBody();
        const operation = this.patch(this.getJobUrl(), body);

        if (operation?.name) {
            this.state.operation_name = operation.name;
            cli.output(`Waiting for job update...`);
            this.waitForJobOperation(operation.name);
            this.state.operation_name = undefined;
        }

        const job = this.getJob();
        if (job) {
            this.populateState(job);
        }

        cli.output(`Cloud Run job ${this.definition.name} updated`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Job ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getJob();
        if (!existing) {
            cli.output(`Job ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting Cloud Run job: ${this.definition.name}`);
        const operation = this.httpDelete(this.getJobUrl());

        if (operation?.name) {
            cli.output(`Waiting for job deletion...`);
            this.waitForJobOperation(operation.name);
        }

        cli.output(`Job ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        if (this.state.operation_name) {
            cli.output(`Waiting for operation to complete...`);
            return false;
        }

        const job = this.getJob();
        if (!job) {
            cli.output("Job not found");
            return false;
        }

        this.populateState(job);

        if (job.reconciling) {
            cli.output(`Job ${this.definition.name} is reconciling...`);
            return false;
        }

        const terminalCondition = job.terminalCondition;
        if (terminalCondition) {
            if (terminalCondition.state === "CONDITION_SUCCEEDED") {
                cli.output(`Job ${this.definition.name} is ready`);
                return true;
            }
            if (terminalCondition.state === "CONDITION_FAILED") {
                cli.output(`Job ${this.definition.name} failed: ${terminalCondition.message || "unknown error"}`);
                return false;
            }
            cli.output(`Job ${this.definition.name} condition: ${terminalCondition.state}`);
            return false;
        }

        cli.output(`Job ${this.definition.name} is still provisioning`);
        return false;
    }

    checkLiveness(): boolean {
        const job = this.getJob();
        if (!job) return false;
        return !job.reconciling && job.terminalCondition?.state === "CONDITION_SUCCEEDED";
    }

    // ==================== ACTIONS ====================

    @action("get-info")
    getInfo(_args?: Args): void {
        const job = this.getJob();
        if (!job) {
            throw new Error("Job not found");
        }
        cli.output(JSON.stringify(job, null, 2));
    }

    @action("execute")
    executeJob(args?: Args): void {
        const url = `${this.getJobUrl()}:run`;
        const body: any = {};

        if (args?.task_count || args?.timeout || args?.env) {
            body.overrides = {};
            if (args.task_count) {
                body.overrides.taskCount = parseInt(args.task_count, 10);
            }
            if (args.timeout) {
                body.overrides.timeout = `${args.timeout}s`;
            }
            if (args.env) {
                try {
                    const envOverrides = JSON.parse(args.env);
                    body.overrides.containerOverrides = [{
                        env: Object.entries(envOverrides).map(([name, value]) => ({ name, value })),
                    }];
                } catch {
                    throw new Error("env argument must be valid JSON (e.g., '{\"KEY\":\"value\"}'");
                }
            }
        }

        const operation = this.post(url, body);
        if (operation?.name) {
            const execName = operation.metadata?.name?.split("/").pop() || operation.name;
            cli.output(`Execution started: ${execName}`);
        } else {
            cli.output("Execution triggered");
        }
    }

    @action("get-executions")
    getExecutions(_args?: Args): void {
        const url = `${this.getJobUrl()}/executions`;
        const response = this.get(url);
        const executions = response.executions || [];
        if (executions.length === 0) {
            cli.output("No executions found");
            return;
        }
        for (const exec of executions) {
            const name = exec.name?.split("/").pop() || "unknown";
            const createTime = exec.createTime || "unknown";
            const completionStatus = exec.completionStatus || "UNKNOWN";
            const tasks = `${exec.succeededCount || 0}/${exec.taskCount || 0} tasks succeeded`;
            cli.output(`${name} | ${createTime} | ${completionStatus} | ${tasks}`);
        }
    }

    // ==================== COST ESTIMATION ====================

    private parseMemoryMb(memStr: string): number {
        if (memStr.endsWith('Gi')) {
            return parseFloat(memStr.replace('Gi', '')) * 1024;
        }
        if (memStr.endsWith('Mi')) {
            return parseFloat(memStr.replace('Mi', ''));
        }
        return 512;
    }

    private fetchCloudRunPricing(): {
        cpuPerSecond: number;
        memoryGbPerSecond: number;
        source: string;
    } {
        try {
            const billingApiUrl = 'https://cloudbilling.googleapis.com/v1';
            const servicesUrl = `${billingApiUrl}/services`;
            const servicesResp = this.get(servicesUrl);
            let cloudRunServiceId = '';

            if (servicesResp.services && Array.isArray(servicesResp.services)) {
                for (const svc of servicesResp.services) {
                    const name = (svc.displayName || '').toLowerCase();
                    if (name === 'cloud run') {
                        cloudRunServiceId = svc.serviceId;
                        break;
                    }
                }
            }

            if (!cloudRunServiceId) {
                throw new Error('Cloud Run service not found in Billing Catalog');
            }

            const skusUrl = `${billingApiUrl}/services/${cloudRunServiceId}/skus?currencyCode=USD`;
            const response = this.get(skusUrl);

            if (response.skus && Array.isArray(response.skus)) {
                let cpuRate = 0;
                let memoryRate = 0;
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
                    }
                }

                if (cpuRate > 0 && memoryRate > 0) {
                    return {
                        cpuPerSecond: cpuRate,
                        memoryGbPerSecond: memoryRate,
                        source: 'GCP Cloud Billing Catalog API',
                    };
                }
            }
        } catch {
            // Fall through to published pricing
        }

        return {
            cpuPerSecond: 0.0000240,
            memoryGbPerSecond: 0.0000025,
            source: 'Published pricing (fallback)',
        };
    }

    private getJobMetrics(): { executionSeconds: number } | null {
        try {
            const endTime = new Date().toISOString();
            const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const jobName = this.definition.name;

            const timeFilter = encodeURIComponent(
                `metric.type="run.googleapis.com/container/billable_instance_time" AND resource.labels.service_name="${jobName}"`
            );
            const timeUrl = `https://monitoring.googleapis.com/v3/projects/${this.projectId}/timeSeries?filter=${timeFilter}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            let executionSeconds = 0;
            const timeResponse = this.get(timeUrl);
            if (timeResponse.timeSeries && timeResponse.timeSeries.length > 0) {
                for (const ts of timeResponse.timeSeries) {
                    for (const point of (ts.points || [])) {
                        executionSeconds += parseFloat(point.value?.doubleValue || point.value?.int64Value || '0');
                    }
                }
            }

            return { executionSeconds };
        } catch {
            return null;
        }
    }

    private calculateMonthlyCost(): { total: number; pricing: any; metrics: any } {
        const pricing = this.fetchCloudRunPricing();
        const metrics = this.getJobMetrics();

        const cpu = parseFloat(this.definition.cpu || '1');
        const memoryGb = this.parseMemoryMb(this.definition.memory || '512Mi') / 1024;
        let totalMonthlyCost = 0;

        if (metrics && metrics.executionSeconds > 0) {
            totalMonthlyCost += metrics.executionSeconds * cpu * pricing.cpuPerSecond;
            totalMonthlyCost += metrics.executionSeconds * memoryGb * pricing.memoryGbPerSecond;
        }

        return { total: totalMonthlyCost, pricing, metrics };
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const jobName = this.state.name || this.definition.name;

        cli.output(`\nCost Estimate for Cloud Run Job: ${jobName}`);
        cli.output(`${'='.repeat(60)}`);

        const cpu = this.definition.cpu || '1';
        const memory = this.definition.memory || '512Mi';
        const taskCount = this.definition.task_count ?? 1;
        const parallelism = this.definition.parallelism ?? 0;

        cli.output(`\nConfiguration:`);
        cli.output(`  Name: ${jobName}`);
        cli.output(`  Image: ${this.definition.image}`);
        cli.output(`  CPU: ${cpu} vCPU`);
        cli.output(`  Memory: ${memory}`);
        cli.output(`  Task Count: ${taskCount}`);
        cli.output(`  Parallelism: ${parallelism || 'default'}`);
        cli.output(`  Location: ${this.definition.location}`);

        const { total, pricing, metrics } = this.calculateMonthlyCost();

        cli.output(`\nPricing (${pricing.source}):`);
        cli.output(`  CPU: $${pricing.cpuPerSecond.toFixed(7)}/vCPU-second`);
        cli.output(`  Memory: $${pricing.memoryGbPerSecond.toFixed(7)}/GiB-second`);

        if (metrics && metrics.executionSeconds > 0) {
            cli.output(`\nUsage (Last 30 Days from Cloud Monitoring):`);
            cli.output(`  Execution Time: ${(metrics.executionSeconds / 3600).toFixed(2)} hours`);
        } else {
            cli.output(`\nNo usage metrics available from Cloud Monitoring`);
        }

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`ESTIMATED MONTHLY COST: $${total.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\nNotes:`);
        cli.output(`  - Jobs are billed per task execution time (CPU + memory)`);
        cli.output(`  - No request charges for jobs`);
        cli.output(`  - Free tier: 180K vCPU-seconds, 360K GiB-seconds/month`);
    }

    @action("costs")
    costs(_args?: Args): void {
        if (!this.state.name && !this.definition.name) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-run-job",
                costs: { month: { amount: "0", currency: "USD" } },
            }));
            return;
        }

        try {
            const { total } = this.calculateMonthlyCost();
            cli.output(JSON.stringify({
                type: "gcp-cloud-run-job",
                costs: { month: { amount: total.toFixed(2), currency: "USD" } },
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-run-job",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } },
            }));
        }
    }
}
