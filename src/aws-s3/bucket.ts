import { AWSS3Entity, AWSS3Definition, AWSS3State } from "./base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";
import aws from "cloud/aws";
import {
    validateBucketName,
    DEFAULT_BUCKET_CONFIG,
    buildLifecycleConfigXml,
    buildEncryptionConfigXml,
    parseS3Error
} from "./common.ts";

/**
 * Definition interface for AWS S3 Bucket entity.
 * Configures bucket properties including versioning, encryption, CORS, lifecycle rules, and website hosting.
 * @interface S3BucketDefinition
 */
export interface S3BucketDefinition extends AWSS3Definition {
    /** @description S3 bucket name */
    bucket_name: string;
    /** @description Enable or disable bucket versioning
     *  @default false
     */
    versioning?: boolean;
    /** @description Whether to allow public reads (controls public access block)
     *  @default false
     */
    public_read_access?: boolean;
    /** @description Whether to allow public writes (controls public ACLs)
     *  @default false
     */
    public_write_access?: boolean;
    /** @description CORS configuration for the bucket */
    cors_configuration?: {
        /** @description List of CORS rules applied to the bucket */
        cors_rules: Array<{
            /** @description Allowed headers for CORS requests */
            allowed_headers?: string[];
            /** @description Allowed HTTP methods */
            allowed_methods: string[];
            /** @description Allowed origins */
            allowed_origins: string[];
            /** @description Response headers to expose */
            expose_headers?: string[];
            /** @description Max age for preflight results */
            max_age_seconds?: number;
        }>;
    };
    /** @description Lifecycle rules for automatic transitions/expiration */
    lifecycle_configuration?: {
        /** @description Lifecycle rules */
        rules: Array<{
            /** @description Rule identifier */
            id: string;
            /** @description Rule status */
            status: "Enabled" | "Disabled";
            /** @description Object filter for the rule */
            filter?: {
                /** @description Key prefix filter */
                prefix?: string;
                /** @description Tag filter */
                tags?: Record<string, string>;
            };
            /** @description Expiration settings */
            expiration?: {
                /** @description Expire after this many days */
                days?: number;
                /** @description Expire on specific date (YYYY-MM-DD) */
                date?: string;
            };
            /** @description Noncurrent version expiration settings */
            noncurrent_version_expiration?: {
                /** @description Days until noncurrent versions expire */
                noncurrent_days: number;
            };
            /** @description Storage class transition rules */
            transitions?: Array<{
                /** @description Transition after this many days */
                days?: number;
                /** @description Transition on specific date */
                date?: string;
                /** @description Target storage class */
                storage_class: "STANDARD_IA" | "ONEZONE_IA" | "GLACIER" | "DEEP_ARCHIVE";
            }>;
        }>;
    };
    /** @description Default server-side encryption configuration */
    server_side_encryption?: {
        /** @description Encryption rules */
        rules: Array<{
            /** @description Default encryption settings */
            apply_server_side_encryption_by_default: {
                /** @description Algorithm to use */
                sse_algorithm: "AES256" | "aws:kms";
                /** @description KMS key ID/ARN for aws:kms */
                kms_master_key_id?: string;
            };
            /** @description Enable S3 Bucket Keys for KMS */
            bucket_key_enabled?: boolean;
        }>;
    };
    /**
     * Static website hosting configuration
     */
    website_configuration?: {
        /** @description Index document for the website (default: index.html) */
        index_document?: string;
        /** @description Error document for the website (default: error.html) */
        error_document?: string;
    };
    /**
     * Bucket policy configuration for public access
     */
    bucket_policy?: {
        /** @description JSON policy document as string, or 'public-read' for standard public read policy */
        policy: string | "public-read";
    };
    /** @description Resource tags for the bucket */
    tags?: Record<string, string>;
}

/**
 * State interface for AWS S3 Bucket entity.
 * Contains runtime information about the created bucket.
 * Inherits: existing, bucket_name, region, location.
 * All other data (configuration, attributes, etc.) obtained via API calls.
 * @interface S3BucketState
 */
export interface S3BucketState extends AWSS3State {
}

interface S3ObjectInfo {
    key: string;
    size: string;
    lastModified: string;
}

/**
 * @description AWS S3 Bucket entity.
 * Creates and manages Amazon S3 buckets for scalable object storage.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.bucket_name` - Bucket name for SDK/API operations
 * - `state.region` - AWS region where the bucket resides
 * - `state.location` - Bucket location constraint
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-iam/role` - Create IAM roles with S3 access permissions
 * - `aws-lambda/function` - Store Lambda deployment packages
 * - `aws-cloudfront/distribution` - Serve static content via CDN
 */
