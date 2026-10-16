import { NamedObjects, NamedDefinition, NamedState } from "./named.ts";
import { serviceObjects } from "./builders.ts";

/**
 * A Service in front of pods.
 * @interface ServiceDefinition
 */
export interface ServiceDefinition extends NamedDefinition {
    /**
     * @description Pods to send traffic to, by their app.kubernetes.io/name label: the name of a k8s/deployment or k8s/stateful-set
     */
    app?: string;

    /**
     * @description Pods to send traffic to, by labels (instead of app)
     */
    selector?: Record<string, string>;

    /**
     * @description Ports: 80, or 80:8080 to send port 80 to the pods' 8080, with /udp for UDP; http=80:8080 names the port (default tcp-80), =80 leaves it unnamed
     */
    ports: (number | string)[];

    /**
     * @description ClusterIP (default), NodePort, LoadBalancer or Headless
     */
    service_type?: string;
}

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
export class Service extends NamedObjects<ServiceDefinition, NamedState> {
    protected kind(): string {
        return "Service";
    }

    protected build(name: string): any[] {
        return serviceObjects(name, this.definition);
    }
}
