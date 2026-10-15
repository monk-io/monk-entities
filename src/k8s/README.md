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
| `k8s/inventory` | Takes stock of a namespace someone else deployed and writes a Monk template that maps it (below). Never writes. Actions: `refresh`, `template`. |
| `k8s/deployment` | A Deployment from a few settings: image, ports (with a Service), env, `secret_env` from Monk secrets, `config_files`, `storage`, a readiness check. |
| `k8s/stateful-set` | The same as a StatefulSet, with a volume per pod and a headless Service for pod DNS names. |
| `k8s/job` | A container that runs to completion; the entity is ready when it has. A changed definition runs a new Job. |
| `k8s/config-map` | Settings, often from other entities' state through ArrowScript. |
| `k8s/secret` | Monk secrets copied into a Kubernetes Secret. |
| `k8s/service` | A Service in front of an app's pods, e.g. a LoadBalancer for a Deployment. |
| `k8s/ingress` | HTTP routing from a host to a Service, with cert-manager TLS if asked. |
| `k8s/kube-namespace` | A Namespace (`namespace` itself is a word Monk templates keep). |
| `k8s/volume` | A PersistentVolumeClaim several workloads can share. |

All but `k8s/cluster`, `k8s/lookup` and `k8s/inventory` manage objects the
same way (below) and have the actions `status`, `get` (Secret values
hidden), `restart`, `apply` and `refresh`.

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

## How objects are managed

- Objects are applied in the manifest's order, except that Namespaces and
  CRDs go first; custom resources wait for their CRD to be established.
- Field manager `monk`, with conflicts forced: what the manifest says wins
  over other managers, while fields it leaves out (an HPA's replicas, say)
  stay theirs.
- Every object gets the annotation `monk.io/owner: <entity path>`. An object
  that exists without it is refused unless `adopt: true`; an object another
  entity owns is always refused.
- `monk update` re-applies the manifest and deletes the objects that left it.
- Deleting the entity deletes the objects it created, in reverse order, and
  waits until they are gone: finalizers keep a LoadBalancer Service until
  its load balancer is released, and a claim until its volume is.
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

## Typed entities

The typed entities write the Kubernetes objects for you, so a stack needs
no Kubernetes YAML and every setting can be ArrowScript:

```yaml
web:
  defines: k8s/deployment
  kubeconfig_secret: <- connection-target("cluster") entity-state get-member("kubeconfig_secret")
  namespace: shop
  image: nginx:1.27-alpine
  replicas: 2
  ports: ["80:8080"]            # Service port 80 to container port 8080
  service_type: LoadBalancer
  env:
    DB_HOST: <- connection-target("db") entity-state get-member("address")
  secret_env:
    DB_PASSWORD: shop-db-password  # a Monk secret, kept in a Kubernetes Secret
  config_files:
    site:
      path: /etc/nginx/conf.d/default.conf
      contents: |
        server { listen 8080; location / { proxy_pass http://app:3000; } }
  storage:
    cache:
      path: /var/cache/nginx
      size: 1Gi
  readiness_path: /
  permitted-secrets:
    k8s-kubeconfig: true
    shop-db-password: true
```

- The object is named after the entity unless `name` says otherwise; every
  object gets `app.kubernetes.io/name` and `app.kubernetes.io/managed-by:
  monk`, and pods are selected by the first.
- `override` takes YAML merged into the main object, for any field the
  entity has no setting for (maps merge, lists replace).
- Changing `config_files` or the values of `secret_env` restarts the pods.
  Monk skips an update when the definition hasn't changed, so after
  changing a Monk secret run `monk do <entity>/apply`.
- `storage` and `k8s/volume` claims are kept when the entity is deleted, as
  Monk keeps a runnable's volumes; `delete_volumes: true` deletes them.
- `files` and `volumes` are words Monk templates keep for runnables, hence
  `config_files` and `storage`.

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

## Importing a namespace

An app that is already on a cluster, deployed with kubectl, Helm or Argo
CD, can be mapped into Monk without being redeployed. `k8s/inventory`
lists a namespace's objects, leaving out what other objects own (the
ReplicaSets and Pods of a Deployment) and what the cluster keeps for
itself, and notes what manages each: `helm:<release>`, `argocd:<app>`,
`flux:<kustomization>`, or Monk.

With a Monk CLI that has `monk import k8s`, one command does it all. It
runs a temporary inventory, writes the template, and removes the inventory:

```bash
monk import k8s -n shop --kubeconfig-secret k8s-kubeconfig -o shop.yaml
monk load shop.yaml
monk run imported-shop/stack
```

`--run` loads and runs it straight away, `--as` names the Monk namespace,
and `--every 60` refreshes every minute. By hand, the same goes:

```yaml
namespace: import

shop:
  defines: k8s/inventory
  kubeconfig_secret: k8s-kubeconfig
  namespace: shop
  permitted-secrets:
    k8s-kubeconfig: true
```

```bash
monk run import/shop
monk do import/shop/template                # every=60 to refresh every minute
```

`template` prints the template; save it, from `# Generated by k8s/inventory`
to its last line, as `shop.yaml`, then:

```bash
monk load shop.yaml
monk run imported-shop/stack
```

The template has one `k8s/resource` per object, holding its manifest as
the cluster has it, without status, fields the cluster set, or Secret
values, in a group per Helm release inside one `stack`. Each is in
`mode: observe`:

- it maps an object that exists and never applies, changes or deletes it;
  deleting the entity only forgets it;
- a cron runs its `refresh` action, every two minutes by default, which
  reads the object again and adds a line to `state.changes` when it
  changed (replicas and images, Service type, ports and address, the keys
  of a ConfigMap or Secret), went or came back;
- a Service's `host`, `port`, `endpoint` and `load_balancer` are in state
  as for any `k8s/resource`, so Monk workloads can connect to it.

The inventory's own `refresh` lists the namespace again and says which
objects appeared or went (`state.new_objects`, `state.gone_objects`).

Setting `mode: manage` on an observed entity and running `monk update`
takes its objects over: Monk applies the manifest from then on, and the
objects stay on the cluster when the entity is deleted, as adopted ones
do. Leave objects that Argo CD or Flux manages in observe mode: two tools
applying the same fields undo each other.

## Tests

```bash
monk entity test src/k8s              # offline, against test/fake-kube.ts
monk entity test --explore src/k8s    # with faults injected
```

`test/k8s.e2e.ts` runs a cluster, an app and a Monk runnable that reaches it
on a real Monk cluster and kind; its header says how.
