import { Workload, WorkloadDefinition, WorkloadState } from "./workload.ts";
import { digest } from "./named.ts";

/**
 * A container that runs to completion.
 * @interface JobDefinition
 */
export interface JobDefinition extends WorkloadDefinition {
    /**
     * @description Times to retry a failed pod (default 3)
     */
    backoff_limit?: number;

    /**
     * @description Pods that must succeed (default 1)
     */
    completions?: number;

    /**
     * @description Pods to run at once (default 1)
     */
    parallelism?: number;

    /**
     * @description Seconds the job may run before it fails
     */
    deadline?: number;
}

/**
 * What a Job reports.
 * @interface JobState
 */
export interface JobState extends WorkloadState {
    /**
     * @description Pods that succeeded, as last seen
     */
    succeeded?: number;
}

/**
 * @description A Job: a container that runs to completion, such as a migration.
 * The entity is ready when the Job completes, so what depends on it waits
 * for it. A Job cannot be changed once it runs, so a change to the
 * definition makes a new Job, named after a hash of its spec, and deletes
 * the old one: changing the image reruns the job.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` or `token_secret`, and the secrets named in `secret_env`
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name`, `state.namespace` - the Job as it runs now
 * - `state.succeeded` - pods that succeeded
 */
export class Job extends Workload<JobDefinition, JobState> {
    protected kind(): string {
        return "Job";
    }

    protected build(name: string): any[] {
        const d = this.definition;
        const pod = this.pod(name, false);
        pod.template.spec.restartPolicy = "Never";
        const spec: any = {
            backoffLimit: d.backoff_limit ?? 3,
            completions: d.completions ?? 1,
            parallelism: d.parallelism ?? 1,
            template: pod.template,
        };
        if (d.deadline !== undefined) spec.activeDeadlineSeconds = Number(d.deadline);
        const job = { apiVersion: "batch/v1", kind: "Job", metadata: { name: `${name}-${digest(spec).slice(0, 8)}` }, spec };
        return [job, ...pod.objects];
    }

    protected observeMain(obj: any): void {
        this.state.succeeded = obj.status?.succeeded ?? 0;
    }
}
