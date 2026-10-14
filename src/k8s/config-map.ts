import { NamedObjects, NamedDefinition, NamedState, strings } from "./named.ts";

/**
 * Settings, as a ConfigMap.
 * @interface ConfigMapDefinition
 */
export interface ConfigMapDefinition extends NamedDefinition {
    /**
     * @description The settings: key to value
     */
    data: Record<string, string>;
}

/**
 * @description A ConfigMap.
 * Keeps settings in a ConfigMap. Values may come from other entities'
 * state through ArrowScript, so pods on the cluster can read what Monk
 * knows, such as a database's address.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` or `token_secret`
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name`, `state.namespace` - the ConfigMap
 */
export class ConfigMap extends NamedObjects<ConfigMapDefinition, NamedState> {
    protected kind(): string {
        return "ConfigMap";
    }

    protected build(name: string): any[] {
        return [{ apiVersion: "v1", kind: "ConfigMap", metadata: { name }, data: strings(this.definition.data) }];
    }
}
