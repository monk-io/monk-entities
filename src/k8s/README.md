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
| `k8s/branch` | A copy of a namespace, its volumes' data included, in a new namespace on the same cluster: a branch of production to test against (below). GKE volumes. |

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
  monk`, and pods are selected by the first. `standard_labels: false`
  leaves those labels out, `selector` picks the pods by other labels (they
  get them too), and `container_name` names the container; an import uses
  these to describe objects made elsewhere as they are.
- A port is `8080`, `80:8080` (port 80 to container port 8080) or `53/udp`,
  named `tcp-8080` by default; `http=80:8080` names it, `=80:8080` leaves it
  unnamed.
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

Each field lands in `state.values` under its name, with objects and lists
as they are in the object. Through a connection to the lookup named
`ingress`, read it with `@ingress.state.values.address` (the `@` form
needs a monkd from 16 October 2026 or later), or
`connection-target("ingress") entity-state get-member("values") get-member("address")`.
A field the object does not have is left out. The lookup is ready once the object exists (`wait_ready: true` waits for it to
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

The template has one entity per object, in a group per Helm release
inside one `stack`. A Deployment, Service, ConfigMap or
PersistentVolumeClaim gets its typed entity (`k8s/deployment`,
`k8s/service`, `k8s/config-map`, `k8s/volume`) when that entity, with the
settings read off the object, renders it exactly as the cluster has it:
every field it would set has the cluster's value, and every other field is
one the cluster fills in by default. Anything else is a `k8s/resource`
holding the manifest as the cluster has it, without status, fields the
cluster set, or Secret values, under a comment that says why its typed
entity could not take it:

```yaml
deployment-api:
  # k8s/resource: k8s/deployment has no setting for spec.template.spec.containers.0.livenessProbe
  defines: k8s/resource
```

`typed=false` on `template` writes a `k8s/resource` for every object. Each
entity is in `mode: observe`:

- it maps an object that exists and never applies, changes or deletes it;
  deleting the entity only forgets it;
- a cron runs its `refresh` action, every two minutes by default, which
  reads the object again and adds a line to `state.changes` when it
  changed (replicas and images, Service type, ports and address, the keys
  of a ConfigMap or Secret), went or came back;
- a Service's `host`, `port`, `endpoint` and `load_balancer` are in state
  as for any `k8s/resource`, so Monk workloads can connect to it.

[`examples/eks-import`](examples/eks-import) walks through it on EKS: an app installed with Helm
and kubectl, imported, then changed outside Monk.

The inventory's own `refresh` lists the namespace again and says which
objects appeared or went (`state.new_objects`, `state.gone_objects`).

Setting `mode: manage` on an observed entity and running `monk update`
takes its objects over: Monk applies the manifest from then on, and the
objects stay on the cluster when the entity is deleted, as adopted ones
do. For a typed entity from an import that first apply changes nothing
but the `monk.io/owner` annotation (a Deployment counts that as a new
generation; its pods are not replaced), and from then on its settings are
the ones to edit. Leave objects that Argo CD or Flux manages in observe mode: two tools
applying the same fields undo each other.

## Branching a namespace

`k8s/branch` copies a namespace that is already on a cluster (deployed with
kubectl, Helm or Argo CD) into a new one, data included, and seals the copy
off from the rest of the cluster:

```yaml
b1:
  defines: k8s/branch
  gke_cluster: prod-cluster
  gke_location: europe-west1-b
  source_namespace: prod
  namespace: br-b1
  replicas:
    loadgen: 0            # leave a writer out of the copy
  before_clone:           # optional: a Job in prod that runs first
    image: cassandra:5.0.9
    command: [sh, -c, "nodetool -h cassandra-0.cassandra.prod.svc.cluster.local flush"]
