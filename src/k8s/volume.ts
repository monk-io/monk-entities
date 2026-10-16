import { NamedObjects, NamedDefinition, NamedState } from "./named.ts";
import { ManagedObject } from "./objects.ts";
import { volumeObjects } from "./builders.ts";

/**
 * A volume pods can mount.
 * @interface VolumeDefinition
 */
export interface VolumeDefinition extends NamedDefinition {
    /**
     * @description Size, e.g. 10Gi
     */
    size: string;

    /**
     * @description Storage class (default: the cluster's default)
     */
    storage_class?: string;

    /**
     * @description ReadWriteOnce (default), ReadWriteMany, ReadOnlyMany or ReadWriteOncePod
     */
    access_mode?: string;

    /**
     * @description Delete the volume and its data when the entity is deleted (default false: it is kept, as Monk keeps a runnable's volumes)
     */
    delete_volumes?: boolean;
}

/**
 * @description A PersistentVolumeClaim: a volume pods can mount.
 * For a volume that several workloads share or that outlives them: mount
 * it with a k8s/deployment's volumes, as claim. The volume and its data are
 * kept when the entity is deleted unless delete_volumes is set; making the
 * entity again takes it back.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` or `token_secret`
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name` - the claim, for a workload's volumes.<name>.claim
 */
export class Volume extends NamedObjects<VolumeDefinition, NamedState> {
    protected kind(): string {
        return "PersistentVolumeClaim";
    }

    protected build(name: string): any[] {
        return volumeObjects(name, this.definition);
    }

    protected keeps(_o: ManagedObject): boolean {
        return !this.definition.delete_volumes;
    }
}
