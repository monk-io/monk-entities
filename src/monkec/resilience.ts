/**
 * Small helpers for the failures every API has: requests that time out or
 * get rate limited, creates whose response is lost, deletes of things
 * already gone. Each is a plain function an entity can use, or not; none
 * needs a particular client or base class.
 *
 * They tell failures apart by the HttpError HttpClient throws: an Error
 * whose properties say how the request failed (see httpFailure). Other
 * clients can throw errors with the same properties to get the same help.
 */
import cli from "cli";

/** How a request failed, as HttpClient's errors say. */
export interface HttpFailure {
    /** The status the API answered with; 0 if no answer came. */
    status: number;
    /**
     * "status": the API answered with an error status; "transport": no
     * answer came; "malformed": the answer wasn't what the API sends.
     */
    kind: "status" | "transport" | "malformed";
    method: string;
    url: string;
    /** The response body, if any. */
    body: string;
    headers: Record<string, string>;
}

/** How a request that threw err failed, if err is a failed request. */
export function httpFailure(err: unknown): HttpFailure | undefined {
    if (typeof err !== "object" || err === null) return undefined;
    const e = err as any;
    if (typeof e.status !== "number" || typeof e.kind !== "string") return undefined;
    return e as HttpFailure;
}

/** A response header of f, by name in any case. */
function header(f: HttpFailure, name: string): string | undefined {
    const want = name.toLowerCase();
    for (const k of Object.keys(f.headers ?? {})) {
        if (k.toLowerCase() === want) return f.headers[k];
    }
    return undefined;
}

/** Methods that do the same however often they're sent. */
const IDEMPOTENT = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"];

/**
 * Statuses that say the API refused the request without carrying it out,
 * and that it may take it later: rate limited, unavailable, locked by an
 * operation in progress.
 */
const REFUSED = [423, 429, 503];

/**
 * Whether err leaves it unknown if the API carried the request out: no
 * response came, the API failed midway, or its answer was garbled.
 */
export function isAmbiguous(err: unknown): boolean {
    const f = httpFailure(err);
    if (f === undefined) return false;
    return f.kind === "transport" || f.kind === "malformed" || f.status === 500 || f.status === 502 || f.status === 504;
}

/**
 * Whether a request with method that failed with err is safe and worth
 * sending again: the API refused it for now, or it failed in a way that
 * may have left it done but the method makes doing it again harmless.
 * A POST that may have been carried out is not: sending it again can
 * create a second thing (use ensureCreated).
 */
export function isRetryable(err: unknown, method: string): boolean {
    const f = httpFailure(err);
    if (f === undefined) return false;
    if (f.kind === "status" && REFUSED.indexOf(f.status) >= 0) return true;
    return isAmbiguous(err) && IDEMPOTENT.indexOf(method.toUpperCase()) >= 0;
}

/** How retry tries again. */
export interface RetryOptions {
    /** Attempts in all, the first included (default 5). */
    attempts?: number;
    /** The wait before the second attempt; it doubles after (default 1000). */
    delayMs?: number;
    /** The longest wait between two attempts (default 30000). */
    maxDelayMs?: number;
    /**
     * The longest all waits together may take (default 120000), so retrying
     * ends well within a step's time and the next reconcile takes over.
     */
    budgetMs?: number;
    /** Which errors to retry; by default none. See isRetryable. */
    when?: (err: unknown) => boolean;
    /** What the retries are of, for the messages they print. */
    what?: string;
}

/**
 * Calls fn until it returns, retrying the errors opts.when accepts, with
 * waits that double, or that the API asks for with Retry-After:
 *
 * ```typescript
 * const order = retry(() => client.get(`/orders/${id}`).data, {
 *     when: (e) => isRetryable(e, "GET"),
 *     what: "reading the order",
 * });
 * ```
 */
export function retry<T>(fn: () => T, opts: RetryOptions = {}): T {
    const attempts = opts.attempts ?? 5;
    const maxDelay = opts.maxDelayMs ?? 30000;
    let budget = opts.budgetMs ?? 120000;
    let delay = opts.delayMs ?? 1000;
    for (let attempt = 1; ; attempt++) {
        try {
            return fn();
        } catch (err) {
            if (attempt >= attempts || opts.when === undefined || !opts.when(err)) throw err;
            const wait = Math.min(retryAfter(err) ?? delay, maxDelay);
            if (wait > budget) throw err;
            budget -= wait;
            delay = Math.min(delay * 2, maxDelay);
            const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
            cli.output(`${opts.what ?? "request"} failed (${why}); retrying in ${wait / 1000}s (${attempt}/${attempts - 1})`);
            sleep(wait);
        }
    }
}

/** The wait err's Retry-After header asks for, in milliseconds. */
function retryAfter(err: unknown): number | undefined {
    const f = httpFailure(err);
    if (f === undefined) return undefined;
    const v = header(f, "Retry-After");
    if (v === undefined) return undefined;
    const seconds = Number(v);
    if (!isNaN(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(v);
    return isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/** What ensureCreated needs. */
export interface EnsureCreated<T> {
    /** Looks the thing up, as the create would name it; nothing if absent. */
    find: () => T | undefined | null;
    /** Creates the thing. */
    create: () => T;
    /** How often to look again after a create that may have worked (default 3). */
    verifyAttempts?: number;
    /** How long to wait before each look (default 2000). */
    verifyDelayMs?: number;
    /** What the thing is, for messages. */
    what?: string;
}

/** What ensureCreated found or made. */
export interface Ensured<T> {
    resource: T;
    /**
     * Whether it existed before this call: someone else's, which the entity
     * should leave in place when it is deleted.
     */
    adopted: boolean;
}

/**
 * Creates a thing unless it exists, without creating it twice when a
 * create's response is lost. It looks first; then creates; and if the
 * create fails in a way that leaves unknown whether it worked (isAmbiguous),
 * looks again before giving up. What it finds then didn't exist when it
 * started, so it is the entity's own.
 *
 * find must find what create makes, by a name or key the entity chose;
 * for things the API names itself, there is nothing to look for.
 */
export function ensureCreated<T>(spec: EnsureCreated<T>): Ensured<T> {
    const what = spec.what ?? "resource";
    const existing = spec.find();
    if (existing !== undefined && existing !== null) {
        cli.output(`${what} already exists; using it`);
        return { resource: existing, adopted: true };
    }
    try {
        return { resource: spec.create(), adopted: false };
    } catch (err) {
        if (!isAmbiguous(err)) throw err;
        const attempts = spec.verifyAttempts ?? 3;
        for (let i = 0; i < attempts; i++) {
            sleep(spec.verifyDelayMs ?? 2000);
            let found: T | undefined | null = undefined;
            try {
                found = spec.find();
            } catch (_e) {
                continue; // the API is still failing; look again
            }
            if (found !== undefined && found !== null) {
                cli.output(`creating ${what} failed midway, but it was created`);
                return { resource: found, adopted: false };
            }
        }
        throw err;
    }
}

/**
 * Deletes a thing with del, which counts as done if the thing is already
 * gone (404 or 410): deleted elsewhere, or by an earlier attempt whose
 * response was lost. Returns whether this call deleted it.
 */
export function deleteIfExists(del: () => void): boolean {
    try {
        del();
        return true;
    } catch (err) {
        const f = httpFailure(err);
        if (f !== undefined && (f.status === 404 || f.status === 410)) return false;
        throw err;
    }
}