```

- Every bound PersistentVolumeClaim of the source on a GCE Persistent Disk
  (GKE's PD CSI driver) gets a clone of its disk. Compute Engine makes it in
  seconds, whatever the size, in the same zone. The branch then has a
  PersistentVolume for each clone and a claim of the source's name bound
  to it, so a copied StatefulSet takes its pods' claims over by name and
  starts on the source's data. A claim on any other volume (NFS,
  Filestore, a regional disk) makes the branch refuse, unless
  `other_claims: empty`, which gives the branch a new, empty claim of the
  same name, class and size instead.
- Each clone carries GCE labels saying which branch made it
  (`monk-owner`) and for which namespace. A disk of the clone's name that
  another branch made, or that an earlier delete of this one kept
  (`monk-kept`), is never used: the branch refuses before it writes
  anything, and says which. Clones left by a create that failed are the
  branch's own, and a create run again uses them.
- Deployments, StatefulSets, Services, ConfigMaps, Secrets,
  ServiceAccounts, Roles and RoleBindings are copied, without what the
  cluster set on the originals. A RoleBinding's service accounts of the
  source become the branch's; its other subjects stay as they are.
  ClusterRoleBindings are cluster-wide and not copied, so a service account
  that relies on one has no such rights in the branch. In their strings, `<name>.<source>.svc` becomes
  `<name>.<branch>.svc`. Short names (`db`) already resolve in the branch.
  Services lose their node ports, and LoadBalancer and NodePort Services
  become ClusterIP unless `expose: true`. With `isolate` on, an exposed
  Service also gets a NetworkPolicy that lets traffic from anywhere reach
  its pods on its target ports, and nothing else. `replicas` sets a workload's
  replicas in the copy.
- `isolate` (on by default) adds a NetworkPolicy so that the branch's pods
  take traffic only from each other and reach only each other and the
  cluster's DNS. `allow_egress` adds CIDRs. Copies of databases keep their
  original peers' addresses in their data (Cassandra's `system.peers`, a
  replica's primary) and would otherwise reach them. The cluster has to
  enforce NetworkPolicies (GKE Dataplane V2, Calico, Cilium).
- The clones are crash-consistent, as if the source's nodes had lost
  power at the same moment, and a database recovers them as it does after
  a crash. `before_clone` runs a Job in the source namespace first (a
  flush, a checkpoint), and the clones wait until it completes.
- Readiness waits until every cloned disk is ready and every copied
  workload has rolled out. `state.clone_seconds` and `state.ready_seconds`
  say how long the branch took, counted from when it was asked for.
- Deleting the branch deletes its namespace, then its volumes and its
  cloned disks, found by their labels in GCE, so a delete after a failed
  create removes the clones it made too. `keep_disks: true` keeps them and
  labels them `monk-kept`. Disks other branches made are left in place. The source namespace
  is only read, apart from the `before_clone` Job.
- Copying Roles needs the rights they grant, or the `escalate` and `bind`
  verbs on Roles and RoleBindings, as Kubernetes requires of anyone who
  creates them.
- The Monk cluster's GCP credentials clone and delete the disks. They need
  `compute.disks.create`, `compute.disks.get` and `compute.disks.delete`,
  and `compute.disks.useReadOnly` on the source disks.

### From a chart instead of the source's objects

With `manifest`, the branch runs the objects of a rendered manifest
instead of copies of the source's: the chart at a git branch, say, on a
copy of production's data. `helm/template` renders it:

```yaml
chart:
  defines: helm/template
  chart: oci://ghcr.io/acme/charts/app
  version: 0.1.0-3f2a9c1           # what CI pushed for the branch
  release: app                     # as production's release
  namespace: capsule-new-search
  values:
    image: {tag: 3f2a9c1}
    loadgen: {enabled: false}
  registry_secret: ghcr-token
  permissions:
    tasks: {max: 1}
    secrets: [ghcr-token]

branch:
  defines: k8s/branch
  source_namespace: prod
  namespace: capsule-new-search
  manifest: <- connection-target("chart") entity-state get-member("manifest")
  copy_secrets: [ghcr]             # the image pull secret, which the chart doesn't make
  connections:
    chart: {target: acme/chart}
  depends:
    wait-for: {runnables: [acme/chart]}
```

- Only the source's claims that the manifest's objects use are cloned:
  its PersistentVolumeClaims, and the `<template>-<statefulset>-<n>` claims
  of each StatefulSet's pods. A claim the source doesn't have starts empty.
  Charts that name objects by release need the same release name as
  production for their claims to match.
- Each object is put in the branch's namespace with the same Service and
  `replicas` rules as a copy. Cluster-scoped objects, Helm test hooks and
  the claims bound to clones are left out.
- An update with a new manifest (a later push) applies it on the same
  clones: the data stays as it was branched, the objects follow the
  manifest. Objects the new manifest no longer has are not deleted.

## Tests

```bash
monk entity test src/k8s              # offline, against test/fake-kube.ts
monk entity test --explore src/k8s    # with faults injected
```

`test/k8s.e2e.ts` runs a cluster, an app and a Monk runnable that reaches it
on a real Monk cluster and kind; its header says how.
