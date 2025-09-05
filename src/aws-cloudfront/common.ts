/**
 * Validates a CloudFront caller reference according to AWS CloudFront rules
 */
export function validateCallerReference(callerReference: string): boolean {
    // AWS CloudFront caller reference constraints:
    // - Must be unique across all distributions in the account
    // - Can contain letters, numbers, hyphens, and underscores
    // - 1-128 characters long
    if (!callerReference || callerReference.length < 1 || callerReference.length > 128) {
        return false;
    }
    
    return /^[a-zA-Z0-9_-]+$/.test(callerReference);
}

/**
 * Validates CloudFront aliases (CNAMEs)
 */
export function validateAlias(alias: string): boolean {
    // Basic domain name validation
    if (!alias || alias.length > 253) {
        return false;
    }
    
    // Domain name format validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(alias);
}

/**
 * Validates origin domain name
 */
export function validateOriginDomainName(domainName: string): boolean {
    if (!domainName || domainName.length > 253) {
        return false;
    }
    
    // Allow both domain names and S3 bucket URLs
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    const s3Regex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.s3(\.[a-zA-Z0-9-]+)?\.amazonaws\.com$/;
    
    return domainRegex.test(domainName) || s3Regex.test(domainName);
}

/**
 * Validates origin ID
 */
export function validateOriginId(originId: string): boolean {
    // Origin ID constraints:
    // - 1-128 characters
    // - Letters, numbers, hyphens, underscores, periods
    if (!originId || originId.length < 1 || originId.length > 128) {
        return false;
    }
    
    return /^[a-zA-Z0-9._-]+$/.test(originId);
}

/**
 * Generates a unique caller reference if not provided
 */
export function generateCallerReference(distributionName?: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const baseName = distributionName ? distributionName.replace(/[^a-zA-Z0-9-]/g, '-') : 'cf-dist';
    
    return `${baseName}-${timestamp}-${randomSuffix}`.substring(0, 128);
}

/**
 * Builds CloudFront distribution configuration from definition
 */
