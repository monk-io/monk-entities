import secret from "secret";
import { NamedObjects, NamedDefinition, NamedState, strings } from "./named.ts";
import { ManagedObject } from "./objects.ts";

/**
 * Monk secrets, as a Kubernetes Secret.
 * @interface SecretDefinition
 */
export interface SecretDefinition extends NamedDefinition {
    /**
     * @description Keys filled from Monk secrets: key to secret name. List the secrets in permitted-secrets.
     */
    secrets?: Record<string, string>;

    /**
     * @description Keys with values given here
     */
    data?: Record<string, string>;

    /**
     * @description Secret type (default Opaque), e.g. kubernetes.io/tls or kubernetes.io/dockerconfigjson
     */
    secret_type?: string;

    /**
     * @description Leave the Secret on the cluster when the entity is deleted (default false)
     */
    keep?: boolean;
}

/**
 * @description A Secret filled from Monk secrets.
 * Copies Monk secrets into a Kubernetes Secret that pods can mount or read
 * as variables. The values are not kept in the entity's state. Re-applying
 * the entity copies the current values.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` or `token_secret`, and the secrets named in `secrets`
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name`, `state.namespace` - the Secret
 */
export class Secret extends NamedObjects<SecretDefinition, NamedState> {
    protected kind(): string {
        return "Secret";
    }

    protected build(name: string): any[] {
        const values: Record<string, string> = { ...strings(this.definition.data) };
        for (const [k, ref] of Object.entries(strings(this.definition.secrets))) values[k] = secret.get(ref);
        if (Object.keys(values).length === 0) throw new Error("a Secret needs secrets or data");
        return [{ apiVersion: "v1", kind: "Secret", metadata: { name }, type: this.definition.secret_type ?? "Opaque", stringData: values }];
    }

    protected keeps(_o: ManagedObject): boolean {
        return this.definition.keep === true;
    }
}
