// Common types and utilities for AWS SES entities

/**
 * Parse SES API error from XML response
 */
export function parseSESError(response: { body?: string; statusCode?: number; status?: string }): string {
    if (response.body) {
        // Try to extract error message from XML
        const messageMatch = response.body.match(/<Message>(.*?)<\/Message>/);
        if (messageMatch) {
            return messageMatch[1];
        }
        
        const errorMatch = response.body.match(/<Error>(.*?)<\/Error>/s);
        if (errorMatch) {
            return errorMatch[1].replace(/<[^>]+>/g, ' ').trim();
        }
    }
    
    return `HTTP ${response.statusCode}: ${response.status || 'Unknown error'}`;
}

/**
 * Extract value from XML by tag name
 */
export function extractXMLValue(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}>([^<]*)<\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : undefined;
}

/**
 * Extract all values from XML by tag name
 */
export function extractXMLValues(xml: string, tagName: string): string[] {
    const regex = new RegExp(`<${tagName}>([^<]*)<\/${tagName}>`, 'gi');
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}

/**
 * Validate email address format
 */
export function validateEmailAddress(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate domain name format
 */
export function validateDomainName(domain: string): boolean {
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    return domainRegex.test(domain);
}

/**
 * Verification status types
 */
export type VerificationStatus = "PENDING" | "SUCCESS" | "FAILED" | "TEMPORARY_FAILURE" | "NOT_STARTED";

/**
 * SES v2 API response types
 */
export interface SESIdentityInfo {
    IdentityType?: string;
    IdentityName?: string;
    SendingEnabled?: boolean;
    VerificationStatus?: VerificationStatus;
}

export interface SESDkimAttributes {
    SigningEnabled?: boolean;
    Status?: string;
    Tokens?: string[];
    SigningAttributesOrigin?: string;
    NextSigningKeyLength?: string;
    CurrentSigningKeyLength?: string;
}

export interface SESConfigurationSet {
    ConfigurationSetName?: string;
    TrackingOptions?: {
        CustomRedirectDomain?: string;
    };
    DeliveryOptions?: {
        TlsPolicy?: string;
        SendingPoolName?: string;
    };
    ReputationOptions?: {
        ReputationMetricsEnabled?: boolean;
        LastFreshStart?: string;
    };
    SendingOptions?: {
        SendingEnabled?: boolean;
    };
    SuppressionOptions?: {
        SuppressedReasons?: string[];
    };
}

/**
 * Email identity API response
 */
export interface SESEmailIdentityResponse {
    VerificationStatus?: VerificationStatus;
    SendingEnabled?: boolean;
    DkimAttributes?: SESDkimAttributes;
    MailFromAttributes?: {
        MailFromDomain?: string;
        MailFromDomainStatus?: string;
        BehaviorOnMxFailure?: string;
    };
}

