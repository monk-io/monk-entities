// End-to-end: an app made of typed entities (e2e/typed.yaml) on a real
// cluster, set up as for k8s.e2e.ts:
//
//   K8S_E2E_KUBECONFIG="$(kind get kubeconfig --name monk-k8s --internal)" \
//   monk entity test --e2e src/k8s
import { e2e, expect } from "monk/e2e";
import { Deployment } from "../deployment.ts";
import { Job } from "../job.ts";
import { ConfigMap } from "../config-map.ts";

e2e("an app made of typed entities serves a Monk runnable", (c) => {
    c.secret("k8s-e2e-kubeconfig", c.env("K8S_E2E_KUBECONFIG", { secret: true }));
    c.secret("k8s-typed-token", `t0ken-${c.id}`);
    c.load("e2e/typed.yaml");
    c.run("k8s-typed/stack");
    c.waitReady("k8s-typed/stack", { timeout: 900 });

    // The job only completes when the ConfigMap and the Secret reached its
    // environment, the Kubernetes version among them.
    const job = c.entity(Job, "k8s-typed/check-env");
    expect(job.ready).toBe(true);
    expect(job.state.succeeded).toBe(1);
    const settings = c.entity(ConfigMap, "k8s-typed/settings");
    expect(settings.state.namespace).toBe(`k8s-typed-${c.id}`);

    const web = c.entity(Deployment, "k8s-typed/web");
    expect(web.state.name).toBe("web");
    expect(web.state.ready_replicas).toBe(2);
    expect(web.state.endpoint).toBe(`${web.state.node_address}:${web.state.node_port}`);
    expect((web.state.objects ?? []).map((o) => o.kind)).toEqual(["Deployment", "Service", "ConfigMap", "PersistentVolumeClaim"]);

    c.waitLogs("k8s-typed/probe", "typed-ok", { timeout: 300 });
    c.do("k8s-typed/web", "status");
});
