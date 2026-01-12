import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

export interface AWSCloudFrontDefinition {
    /** @description AWS region for CloudFront operations (global service, but required for API calls) */
    region: string;
    /** @description Caller reference for the distribution (must be unique) */
    caller_reference?: string;
    /** @description Comment for the distribution */
    comment?: string;
    /** @description Default root object (e.g., index.html) */
    default_root_object?: string;
    /** @description Whether the distribution is enabled */
    enabled?: boolean;
    /** @description Origins configuration */
    origins?: Array<{
        /** @description Origin ID (unique within distribution) */
        id: string;
        /** @description Domain name for the origin */
        domain_name: string;
        /** @description Custom origin configuration */
        custom_origin_config?: {
            /** @description HTTP port */
            http_port?: number;
            /** @description HTTPS port */
            https_port?: number;
            /** @description Origin protocol policy */
            origin_protocol_policy: "http-only" | "https-only" | "match-viewer";
            /** @description SSL protocols */
            origin_ssl_protocols?: string[];
            /** @description Origin read timeout */
            origin_read_timeout?: number;
            /** @description Origin keep alive timeout */
            origin_keep_alive_timeout?: number;
        };
        /** @description S3 origin configuration */
        s3_origin_config?: {
            /** @description Origin access identity */
            origin_access_identity?: string;
        };
        /** @description Origin path */
        origin_path?: string;
        /** @description Connection attempts */
        connection_attempts?: number;
        /** @description Connection timeout */
        connection_timeout?: number;
    }>;
    /** @description Default cache behavior */
    default_cache_behavior?: {
        /** @description Target origin ID */
        target_origin_id: string;
        /** @description Viewer protocol policy */
        viewer_protocol_policy: "allow-all" | "https-only" | "redirect-to-https";
        /** @description Allowed HTTP methods */
        allowed_methods?: string[];
        /** @description Cached HTTP methods */
        cached_methods?: string[];
        /** @description Forward cookies */
        forward_cookies?: "none" | "whitelist" | "all";
        /** @description Cookie whitelist */
        cookies_whitelist?: string[];
        /** @description Forward headers */
        forward_headers?: string[];
        /** @description Forward query strings */
        forward_query_string?: boolean;
        /** @description TTL settings */
        min_ttl?: number;
        default_ttl?: number;
        max_ttl?: number;
        /** @description Compress objects automatically */
        compress?: boolean;
        /** @description Trusted signers */
        trusted_signers?: string[];
    };
    /** @description Additional cache behaviors */
    cache_behaviors?: Array<{
        /** @description Path pattern */
        path_pattern: string;
        /** @description Target origin ID */
        target_origin_id: string;
        /** @description Viewer protocol policy */
        viewer_protocol_policy: "allow-all" | "https-only" | "redirect-to-https";
        /** @description Allowed HTTP methods */
        allowed_methods?: string[];
        /** @description Cached HTTP methods */
        cached_methods?: string[];
        /** @description Forward cookies */
        forward_cookies?: "none" | "whitelist" | "all";
        /** @description Cookie whitelist */
        cookies_whitelist?: string[];
        /** @description Forward headers */
        forward_headers?: string[];
        /** @description Forward query strings */
        forward_query_string?: boolean;
        /** @description TTL settings */
        min_ttl?: number;
        default_ttl?: number;
        max_ttl?: number;
        /** @description Compress objects automatically */
        compress?: boolean;
        /** @description Trusted signers */
        trusted_signers?: string[];
    }>;
    /** @description Custom error pages */
    custom_error_responses?: Array<{
        /** @description HTTP error code */
        error_code: number;
        /** @description Custom error page path */
        response_page_path?: string;
        /** @description Custom response code */
        response_code?: number;
        /** @description Cache TTL for error pages */
        error_caching_min_ttl?: number;
    }>;
    /** @description Price class */
    price_class?: "PriceClass_All" | "PriceClass_100" | "PriceClass_200";
    /** @description Aliases (CNAMEs) */
    aliases?: string[];
    /** @description Viewer certificate configuration */
    viewer_certificate?: {
        /** @description Use CloudFront default certificate */
        cloudfront_default_certificate?: boolean;
        /** @description ACM certificate ARN */
        acm_certificate_arn?: string;
        /** @description IAM certificate ID */
        iam_certificate_id?: string;
        /** @description SSL support method */
        ssl_support_method?: "sni-only" | "vip";
        /** @description Minimum protocol version */
        minimum_protocol_version?: "SSLv3" | "TLSv1" | "TLSv1_2016" | "TLSv1.1_2016" | "TLSv1.2_2018" | "TLSv1.2_2019" | "TLSv1.2_2021";
        /** @description Certificate source */
        certificate_source?: "cloudfront" | "acm" | "iam";
    };
    /** @description Web ACL ID */
    web_acl_id?: string;
    /** @description HTTP version */
    http_version?: "http1.1" | "http2";
    /** @description IPv6 enabled */
    is_ipv6_enabled?: boolean;
    /** @description Logging configuration */
    logging?: {
        /** @description Enable logging */
        enabled: boolean;
        /** @description S3 bucket for logs */
        bucket?: string;
        /** @description Log prefix */
        prefix?: string;
        /** @description Include cookies in logs */
        include_cookies?: boolean;
    };
    /** @description Resource tags */
    tags?: Record<string, string>;
}

