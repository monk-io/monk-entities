/**
 * Helpers shared by the Compute Engine storage entities (compute-disk,
 * compute-snapshot): resource references, ownership labels and prices.
 */

import crypto from "crypto";
import { COMPUTE_API_URL } from "./common.ts";

/**
 * Label a disk or snapshot carries naming the Monk instance that created
 * it. A create whose response was lost leaves a resource the next run
 * finds; the label tells it apart from someone else's, which is adopted
 * and left in place.
 */
export const OWNER_LABEL = "monk-owner";

/** The OWNER_LABEL value for the instance at path. */
export function ownerLabel(path: string): string {
    return crypto.sha256(path).slice(0, 40);
}

/** The last segment of a resource URL or path ("…/diskTypes/pd-ssd" → "pd-ssd"). */
export function lastSegment(ref: string | undefined): string | undefined {
    if (!ref) return undefined;
    const parts = ref.split("/");
    return parts[parts.length - 1] || undefined;
}

/**
 * A full Compute API URL for ref: a URL as is, a path starting with
 * "projects/" under the API, a path without the project ("zones/…",
 * "global/…") under project, and a bare name as `relative(name)`.
 */
export function computeUrl(ref: string, project: string, relative: (name: string) => string): string {
    if (ref.startsWith("https://")) return ref;
    const r = ref.replace(/^\/+/, "");
    if (r.startsWith("projects/")) return `${COMPUTE_API_URL}/${r}`;
    if (r.startsWith("zones/") || r.startsWith("regions/") || r.startsWith("global/")) {
        return `${COMPUTE_API_URL}/projects/${project}/${r}`;
    }
    return `${COMPUTE_API_URL}/projects/${project}/${relative(r)}`;
}

/** Whether a Compute operation has finished, successfully or not. */
export function operationDone(op: any): boolean {
    return op?.status === "DONE";
}

/** What a finished Compute operation reports as its errors, if any. */
export function operationErrors(op: any): string | undefined {
    const errs = op?.error?.errors;
    if (!Array.isArray(errs) || errs.length === 0) return undefined;
    return errs.map((e: any) => `${e.code ?? "ERROR"}: ${e.message ?? "no details"}`).join("; ");
}

/** Whether err is an HTTP failure with status. */
export function hasStatus(err: unknown, status: number): boolean {
    return typeof err === "object" && err !== null && (err as any).status === status;
}

/**
 * List prices per GiB-month of provisioned capacity, by disk type, from the
 * Cloud Billing catalog for Compute Engine (us-central1 and europe-west1,
 * which share these rates; other regions cost up to ~40% more). The
 * Compute catalog runs to seven pages of several MB each, too much to
 * read in an entity step, so the rates are kept here.
 * Hyperdisk provisioned IOPS and throughput above the baseline, and
 * pd-extreme provisioned IOPS, are billed on top and not included.
 */
export const DISK_PRICE_PER_GIB_MONTH: Record<string, number> = {
    "pd-standard": 0.04,
    "pd-balanced": 0.10,
    "pd-ssd": 0.17,
    "pd-extreme": 0.125,
    "hyperdisk-balanced": 0.08,
    "hyperdisk-balanced-high-availability": 0.16,
    "hyperdisk-extreme": 0.125,
    "hyperdisk-throughput": 0.005,
    "hyperdisk-ml": 0.08,
};

/** List price per GiB-month of standard snapshot storage (same regions as above). */
export const SNAPSHOT_PRICE_PER_GIB_MONTH = 0.05;

/** Hours in a month, as Monk's billing counts them. */
export const HOURS_PER_MONTH = 730;
