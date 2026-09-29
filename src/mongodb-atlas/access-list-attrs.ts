/**
 * Comparison of the mutable attributes of a MongoDB Atlas IP access list entry
 * (`comment` and `deleteAfterDate`).
 *
 * Atlas has no single-entry PATCH for the access list, so a change to either attribute
 * has to be applied by re-adding or re-creating the entry. These helpers decide whether
 * the live record differs from what the definition asks for, and how.
 */

/** Tolerance when comparing expiry timestamps, since Atlas may normalize the precision it stores. */
const DELETE_AFTER_TOLERANCE_MS = 60 * 1000;

/** The attributes of an entry that can change without changing which entry it is. */
export interface AccessListAttributes {
    comment?: string;
    deleteAfterDate?: string;
}

/** Which attributes differ between the desired and the live entry. */
export interface AccessListAttributeDrift {
    comment: boolean;
    deleteAfterDate: boolean;
    /**
     * True when the live entry has an expiry and the definition has none. Re-adding the
     * entry without `deleteAfterDate` is not documented to clear an expiry, so this case
     * goes straight to delete-and-recreate.
     */
    clearsDeleteAfter: boolean;
}

function blank(value: unknown): boolean {
    return value === undefined || value === null || String(value) === "";
}

/**
 * Whether two expiry timestamps name the same moment. Both are ISO-8601, but Atlas can
 * return a different spelling than the one sent (time zone designator, fractional
 * seconds), so compare parsed instants within a small tolerance. Unparseable values fall
 * back to a string comparison.
 */
export function sameDeleteAfter(a?: string, b?: string): boolean {
    if (blank(a) && blank(b)) {
        return true;
    }
    if (blank(a) || blank(b)) {
        return false;
    }
    const ta = Date.parse(String(a));
    const tb = Date.parse(String(b));
    if (isNaN(ta) || isNaN(tb)) {
        return String(a).trim() === String(b).trim();
    }
    return Math.abs(ta - tb) < DELETE_AFTER_TOLERANCE_MS;
}

/**
 * Whether an entry's configured expiry has passed: true only when `deleteAfter` parses
 * and is at or before `nowMs`. Atlas removes such an entry by design, so it must not be
 * re-added. No expiry, or an unparseable one, counts as not expired.
 */
export function deleteAfterExpired(deleteAfter: string | undefined, nowMs: number): boolean {
    if (blank(deleteAfter)) {
        return false;
    }
    const t = Date.parse(String(deleteAfter));
    return !isNaN(t) && t <= nowMs;
}

/** Compare the desired attributes with the live record's. An absent comment equals an empty one. */
export function accessListAttributeDrift(desired: AccessListAttributes, live: AccessListAttributes): AccessListAttributeDrift {
    const desiredComment = blank(desired.comment) ? "" : String(desired.comment);
    const liveComment = blank(live.comment) ? "" : String(live.comment);
    const deleteAfterDate = !sameDeleteAfter(desired.deleteAfterDate, live.deleteAfterDate);
    return {
        comment: desiredComment !== liveComment,
        deleteAfterDate,
        clearsDeleteAfter: deleteAfterDate && blank(desired.deleteAfterDate) && !blank(live.deleteAfterDate),
    };
}

/** True when any attribute differs. */
export function hasAttributeDrift(drift: AccessListAttributeDrift): boolean {
    return drift.comment || drift.deleteAfterDate;
}

/** Human-readable list of what differs, e.g. `comment ("a" -> "b")`. */
export function describeAttributeDrift(drift: AccessListAttributeDrift, desired: AccessListAttributes, live: AccessListAttributes): string {
    const parts: string[] = [];
    if (drift.comment) {
        parts.push(`comment (${JSON.stringify(live.comment ?? "")} -> ${JSON.stringify(desired.comment ?? "")})`);
    }
    if (drift.deleteAfterDate) {
        parts.push(`delete_after (${live.deleteAfterDate || "none"} -> ${desired.deleteAfterDate || "none"})`);
    }
    return parts.join(", ");
}