export function buildDistributionConfig(definition: any): any {
    const config: any = {
        CallerReference: definition.caller_reference || generateCallerReference(),
        Comment: definition.comment || '',
        Enabled: definition.enabled !== false, // Default to true
        Origins: []
    };

    // Build origins
    if (definition.origins && Array.isArray(definition.origins)) {
        config.Origins = definition.origins.map((origin: any) => {
            const originConfig: any = {
                Id: origin.id,
                DomainName: origin.domain_name
            };

            if (origin.origin_path) {
                originConfig.OriginPath = origin.origin_path;
            }

            // AWS default connection settings
            originConfig.ConnectionAttempts = origin.connection_attempts !== undefined ? 
                origin.connection_attempts : 3;
            originConfig.ConnectionTimeout = origin.connection_timeout !== undefined ? 
                origin.connection_timeout : 10;
            
            // AWS required fields with defaults
            originConfig.OriginShield = { Enabled: false };
            originConfig.OriginAccessControlId = "";

            // Custom origin config
            if (origin.custom_origin_config) {
                originConfig.CustomOriginConfig = {
                    HTTPPort: origin.custom_origin_config.http_port || 80,
                    HTTPSPort: origin.custom_origin_config.https_port || 443,
                    OriginProtocolPolicy: origin.custom_origin_config.origin_protocol_policy,
                    // AWS default SSL protocols
                    OriginSslProtocols: origin.custom_origin_config.origin_ssl_protocols || ['TLSv1', 'TLSv1.1', 'TLSv1.2'],
                    // AWS default timeouts
                    OriginReadTimeout: origin.custom_origin_config.origin_read_timeout !== undefined ? 
                        origin.custom_origin_config.origin_read_timeout : 30,
                    OriginKeepaliveTimeout: origin.custom_origin_config.origin_keep_alive_timeout !== undefined ? 
                        origin.custom_origin_config.origin_keep_alive_timeout : 5
                };
            }

            // S3 origin config
            if (origin.s3_origin_config) {
                originConfig.S3OriginConfig = {
                    OriginAccessIdentity: origin.s3_origin_config.origin_access_identity || ''
                };
            }

            return originConfig;
        });
    }

    // Build default cache behavior
    if (definition.default_cache_behavior) {
        const behavior = definition.default_cache_behavior;
        config.DefaultCacheBehavior = {
            TargetOriginId: behavior.target_origin_id,
            ViewerProtocolPolicy: behavior.viewer_protocol_policy || 'allow-all'
        };

        // Allowed methods
        if (behavior.allowed_methods) {
            config.DefaultCacheBehavior.AllowedMethods = behavior.allowed_methods;
            
            if (behavior.cached_methods) {
                config.DefaultCacheBehavior.CachedMethods = behavior.cached_methods;
            }
        }

        // Forwarded values
        config.DefaultCacheBehavior.QueryString = behavior.forward_query_string || false;
        config.DefaultCacheBehavior.CookiesForward = behavior.forward_cookies || 'none';
        
        if (behavior.cookies_whitelist && Array.isArray(behavior.cookies_whitelist)) {
            config.DefaultCacheBehavior.CookiesWhitelistedNames = behavior.cookies_whitelist;
        }

        if (behavior.forward_headers && Array.isArray(behavior.forward_headers)) {
            config.DefaultCacheBehavior.Headers = behavior.forward_headers;
        }

        // TTL settings
        if (behavior.min_ttl !== undefined) {
            config.DefaultCacheBehavior.MinTTL = behavior.min_ttl;
        }
        if (behavior.default_ttl !== undefined) {
            config.DefaultCacheBehavior.DefaultTTL = behavior.default_ttl;
        }
        if (behavior.max_ttl !== undefined) {
            config.DefaultCacheBehavior.MaxTTL = behavior.max_ttl;
        }

        if (behavior.compress !== undefined) {
            config.DefaultCacheBehavior.Compress = behavior.compress;
        }

        if (behavior.trusted_signers && Array.isArray(behavior.trusted_signers)) {
            config.DefaultCacheBehavior.TrustedSigners = behavior.trusted_signers;
        }

        // AWS required fields with defaults
        config.DefaultCacheBehavior.SmoothStreaming = false;
        config.DefaultCacheBehavior.FieldLevelEncryptionId = "";
        config.DefaultCacheBehavior.GrpcConfig = { Enabled: false };
    }

    // Cache behaviors
    if (definition.cache_behaviors && Array.isArray(definition.cache_behaviors)) {
        config.CacheBehaviors = definition.cache_behaviors.map((behavior: any) => {
            const cacheBehavior: any = {
                PathPattern: behavior.path_pattern,
                TargetOriginId: behavior.target_origin_id,
                ViewerProtocolPolicy: behavior.viewer_protocol_policy || 'allow-all'
            };

            // Similar logic as default cache behavior
            if (behavior.allowed_methods) {
                cacheBehavior.AllowedMethods = behavior.allowed_methods;
                if (behavior.cached_methods) {
                    cacheBehavior.CachedMethods = behavior.cached_methods;
                }
            }

            cacheBehavior.QueryString = behavior.forward_query_string || false;
            cacheBehavior.CookiesForward = behavior.forward_cookies || 'none';

            if (behavior.cookies_whitelist && Array.isArray(behavior.cookies_whitelist)) {
                cacheBehavior.CookiesWhitelistedNames = behavior.cookies_whitelist;
            }

            if (behavior.forward_headers && Array.isArray(behavior.forward_headers)) {
                cacheBehavior.Headers = behavior.forward_headers;
            }

            if (behavior.min_ttl !== undefined) {
                cacheBehavior.MinTTL = behavior.min_ttl;
            }
            if (behavior.default_ttl !== undefined) {
                cacheBehavior.DefaultTTL = behavior.default_ttl;
            }
            if (behavior.max_ttl !== undefined) {
                cacheBehavior.MaxTTL = behavior.max_ttl;
            }

            if (behavior.compress !== undefined) {
                cacheBehavior.Compress = behavior.compress;
            }

            if (behavior.trusted_signers && Array.isArray(behavior.trusted_signers)) {
                cacheBehavior.TrustedSigners = behavior.trusted_signers;
            }

            return cacheBehavior;
        });
    }

    // Custom error responses
    if (definition.custom_error_responses && Array.isArray(definition.custom_error_responses)) {
        config.CustomErrorResponses = definition.custom_error_responses.map((errorResponse: any) => {
            const customError: any = {
                ErrorCode: errorResponse.error_code
            };

            if (errorResponse.response_page_path) {
                customError.ResponsePagePath = errorResponse.response_page_path;
            }

            if (errorResponse.response_code) {
                customError.ResponseCode = errorResponse.response_code;
            }

            if (errorResponse.error_caching_min_ttl !== undefined) {
                customError.ErrorCachingMinTTL = errorResponse.error_caching_min_ttl;
            }

            return customError;
        });
    }

    // Price class
    if (definition.price_class) {
        config.PriceClass = definition.price_class;
    }

    // Aliases
    if (definition.aliases && Array.isArray(definition.aliases)) {
        config.Aliases = definition.aliases;
    }

    // Default root object
    if (definition.default_root_object) {
        config.DefaultRootObject = definition.default_root_object;
    }

    // Viewer certificate
    if (definition.viewer_certificate) {
        config.ViewerCertificate = {};
        const cert = definition.viewer_certificate;
        
        if (cert.cloudfront_default_certificate) {
            config.ViewerCertificate.CloudFrontDefaultCertificate = true;
        } else {
            config.ViewerCertificate.CloudFrontDefaultCertificate = false;
            
            if (cert.acm_certificate_arn) {
                config.ViewerCertificate.ACMCertificateArn = cert.acm_certificate_arn;
                config.ViewerCertificate.CertificateSource = 'acm';
            } else if (cert.iam_certificate_id) {
                config.ViewerCertificate.IAMCertificateId = cert.iam_certificate_id;
                config.ViewerCertificate.CertificateSource = 'iam';
            }
            
            if (cert.ssl_support_method) {
                config.ViewerCertificate.SSLSupportMethod = cert.ssl_support_method;
            }
            
            if (cert.minimum_protocol_version) {
                config.ViewerCertificate.MinimumProtocolVersion = cert.minimum_protocol_version;
            }
        }
    } else {
        // Default viewer certificate with AWS defaults
        config.ViewerCertificate = {
            CloudFrontDefaultCertificate: true,
            SSLSupportMethod: "vip",
            MinimumProtocolVersion: "TLSv1",
            CertificateSource: "cloudfront"
        };
    }

    // Web ACL ID
    if (definition.web_acl_id) {
        config.WebACLId = definition.web_acl_id;
    }

    // HTTP version
    if (definition.http_version) {
        config.HttpVersion = definition.http_version;
    }

    // IPv6
    if (definition.is_ipv6_enabled !== undefined) {
        config.IsIPV6Enabled = definition.is_ipv6_enabled;
    }

    // Logging
    if (definition.logging) {
        config.Logging = {
            Enabled: definition.logging.enabled || false
        };

        if (definition.logging.enabled && definition.logging.bucket) {
            config.Logging.Bucket = definition.logging.bucket;
            config.Logging.Prefix = definition.logging.prefix || '';
            config.Logging.IncludeCookies = definition.logging.include_cookies || false;
        }
    }

    // Restrictions (required for UpdateDistribution)
    config.Restrictions = {
        GeoRestriction: {
            RestrictionType: 'none',
            Quantity: 0
        }
    };

    // AWS required distribution-level fields with defaults
    config.ContinuousDeploymentPolicyId = "";
    config.Staging = false;

    return config;
}

