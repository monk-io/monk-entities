import { NamedObjects, NamedDefinition, NamedState } from "./named.ts";

/**
 * @description A Namespace (k8s/kube-namespace: `namespace` is a word Monk templates keep for themselves).
 * Makes a Namespace, named after the entity unless name says otherwise.
 * Deleting the entity deletes the Namespace and everything in it.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` or `token_secret`
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name` - the Namespace, to wire into other k8s entities' namespace
 */
export class KubeNamespace extends NamedObjects<NamedDefinition, NamedState> {
    protected kind(): string {
        return "Namespace";
    }

    protected build(name: string): any[] {
        return [{ apiVersion: "v1", kind: "Namespace", metadata: { name } }];
    }
}