export class S3Bucket extends AWSS3Entity<S3BucketDefinition, S3BucketState> {
    
    protected getBucketName(): string {
        return this.definition.bucket_name;
    }

    override create(): void {
        // Validate bucket name
        if (!validateBucketName(this.getBucketName())) {
            throw new Error(`Invalid bucket name: ${this.getBucketName()}`);
        }

        // Check if bucket already exists
        if (this.bucketExists(this.getBucketName())) {
            // Bucket already exists - store essential state
            cli.output(`Bucket ${this.getBucketName()} already exists, adopting it and applying configuration`);
            this.state.existing = true;
            this.state.bucket_name = this.getBucketName();
            this.state.region = this.region;
            
            // Get bucket location
            try {
                const location = this.getBucketLocation(this.getBucketName());
                this.state.location = location.LocationConstraint || this.region;
            } catch (error) {
                this.state.location = this.region;
            }
            
            // Configure existing bucket with current settings
            this.configureBucket();
            return;
        }

        // Create the bucket
        cli.output(`Creating new bucket: ${this.getBucketName()}`);
        this.createBucket(this.getBucketName());
        
        // Store essential state
        this.state.existing = false;
        this.state.bucket_name = this.getBucketName();
        this.state.region = this.region;
        this.state.location = this.region;

        // Configure bucket settings
        cli.output(`Configuring new bucket: ${this.getBucketName()}`);
        this.configureBucket();
    }

    private configureBucket(): void {
        const bucketName = this.getBucketName();
        
        // Configure versioning
        const versioning = this.definition.versioning ?? DEFAULT_BUCKET_CONFIG.versioning;
        if (versioning !== undefined) {
            this.setBucketVersioning(bucketName, versioning);
        }

        // Configure public access block
        const publicReadAccess = this.definition.public_read_access ?? DEFAULT_BUCKET_CONFIG.public_read_access;
        const publicWriteAccess = this.definition.public_write_access ?? DEFAULT_BUCKET_CONFIG.public_write_access;
        this.setBucketPublicAccessBlock(bucketName, publicReadAccess, publicWriteAccess);

        // Configure CORS if specified
        if (this.definition.cors_configuration?.cors_rules) {
            this.setBucketCors(bucketName, [...this.definition.cors_configuration.cors_rules]);
        }

        // Configure lifecycle if specified
        if (this.definition.lifecycle_configuration?.rules) {
            this.setBucketLifecycle(bucketName, [...this.definition.lifecycle_configuration.rules]);
        }

        // Configure server-side encryption if specified
        if (this.definition.server_side_encryption?.rules) {
            this.setBucketEncryption(bucketName, [...this.definition.server_side_encryption.rules]);
        }

        // Configure website hosting if specified
        if (this.definition.website_configuration) {
            const indexDoc = this.definition.website_configuration.index_document || "index.html";
            const errorDoc = this.definition.website_configuration.error_document;
            cli.output(`Configuring website hosting: index=${indexDoc}, error=${errorDoc || 'none'}`);
            this.setBucketWebsite(bucketName, indexDoc, errorDoc);
            cli.output(`Website hosting configured successfully`);
        }

        // Configure bucket policy if specified
        if (this.definition.bucket_policy) {
            cli.output(`Configuring bucket policy: ${this.definition.bucket_policy.policy}`);
            this.setBucketPolicy(bucketName, this.definition.bucket_policy.policy);
            cli.output(`Bucket policy configured successfully`);
        }

        // Set tags if specified (skip if fails due to checksum requirement)
        if (this.definition.tags) {
            try {
                this.setBucketTags(bucketName, this.definition.tags);
            } catch (error) {
                cli.output(`Warning: Failed to set bucket tags (AWS S3 tagging requires checksum headers): ${(error as Error).message}`);
                cli.output(`Bucket created successfully, but tags were not applied. This is a known limitation.`);
            }
        }
    }

    override start(): void {
        // For S3 buckets, start means ensuring the bucket is ready for operations
        this.checkReadiness();
    }

    override stop(): void {
        // For S3 buckets, there's no specific stop operation
        // The bucket remains available until deleted
    }

    override update(): void {
        if (!this.state.bucket_name) {
            throw new Error('Bucket name not available for update');
        }

        // Reconfigure bucket settings
        this.configureBucket();
    }

