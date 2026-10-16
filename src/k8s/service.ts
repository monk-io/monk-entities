import { NamedState } from "./named.ts";
import { ServiceObjects, ServiceDefinition } from "./builders.ts";

/**
 * @description A Service.
 * Puts a Service in front of pods that some other entity or tool runs,
 * for instance a LoadBalancer for a k8s/deployment that has a ClusterIP
 * Service of its own. k8s/deployment and k8s/stateful-set make a Service
 * for their ports already.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` or `token_secret`
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name`, `state.namespace` - the Service
 * - `state.host`, `state.port`, `state.endpoint` - the best way in: its load balancer, else a node and the node port, else its cluster IP
 * - `state.cluster_ip`, `state.load_balancer`, `state.node_port`, `state.node_address`
 */
export class Service extends ServiceObjects<ServiceDefinition, NamedState> {}
