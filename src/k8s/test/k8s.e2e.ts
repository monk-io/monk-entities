// End-to-end: a Kubernetes cluster, an app applied to it by k8s/resource,
// and a Monk runnable that reaches the app, all run by Monk from
// e2e/app.yaml. With kind, the Monk cluster must reach the kind node:
//
//   kind create cluster --name monk-k8s
//   podman network connect kind monk-e2e        # the e2e Monk cluster's container
//   K8S_E2E_KUBECONFIG="$(kind get kubeconfig --name monk-k8s --internal)" \
//   K8S_E2E_NODE=$(podman inspect monk-k8s-control-plane \
//       --format '{{(index .NetworkSettings.Networks "kind").IPAddress}}') \
//   monk entity test --e2e src/k8s
//
// K8S_E2E_NODE is an address of a node the Monk cluster's containers can
// reach; an IP, since they may not resolve the kind network's names.
//
// The namespace is the run's own, and is deleted with the rest when the
// test ends.
import { e2e, expect } from "monk/e2e";
import { Cluster } from "../cluster.ts";
import { Resource } from "../resource.ts";

e2e("an app applied to a cluster serves a Monk runnable", (c) => {
    c.secret("k8s-e2e-kubeconfig", c.env("K8S_E2E_KUBECONFIG", { secret: true }));
    c.load("e2e/app.yaml", { vars: { node: c.env("K8S_E2E_NODE") } });
    c.run("k8s-e2e/stack");
    c.waitReady("k8s-e2e/stack", { timeout: 600 });

    const cluster = c.entity(Cluster, "k8s-e2e/cluster");
    expect(cluster.state.version).toMatch(/^v1\./);
    const app = c.entity(Resource, "k8s-e2e/app");
    expect(app.ready).toBe(true);
    expect((app.state.objects ?? []).map((o) => `${o.kind} ${o.name}`)).toEqual([
        `Namespace k8s-e2e-${c.id}`, "Deployment web", "Service web",
    ]);
    expect(app.state.node_port).toBeGreaterThan(29999);

    c.waitLogs("k8s-e2e/probe", "k8s-ok", { timeout: 300 });
    c.do("k8s-e2e/app", "status");
    c.do("k8s-e2e/app", "restart");
});