/**
 * Formats CloudFront distribution state from API response
 * @param distribution - Distribution data from CloudFront API
 * @param etag - ETag header from response
 * @param wasPreExisting - true if distribution existed before entity creation
 */
export function formatDistributionState(distribution: any, etag?: string, wasPreExisting: boolean = false): any {
    // Note: Using console.log here since this is a utility function that may be called from different contexts
    
    const state: any = {
        existing: wasPreExisting, // true = don't delete (pre-existing), false = we created it (can delete)
        distribution_id: distribution.Id,
        distribution_arn: distribution.ARN,
        distribution_status: distribution.Status,
        domain_name: distribution.DomainName,
        etag: etag,
        last_modified_time: distribution.LastModifiedTime,
        creation_time: distribution.LastModifiedTime, // CloudFront doesn't have separate creation time
        in_progress_invalidation_batches: distribution.InProgressInvalidationBatches || 0
    };
    
    // Extract DistributionConfig.Enabled if available
    if (distribution.DistributionConfig && typeof distribution.DistributionConfig.Enabled !== 'undefined') {
        state.distribution_config_enabled = distribution.DistributionConfig.Enabled;
    } else {
        // No DistributionConfig.Enabled found, defaults to false
    }
    return state;
}

/**
 * Parses CloudFront error messages from XML responses
 */
