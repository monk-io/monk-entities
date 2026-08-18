import { MonkEntity } from "monkec/base";
export { action } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import {
    BASE_URL,
    DEFAULT_SECRET_REF,
    getApiToken,
    extractList,
    listKeyForPath,
    type CatalogGpu,
    type CatalogCpu,
} from "./common.ts";
import cli from "cli";

/**
 * Base definition shared by all RunPod entities.
 */
export interface RunpodEntityDefinition {
    /** @description Secret reference holding the RunPod API key. Defaults to `runpod-api-token`. */
    secret_ref?: string;
}

/**
 * Base state shared by all RunPod entities.
 */
export interface RunpodEntityState {
    /** @description True when the resource already existed and was adopted rather than created */
    existing?: boolean;
}

/**
 * Base class for RunPod entities.
 *
 * Owns the three things every RunPod entity needs: a Bearer-authenticated HttpClient,
 * a single request path that surfaces API error bodies verbatim, and the read-only
 * catalog/billing helpers the cost actions depend on.
 *
 * v2 is in public beta, so all URL construction is confined to this class — an upstream
 * path or auth change is a one-file fix rather than a sweep across every entity.
 */
export abstract class RunpodEntity<
    D extends RunpodEntityDefinition,
    S extends RunpodEntityState
> extends MonkEntity<D, S> {
    protected apiToken!: string;
    protected httpClient!: HttpClient;

    protected override before(): void {
        const secretRef = this.definition.secret_ref || DEFAULT_SECRET_REF;
        this.apiToken = getApiToken(secretRef);

        this.httpClient = new HttpClient({
            baseUrl: BASE_URL,
            headers: {
                Authorization: `Bearer ${this.apiToken}`,
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            parseJson: true,
            stringifyJson: true,
        });
    }

    /** Display name used in log output and error messages. */
    protected abstract getEntityName(): string;

    /**
     * Make an authenticated request, throwing on non-2xx with the response body included.
     *
     * The body matters more than usual on RunPod: a pod create can fail purely because the
     * requested GPU is sold out, and only the body distinguishes that from a real bug.
     */
    protected makeRequest(method: string, path: string, body?: any, query?: Record<string, string>): any {
        const response = this.httpClient.request(method as any, path, { body, query });

        if (!response.ok) {
            const error = new Error(
                `RunPod API error (${method} ${path}): ${response.statusCode} — ${this.describeError(response)}`
            );
            // Carry the status structurally. Classifying by substring is unsafe because the
            // message embeds the API's error body — a 500 whose body happens to mention "404"
            // would otherwise be misread as "the resource is gone".
            (error as any).statusCode = response.statusCode;
            throw error;
        }

        let data = response.data;
        if (typeof data === "string" && data.length > 0) {
            try {
                data = JSON.parse(data);
            } catch {
                // Non-JSON body (e.g. log streams) — hand back the raw string.
            }
        }
        return data;
    }

    /**
     * Extract a useful message from an error response, falling back to the raw body.
     */
    private describeError(response: any): string {
        let data = response.data;
        if (typeof data === "string") {
            try {
                data = JSON.parse(data);
            } catch {
                return data || response.raw || "no response body";
            }
        }
        if (data && typeof data === "object") {
            if (data.message) return String(data.message);
            if (data.error) return String(data.error);
            return JSON.stringify(data);
        }
        return response.raw || "no response body";
    }

    /**
     * GET a resource, returning null when it does not exist.
     * Used for the detect-then-create path in every entity.
     */
    protected findResource(path: string): any | null {
        try {
            return this.makeRequest("GET", path);
        } catch (error) {
            if (this.isNotFound(error)) return null;
            throw error;
        }
    }

    /**
     * True when an error represents a missing resource rather than a real failure.
     *
     * Keyed off the status code attached by makeRequest(), never off the message text: the
     * message contains the API's error body, so a 5xx whose body mentions "404" must not be
     * treated as "gone" — that would turn a transient outage into a silent adopt-or-skip.
     */
    protected isNotFound(error: unknown): boolean {
        const status = (error as any)?.statusCode;
        if (typeof status === "number") return status === 404;

        // Errors raised before a response exists (transport failures) carry no status. Those
        // are real failures, not missing resources.
        return false;
    }

    /**
     * Find a resource by name in a list endpoint.
     *
     * RunPod IDs are server-generated, so adoption has to match on the user-supplied name.
     * Also covers the case where `GET /{path}/{id}` is unavailable (`rules.md:57`).
     */
    protected findByName(listPath: string, name: string): any | null {
        const response = this.findResource(listPath);
        if (!response) return null;

        for (const item of extractList(response, listKeyForPath(listPath))) {
            if (item && item.name === name) return item;
        }
        return null;
    }

    /**
     * Delete a resource, tolerating one that is already gone.
     *
     * Idempotent teardown matters here — a leaked pod keeps billing, so delete must never
     * abort a stack teardown just because the resource vanished out of band.
     */
    protected deleteResource(path: string, label: string): void {
        try {
            this.makeRequest("DELETE", path);
            cli.output(`🗑️  Deleted ${label}`);
        } catch (error) {
            if (this.isNotFound(error)) {
                cli.output(`${label} was already gone`);
                return;
            }
            throw error;
        }
    }

    /**
     * Live GPU pricing from `GET /v2/catalog/gpus`.
     * Returns an empty array on failure so cost actions degrade instead of throwing.
     */
    protected catalogGpus(): CatalogGpu[] {
        try {
            return extractList(this.makeRequest("GET", "/catalog/gpus"), "gpus") as CatalogGpu[];
        } catch (error) {
            cli.output(`⚠️  Could not fetch GPU catalog: ${(error as Error).message}`);
            return [];
        }
    }

    /** Look up a single GPU type's live pricing by catalog ID. */
    protected catalogGpu(gpuTypeId: string): CatalogGpu | null {
        for (const gpu of this.catalogGpus()) {
            if (gpu.id === gpuTypeId) return gpu;
        }
        return null;
    }

    /**
     * Live CPU flavor pricing from `GET /v2/catalog/cpus`.
     * Returns an empty array on failure so cost actions degrade instead of throwing.
     */
    protected catalogCpus(): CatalogCpu[] {
        try {
            return extractList(this.makeRequest("GET", "/catalog/cpus"), "cpus") as CatalogCpu[];
        } catch (error) {
            cli.output(`⚠️  Could not fetch CPU catalog: ${(error as Error).message}`);
            return [];
        }
    }

    /** Look up a single CPU flavor's live pricing by catalog ID (e.g. `cpu3c`). */
    protected catalogCpu(cpuFlavorId: string): CatalogCpu | null {
        for (const cpu of this.catalogCpus()) {
            if (cpu.id === cpuFlavorId) return cpu;
        }
        return null;
    }

    /**
     * Bucketed billing history, e.g. `billingHistory("network-volumes", 30)`.
     *
     * This is the only cost source for resources whose rate is not exposed anywhere in the
     * API (network volumes). Returns null on failure — a brand-new resource legitimately
     * has no history yet.
     */
    protected billingHistory(resource: string, lastN: number): any | null {
        try {
            return this.makeRequest("GET", `/billing/${resource}`, undefined, {
                lastN: String(lastN),
                bucketSize: "day",
            });
        } catch (error) {
            cli.output(`⚠️  Could not fetch billing history: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Billing records belonging to exactly one resource.
     *
     * A record **must** carry `idField` matching `id` to be included. Treating a record that
     * lacks the field as a match would be silently catastrophic: if v2 renames `podId` — a risk
     * this package explicitly accepts by targeting a beta API — every record in the account
     * would match, and the cost actions would report **account-wide 30-day spend as this one
     * resource's cost**. A wrong number that looks plausible is worse than no number, so an
     * unrecognized shape yields no records and the caller reports "unavailable" instead.
     */
    private matchingBillingRecords(billing: any, idField: string, id: string): any[] {
        const records: any[] = billing?.records || [];
        const matching = records.filter((r) => r && r[idField] === id);

        if (records.length > 0 && matching.length === 0) {
            const withField = records.filter((r) => r && r[idField] !== undefined).length;
            if (withField === 0) {
                cli.output(
                    `⚠️  Billing records carry no "${idField}" field — the API shape has changed. ` +
                    `Refusing to attribute account-wide spend to this resource.`
                );
            }
        }
        return matching;
    }

    /**
     * Sum billing amounts for one resource. Returns null when there is no usable history.
     */
    protected sumBillingRecords(billing: any, idField: string, id: string): number | null {
        const matching = this.matchingBillingRecords(billing, idField, id);
        if (matching.length === 0) return null;

        let total = 0;
        for (const record of matching) {
            // Records carry component amounts (cpuAmount/diskAmount/gpuAmount, or
            // standardAmount/highPerformanceAmount) plus a `totalAmount` rollup. Use the
            // rollup so a new component category is included automatically.
            const amount = Number(record.totalAmount ?? 0);
            if (!isNaN(amount)) total += amount;
        }
        return total;
    }

    /**
     * Count distinct time buckets for one resource.
     *
     * Not the same as `records.length`: the API returns one record per resource per bucket, so
     * an account with six pods over three days yields eighteen records but three buckets.
     * Dividing a per-resource total by the record count would understate the daily rate.
     */
    protected countBillingBuckets(billing: any, idField: string, id: string): number {
        const seen: string[] = [];

        for (const record of this.matchingBillingRecords(billing, idField, id)) {
            const bucket = String(record.startTime || "");
            if (bucket && seen.indexOf(bucket) === -1) seen.push(bucket);
        }
        return seen.length;
    }

    /** Emit the standardized `costs` JSON payload consumed by Monk's billing system. */
    protected emitCosts(costType: string, amount: string, error?: string): void {
        const month: Record<string, string> = { amount, currency: "USD" };
        if (error) month.error = error;
        cli.output(JSON.stringify({ type: costType, costs: { month } }));
    }
}