export interface AWSCloudFrontState {
    /** @description Indicates if the distribution pre-existed before this entity managed it */
    existing: boolean;
    /** @description CloudFront distribution ID */
    distribution_id?: string;
    /** @description Distribution ARN */
    distribution_arn?: string;
    /** @description Current distribution status */
    distribution_status?: string;
    /** @description Distribution domain name */
    domain_name?: string;
    /** @description Distribution ETag (required for updates/deletes) */
    etag?: string;
    /** @description Last modified timestamp */
    last_modified_time?: string;
    /** @description Distribution creation timestamp */
    creation_time?: string;
    /** @description In progress invalidation ID (if any) */
    in_progress_invalidation_batches?: number;
    /** @description Whether the distribution is enabled (extracted from DistributionConfig) */
    distribution_config_enabled?: boolean;
}

export interface CloudFrontResponse {
    Distribution?: {
        Id?: string;
        ARN?: string;
        Status?: string;
        DomainName?: string;
        LastModifiedTime?: string;
        DistributionConfig?: any;
        [key: string]: any;
    };
    ETag?: string;
    Location?: string;
    [key: string]: any;
}

export interface CloudFrontErrorResponse {
    Error?: {
        Code?: string;
        Message?: string;
        Type?: string;
        Detail?: string;
    };
    RequestId?: string;
}

export abstract class AWSCloudFrontEntity<
    TDefinition extends AWSCloudFrontDefinition,
    TState extends AWSCloudFrontState
