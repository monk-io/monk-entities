# k8s

Kubernetes objects managed by Monk, next to the rest of a stack: databases,
cloud resources and Monk runnables can wire to what runs on a cluster, and
the other way round. Works with any cluster Monk can reach: kind, k3s,
on-prem, EKS, GKE, AKS.

The package runs on Monk's TypeScript runtime (paserati) and uses its `k8s`
module; it is not built with monkec.

## Entities

| Entity | What it does |
|---|---|
| `k8s/cluster` | Checks that Monk can reach a cluster, reports its version, and keeps how to reach it for other entities to wire to. Actions: `namespaces`, `kinds`. |
| `k8s/resource` | Applies a YAML manifest (any kinds, CRDs and custom resources included) with server-side apply and keeps the objects as it says. Actions: `status`, `get`, `restart`. |
| `k8s/lookup` | Reads an object Monk doesn't manage, by name or label selector, and copies the fields you name into state. Never writes. Action: `get`. |

## Reaching a cluster

Every entity takes the same connection fields; give one of:

- `kubeconfig_secret`: a Monk secret holding a kubeconfig (`context` picks
  a context). Credentials must be inline. A kubeconfig that runs `aws eks
  get-token`, `aws-iam-authenticator` or `gke-gcloud-auth-plugin` works: the
  Monk cluster's AWS or GCP credentials stand in for the plugin. Other
  plugins, auth providers and files named in the kubeconfig are refused, so
  a kubeconfig cannot run commands or read files on Monk's nodes.
- `server` and `token_secret` (and `ca`, `insecure`).
- `eks_cluster` and `eks_region`: the endpoint and CA are looked up, and
  tokens made, with the Monk cluster's AWS credentials.
- `gke_cluster` and `gke_location` (and `gke_project`): the same with GCP.

`namespace` is where objects that name none go; otherwise the context's
namespace, else `default`.

## How k8s/resource manages objects

- Objects are applied in the manifest's order, except that Namespaces and
  CRDs go first; custom resources wait for their CRD to be established.
- Field manager `monk`, with conflicts forced: what the manifest says wins
  over other managers, while fields it leaves out (an HPA's replicas, say)
  stay theirs.
- Every object gets the annotation `monk.io/owner: <entity path>`. An object
  that exists without it is refused unless `adopt: true`; an object another
  entity owns is always refused.
- `monk update` re-applies the manifest and deletes the objects that left it.
- Deleting the entity deletes the objects it created, in reverse order.
  Adopted objects stay; `on_delete: orphan` keeps everything.
- Readiness: Deployments, StatefulSets and DaemonSets when rolled out, Jobs
  when complete, LoadBalancer Services when they have an address, CRDs when
  established, anything else by its `Ready` or `Available` condition.
  `wait: false` skips it.
- State for wiring, from the first Service: `endpoint` (`host:port`) with
  `host` and `port`, the best way in: its load balancer, else a ready
  node's address and the node port, else its cluster IP. Also
  `cluster_ip`, `load_balancer`, `node_port`, `node_address` (a ready
  node's ExternalIP, else InternalIP; `node_address_type` picks), and
  `objects` with their UIDs. Node addresses need permission to list
  nodes; without it they are left out.

## Querying the cluster

`k8s/cluster` lists the nodes into `state.nodes` (name, ready, internal_ip,
external_ip) and `state.node_address`. For anything else, `k8s/lookup`:

```yaml
ingress:
  defines: k8s/lookup
  kubeconfig_secret: k8s-kubeconfig
  api_version: v1
  kind: Service
  label_selector: app.kubernetes.io/name=ingress-nginx
  all_namespaces: true
  fields:
    - name: address
      path: status.loadBalancer.ingress.0.ip
  permitted-secrets:
    k8s-kubeconfig: true
```

Each field lands in state under its name, as a string
(`entity-state get-member("address")`); objects and lists as JSON. The
lookup is ready once the object exists (`wait_ready: true` waits for it to
be ready by its kind's rules), and reads it again on every readiness check.

See `example.yaml`.

## Tests

```bash
monk entity test src/k8s              # offline, against test/fake-kube.ts
monk entity test --explore src/k8s    # with faults injected
```

`test/k8s.e2e.ts` runs a cluster, an app and a Monk runnable that reaches it
on a real Monk cluster and kind; its header says how.
