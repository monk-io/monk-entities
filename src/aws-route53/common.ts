// Common types and utilities for AWS Route 53 entities

/**
 * Parse Route 53 API error from XML response
 */
export function parseRoute53Error(response: { body?: string; statusCode?: number; status?: string }): string {
    if (response.body) {
        const messageMatch = response.body.match(/<Message>(.*?)<\/Message>/);
        if (messageMatch) {
            const codeMatch = response.body.match(/<Code>(.*?)<\/Code>/);
            if (codeMatch) {
                return `${codeMatch[1]}: ${messageMatch[1]}`;
            }
            return messageMatch[1];
        }

        const errorMatch = response.body.match(/<Error>(.*?)<\/Error>/s);
        if (errorMatch) {
            return errorMatch[1].replace(/<[^>]+>/g, " ").trim();
        }
    }

    return `HTTP ${response.statusCode}: ${response.status || "Unknown error"}`;
}

/**
 * Extract a single value from XML by tag name
 */
export function extractXMLValue(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, "i");
    const match = xml.match(regex);
    return match ? match[1] : undefined;
}

/**
 * Extract all values from XML by tag name
 */
export function extractXMLValues(xml: string, tagName: string): string[] {
    const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, "gi");
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}

/**
 * Extract all named XML blocks
 */
export function extractXMLBlocks(xml: string, tagName: string): string[] {
    const regex = new RegExp(`<${tagName}>[\\s\\S]*?</${tagName}>`, "gi");
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
        matches.push(match[0]);
    }
    return matches;
}

/**
 * Escape special XML characters
 */
export function escapeXml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Validate domain name format
 */
export function validateDomainName(domain: string): boolean {
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.?$/i;
    return domainRegex.test(domain);
}

/**
 * Ensure domain name has trailing dot (Route 53 convention)
 */
export function ensureTrailingDot(domain: string): string {
    return domain.endsWith(".") ? domain : `${domain}.`;
}

/**
 * Strip the /hostedzone/ prefix from a zone ID
 */
export function stripZoneIdPrefix(zoneId: string): string {
    return zoneId.replace(/^\/hostedzone\//, "");
}

/**
 * Route 53 API base URL
 */
export const ROUTE53_API_BASE = "https://route53.amazonaws.com";
export const ROUTE53_API_VERSION = "2013-04-01";
