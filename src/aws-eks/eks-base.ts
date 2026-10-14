import { MonkEntity } from "monkec/base";
import { retry, isRetryable, httpFailure } from "monkec/resilience";
import aws from "cloud/aws";
import cli from "cli";

/**
 * Where an EKS resource lives.
 * @interface EKSDefinition
 */
export interface EKSDefinition {
    /**
     * @description AWS region, e.g. us-east-1
     */
    region: string;
}

/**
 * The AWS error type of a failed EKS request, e.g. ResourceNotFoundException;
 * undefined for anything else.
 */
export function awsErrorType(err: unknown): string | undefined {
    const code = (err as any)?.code;
    return typeof code === "string" ? code : undefined;
}

/** Whether err says the thing asked for does not exist. */
export function isNotFound(err: unknown): boolean {
    return httpFailure(err)?.status === 404 || awsErrorType(err) === "ResourceNotFoundException";
}

/** The tag that says which Monk entity made a resource. */
export const OWNER_TAG = "monk.io/owner";

/** A token that makes AWS carry out a create once however often it is sent. */
export function requestToken(): string {
    return `monk-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** o without its undefined fields, for request bodies. */
export function defined<T extends object>(o: T): T {
    const out: any = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
    return out;
}

/**
 * A map of strings, such as tags or labels, as given: Monk keeps a
 * definition's maps as a tree, so a key with slashes
 * (kubernetes.io/cluster/shop) comes back nested, and is joined up here.
 */
export function flatStrings(m: Record<string, any> | undefined, prefix = ""): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(m ?? {})) {
        const key = prefix ? `${prefix}/${k}` : k;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatStrings(v, key));
        else if (v !== undefined && v !== null) out[key] = String(v);
    }
    return out;
}

/** Whether two lists hold the same strings, in any order. */
export function sameSet(a: string[] | undefined, b: string[] | undefined): boolean {
    const x = [...(a ?? [])].sort();
    const y = [...(b ?? [])].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * Base for EKS entities: requests to the EKS API, signed with the Monk
 * cluster's AWS credentials.
 */
export abstract class EKSEntity<D extends EKSDefinition, S extends object> extends MonkEntity<D, S> {
    /**
     * Sends one request to the EKS API and returns its JSON. A failure is
     * thrown as an Error that monkec/resilience understands, with the AWS
     * error type as code.
     */
    protected request(method: string, path: string, body?: unknown): any {
        const region = this.definition.region;
        if (!region) throw new Error("region is required");
        const url = `https://eks.${region}.amazonaws.com${path}`;
        const opts: any = { method, service: "eks", region, headers: { "Content-Type": "application/json" } };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const resp = aws.do(url, opts);
        if (!resp.statusCode) throw failure(`EKS ${method} ${path} failed: ${resp.error ?? "no response"}`, "transport", 0, method, url, "", {});
        if (resp.statusCode >= 300) {
            const headers = resp.headers ?? {};
            let message = "";
            let type = headerValue(headers, "x-amzn-errortype")?.split(":")[0];
            try {
                const parsed = JSON.parse(resp.body || "{}");
                message = parsed.message ?? parsed.Message ?? "";
                type = type || parsed.__type;
            } catch (_e) {
                message = (resp.body || "").slice(0, 200);
            }
            const err = failure(`EKS ${method} ${path} failed: ${resp.statusCode}${type ? ` ${type}` : ""}${message ? `: ${message}` : ""}`, "status", resp.statusCode, method, url, resp.body ?? "", headers);
            if (type) err.code = type;
            throw err;
        }
        if (!resp.body) return {};
        try {
            return JSON.parse(resp.body);
        } catch (_e) {
            throw failure(`EKS ${method} ${path} answered with a body that is not JSON`, "malformed", resp.statusCode, method, url, resp.body, resp.headers ?? {});
        }
    }

    /**
     * Sends a request, retrying what is safe to retry. A create that sends
     * a clientRequestToken is safe to send again, so idempotent says so.
     */
    protected send(what: string, method: string, path: string, body?: unknown, idempotent = false): any {
        const as = idempotent ? "PUT" : method;
        return retry(() => this.request(method, path, body), { when: (e) => isRetryable(e, as), what, budgetMs: 20000 });
    }

    /** GETs path; null when it is not found. */
    protected find(what: string, path: string): any | null {
        try {
            return this.send(what, "GET", path);
        } catch (err) {
            if (isNotFound(err)) return null;
            throw err;
        }
    }

    /** DELETEs path; false when it was already gone. */
    protected remove(what: string, path: string): boolean {
        try {
            this.send(what, "DELETE", path);
            return true;
        } catch (err) {
            if (isNotFound(err)) {
                cli.output(`${what}: already gone`);
                return false;
            }
            throw err;
        }
    }
}

function failure(message: string, kind: string, status: number, method: string, url: string, body: string, headers: Record<string, string>): any {
    const err: any = new Error(message);
    err.kind = kind;
    err.status = status;
    err.method = method;
    err.url = url;
    err.body = body;
    err.headers = headers;
    return err;
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
    for (const k of Object.keys(headers)) if (k.toLowerCase() === name) return headers[k];
    return undefined;
}
