/**
 * Canonical keys for MongoDB Atlas IP access list entries.
 *
 * Atlas stores a single IP address as one record carrying both `ipAddress: X` and
 * `cidrBlock: X/32` (IPv6: `X/128`), and either form addresses the same record in the
 * single-entry GET/DELETE endpoints. Two definitions that differ only in that spelling
 * therefore refer to one Atlas record, and must be compared by a canonical key rather
 * than by the raw string.
 */

/** Canonical dotted-quad form, or null when `value` is not an IPv4 address. */
function canonicalIPv4(value: string): string | null {
    const parts = value.split(".");
    if (parts.length !== 4) {
        return null;
    }
    const octets: number[] = [];
    for (const part of parts) {
        if (!/^[0-9]{1,3}$/.test(part)) {
            return null;
        }
        const n = parseInt(part, 10);
        if (n > 255) {
            return null;
        }
        octets.push(n);
    }
    return octets.join(".");
}

/**
 * Fully expanded lowercase form (eight groups, no leading zeros), or null when `value`
 * is not an IPv6 address. Only used for comparison, so it need not be RFC 5952 compact.
 */
function canonicalIPv6(value: string): string | null {
    let text = value.toLowerCase();
    if (text.indexOf(":") === -1) {
        return null;
    }

    // An embedded IPv4 tail (e.g. ::ffff:192.0.2.1) counts as two groups.
    const lastColon = text.lastIndexOf(":");
    const tail = text.substring(lastColon + 1);
    if (tail.indexOf(".") !== -1) {
        const v4 = canonicalIPv4(tail);
        if (!v4) {
            return null;
        }
        const o = v4.split(".").map((p) => parseInt(p, 10));
        text = text.substring(0, lastColon + 1) +
            ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
    }

    const halves = text.split("::");
    if (halves.length > 2) {
        return null;
    }
    const head = halves[0] ? halves[0].split(":") : [];
    const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    let groups: string[];
    if (halves.length === 2) {
        const missing = 8 - head.length - rest.length;
        if (missing < 1) {
            return null;
        }
        groups = head.concat(new Array(missing).fill("0"), rest);
    } else {
        groups = head;
    }
    if (groups.length !== 8) {
        return null;
    }
    const out: string[] = [];
    for (const g of groups) {
        if (!/^[0-9a-f]{1,4}$/.test(g)) {
            return null;
        }
        out.push(parseInt(g, 16).toString(16));
    }
    return out.join(":");
}

/**
 * Canonical key for an access list value: a single IP becomes a host CIDR
 * (`/32` for IPv4, `/128` for IPv6), a CIDR block keeps its prefix with a canonical
 * address part, and anything else (an AWS security group ID) is returned trimmed.
 */
export function normalizeAccessListKey(value: string): string {
    const text = String(value).trim();
    const slash = text.indexOf("/");
    const addr = slash === -1 ? text : text.substring(0, slash);
    const prefixText = slash === -1 ? null : text.substring(slash + 1);

    const v4 = canonicalIPv4(addr);
    const v6 = v4 ? null : canonicalIPv6(addr);
    const canonical = v4 ?? v6;
    if (!canonical) {
        return text;
    }

    const maxPrefix = v4 ? 32 : 128;
    if (prefixText === null) {
        return `${canonical}/${maxPrefix}`;
    }
    if (!/^[0-9]{1,3}$/.test(prefixText) || parseInt(prefixText, 10) > maxPrefix) {
        return text;
    }
    return `${canonical}/${parseInt(prefixText, 10)}`;
}

/** Canonical key of an access list record as returned by the Atlas API, or null. */
export function accessListRecordKey(record: any): string | null {
    if (!record) {
        return null;
    }
    const raw = record.cidrBlock || record.ipAddress || record.awsSecurityGroup;
    return raw ? normalizeAccessListKey(raw) : null;
}
