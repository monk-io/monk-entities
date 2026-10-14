import { Workload, WorkloadDefinition, WorkloadState } from "./workload.ts";

/**
 * Pods of a StatefulSet.
 * @interface StatefulSetDefinition
 */
export interface StatefulSetDefinition extends WorkloadDefinition {
    /**
     * @description Number of pods (default 1)
     */
    replicas?: number;
}

/**
 * What a StatefulSet reports.
 * @interface StatefulSetState
 */
export interface StatefulSetState extends WorkloadState {
    /**
     * @description Pods that are ready, as last seen
     */
    ready_replicas?: number;

    /**
     * @description Headless Service that gives each pod a DNS name: <name>-0.<pods_service>
     */
    pods_service?: string;
}

/**
 * @description A StatefulSet, with its Services, config files, variables and storage per pod.
 * Runs a container as a StatefulSet, for databases and anything else whose
 * pods keep their own data and name. Each storage entry becomes a volume
 * per pod.
 * Ports get a Service of the same name; a headless Service, <name>-pods,
 * gives each pod a DNS name of its own.
 *
 * The pods' volumes are kept when the entity is deleted unless
 * delete_volumes is set.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` or `token_secret`, and the secrets named in `secret_env`
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name`, `state.namespace` - the StatefulSet and its Service
 * - `state.pods_service` - the headless Service
 * - `state.host`, `state.port`, `state.endpoint` - the best way in to the Service
 */
export class StatefulSet extends Workload<StatefulSetDefinition, StatefulSetState> {
    protected kind(): string {
        return "StatefulSet";
    }

    protected build(name: string): any[] {
        const pod = this.pod(name, true);
        const pods = `${name}-pods`;
        const spec: any = {
            replicas: this.definition.replicas ?? 1,
            serviceName: pods,
            selector: this.selector(name),
            template: pod.template,
        };
        if (pod.claimTemplates.length > 0) {
            spec.volumeClaimTemplates = pod.claimTemplates;
            if (this.definition.delete_volumes) {
                spec.persistentVolumeClaimRetentionPolicy = { whenDeleted: "Delete", whenScaled: "Retain" };
            }
        }
        const set = { apiVersion: "apps/v1", kind: "StatefulSet", metadata: { name }, spec };
        const headless = {
            apiVersion: "v1", kind: "Service", metadata: { name: pods },
            spec: {
                clusterIP: "None",
                selector: { "app.kubernetes.io/name": name },
                ports: pod.ports.map((p) => ({ name: p.name, port: p.target, protocol: p.protocol })),
                publishNotReadyAddresses: true,
            },
        };
        const svc = this.serviceFor(name, pod.ports);
        this.state.pods_service = pods;
        // The Service first: what the entity reports is the first Service's.
        return [set, ...(svc ? [svc] : []), headless, ...pod.objects];
    }

    protected observeMain(obj: any): void {
        this.state.ready_replicas = obj.status?.readyReplicas ?? 0;
    }
}
