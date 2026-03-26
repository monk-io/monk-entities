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
 * Extract a named XML block (with nested content)
 */
export function extractXMLBlock(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}>[\\s\\S]*?</${tagName}>`, "i");
    const match = xml.match(regex);
    return match ? match[0] : undefined;
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
 * Strip the /change/ prefix from a change ID
 */
export function stripChangeIdPrefix(changeId: string): string {
    return changeId.replace(/^\/change\//, "");
}

/**
 * Route 53 API base URL
 */
export const ROUTE53_API_BASE = "https://route53.amazonaws.com";
export const ROUTE53_API_VERSION = "2013-04-01";

/**
 * Supported DNS record types
 */
export const DNS_RECORD_TYPES = [
    "A", "AAAA", "CNAME", "MX", "NS", "PTR", "SOA",
    "SPF", "SRV", "TXT", "CAA", "DS", "NAPTR"
] as const;

/**
 * Health check protocol types
 */
export const HEALTH_CHECK_TYPES = [
    "HTTP", "HTTPS", "HTTP_STR_MATCH", "HTTPS_STR_MATCH", "TCP", "CALCULATED", "CLOUDWATCH_METRIC"
] as const;

/**
 * Region mapping for AWS pricing API
 */
export const REGION_LOCATION_MAP: Record<string, string> = {
    "us-east-1": "US East (N. Virginia)",
    "us-east-2": "US East (Ohio)",
    "us-west-1": "US West (N. California)",
    "us-west-2": "US West (Oregon)",
    "eu-west-1": "EU (Ireland)",
    "eu-west-2": "EU (London)",
    "eu-west-3": "EU (Paris)",
    "eu-central-1": "EU (Frankfurt)",
    "eu-north-1": "EU (Stockholm)",
    "ap-southeast-1": "Asia Pacific (Singapore)",
    "ap-southeast-2": "Asia Pacific (Sydney)",
    "ap-northeast-1": "Asia Pacific (Tokyo)",
    "ap-northeast-2": "Asia Pacific (Seoul)",
    "ap-south-1": "Asia Pacific (Mumbai)",
    "sa-east-1": "South America (Sao Paulo)",
    "ca-central-1": "Canada (Central)",
};
