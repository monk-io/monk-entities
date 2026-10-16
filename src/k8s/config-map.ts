import { NamedState } from "./named.ts";
import { ConfigMapObjects, ConfigMapDefinition } from "./builders.ts";

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
export class ConfigMap extends ConfigMapObjects<ConfigMapDefinition, NamedState> {}