    override delete(): void {
        if (!this.state.bucket_name) {
            try {
                // Try to check if bucket exists
                if (!this.bucketExists(this.getBucketName())) {
                    return;
                }
            } catch (error) {
                return;
            }
        }

        try {
            this.deleteBucket(this.getBucketName());
        } catch (error) {
            throw new Error(`Failed to delete bucket: ${(error as Error).message}`);
        }

        // Clear state
        this.state.bucket_name = undefined;
        this.state.region = undefined;
        this.state.location = undefined;
        this.state.existing = false;
    }

    override checkReadiness(): boolean {
        if (!this.state.bucket_name) {
            return false;
        }

        try {
            return this.bucketExists(this.getBucketName());
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    
    // Custom actions

    @action()
    getBucketInfo(_args?: Args): void {
        if (!this.state.bucket_name) {
            throw new Error('Bucket not created yet');
        }

        try {
            const location = this.getBucketLocation(this.getBucketName());
            
            const bucketInfo = {
                bucket_name: this.state.bucket_name,
                region: this.state.region,
                location: location.LocationConstraint || this.state.region,
                url: this.getBucketUrl(this.getBucketName())
            };
            
            cli.output(`Bucket Information:\n${JSON.stringify(bucketInfo, null, 2)}`);
        } catch (error) {
            throw new Error(`Failed to get bucket info: ${(error as Error).message}`);
        }
    }

    @action()
    listObjects(args?: Args): void {
        if (!this.state.bucket_name) {
            throw new Error('Bucket not created yet');
        }

        const prefix = args?.prefix as string || '';
        const maxKeys = parseInt(args?.max_keys as string || '1000', 10);
        
        const url = this.getBucketUrl(this.getBucketName(), `?list-type=2&max-keys=${maxKeys}${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ''}`);
        
        try {
            this.headBucket(this.getBucketName()); // First check if bucket exists
            
            const listResponse = this.listBucketObjects(url);
            
            // Parse and display objects in a readable format
            const objectKeys = this.parseObjectKeysFromResponse(listResponse.body);
            const objectInfo = this.parseObjectInfoFromResponse(listResponse.body);
            
            cli.output(`Found ${objectKeys.length} objects in bucket ${this.getBucketName()}:`);
            if (objectKeys.length > 0) {
                objectInfo.forEach(obj => {
                    cli.output(`  - ${obj.key} (${obj.size} bytes, modified: ${obj.lastModified})`);
                });
            } else {
                cli.output("  (bucket is empty)");
            }
        } catch (error) {
            throw new Error(`Failed to list objects: ${(error as Error).message}`);
        }
    }

    @action()
    generatePresignedUrl(args?: Args): void {
        if (!this.state.bucket_name) {
            throw new Error('Bucket not created yet');
        }

        const objectKey = args?.object_key as string;
        const method = args?.method as string || 'GET';
        const expires = parseInt(args?.expires as string || '3600', 10); // 1 hour default
        
        if (!objectKey) {
            throw new Error('object_key parameter is required');
        }

        const url = this.getBucketUrl(this.getBucketName(), objectKey);
        
        try {
            const presignedResult = this.generatePresignedUrlForObject(url, method, expires);
            
            cli.output(`Presigned URL for ${method} ${objectKey}:`);
            cli.output(`URL: ${presignedResult.url}`);
            if (presignedResult.headers && Object.keys(presignedResult.headers).length > 0) {
                cli.output(`Headers: ${JSON.stringify(presignedResult.headers, null, 2)}`);
            }
        } catch (error) {
            throw new Error(`Failed to generate presigned URL: ${(error as Error).message}`);
        }
    }

    @action()
    emptyBucket(_args?: Args): void {
        if (!this.state.bucket_name) {
            throw new Error('Bucket not created yet');
        }

        try {
            let deletedCount = 0;
            let continuationToken: string | undefined;
            
            do {
                // List objects with pagination support
                let listUrl = this.getBucketUrl(this.getBucketName(), '?list-type=2&max-keys=1000');
                if (continuationToken) {
                    listUrl += `&continuation-token=${encodeURIComponent(continuationToken)}`;
                }
                
                const listResponse = this.listBucketObjects(listUrl);
                
                // Parse the XML response to extract object keys
                const objectKeys = this.parseObjectKeysFromResponse(listResponse.body);
                
                if (objectKeys.length === 0) {
                    break; // No more objects to delete
                }
                
                // Delete objects in batch (up to 1000 at a time)
                const deleteCount = this.deleteObjectsBatch(objectKeys);
                deletedCount += deleteCount;
                
                // Check if there are more objects (pagination)
                const nextTokenMatch = listResponse.body.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
                continuationToken = nextTokenMatch ? nextTokenMatch[1] : undefined;
                
            } while (continuationToken);
            
            cli.output(`Successfully deleted ${deletedCount} objects from bucket ${this.getBucketName()}`);
            
        } catch (error) {
            throw new Error(`Failed to empty bucket: ${(error as Error).message}`);
        }
    }

    @action()
    getBucketStatistics(_args?: Args): void {
        if (!this.state.bucket_name) {
            throw new Error('Bucket not created yet');
        }

        try {
            let totalObjects = 0;
            let totalSize = 0;
            let continuationToken: string | undefined;
            
            do {
                // List objects with pagination support
                let listUrl = this.getBucketUrl(this.getBucketName(), '?list-type=2&max-keys=1000');
                if (continuationToken) {
                    listUrl += `&continuation-token=${encodeURIComponent(continuationToken)}`;
                }
                
                const listResponse = this.listBucketObjects(listUrl);
                const objectInfo = this.parseObjectInfoFromResponse(listResponse.body);
                
                totalObjects += objectInfo.length;
                totalSize += objectInfo.reduce((sum, obj) => sum + parseInt(obj.size, 10), 0);
                
                // Check if there are more objects (pagination)
                const nextTokenMatch = listResponse.body.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
                continuationToken = nextTokenMatch ? nextTokenMatch[1] : undefined;
                
            } while (continuationToken);
            
            const statistics = {
                bucket_name: this.state.bucket_name,
                total_objects: totalObjects,
                total_size_bytes: totalSize,
                total_size_mb: Math.round(totalSize / (1024 * 1024) * 100) / 100,
                total_size_gb: Math.round(totalSize / (1024 * 1024 * 1024) * 100) / 100
            };
            
            cli.output(`Bucket Statistics:\n${JSON.stringify(statistics, null, 2)}`);
            
        } catch (error) {
            throw new Error(`Failed to get bucket statistics: ${(error as Error).message}`);
        }
    }

    @action()
    getWebsiteInfo(_args?: Args): void {
        if (!this.state.bucket_name) {
            throw new Error('Bucket not created yet');
        }
        
        const bucketName = this.getBucketName();
        
        try {
            cli.output(`=== Website Configuration Information ===`);
            cli.output(`Bucket: ${bucketName}`);
            cli.output(`Region: ${this.region}`);
            
            // Check if website hosting is configured
            const websiteConfig = this.getBucketWebsite(bucketName);
            if (websiteConfig) {
                cli.output(`✅ Website hosting: ENABLED`);
                cli.output(`📄 Website URL: http://${bucketName}.s3-website-${this.region}.amazonaws.com`);
                cli.output(`🌍 Website URL (alternative): http://${bucketName}.s3-website.${this.region}.amazonaws.com`);
                
                // Parse website configuration from response
                const indexMatch = websiteConfig.body.match(/<Suffix>(.*?)<\/Suffix>/);
                const errorMatch = websiteConfig.body.match(/<Key>(.*?)<\/Key>/);
                
                if (indexMatch) {
                    cli.output(`📝 Index document: ${indexMatch[1]}`);
                }
                if (errorMatch) {
                    cli.output(`❌ Error document: ${errorMatch[1]}`);
                }
            } else {
                cli.output(`❌ Website hosting: DISABLED`);
                cli.output(`💡 To enable: Configure website_configuration in entity definition`);
            }
            
        } catch (error) {
            throw new Error(`Failed to get website info: ${(error as Error).message}`);
        }
    }

    // Helper methods for custom actions

    private listBucketObjects(url: string): any {
        const response = aws.get(url, {
            service: 's3',
            region: this.region
        });

        if (response.statusCode !== 200) {
            const error = parseS3Error(response);
            throw new Error(`Failed to list bucket objects: ${error}`);
        }
        
        return response;
    }

    private generatePresignedUrlForObject(url: string, method: string, expires: number): any {
        try {
            const presignedResult = aws.presign(url, {
                method: method,
                service: 's3',
                region: this.region,
                expire: expires
            });
            
            return presignedResult;
        } catch (error) {
            throw new Error(`Failed to generate presigned URL: ${(error as Error).message}`);
        }
    }

    private setBucketLifecycle(bucketName: string, rules: any[]): any {
        const url = this.getBucketUrl(bucketName, "?lifecycle");
        
        const lifecycleConfig = buildLifecycleConfigXml(rules);
        
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            headers: {
                'Content-Type': 'application/xml'
            },
            body: lifecycleConfig
        });

        if (response.statusCode !== 200) {
            const error = parseS3Error(response);
            throw new Error(`Failed to set bucket lifecycle: ${error}`);
        }
        
        return response;
    }

