/**
 * Common utilities and helper functions for AWS S3 entities
 */

/**
 * Helper function to validate S3 bucket name according to AWS S3 rules
 */
export function validateBucketName(bucketName: string): boolean {
    // Bucket naming rules:
    // - Between 3 and 63 characters long
    // - Can consist only of lowercase letters, numbers, dots (.), and hyphens (-)
    // - Must begin and end with a letter or number
    // - Must not contain two adjacent periods
    // - Must not be formatted as an IP address (e.g., 192.168.1.1)
    
    if (!bucketName || bucketName.length < 3 || bucketName.length > 63) {
        return false;
    }
    
    // Check for valid characters only
    if (!/^[a-z0-9.-]+$/.test(bucketName)) {
        return false;
    }
    
    // Must begin and end with a letter or number
    if (!/^[a-z0-9]/.test(bucketName) || !/[a-z0-9]$/.test(bucketName)) {
        return false;
    }
    
    // Must not contain two adjacent periods
    if (bucketName.includes('..')) {
        return false;
    }
    
    // Must not be formatted as an IP address
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipRegex.test(bucketName)) {
        return false;
    }
    
    return true;
}

/**
 * Helper function to parse S3 API errors from response
 */
export function parseS3Error(response: any): string {
    if (response.error) {
        return response.error;
    }
    
    if (response.body) {
        try {
            // Try to parse XML error response
            const errorCodeMatch = response.body.match(/<Code>(.*?)<\/Code>/);
            const errorMessageMatch = response.body.match(/<Message>(.*?)<\/Message>/);
            
            if (errorCodeMatch && errorMessageMatch) {
                return `${errorCodeMatch[1]}: ${errorMessageMatch[1]}`;
            }
            
            if (errorCodeMatch) {
                return errorCodeMatch[1];
            }
            
            if (errorMessageMatch) {
                return errorMessageMatch[1];
            }
        } catch (e) {
            // Fall back to raw body if XML parsing fails
            return response.body;
        }
    }
    
    return `HTTP ${response.statusCode}: ${response.status || 'Unknown error'}`;
}

/**
 * Default bucket configuration for standard buckets
 */
export const DEFAULT_BUCKET_CONFIG = {
    versioning: false,
    public_read_access: false,
    public_write_access: false
};

/**
 * Helper function to validate object key name according to AWS S3 rules
 */
export function validateObjectKey(key: string): boolean {
    // Object key naming rules:
    // - Can be up to 1,024 characters long
    // - Can contain any UTF-8 character
    // - But certain characters may cause issues with some tools
    
    if (!key || key.length === 0 || key.length > 1024) {
        return false;
    }
    
    // Check for characters that might cause issues
    const problematicChars = /[\x00-\x1F\x7F]/; // Control characters
    if (problematicChars.test(key)) {
        return false;
    }
    
    return true;
}

/**
 * Helper function to escape XML special characters
 */
export function escapeXml(unsafe: string): string {
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

/**
 * Helper function to check if a string is a valid AWS region
 */
export function validateRegion(region: string): boolean {
    // Basic validation for AWS region format
    const regionRegex = /^[a-z]{2}-[a-z]+-\d+$/;
    return regionRegex.test(region);
}

/**
 * Helper function to generate presigned URL parameters
 */
export function generatePresignedUrlParams(_method: string, expires: number): string {
    // const _expireTime = Math.floor(Date.now() / 1000) + expires;
    return `X-Amz-Expires=${expires}&X-Amz-Date=${new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '')}`;
}

/**
 * Storage class options for S3 lifecycle rules
 */
export const STORAGE_CLASSES = [
    'STANDARD',
    'STANDARD_IA',
    'ONEZONE_IA', 
    'REDUCED_REDUNDANCY',
    'GLACIER',
    'DEEP_ARCHIVE',
    'INTELLIGENT_TIERING'
] as const;

/**
 * Valid CORS methods for S3
 */
export const CORS_METHODS = [
    'GET',
    'PUT', 
    'POST',
    'DELETE',
    'HEAD'
] as const;

/**
 * Helper function to build XML for lifecycle configuration
 */
export function buildLifecycleConfigXml(rules: any[]): string {
    const rulesXml = rules.map(rule => {
        let ruleXml = `<Rule>
            <ID>${escapeXml(rule.id)}</ID>
            <Status>${rule.status}</Status>`;
        
        // Add filter if present
        if (rule.filter) {
            ruleXml += '<Filter>';
            // If both prefix and tags are present, they must be inside an <And> element
            if (rule.filter.prefix && rule.filter.tags) {
                ruleXml += '<And>';
                ruleXml += `<Prefix>${escapeXml(rule.filter.prefix)}</Prefix>`;
                Object.entries(rule.filter.tags).forEach(([key, value]) => {
                    ruleXml += `<Tag><Key>${escapeXml(key)}</Key><Value>${escapeXml(value as string)}</Value></Tag>`;
                });
                ruleXml += '</And>';
            } else if (rule.filter.prefix) {
                // Only prefix, no tags
                ruleXml += `<Prefix>${escapeXml(rule.filter.prefix)}</Prefix>`;
            } else if (rule.filter.tags) {
                // Only tags, no prefix
                Object.entries(rule.filter.tags).forEach(([key, value]) => {
                    ruleXml += `<Tag><Key>${escapeXml(key)}</Key><Value>${escapeXml(value as string)}</Value></Tag>`;
                });
            }
            ruleXml += '</Filter>';
        }
        
        // Add expiration if present
        if (rule.expiration) {
            ruleXml += '<Expiration>';
            if (rule.expiration.days) {
                ruleXml += `<Days>${rule.expiration.days}</Days>`;
            }
            if (rule.expiration.date) {
                ruleXml += `<Date>${rule.expiration.date}</Date>`;
            }
            ruleXml += '</Expiration>';
        }
        
        // Add transitions if present
        if (rule.transitions) {
            rule.transitions.forEach((transition: any) => {
                ruleXml += '<Transition>';
                if (transition.days) {
                    ruleXml += `<Days>${transition.days}</Days>`;
                }
                if (transition.date) {
                    ruleXml += `<Date>${transition.date}</Date>`;
                }
                ruleXml += `<StorageClass>${transition.storage_class}</StorageClass>`;
                ruleXml += '</Transition>';
            });
        }
        
        ruleXml += '</Rule>';
        return ruleXml;
    }).join('');
    
    return `<LifecycleConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
        ${rulesXml}
    </LifecycleConfiguration>`;
}

/**
 * Helper function to build XML for server-side encryption configuration
 */
export function buildEncryptionConfigXml(rules: any[]): string {
    const rulesXml = rules.map(rule => {
        let ruleXml = `<Rule>
            <ApplyServerSideEncryptionByDefault>
                <SSEAlgorithm>${rule.apply_server_side_encryption_by_default.sse_algorithm}</SSEAlgorithm>`;
        
        if (rule.apply_server_side_encryption_by_default.kms_master_key_id) {
            ruleXml += `<KMSMasterKeyID>${escapeXml(rule.apply_server_side_encryption_by_default.kms_master_key_id)}</KMSMasterKeyID>`;
        }
        
        ruleXml += '</ApplyServerSideEncryptionByDefault>';
        
        if (rule.bucket_key_enabled !== undefined) {
            ruleXml += `<BucketKeyEnabled>${rule.bucket_key_enabled}</BucketKeyEnabled>`;
        }
        
        ruleXml += '</Rule>';
        return ruleXml;
    }).join('');
    
    return `<ServerSideEncryptionConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
        ${rulesXml}
    </ServerSideEncryptionConfiguration>`;
} 