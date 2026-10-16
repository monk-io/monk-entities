import { WorkloadDefinition, WorkloadState } from "./workload.ts";
import { DeploymentObjects } from "./builders.ts";

/**
 * Pods of a Deployment.
 * @interface DeploymentDefinition
 */
export interface DeploymentDefinition extends WorkloadDefinition {
    /**
     * @description Number of pods (default 1)
     */
    replicas?: number;
}

/**
 * What a Deployment reports.
 * @interface DeploymentState
 */
export interface DeploymentState extends WorkloadState {
    /**
     * @description Pods that are ready, as last seen
     */
    ready_replicas?: number;
}

/**
 * @description A Deployment, with its Service, config files, variables and storage.
 * Runs a container as a Deployment without writing Kubernetes YAML. Ports
 * get a Service of the same name, config_files a ConfigMap, secret_env a
 * Secret filled from Monk secrets, and storage PersistentVolumeClaims.
 * Changing config files or secret values restarts the pods; after
 * changing a Monk secret, run the apply action to copy it over.
 *
 * Storage is kept when the entity is deleted, as Monk keeps a runnable's
 * volumes, unless delete_volumes is set. With storage the Deployment
 * replaces its pods rather than rolling them, so a volume is never
 * mounted by two pods at once.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` or `token_secret`, and the secrets named in `secret_env`
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name`, `state.namespace` - the Deployment and its Service
 * - `state.host`, `state.port`, `state.endpoint` - the best way in to the Service
 * - `state.cluster_ip`, `state.load_balancer`, `state.node_port`, `state.node_address`
 *
 * ## Composing with Other Entities
 * Works with:
 * - `k8s/cluster` - wire the connection fields to its state
 * - `k8s/ingress` - `service: <- connection-target("web") entity-state get-member("name")`
 */
export class Deployment extends DeploymentObjects<DeploymentDefinition, DeploymentState> {
    protected observeMain(obj: any): void {
        this.state.ready_replicas = obj.status?.readyReplicas ?? 0;
    }
}