    private setBucketEncryption(bucketName: string, rules: any[]): any {
        const url = this.getBucketUrl(bucketName, "?encryption");
        
        const encryptionConfig = buildEncryptionConfigXml(rules);
        
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            headers: {
                'Content-Type': 'application/xml'
            },
            body: encryptionConfig
        });

        if (response.statusCode !== 200) {
            const error = parseS3Error(response);
            throw new Error(`Failed to set bucket encryption: ${error}`);
        }
        
        return response;
    }

    private parseObjectKeysFromResponse(xmlResponse: string): string[] {
        const objectKeys: string[] = [];
        
        // Parse XML response to extract object keys
        const keyMatches = xmlResponse.match(/<Key>(.*?)<\/Key>/g);
        
        if (keyMatches) {
            for (const match of keyMatches) {
                const keyMatch = match.match(/<Key>(.*?)<\/Key>/);
                if (keyMatch && keyMatch[1]) {
                    objectKeys.push(keyMatch[1]);
                }
            }
        }
        
        return objectKeys;
    }

    private parseObjectInfoFromResponse(xmlResponse: string): S3ObjectInfo[] {
        const objects: S3ObjectInfo[] = [];
        
        // Parse XML response to extract complete object information
        const contentMatches = xmlResponse.match(/<Contents>[\s\S]*?<\/Contents>/g);
        
        if (contentMatches) {
            for (const match of contentMatches) {
                const keyMatch = match.match(/<Key>(.*?)<\/Key>/);
                const sizeMatch = match.match(/<Size>(.*?)<\/Size>/);
                const lastModifiedMatch = match.match(/<LastModified>(.*?)<\/LastModified>/);
                
                if (keyMatch && sizeMatch && lastModifiedMatch) {
                    objects.push({
                        key: keyMatch[1],
                        size: sizeMatch[1],
                        lastModified: lastModifiedMatch[1]
                    });
                }
            }
        }
        
        return objects;
    }

    private deleteObjectsBatch(objectKeys: string[]): number {
        if (objectKeys.length === 0) {
            return 0;
        }

        // Build delete request XML
        const deleteObjectsXml = objectKeys.map(key => 
            `<Object><Key>${this.escapeXml(key)}</Key></Object>`
        ).join('');

        const deleteRequestXml = `<?xml version="1.0" encoding="UTF-8"?>
<Delete xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    ${deleteObjectsXml}
</Delete>`;

        const url = this.getBucketUrl(this.getBucketName(), '?delete');

        try {
            const response = aws.post(url, {
                service: 's3',
                region: this.region,
                headers: {
                    'Content-Type': 'application/xml'
                },
                body: deleteRequestXml
            });

            if (response.statusCode !== 200) {
                const error = parseS3Error(response);
                throw new Error(`Failed to delete objects: ${error}`);
            }

            return objectKeys.length;
        } catch (error) {
            // If bulk delete fails (likely due to checksum requirements), 
            // fall back to individual delete operations
            const errorMessage = error && (error as Error).message ? (error as Error).message : String(error);
            cli.output(`Bulk delete failed, falling back to individual deletes: ${errorMessage}`);
            return this.deleteObjectsIndividually(objectKeys);
        }
    }

    private deleteObjectsIndividually(objectKeys: string[]): number {
        let deletedCount = 0;
        
        cli.output(`Attempting to delete ${objectKeys.length} objects individually...`);
        
        for (const key of objectKeys) {
            try {
                // Fix URL construction - don't add leading slash since getBucketUrl already does it
                const url = this.getBucketUrl(this.getBucketName(), encodeURIComponent(key));
                
                cli.output(`Deleting object: ${key} (URL: ${url})`);
                
                const response = aws.delete(url, {
                    service: 's3',
                    region: this.region
                });

                if (response.statusCode === 204 || response.statusCode === 200) {
                    deletedCount++;
                    cli.output(`Successfully deleted object: ${key}`);
                } else {
                    cli.output(`Warning: Failed to delete object ${key}: status ${response.statusCode}`);
                }
            } catch (error) {
                cli.output(`Warning: Failed to delete object ${key}: ${(error as Error).message}`);
            }
        }
        
        cli.output(`Individual delete completed. Deleted ${deletedCount} out of ${objectKeys.length} objects.`);
        return deletedCount;
    }

    private escapeXml(unsafe: string): string {
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
} 