# Importing an app from EKS

A demo of `monk import k8s` on a real cluster. An app is deployed the way a
team without Monk would deploy it, with Helm and kubectl. Monk maps it
without redeploying or changing it, then notices when the team changes it.

Everything runs with the Monk cluster's AWS credentials; no kubeconfig and
no local AWS CLI. It costs about $0.20 an hour while up (an EKS control plane
and two t3.medium nodes in us-east-1).

| File | What it is |
| --- | --- |
| `cluster.yaml` | The EKS cluster `import-demo`: VPC, subnets, IAM roles, cluster, node group. |
| `seed.yaml` | The "other team": a Job with cluster-admin installs podinfo and its Redis cache with Helm (release `web`), and a worker with its ConfigMap and Secret with kubectl, into namespace `shop`. |
| `change.yaml` | A change made outside Monk: `helm upgrade` to 3 replicas, `kubectl set image` on the worker, and the worker's ConfigMap deleted. |
| `shop.generated.yaml` | What `monk import k8s` wrote from that namespace, for reference. |

Load the packages first (see `src/aws-eks/README.md`, "Before you run it").

## 1. The cluster and the app

```bash
monk load cluster.yaml seed.yaml change.yaml
monk run eks-import-demo/cluster      # 15 to 20 minutes
monk run eks-import-demo/seed         # then wait for the Job:
monk do eks-import-demo/seed/status   # "Job import-seed/seed: ready"
```

## 2. The import

```bash
monk import k8s -n shop --eks-cluster import-demo --eks-region us-east-1 --as shop -o shop.yaml
```

The template has 8 objects. Helm's five sit in a `release-web` group and
the worker's three at the top level. The Secret has no values, and the
cluster's own objects (Helm's release Secret, the `default` ServiceAccount)
are left out.

```bash
monk load shop.yaml
monk run shop/stack
```

Each entity is in `mode: observe`: it reads its object, never writes it,
and a cron refreshes it every two minutes.

## 3. A change Monk didn't make

```bash
monk run eks-import-demo/change
```

Within one refresh (two minutes), the entities record what happened:

```bash
monk repl --runnable shop/deployment-web-podinfo -c 'entity-state get-member("changes")'
#   Deployment shop/web-podinfo: replicas=2 ... -> replicas=3 ...
monk repl --runnable shop/deployment-worker -c 'entity-state get-member("changes")'
#   Deployment shop/worker: replicas=1 images=busybox:1.37 -> replicas=1 images=busybox:1.36
monk repl --runnable shop/configmap-worker-settings -c 'entity-state get-member("changes")'
#   ConfigMap shop/worker-settings: gone
```

The Redis Deployment, which nobody touched, records nothing.

## Tearing it down

Deleting the imported stack only makes Monk forget the objects; the
cluster going takes the app with it. Nothing in it makes a load balancer,
so the VPC deletes cleanly.

```bash
monk delete --force shop/stack eks-import-demo/change eks-import-demo/seed
monk delete --force eks-import-demo/cluster
```
