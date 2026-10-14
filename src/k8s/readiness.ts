/**
 * Whether a Kubernetes object is ready, by what its kind reports, the way
 * kubectl rollout status and Helm's --wait judge it.
 */
export interface Readiness {
    ready: boolean;
    /** Why it is not ready; empty when it is. */
    reason: string;
}

const READY: Readiness = { ready: true, reason: "" };

function waiting(reason: string): Readiness {
    return { ready: false, reason };
}

function condition(obj: any, type: string): any {
    const conditions: any[] = obj?.status?.conditions ?? [];
    return conditions.find((c: any) => c?.type === type);
}

function conditionTrue(obj: any, type: string): boolean {
    return condition(obj, type)?.status === "True";
}

function num(v: unknown, fallback = 0): number {
    return typeof v === "number" ? v : fallback;
}

/** Judges obj, as read from the cluster. */
export function readiness(obj: any): Readiness {
    if (obj === null || obj === undefined) return waiting("not found");
    const kind: string = obj.kind ?? "";
    const status = obj.status ?? {};
    const generation = obj.metadata?.generation;
    if (typeof generation === "number" && typeof status.observedGeneration === "number" && status.observedGeneration < generation) {
        return waiting(`generation ${generation} not observed yet`);
    }

    switch (kind) {
        case "Deployment": {
            const want = num(obj.spec?.replicas, 1);
            if (num(status.updatedReplicas) < want) return waiting(`${num(status.updatedReplicas)} of ${want} replicas updated`);
            if (num(status.replicas) > num(status.updatedReplicas)) return waiting(`${num(status.replicas) - num(status.updatedReplicas)} old replicas terminating`);
            if (num(status.availableReplicas) < want) return waiting(`${num(status.availableReplicas)} of ${want} replicas available`);
            return READY;
        }
        case "StatefulSet": {
            const want = num(obj.spec?.replicas, 1);
            if (num(status.readyReplicas) < want) return waiting(`${num(status.readyReplicas)} of ${want} replicas ready`);
            if (obj.spec?.updateStrategy?.type !== "OnDelete" && status.updateRevision && status.currentRevision !== status.updateRevision) {
                return waiting("rolling out a new revision");
            }
            return READY;
        }
        case "DaemonSet": {
            const want = num(status.desiredNumberScheduled);
            if (num(status.updatedNumberScheduled) < want) return waiting(`${num(status.updatedNumberScheduled)} of ${want} pods updated`);
            if (num(status.numberAvailable) < want) return waiting(`${num(status.numberAvailable)} of ${want} pods available`);
            return READY;
        }
        case "ReplicaSet":
        case "ReplicationController": {
            const want = num(obj.spec?.replicas, 1);
            return num(status.readyReplicas) >= want ? READY : waiting(`${num(status.readyReplicas)} of ${want} replicas ready`);
        }
        case "Job": {
            if (conditionTrue(obj, "Failed")) return waiting(`failed: ${condition(obj, "Failed")?.message ?? "no reason given"}`);
            return conditionTrue(obj, "Complete") ? READY : waiting("not complete");
        }
        case "Pod": {
            if (status.phase === "Succeeded") return READY;
            if (status.phase === "Failed") return waiting(`failed: ${status.reason ?? status.message ?? "no reason given"}`);
            return conditionTrue(obj, "Ready") ? READY : waiting(`phase ${status.phase ?? "unknown"}`);
        }
        case "Service": {
            if (obj.spec?.type !== "LoadBalancer") return READY;
            return (status.loadBalancer?.ingress ?? []).length > 0 ? READY : waiting("no load balancer address yet");
        }
        case "PersistentVolumeClaim":
            // Pending is fine: a claim whose storage class binds on first use
            // stays Pending until a pod mounts it.
            return status.phase === "Lost" ? waiting("volume lost") : READY;
        case "CustomResourceDefinition":
            return conditionTrue(obj, "Established") ? READY : waiting("not established");
        case "Namespace":
            return status.phase === undefined || status.phase === "Active" ? READY : waiting(`phase ${status.phase}`);
        case "APIService":
            return conditionTrue(obj, "Available") ? READY : waiting("not available");
    }

    // Anything else, custom resources included: a Ready condition, or an
    // Available one, if it reports one.
    for (const type of ["Ready", "Available"]) {
        const c = condition(obj, type);
        if (c) return c.status === "True" ? READY : waiting(`${type} is ${c.status}${c.message ? `: ${c.message}` : ""}`);
    }
    return READY;
}
