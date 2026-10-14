# aws-eks

Amazon EKS clusters, made by Monk with its own AWS credentials, so the k8s
entities can use them straight away: no kubeconfig, no `aws eks
update-kubeconfig`. The AWS identity that creates a cluster is its admin,
and the k8s entities reach it as that identity with `eks_cluster` and
`eks_region`.

The package runs on Monk's TypeScript runtime (paserati); it is not built
with monkec.

## Entities

| Entity | What it does |
|---|---|
| `aws-eks/cluster` | The control plane. Ready when ACTIVE (10 to 15 minutes). Version upgrades and endpoint, network and logging changes are applied in place. Action: `status`. |
| `aws-eks/node-group` | A managed node group. Size, labels and version change in place. Action: `status`. |
| `aws-eks/addon` | An EKS add-on, e.g. `aws-ebs-csi-driver` for volumes. `service_account_roles` gives its service accounts IAM roles through EKS Pod Identity (with the `eks-pod-identity-agent` add-on); pods on managed nodes can not reach the node role. Add-ons that came with the cluster are left in place on delete. |
| `aws-eks/access-entry` | Lets an IAM user or role in with an EKS access policy, cluster-wide or for some namespaces. |

## One stack, from VPC to app

`example.yaml` makes everything an app on EKS needs, from an empty account:

```
aws-ec2/vpc ─┬─ aws-ec2/internet-gateway ─┐
             ├─ aws-ec2/subnet (a, b) ────┴─ aws-ec2/route-table
aws-iam/iam-role (cluster, nodes)
aws-eks/cluster ── aws-eks/node-group ── aws-eks/addon (EBS CSI)
k8s/cluster, k8s/resource (gp3 StorageClass), k8s/deployment (LoadBalancer)
```

```bash
monk load src/aws-eks/example.yaml
monk run aws-eks-example/stack
```

## How the entities behave

- **Creates are safe to retry.** Every create sends a `clientRequestToken`,
  so AWS carries it out once however often it is sent. Clusters and node
  groups are tagged `monk.io/owner` with the entity's path: one whose
  create response was lost is recognised as the entity's own. A cluster
  that exists and isn't the entity's is refused unless `adopt: true`; an
  adopted cluster is left in place on delete.
- **Updates converge.** EKS runs one update at a time. The entity starts
  the first change the cluster or node group needs, and its readiness
  check starts the next one when that is done. The entity is ready when
  everything matches its definition.
- **Deletes start, and AWS finishes.** An entity call may take a minute,
  so deletes don't wait. EKS refuses to delete a cluster while node groups
  are still being deleted. If so, the entity says so; run the delete again
  a few minutes later. The VPC can only go after the cluster.
- **Versions are strings.** Quote them (`version: "1.30"`); YAML reads
  1.30 as the number 1.3.
- **Tags and labels with slashes work.** Monk keeps a definition's maps as
  a tree, so `kubernetes.io/role/elb` comes back nested; the entities join
  it up again.

## Testing

```bash
monk entity test src/aws-eks             # against the fake EKS API in test/fake-eks.ts
monk entity test --explore src/aws-eks   # with faults injected
```
