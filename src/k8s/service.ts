import { NamedObjects, NamedDefinition, NamedState, strings } from "./named.ts";

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
     * @description Ports: 80, or 80:8080 to send port 80 to the pods' 8080, with /udp for UDP
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
        const d = this.definition;
        const selector = d.selector ? strings(d.selector) : d.app ? { "app.kubernetes.io/name": d.app } : undefined;
        if (!selector) throw new Error("a Service needs app or selector");
        const ports = (d.ports ?? []).map((p) => {
            const s = String(p).trim();
            const m = /^(?:(\d+):)?(\d+)(?:\/(tcp|udp|sctp))?$/i.exec(s);
            if (!m) throw new Error(`port "${s}" is not like 80, 80:8080 or 53/udp`);
            const target = Number(m[2]);
            const protocol = (m[3] ?? "tcp").toUpperCase();
            const port = m[1] ? Number(m[1]) : target;
            return { name: `${protocol.toLowerCase()}-${port}`, port, targetPort: target, protocol };
        });
        if (ports.length === 0) throw new Error("a Service needs ports");
        const type = d.service_type ?? "ClusterIP";
        const spec: any = type.toLowerCase() === "headless" ? { clusterIP: "None", selector, ports } : { type, selector, ports };
        return [{ apiVersion: "v1", kind: "Service", metadata: { name }, spec }];
    }
}
