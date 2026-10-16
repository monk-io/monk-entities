// End-to-end: a Kubernetes cluster, an app applied to it by k8s/resource,
// and a Monk runnable that reaches the app, all run by Monk from
// e2e/app.yaml. With kind, the Monk cluster must reach the kind node:
//
//   kind create cluster --name monk-k8s
//   podman network connect kind monk-e2e        # the e2e Monk cluster's container
//   K8S_E2E_KUBECONFIG="$(kind get kubeconfig --name monk-k8s --internal)" \
//   monk entity test --e2e src/k8s
//
// The probe reaches the app at a node's InternalIP, which the Monk
// cluster's containers must be able to route to.
//
// The namespace is the run's own, and is deleted with the rest when the
// test ends.
import { e2e, expect } from "monk/e2e";
import { Cluster } from "../cluster.ts";
import { Resource } from "../resource.ts";
import { Lookup } from "../lookup.ts";

e2e("an app applied to a cluster serves a Monk runnable", (c) => {
    c.secret("k8s-e2e-kubeconfig", c.env("K8S_E2E_KUBECONFIG", { secret: true }));
    c.load("e2e/app.yaml");
    c.run("k8s-e2e/stack");
    c.waitReady("k8s-e2e/stack", { timeout: 600 });

    const cluster = c.entity(Cluster, "k8s-e2e/cluster");
    expect(cluster.state.version).toMatch(/^v1\./);
    const app = c.entity(Resource, "k8s-e2e/app");
    expect(app.ready).toBe(true);
    expect(app.state.objects?.map((o) => `${o.kind} ${o.name}`)).toEqual([
        `Namespace k8s-e2e-${c.id}`, "Deployment web", "Service web",
    ]);
    expect(app.state.node_port).toBeGreaterThan(29999);
    expect(app.state.endpoint).toBe(`${cluster.state.node_address}:${app.state.node_port}`);
    expect(cluster.state.nodes?.length).toBeGreaterThan(0);

    const api = c.entity(Lookup, "k8s-e2e/api").state as any;
    expect(api.found).toBe(true);
    expect(api.values.port).toBe(443);
    expect(api.values.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);

    c.waitLogs("k8s-e2e/probe", "k8s-ok", { timeout: 300 });
    c.do("k8s-e2e/app", "status");
    c.do("k8s-e2e/app", "restart");
});
