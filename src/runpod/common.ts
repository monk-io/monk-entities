import secret from "secret";

/**
 * RunPod REST API v2 base URL.
 *
 * RunPod's docs state: "REST API v1 is in maintenance mode and is no longer being
 * actively developed. For new integrations, use REST API v2." v2 is in public beta —
 * "endpoints and behavior may change before general availability" — so every path used
 * by this package is centralized here and in runpod-base.ts.
 */
export const BASE_URL = "https://api.runpod.io/v2";

/** Default secret name holding the RunPod API key. */
export const DEFAULT_SECRET_REF = "runpod-api-token";

/** Billable hours in a month, used to convert hourly rates to monthly estimates. */
export const HOURS_PER_MONTH = 730;

/**
 * Pod lifecycle states reported by the API.
 * RUNNING is the only ready state; ERROR is terminal and must fail fast.
 */
export type PodStatus =
    | "PROVISIONING"
    | "STARTING"
    | "RUNNING"
    | "EXITED"
    | "ERROR"
    | "TERMINATED";

/** Actions accepted by `POST /v2/pods/{id}/actions`. */
export type PodAction = "start" | "stop" | "restart" | "terminate";

/** Network volume storage tiers. Omitting it uses the data center default. */
export type VolumeType = "STANDARD" | "HIGH_PERFORMANCE";

/** Cloud tier: RunPod-owned hardware vs community-hosted. */
export type Cloud = "SECURE" | "COMMUNITY";

/**
 * Retrieve the RunPod API key from Monk secrets.
 */
export function getApiToken(secretRef: string): string {
    const token = secret.get(secretRef);
    if (!token) {
        throw new Error(
            `Failed to retrieve RunPod API token from secret: ${secretRef}. ` +
            `Add it with: monk secrets add -g ${secretRef}=<your-api-key>`
        );
    }
    return token;
}

/**
 * Keys whose values are user-supplied maps and must be passed through untouched.
 *
 * Only genuine free-form maps belong here — converting them would rewrite keys the user
 * chose. `mounts` is deliberately **not** in this list: despite being an object, its keys are
 * a fixed API schema (`network[].volumeId`, `persistent.size`) that must be camelCased like
 * any other, and treating it as opaque sends `volume_id` and gets a 422.
 */
const OPAQUE_KEYS = ["env", "port_mappings", "portMappings"];

function snakeToCamel(key: string): string {
    let out = "";
    let upperNext = false;
    for (let i = 0; i < key.length; i++) {
        const ch = key.charAt(i);
        if (ch === "_") {
            upperNext = true;
            continue;
        }
        out += upperNext ? ch.toUpperCase() : ch;
        upperNext = false;
    }
    return out;
}

/**
 * Recursively convert a snake_case definition object into the camelCase shape the
 * RunPod v2 API expects.
 *
 * Entities build request bodies in snake_case (matching their Definition) and pass them
 * through this function, so the naming convention lives in exactly one place. Keys listed
 * in OPAQUE_KEYS keep their values verbatim — `env` holds user-chosen variable names that
 * must not be rewritten. `undefined` values are dropped so optional fields are omitted
 * rather than sent as null.
 */
export function toApiBody(input: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key in input) {
        const value = input[key];
        if (value === undefined || value === null) continue;

        const apiKey = snakeToCamel(key);

        if (OPAQUE_KEYS.indexOf(key) !== -1) {
            out[apiKey] = value;
            continue;
        }

        if (Array.isArray(value)) {
            out[apiKey] = value.map((item) =>
                item && typeof item === "object" && !Array.isArray(item)
                    ? toApiBody(item as Record<string, any>)
                    : item
            );
            continue;
        }

        if (typeof value === "object") {
            const nested = toApiBody(value as Record<string, any>);
            // Drop objects that ended up empty so we don't send `{}` and trip
            // PATCH's "omitting or sending {} leaves unchanged" semantics by accident.
            if (Object.keys(nested).length > 0) out[apiKey] = nested;
            continue;
        }

        out[apiKey] = value;
    }
    return out;
}

/**
 * Validate a network volume size against the API's documented 10–4096 GB range.
 * Checked locally because the failure is cheap to catch and the API error is opaque.
 */
export function validateVolumeSize(size: number): number {
    if (!size || size < 10 || size > 4096) {
        throw new Error(
            `Invalid network volume size: ${size} GB. RunPod accepts 10–4096 GB.`
        );
    }
    return size;
}

/**
 * Pull the payload array out of a RunPod list response.
 *
 * v2 wraps every collection in a single named key rather than a common envelope:
 * `{"pods":[…]}`, `{"networkVolumes":[…]}`, `{"templates":[…]}`, `{"gpus":[…]}`,
 * `{"cpus":[…]}`, `{"dataCenters":[…]}`, and `{"metadata":{…},"records":[…]}` for billing.
 * Rather than hardcoding each name, take the first array-valued property — which is correct
 * for all of them and survives v2 renaming a key while it is still in beta.
 */
export function extractList(response: any): any[] {
    if (Array.isArray(response)) return response;
    if (!response || typeof response !== "object") return [];

    for (const key in response) {
        if (Array.isArray(response[key])) return response[key];
    }
    return [];
}

/**
 * A GPU entry from `GET /v2/catalog/gpus`, including live hourly pricing.
 * `price` is per GPU per hour.
 */
export interface CatalogGpu {
    id: string;
    name?: string;
    manufacturer?: string;
    memory?: number;
    secure?: boolean;
    community?: boolean;
    /** Max attachable count, split by pool — not a flat number. */
    maxCount?: {
        secure?: number;
        community?: number;
    };
    price?: {
        secure?: number;
        community?: number;
        serverless?: number;
    };
}

/**
 * A CPU flavor from `GET /v2/catalog/cpus`.
 *
 * Note the pricing unit: CPU flavors bill **per vCPU per hour**, so an hourly rate is
 * `securePerVcpu × vcpuCount` — unlike GPUs, whose price is already per unit.
 * IDs are short group names such as `cpu3c`, `cpu5g` — not size-suffixed slugs.
 */
export interface CatalogCpu {
    id: string;
    name?: string;
    group?: string;
    ramGbPerVcpu?: number;
    vcpu?: {
        min?: number;
        max?: number;
    };
    price?: {
        securePerVcpu?: number;
        serverlessPerVcpu?: number;
    };
}