> extends MonkEntity<TDefinition, TState> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    protected abstract getDistributionId(): string;

    protected makeCloudFrontRequest(action: string, params: Record<string, any> = {}): CloudFrontResponse {
        const url = `https://cloudfront.amazonaws.com/2020-05-31/distribution`;
        
        // For CloudFront, most operations use REST API with XML payloads
        let response: any;
        let requestUrl = url;
        
        if (action === 'CreateDistribution') {
            const body = this.buildDistributionConfigXml(params.DistributionConfig);
            
            response = aws.post(requestUrl, {
                service: 'cloudfront',
                region: 'us-east-1', // CloudFront is a global service but uses us-east-1
                headers: {
                    'Content-Type': 'application/xml'
                },
                body: body
            });
        } else if (action === 'GetDistribution') {
            requestUrl = `${url}/${params.Id}`;
            
            response = aws.get(requestUrl, {
                service: 'cloudfront',
                region: 'us-east-1'
            });
        } else if (action === 'UpdateDistribution') {
            requestUrl = `${url}/${params.Id}`;
            const body = this.buildDistributionConfigXml(params.DistributionConfig);
            
            response = aws.put(requestUrl, {
                service: 'cloudfront',
                region: 'us-east-1',
                headers: {
                    'Content-Type': 'application/xml',
                    'If-Match': params.IfMatch || ''
                },
                body: body
            });
        } else if (action === 'DeleteDistribution') {
            requestUrl = `${url}/${params.Id}`;
            
            response = aws.delete(requestUrl, {
                service: 'cloudfront',
                region: 'us-east-1',
                headers: {
                    'If-Match': params.IfMatch || ''
                }
            });
        } else {
            throw new Error(`Unknown CloudFront action: ${action}`);
        }

        if (response.statusCode >= 400) {
            this.handleCloudFrontError(response, action);
        }

        return this.parseCloudFrontResponse(response.body, response.headers);
    }

    protected buildDistributionConfigXml(distributionConfig: any): string {
        // Build XML for distribution configuration
        const xmlParts = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<DistributionConfig xmlns="http://cloudfront.amazonaws.com/doc/2020-05-31/">'
        ];

        // Caller reference
        if (distributionConfig.CallerReference) {
            xmlParts.push(`  <CallerReference>${this.escapeXml(distributionConfig.CallerReference)}</CallerReference>`);
        }

        // Comment
        if (distributionConfig.Comment !== undefined) {
            xmlParts.push(`  <Comment>${this.escapeXml(distributionConfig.Comment || '')}</Comment>`);
        }

        // Default root object
        if (distributionConfig.DefaultRootObject) {
            xmlParts.push(`  <DefaultRootObject>${this.escapeXml(distributionConfig.DefaultRootObject)}</DefaultRootObject>`);
        }

        // Enabled
        xmlParts.push(`  <Enabled>${distributionConfig.Enabled ? 'true' : 'false'}</Enabled>`);

        // Origins
        if (distributionConfig.Origins) {
            xmlParts.push('  <Origins>');
            xmlParts.push(`    <Quantity>${distributionConfig.Origins.length}</Quantity>`);
            xmlParts.push('    <Items>');
            
            distributionConfig.Origins.forEach((origin: any) => {
                xmlParts.push('      <member>');
                xmlParts.push(`        <Id>${this.escapeXml(origin.Id)}</Id>`);
                xmlParts.push(`        <DomainName>${this.escapeXml(origin.DomainName)}</DomainName>`);
                
                // OriginPath is REQUIRED (even if empty)
                xmlParts.push(`        <OriginPath>${this.escapeXml(origin.OriginPath || '')}</OriginPath>`);
                
                // CustomHeaders is REQUIRED (even if empty)
                xmlParts.push('        <CustomHeaders>');
                xmlParts.push('          <Quantity>0</Quantity>');
                xmlParts.push('        </CustomHeaders>');
                
                if (origin.CustomOriginConfig) {
                    xmlParts.push('        <CustomOriginConfig>');
                    const config = origin.CustomOriginConfig;
                    xmlParts.push(`          <HTTPPort>${config.HTTPPort || 80}</HTTPPort>`);
                    xmlParts.push(`          <HTTPSPort>${config.HTTPSPort || 443}</HTTPSPort>`);
                    xmlParts.push(`          <OriginProtocolPolicy>${config.OriginProtocolPolicy}</OriginProtocolPolicy>`);
                    
                    if (config.OriginSslProtocols) {
                        xmlParts.push('          <OriginSslProtocols>');
                        xmlParts.push(`            <Quantity>${config.OriginSslProtocols.length}</Quantity>`);
                        xmlParts.push('            <Items>');
                        config.OriginSslProtocols.forEach((protocol: string) => {
                            xmlParts.push(`              <member>${protocol}</member>`);
                        });
                        xmlParts.push('            </Items>');
                        xmlParts.push('          </OriginSslProtocols>');
                    }
                    
                    if (config.OriginReadTimeout !== undefined) {
                        xmlParts.push(`          <OriginReadTimeout>${config.OriginReadTimeout}</OriginReadTimeout>`);
                    }
                    if (config.OriginKeepaliveTimeout !== undefined) {
                        xmlParts.push(`          <OriginKeepaliveTimeout>${config.OriginKeepaliveTimeout}</OriginKeepaliveTimeout>`);
                    }
                    
                    xmlParts.push('        </CustomOriginConfig>');
                } else if (origin.S3OriginConfig) {
                    xmlParts.push('        <S3OriginConfig>');
                    if (origin.S3OriginConfig.OriginAccessIdentity) {
                        xmlParts.push(`          <OriginAccessIdentity>${this.escapeXml(origin.S3OriginConfig.OriginAccessIdentity)}</OriginAccessIdentity>`);
                    } else {
                        xmlParts.push('          <OriginAccessIdentity></OriginAccessIdentity>');
                    }
                    xmlParts.push('        </S3OriginConfig>');
                }
                
                if (origin.ConnectionAttempts !== undefined) {
                    xmlParts.push(`        <ConnectionAttempts>${origin.ConnectionAttempts}</ConnectionAttempts>`);
                }
                if (origin.ConnectionTimeout !== undefined) {
                    xmlParts.push(`        <ConnectionTimeout>${origin.ConnectionTimeout}</ConnectionTimeout>`);
                }
                
                // OriginShield is REQUIRED 
                if (origin.OriginShield) {
                    xmlParts.push('        <OriginShield>');
                    xmlParts.push(`          <Enabled>${origin.OriginShield.Enabled ? 'true' : 'false'}</Enabled>`);
                    xmlParts.push('        </OriginShield>');
                } else {
                    xmlParts.push('        <OriginShield>');
                    xmlParts.push('          <Enabled>false</Enabled>');
                    xmlParts.push('        </OriginShield>');
                }
                
                // OriginAccessControlId is REQUIRED (even if empty)
                xmlParts.push(`        <OriginAccessControlId>${origin.OriginAccessControlId || ''}</OriginAccessControlId>`);
                
                xmlParts.push('      </member>');
            });
            
            xmlParts.push('    </Items>');
            xmlParts.push('  </Origins>');
        }

        // Default cache behavior
        if (distributionConfig.DefaultCacheBehavior) {
            xmlParts.push('  <DefaultCacheBehavior>');
            const behavior = distributionConfig.DefaultCacheBehavior;
            
            xmlParts.push(`    <TargetOriginId>${this.escapeXml(behavior.TargetOriginId)}</TargetOriginId>`);
            xmlParts.push(`    <ViewerProtocolPolicy>${behavior.ViewerProtocolPolicy}</ViewerProtocolPolicy>`);
            
            // Allowed methods
            if (behavior.AllowedMethods) {
                xmlParts.push('    <AllowedMethods>');
                xmlParts.push(`      <Quantity>${behavior.AllowedMethods.length}</Quantity>`);
                xmlParts.push('      <Items>');
                behavior.AllowedMethods.forEach((method: string) => {
                    xmlParts.push(`        <member>${method}</member>`);
                });
                xmlParts.push('      </Items>');
                
                if (behavior.CachedMethods) {
                    xmlParts.push('      <CachedMethods>');
                    xmlParts.push(`        <Quantity>${behavior.CachedMethods.length}</Quantity>`);
                    xmlParts.push('        <Items>');
                    behavior.CachedMethods.forEach((method: string) => {
                        xmlParts.push(`          <member>${method}</member>`);
                    });
                    xmlParts.push('        </Items>');
                    xmlParts.push('      </CachedMethods>');
                }
                
                xmlParts.push('    </AllowedMethods>');
            }
            
            // Forwarded values
            xmlParts.push('    <ForwardedValues>');
            xmlParts.push(`      <QueryString>${behavior.QueryString ? 'true' : 'false'}</QueryString>`);
            
            xmlParts.push('      <Cookies>');
            xmlParts.push(`        <Forward>${behavior.CookiesForward || 'none'}</Forward>`);
            if (behavior.CookiesWhitelistedNames && behavior.CookiesWhitelistedNames.length > 0) {
                xmlParts.push('        <WhitelistedNames>');
                xmlParts.push(`          <Quantity>${behavior.CookiesWhitelistedNames.length}</Quantity>`);
                xmlParts.push('          <Items>');
                behavior.CookiesWhitelistedNames.forEach((name: string) => {
                    xmlParts.push(`            <member>${this.escapeXml(name)}</member>`);
                });
                xmlParts.push('          </Items>');
                xmlParts.push('        </WhitelistedNames>');
            }
            xmlParts.push('      </Cookies>');
            
            if (behavior.Headers && behavior.Headers.length > 0) {
                xmlParts.push('      <Headers>');
                xmlParts.push(`        <Quantity>${behavior.Headers.length}</Quantity>`);
                xmlParts.push('        <Items>');
                behavior.Headers.forEach((header: string) => {
                    xmlParts.push(`          <member>${this.escapeXml(header)}</member>`);
                });
                xmlParts.push('        </Items>');
                xmlParts.push('      </Headers>');
            }
            
            xmlParts.push('    </ForwardedValues>');
            
            // TTL values
            if (behavior.MinTTL !== undefined) {
                xmlParts.push(`    <MinTTL>${behavior.MinTTL}</MinTTL>`);
            }
            if (behavior.DefaultTTL !== undefined) {
                xmlParts.push(`    <DefaultTTL>${behavior.DefaultTTL}</DefaultTTL>`);
            }
            if (behavior.MaxTTL !== undefined) {
                xmlParts.push(`    <MaxTTL>${behavior.MaxTTL}</MaxTTL>`);
            }
            
            if (behavior.Compress !== undefined) {
                xmlParts.push(`    <Compress>${behavior.Compress ? 'true' : 'false'}</Compress>`);
            }
            
            // SmoothStreaming is REQUIRED for UpdateDistribution
            xmlParts.push(`    <SmoothStreaming>${behavior.SmoothStreaming ? 'true' : 'false'}</SmoothStreaming>`);
            
            // Lambda@Edge Function Associations (REQUIRED - even if empty)
            xmlParts.push('    <LambdaFunctionAssociations>');
            xmlParts.push('      <Quantity>0</Quantity>');
            xmlParts.push('    </LambdaFunctionAssociations>');
            
            // Function Associations (REQUIRED - even if empty)  
            xmlParts.push('    <FunctionAssociations>');
            xmlParts.push('      <Quantity>0</Quantity>');
            xmlParts.push('    </FunctionAssociations>');
            
            // FieldLevelEncryptionId is REQUIRED for UpdateDistribution
            xmlParts.push(`    <FieldLevelEncryptionId>${behavior.FieldLevelEncryptionId || ''}</FieldLevelEncryptionId>`);
            
            // GrpcConfig is REQUIRED for UpdateDistribution  
            if (behavior.GrpcConfig) {
                xmlParts.push('    <GrpcConfig>');
                xmlParts.push(`      <Enabled>${behavior.GrpcConfig.Enabled ? 'true' : 'false'}</Enabled>`);
                xmlParts.push('    </GrpcConfig>');
            } else {
                xmlParts.push('    <GrpcConfig>');
                xmlParts.push('      <Enabled>false</Enabled>');
                xmlParts.push('    </GrpcConfig>');
            }
            
            // Trusted Signers (REQUIRED - even if empty)
            xmlParts.push('    <TrustedSigners>');
            xmlParts.push('      <Enabled>false</Enabled>');
            xmlParts.push('      <Quantity>0</Quantity>');
            xmlParts.push('    </TrustedSigners>');
            
            // Trusted Key Groups (REQUIRED - even if empty)
            xmlParts.push('    <TrustedKeyGroups>');
            xmlParts.push('      <Enabled>false</Enabled>');
            xmlParts.push('      <Quantity>0</Quantity>');
            xmlParts.push('    </TrustedKeyGroups>');
            
            xmlParts.push('  </DefaultCacheBehavior>');
        }

        // Price class
        if (distributionConfig.PriceClass) {
            xmlParts.push(`  <PriceClass>${distributionConfig.PriceClass}</PriceClass>`);
        }

        // Aliases (REQUIRED - even if empty)
        xmlParts.push('  <Aliases>');
        if (distributionConfig.Aliases && distributionConfig.Aliases.length > 0) {
            xmlParts.push(`    <Quantity>${distributionConfig.Aliases.length}</Quantity>`);
            xmlParts.push('    <Items>');
            distributionConfig.Aliases.forEach((alias: string) => {
                xmlParts.push(`      <member>${this.escapeXml(alias)}</member>`);
            });
            xmlParts.push('    </Items>');
        } else {
            xmlParts.push('    <Quantity>0</Quantity>');
        }
        xmlParts.push('  </Aliases>');

        // CacheBehaviors (REQUIRED - even if empty)
        xmlParts.push('  <CacheBehaviors>');
        xmlParts.push('    <Quantity>0</Quantity>');
        xmlParts.push('  </CacheBehaviors>');

        // CustomErrorResponses (REQUIRED - even if empty)
        xmlParts.push('  <CustomErrorResponses>');
        xmlParts.push('    <Quantity>0</Quantity>');
        xmlParts.push('  </CustomErrorResponses>');

        // Logging (REQUIRED - complete section)
        xmlParts.push('  <Logging>');
        if (distributionConfig.Logging && distributionConfig.Logging.Enabled) {
            xmlParts.push('    <Enabled>true</Enabled>');
            xmlParts.push('    <IncludeCookies>' + (distributionConfig.Logging.IncludeCookies ? 'true' : 'false') + '</IncludeCookies>');
            xmlParts.push('    <Bucket>' + (distributionConfig.Logging.Bucket || '') + '</Bucket>');
            xmlParts.push('    <Prefix>' + (distributionConfig.Logging.Prefix || '') + '</Prefix>');
        } else {
            xmlParts.push('    <Enabled>false</Enabled>');
            xmlParts.push('    <IncludeCookies>false</IncludeCookies>');
            xmlParts.push('    <Bucket></Bucket>');
            xmlParts.push('    <Prefix></Prefix>');
        }
        xmlParts.push('  </Logging>');

        // ViewerCertificate (REQUIRED for UpdateDistribution)
        if (distributionConfig.ViewerCertificate) {
            xmlParts.push('  <ViewerCertificate>');
            if (distributionConfig.ViewerCertificate.CloudFrontDefaultCertificate) {
                xmlParts.push(`    <CloudFrontDefaultCertificate>${distributionConfig.ViewerCertificate.CloudFrontDefaultCertificate ? 'true' : 'false'}</CloudFrontDefaultCertificate>`);
            }
            if (distributionConfig.ViewerCertificate.SSLSupportMethod) {
                xmlParts.push(`    <SSLSupportMethod>${distributionConfig.ViewerCertificate.SSLSupportMethod}</SSLSupportMethod>`);
            }
            if (distributionConfig.ViewerCertificate.MinimumProtocolVersion) {
                xmlParts.push(`    <MinimumProtocolVersion>${distributionConfig.ViewerCertificate.MinimumProtocolVersion}</MinimumProtocolVersion>`);
            }
            if (distributionConfig.ViewerCertificate.CertificateSource) {
                xmlParts.push(`    <CertificateSource>${distributionConfig.ViewerCertificate.CertificateSource}</CertificateSource>`);
            }
            xmlParts.push('  </ViewerCertificate>');
        }

        // Restrictions (CRITICAL - this was missing!)
        if (distributionConfig.Restrictions) {
            xmlParts.push('  <Restrictions>');
            xmlParts.push('    <GeoRestriction>');
            xmlParts.push(`      <RestrictionType>${distributionConfig.Restrictions.GeoRestriction.RestrictionType}</RestrictionType>`);
            xmlParts.push(`      <Quantity>${distributionConfig.Restrictions.GeoRestriction.Quantity}</Quantity>`);
            xmlParts.push('    </GeoRestriction>');
            xmlParts.push('  </Restrictions>');
        }

        // WebACLId (REQUIRED - even if empty)
        xmlParts.push(`  <WebACLId>${distributionConfig.WebACLId || ''}</WebACLId>`);

        // HttpVersion (REQUIRED for UpdateDistribution)
        if (distributionConfig.HttpVersion) {
            xmlParts.push(`  <HttpVersion>${distributionConfig.HttpVersion}</HttpVersion>`);
        }

        // IsIPV6Enabled (REQUIRED for UpdateDistribution)
        if (distributionConfig.IsIPV6Enabled !== undefined) {
            xmlParts.push(`  <IsIPV6Enabled>${distributionConfig.IsIPV6Enabled ? 'true' : 'false'}</IsIPV6Enabled>`);
        }

        // OriginGroups (REQUIRED - even if empty)
        xmlParts.push('  <OriginGroups>');
        xmlParts.push('    <Quantity>0</Quantity>');
        xmlParts.push('  </OriginGroups>');

        // Staging (REQUIRED for UpdateDistribution)
        xmlParts.push('  <Staging>false</Staging>');

        // ContinuousDeploymentPolicyId (REQUIRED - even if empty)
        xmlParts.push('  <ContinuousDeploymentPolicyId></ContinuousDeploymentPolicyId>');

        xmlParts.push('</DistributionConfig>');
        
        return xmlParts.join('\n');
    }

    protected parseCloudFrontResponse(xmlBody: string, headers?: any): CloudFrontResponse {
        const result: CloudFrontResponse = {};
        
        // Parse ETag from headers (case-insensitive check)
        if (headers && (headers.etag || headers.Etag)) {
            const etag = headers.etag || headers.Etag;
            result.ETag = etag.replace(/"/g, ''); // Remove quotes from ETag
        }
        
        // Parse Location from headers (for creation responses)
        if (headers && headers.location) {
            result.Location = headers.location;
        }
        
        // Parse distribution information from XML (handle namespace declarations)
        const distributionMatch = /<Distribution[^>]*>([\s\S]*?)<\/Distribution>/.exec(xmlBody);
        
        if (distributionMatch) {
            const distributionXml = distributionMatch[1];
            
            result.Distribution = {};
            
            const idMatch = /<Id>(.*?)<\/Id>/.exec(distributionXml);
            if (idMatch) {
                result.Distribution.Id = idMatch[1];
            }
            
            const arnMatch = /<ARN>(.*?)<\/ARN>/.exec(distributionXml);
            if (arnMatch) {
                result.Distribution.ARN = arnMatch[1];
            }
            
            const statusMatch = /<Status>(.*?)<\/Status>/.exec(distributionXml);
            if (statusMatch) {
                result.Distribution.Status = statusMatch[1];
            }
            
            const domainMatch = /<DomainName>(.*?)<\/DomainName>/.exec(distributionXml);
            if (domainMatch) {
                result.Distribution.DomainName = domainMatch[1];
            }
            
            const lastModifiedMatch = /<LastModifiedTime>(.*?)<\/LastModifiedTime>/.exec(distributionXml);
            if (lastModifiedMatch) {
                result.Distribution.LastModifiedTime = lastModifiedMatch[1];
            }
            
            // Parse DistributionConfig.Enabled field - target the distribution-level one after <PriceClass>
            // Multiple <Enabled> tags exist, we need the one in DistributionConfig section
            
            // Look for <Enabled> that comes after <PriceClass> in the DistributionConfig section
            const distributionEnabledMatch = /<PriceClass>[^<]*<\/PriceClass>\s*<Enabled>(.*?)<\/Enabled>/.exec(distributionXml);
            
            if (distributionEnabledMatch) {
                const enabledValue = distributionEnabledMatch[1].trim();
                const isEnabled = enabledValue === 'true';
                
                // Initialize DistributionConfig if it doesn't exist
                if (!result.Distribution.DistributionConfig) {
                    result.Distribution.DistributionConfig = {};
                }
                
                result.Distribution.DistributionConfig.Enabled = isEnabled;
            } else {
                
                // Initialize DistributionConfig if it doesn't exist
                if (!result.Distribution.DistributionConfig) {
                    result.Distribution.DistributionConfig = {};
                }
                
                result.Distribution.DistributionConfig.Enabled = false;
            }
        }
        
        return result;
    }


    protected handleCloudFrontError(response: any, _action: string): never {
        let errorMessage = `AWS CloudFront API error: ${response.statusCode} ${response.status}`;
        
        try {
            // Parse XML error response
            const errorMatch = /<Message>(.*?)<\/Message>/.exec(response.body);
            if (errorMatch) {
                errorMessage += ` - ${errorMatch[1]}`;
            }
            const codeMatch = /<Code>(.*?)<\/Code>/.exec(response.body);
            if (codeMatch) {
                errorMessage += ` (${codeMatch[1]})`;
            }
        } catch (_parseError) {
            errorMessage += ` - Raw: ${response.body}`;
        }
        
        throw new Error(errorMessage);
    }

    protected escapeXml(unsafe: string): string {
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    }

    // Abstract methods that concrete implementations must provide
    protected abstract checkDistributionExists(distributionId: string): any;
    
    protected getDistributionConfigForUpdate(distributionId: string): any {
        const url = `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distributionId}/config`;
        
        const response = aws.get(url, {
            service: 'cloudfront',
            region: 'us-east-1'  // CloudFront is global but uses us-east-1
        });
        
        if (response.statusCode !== 200) {
            const error = this.parseCloudFrontResponse(response.body);
            throw new Error(`Failed to get distribution config: ${error.Error?.Code} - ${error.Error?.Message}`);
        }
        
        const result = this.parseDistributionConfigResponse(response.body, response.headers);
        
        return result;
    }
    
    protected parseDistributionConfigResponse(xmlBody: string, headers?: any): any {
        const result: any = {};
        
        // Parse ETag from headers (case-insensitive check)
        if (headers && (headers.etag || headers.Etag)) {
            const etag = headers.etag || headers.Etag;
            result.ETag = etag.replace(/"/g, ''); // Remove quotes from ETag
        }
        
        // Store the complete raw DistributionConfig XML for passthrough approach
        const distributionConfigMatch = /<DistributionConfig[^>]*>([\s\S]*?)<\/DistributionConfig>/.exec(xmlBody);
        if (distributionConfigMatch) {
            const configXml = distributionConfigMatch[0]; // Full DistributionConfig element
            result.RawDistributionConfigXML = configXml;
            
            // Parse Enabled field for logic checks
            const enabledMatch = /<PriceClass>[^<]*<\/PriceClass>\s*<Enabled>(.*?)<\/Enabled>/.exec(configXml);
            if (enabledMatch) {
                const enabledValue = enabledMatch[1].trim();
                const isEnabled = enabledValue === 'true';
                
                // Store minimal info for logic checks
                result.DistributionConfig = {
                    Enabled: isEnabled
                };
                
                // Extract CallerReference for verification
                const callerRefMatch = /<CallerReference>(.*?)<\/CallerReference>/.exec(configXml);
                if (callerRefMatch) {
                    result.DistributionConfig.CallerReference = callerRefMatch[1];
                }
            }
        }
        
        return result;
    }
    protected abstract createDistribution(params: any): any;
    protected abstract updateDistribution(distributionId: string, params: any, etag: string): any;
    protected abstract deleteDistribution(distributionId: string, etag: string): any;
}

