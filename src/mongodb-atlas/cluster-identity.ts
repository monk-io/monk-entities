/**
 * Pure helpers for recognising an existing MongoDB Atlas cluster: the HTTP status of a
 * failed request, the owner tag this entity stamps on clusters it creates, and the
 * live tier family / provider / region of a cluster record.
 */

/** Tag key stamped on clusters this entity creates; the value is the Monk entity path. */
export const OWNER_TAG_KEY = "monk-entity-path";

/** Atlas resource tag values are 1-255 characters. */
const TAG_MAX_LENGTH = 255;

export type TierFamily = "free" | "flex" | "dedicated";

/**
 * HTTP status carried by an error from MongoDBAtlasEntity.makeRequest
 * ("... MongoDB Atlas API error: 404 ..."), or null when the request never got an
 * HTTP response (network failure, timeout) or the message has another shape.
 */
export function atlasErrorStatus(error: unknown): number | null {
    const message = error instanceof Error ? error.message : String(error);
    const match = /API error: (\d{3})\b/.exec(message);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Owner tag value for a Monk entity path, or null when the path is empty (an entity that
 * cannot name itself must not claim anything). Atlas tag values allow only letters,
 * digits, spaces and `;@_-.+`, so `/` becomes `+` and any other character becomes `_`.
 */
export function ownerTagValue(path: string | undefined): string | null {
    if (!path) {
        return null;
    }
    const value = path.replace(/\//g, "+").replace(/[^A-Za-z0-9 ;@_.+-]/g, "_");
    return value.substring(0, TAG_MAX_LENGTH);
}

/**
 * Who a live cluster belongs to, judged by its tags: "owned" when it carries this
 * entity's owner tag, "foreign" when it carries another entity's, "untagged" otherwise.
 */
export function clusterOwnership(tags: unknown, expectedValue: string | null): "owned" | "foreign" | "untagged" {
    const list: any[] = Array.isArray(tags) ? tags : [];
    const tag = list.find((t) => t && t.key === OWNER_TAG_KEY);
    if (!tag) {
        return "untagged";
    }
    return expectedValue !== null && tag.value === expectedValue ? "owned" : "foreign";
}

/** The shape of a cluster that decides whether a definition may adopt it. */
export interface ClusterShape {
    family?: TierFamily;
    provider?: string;
    region?: string;
    /** Only meaningful for dedicated clusters. */
    instanceSize?: string;
}

/**
 * Read the shape off a cluster record. `fromFlexEndpoint` is true when the record came
 * from /flexClusters. On /clusters, M0 reports providerName "TENANT" (the cloud is in
 * backingProviderName) and a Flex cluster, where it appears at all, reports "FLEX".
 */
export function liveClusterShape(cluster: any, fromFlexEndpoint: boolean): ClusterShape {
    if (fromFlexEndpoint) {
        return {
            family: "flex",
            provider: cluster?.providerSettings?.backingProviderName,
            region: cluster?.providerSettings?.regionName,
        };
    }
    const regionConfig = cluster?.replicationSpecs?.[0]?.regionConfigs?.[0];
    const providerName: string | undefined = regionConfig?.providerName;
    if (providerName === "TENANT" || providerName === "FLEX") {
        return {
            family: providerName === "TENANT" ? "free" : "flex",
            provider: regionConfig?.backingProviderName,
            region: regionConfig?.regionName,
        };
    }
    return {
        family: providerName ? "dedicated" : undefined,
        provider: providerName,
        region: regionConfig?.regionName,
        instanceSize: regionConfig?.electableSpecs?.instanceSize,
    };
}

/**
 * Differences that make adopting a live cluster wrong: a different tier family, cloud
 * provider or region. A field the live record doesn't carry counts as a mismatch, since
 * adopting a cluster whose shape can't be confirmed is exactly what this guards against.
 * Instance size within the dedicated family is reported separately (see
 * instanceSizeDiffers), because an owned cluster can be resized in place.
 */
export function shapeMismatches(desired: ClusterShape, live: ClusterShape): string[] {
    const out: string[] = [];
    if (desired.family !== live.family) {
        out.push(`tier family (definition ${desired.family}, live ${live.family ?? "unknown"})`);
    }
    if (desired.provider !== live.provider) {
        out.push(`provider (definition ${desired.provider}, live ${live.provider ?? "unknown"})`);
    }
    if (desired.region !== live.region) {
        out.push(`region (definition ${desired.region}, live ${live.region ?? "unknown"})`);
    }
    return out;
}

/** True when both are dedicated and the live instance size is known and differs. */
export function instanceSizeDiffers(desired: ClusterShape, live: ClusterShape): boolean {
    return desired.family === "dedicated" && live.family === "dedicated"
        && live.instanceSize !== undefined && desired.instanceSize !== live.instanceSize;
}
