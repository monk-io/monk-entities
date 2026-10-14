import k8s from "k8s";
import { K8sObjects, ObjectsDefinition, ObjectsState } from "./objects.ts";

export { OWNER } from "./objects.ts";
export type { ManagedObject } from "./objects.ts";

/**
 * Kubernetes objects, as a YAML manifest, applied to a cluster.
 * @interface ResourceDefinition
 */
export interface ResourceDefinition extends ObjectsDefinition {
    /**
     * @description The objects, as YAML; several documents separated by --- are fine
     */
    manifest: string;
}

/**
 * The objects and what they report.
 * @interface ResourceState
 */
export interface ResourceState extends ObjectsState {}

/**
 * @description Kubernetes objects.
 * Applies a manifest of Kubernetes objects to a cluster with server-side
 * apply, as field manager `monk`, and keeps them as the manifest says:
 * updates re-apply it, objects dropped from it are deleted, and deleting
 * the entity deletes what it created. Works with any kind the cluster
 * serves, custom resources included.
 *
 * Every object is annotated `monk.io/owner` with this entity's path. An
 * object that already exists without that annotation is refused unless
 * `adopt: true`; adopted objects are managed from then on but left in place
 * when the entity is deleted.
 *
 * Readiness follows the kinds: rollouts for Deployments, StatefulSets and
 * DaemonSets, completion for Jobs, an address for LoadBalancer Services,
 * Established for CRDs, and a Ready or Available condition for anything
 * else that reports one.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` (a kubeconfig) or `token_secret` (a bearer token), when set
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.cluster_ip` - cluster IP of the first Service
 * - `state.load_balancer` - external address of the first LoadBalancer Service
 * - `state.node_port` - node port of the first Service, for clusters without load balancers
 * - `state.node_address` - address of a ready node, where the node port is reachable
 * - `state.host`, `state.port`, `state.endpoint` - the best way in to the first Service:
 *   its load balancer, else a node and the node port, else its cluster IP
 * - `state.objects` - what the entity manages, with UIDs
 *
 * ## Composing with Other Entities
 * Works with:
 * - `k8s/cluster` - wire the connection fields to its state
 * - anything that needs an address: `connection-target("app") entity-state get-member("load_balancer")`
 */
export class Resource extends K8sObjects<ResourceDefinition, ResourceState> {
    protected desired(): any[] {
        const objects = k8s.parse(this.definition.manifest);
        if (objects.length === 0) throw new Error("manifest has no objects");
        return objects;
    }
}
