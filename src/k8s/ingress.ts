import cli from "cli";
import { NamedObjects, NamedDefinition, NamedState } from "./named.ts";

/**
 * HTTP routing from a host name to a Service.
 * @interface IngressDefinition
 */
export interface IngressDefinition extends NamedDefinition {
    /**
     * @description Host name to route, e.g. shop.example.com (default: any)
     */
    host?: string;

    /**
     * @description Path prefix to route (default /)
     */
    path?: string;

    /**
     * @description Service to route to, e.g. a k8s/deployment's name
     */
    service: string;

    /**
     * @description Port of the Service
     */
    port: number;

    /**
     * @description Ingress class, e.g. nginx (default: the cluster's default)
     */
    ingress_class?: string;

    /**
     * @description Secret with the TLS certificate for host; with cert_issuer, cert-manager makes it
     */
    tls_secret?: string;

    /**
     * @description cert-manager ClusterIssuer to get a certificate from, e.g. letsencrypt
     */
    cert_issuer?: string;

    /**
     * @description Wait for the ingress controller to give an address before the entity is ready (default false)
     */
    wait_address?: boolean;
}

/**
 * What an Ingress reports.
 * @interface IngressState
 */
export interface IngressState extends NamedState {
    /**
     * @description Address the ingress controller serves the Ingress at, once it has one
     */
    address?: string;

    /**
     * @description URL of the routed host and path
     */
    url?: string;
}

/**
 * @description An Ingress: HTTP routing from a host name to a Service.
 * Needs an ingress controller on the cluster. With cert_issuer, asks
 * cert-manager for the certificate.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` or `token_secret`
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.address` - where the controller serves it, once it has an address
 * - `state.url` - the routed URL
 */
export class Ingress extends NamedObjects<IngressDefinition, IngressState> {
    protected kind(): string {
        return "Ingress";
    }

    protected build(name: string): any[] {
        const d = this.definition;
        if (!d.service || d.port === undefined) throw new Error("an Ingress needs service and port");
        const path = d.path ?? "/";
        const rule: any = {
            http: { paths: [{ path, pathType: "Prefix", backend: { service: { name: d.service, port: { number: Number(d.port) } } } }] },
        };
        if (d.host) rule.host = d.host;
        const spec: any = { rules: [rule] };
        if (d.ingress_class) spec.ingressClassName = d.ingress_class;
        const tls = d.tls_secret ?? (d.cert_issuer ? `${name}-tls` : undefined);
        if (tls) {
            if (!d.host) throw new Error("TLS needs host");
            spec.tls = [{ hosts: [d.host], secretName: tls }];
        }
        const metadata: any = { name };
        if (d.cert_issuer) metadata.annotations = { "cert-manager.io/cluster-issuer": d.cert_issuer };
        this.state.url = d.host ? `${tls ? "https" : "http"}://${d.host}${path}` : undefined;
        return [{ apiVersion: "networking.k8s.io/v1", kind: "Ingress", metadata, spec }];
    }

    override checkReadiness(): boolean {
        if (!super.checkReadiness()) return false;
        if (this.definition.wait_address && !this.state.address) {
            this.state.ready = false;
            cli.output("waiting for the ingress controller to give an address");
            return false;
        }
        return true;
    }

    protected observeMain(obj: any): void {
        const lb = obj.status?.loadBalancer?.ingress?.[0];
        this.state.address = lb ? (lb.hostname ?? lb.ip) : undefined;
    }
}