export function parseCloudFrontError(xmlBody: string): string {
    try {
        const errorMatch = /<Message>(.*?)<\/Message>/.exec(xmlBody);
        const codeMatch = /<Code>(.*?)<\/Code>/.exec(xmlBody);
        
        if (errorMatch && codeMatch) {
            return `${codeMatch[1]}: ${errorMatch[1]}`;
        } else if (errorMatch) {
            return errorMatch[1];
        }
    } catch (_error) {
        // If parsing fails, return the raw body
    }
    
    return xmlBody;
}

/**
 * Adds parameters to form data for AWS API calls (used by some utility functions)
 */
export function addParamsToFormData(formParams: Record<string, string>, params: Record<string, any>, prefix = ''): void {
    for (const [key, value] of Object.entries(params)) {
        const paramKey = prefix ? `${prefix}.${key}` : key;
        
        if (value === null || value === undefined) {
            continue;
        }
        
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (typeof item === 'object') {
                    addParamsToFormData(formParams, item, `${paramKey}.member.${index + 1}`);
                } else {
                    formParams[`${paramKey}.member.${index + 1}`] = String(item);
                }
            });
        } else if (typeof value === 'object') {
            addParamsToFormData(formParams, value, paramKey);
        } else {
            formParams[paramKey] = String(value);
        }
    }
}

/**
 * Default CloudFront distribution configuration values
 */
export const DEFAULT_CLOUDFRONT_CONFIG = {
    enabled: true,
    price_class: 'PriceClass_All',
    http_version: 'http2',
    is_ipv6_enabled: true,
    default_cache_behavior: {
        viewer_protocol_policy: 'redirect-to-https',
        allowed_methods: ['GET', 'HEAD', 'OPTIONS'],
        cached_methods: ['GET', 'HEAD'],
        forward_cookies: 'none',
        forward_query_string: false,
        compress: true,
        min_ttl: 0,
        default_ttl: 86400,
        max_ttl: 31536000
    }
};

/**
 * Validates distribution configuration
 */
export function validateDistributionConfig(definition: any): string[] {
    const errors: string[] = [];

    // Check required fields
    if (!definition.origins || !Array.isArray(definition.origins) || definition.origins.length === 0) {
        errors.push('At least one origin is required');
    } else {
        // Validate each origin
        definition.origins.forEach((origin: any, index: number) => {
            if (!origin.id || !validateOriginId(origin.id)) {
                errors.push(`Origin ${index + 1}: Invalid origin ID`);
            }
            if (!origin.domain_name || !validateOriginDomainName(origin.domain_name)) {
                errors.push(`Origin ${index + 1}: Invalid domain name`);
            }
        });
    }

    if (!definition.default_cache_behavior) {
        errors.push('Default cache behavior is required');
    } else if (!definition.default_cache_behavior.target_origin_id) {
        errors.push('Default cache behavior must specify target_origin_id');
    }

    // Validate aliases if provided
    if (definition.aliases && Array.isArray(definition.aliases)) {
        definition.aliases.forEach((alias: string, index: number) => {
            if (!validateAlias(alias)) {
                errors.push(`Alias ${index + 1}: Invalid alias format`);
            }
        });
    }

    // Validate caller reference if provided
    if (definition.caller_reference && !validateCallerReference(definition.caller_reference)) {
        errors.push('Invalid caller reference format');
    }

    return errors;
}
