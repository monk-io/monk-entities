# helm

`helm/template` renders a Helm chart with `helm template` in a container
that Monk runs to completion (the `tasks` module), and keeps the manifest
in its state. Nothing is installed and the cluster isn't touched: another
entity applies the result, such as `k8s/branch` with `manifest`
(see the k8s package's README).

```yaml
chart:
  defines: helm/template
  chart: oci://ghcr.io/acme/charts/app   # or a name with repo:, or a .tgz URL
  version: 0.1.0
  release: app
  namespace: staging
  values: {replicas: 2}
  registry_secret: ghcr-token            # "user:password", or a token alone
  permissions:
    tasks: {max: 1}
    secrets: [ghcr-token]
```

- `state.manifest` is the rendered YAML, up to 512 KiB.
- An update with a new chart, version or values renders again; the old
  manifest stays in the state until the new one is ready.
- Inputs reach the container as environment variables and a values file,
  never as part of the script it runs.
- Needs a Monk node with a container engine, on a monkd that has the
  `tasks` module.

## Tests

```bash
monk entity test src/helm
```

The tests cover the task spec and how a run's result is read. The tasks
module has no fake, so the entity itself is tested on a live cluster.
