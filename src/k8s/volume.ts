import { NamedState } from "./named.ts";
import { ManagedObject } from "./objects.ts";
import { VolumeObjects, VolumeDefinition } from "./builders.ts";

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
export class Volume extends VolumeObjects<VolumeDefinition, NamedState> {
    protected keeps(_o: ManagedObject): boolean {
        return !this.definition.delete_volumes;
    }
}
