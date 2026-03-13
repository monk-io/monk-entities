import { AWSS3Entity, AWSS3Definition, AWSS3State } from "./s3-base.ts";
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

    /**
     * Get estimated monthly cost for this S3 bucket based on current storage usage
     * and actual request metrics from CloudWatch.
     * 
     * Calculates costs based on:
     * - Storage size by storage class (STANDARD, STANDARD_IA, GLACIER, etc.) - from S3 API
     * - Request counts (GET, PUT, DELETE, etc.) - from CloudWatch metrics (last 30 days)
     * - Region-specific pricing - from AWS Price List API
     * 
     * Note: This is an estimate. Actual costs may vary based on:
     * - Data transfer out (not included)
     * - S3 Select, Inventory, Analytics features
     * - Retrieval fees for Glacier
     * 
     * Required IAM permissions:
     * - pricing:GetProducts (for pricing data)
     * - cloudwatch:GetMetricStatistics (for request metrics)
     * - s3:ListBucket (for storage analysis)
     */
   @action("get-cost-estimate")
   getCostEstimate(_args?: Args): void {
        if (!this.state.bucket_name) {
            throw new Error('Bucket not created yet');
        }

        try {
            // Use CloudWatch BucketSizeBytes (per storage class) and NumberOfObjects
            // instead of paginated ListObjectsV2. For buckets with millions of objects,
            // ListObjectsV2 would require thousands of sequential API calls and could
            // time out. CloudWatch storage metrics are daily aggregates that return the
            // same information in a single API call per storage class.
            const bucketSizeByClass = this.getCloudWatchBucketSizeBytes();
            const totalObjects = this.getCloudWatchObjectCount();

            // Get pricing rates for the region
            const pricing = this.getS3PricingRates();

            // Calculate costs by storage class
            const costBreakdown: Record<string, {
                size_gb: number;
                storage_cost: number;
                rate_per_gb: number;
            }> = {};

            let totalStorageCost = 0;
            let totalSize = 0;

            for (const [storageClass, bytes] of Object.entries(bucketSizeByClass)) {
                const sizeGB = bytes / (1024 * 1024 * 1024);
                const rate = pricing.storage[storageClass] ?? pricing.storage['STANDARD'] ?? 0;
                const cost = sizeGB * rate;

                costBreakdown[storageClass] = {
                    size_gb: Math.round(sizeGB * 1000) / 1000,
                    storage_cost: Math.round(cost * 100) / 100,
                    rate_per_gb: rate
                };

                totalStorageCost += cost;
                totalSize += bytes;
            }

            // Get actual request metrics from CloudWatch
            const requestMetrics = this.getCloudWatchRequestMetrics();

            // Get data transfer metrics from CloudWatch
            const dataTransferMetrics = this.getCloudWatchDataTransferMetrics();

            // Calculate request costs based on actual CloudWatch metrics only
            let putRequests = 0;
            let getRequests = 0;
            let putRequestCost = 0;
            let getRequestCost = 0;
            let requestMetricsSource: string;

            if (requestMetrics) {
                // Use actual CloudWatch metrics
                putRequests = requestMetrics.putRequests;
                getRequests = requestMetrics.getRequests;
                requestMetricsSource = "CloudWatch (last 30 days)";
                putRequestCost = (putRequests / 1000) * pricing.requests.put;
                getRequestCost = (getRequests / 1000) * pricing.requests.get;
            } else {
                // Do not guess request counts - report as unavailable
                requestMetricsSource = "Not available (CloudWatch request metrics not enabled)";
            }

            // Calculate data transfer costs
            const dataTransferOutGB = dataTransferMetrics ? dataTransferMetrics.bytesDownloaded / (1024 * 1024 * 1024) : 0;
            const dataTransferInGB = dataTransferMetrics ? dataTransferMetrics.bytesUploaded / (1024 * 1024 * 1024) : 0;

            // Calculate data transfer out cost using tiered pricing from AWS Price List API
            let dataTransferOutCost = 0;
            if (dataTransferOutGB > 0) {
                const dataTransferTiers = this.fetchDataTransferOutTiers();
                dataTransferOutCost = this.calculateTieredDataTransferCost(dataTransferOutGB, dataTransferTiers);
            }

            const totalEstimatedCost = totalStorageCost + putRequestCost + getRequestCost + dataTransferOutCost;

            // Determine overall metrics source
            const hasCloudWatchMetrics = requestMetrics !== null || dataTransferMetrics !== null;

            const costEstimate = {
                bucket_name: this.state.bucket_name,
                region: this.region,
                summary: {
                    total_objects: totalObjects ?? "unavailable",
                    total_size_bytes: totalSize,
                    total_size_gb: Math.round(totalSize / (1024 * 1024 * 1024) * 1000) / 1000,
                    storage_source: "CloudWatch BucketSizeBytes (daily metric, per storage class)",
                    estimated_monthly_cost_usd: Math.round(totalEstimatedCost * 100) / 100
                },
                storage_costs: {
                    breakdown_by_class: costBreakdown,
                    total_storage_cost_usd: Math.round(totalStorageCost * 100) / 100
                },
                request_costs: {
                    source: requestMetricsSource,
                    put_requests: putRequests,
                    get_requests: getRequests,
                    all_requests: requestMetrics ? requestMetrics.allRequests : putRequests + getRequests,
                    put_cost_usd: Math.round(putRequestCost * 100) / 100,
                    get_cost_usd: Math.round(getRequestCost * 100) / 100,
                    total_request_cost_usd: Math.round((putRequestCost + getRequestCost) * 100) / 100
                },
                data_transfer_costs: {
                    source: dataTransferMetrics ? "CloudWatch (last 30 days)" : "Not available (CloudWatch metrics not enabled)",
                    bytes_downloaded: dataTransferMetrics ? dataTransferMetrics.bytesDownloaded : 0,
                    bytes_uploaded: dataTransferMetrics ? dataTransferMetrics.bytesUploaded : 0,
                    download_gb: Math.round(dataTransferOutGB * 1000) / 1000,
                    upload_gb: Math.round(dataTransferInGB * 1000) / 1000,
                    download_cost_usd: Math.round(dataTransferOutCost * 100) / 100,
                    upload_cost_usd: 0, // Data transfer IN is free
                    total_transfer_cost_usd: Math.round(dataTransferOutCost * 100) / 100,
                    pricing_note: "Data OUT tiered pricing fetched from AWS Price List API. Data IN: Free."
                },
                pricing_rates: {
                    source: "AWS Price List API",
                    region: this.region,
                    currency: "USD",
                    storage_per_gb_month: pricing.storage,
                    requests_per_1000: pricing.requests
                },
                disclaimer: hasCloudWatchMetrics
                    ? "Pricing from AWS Price List API. Metrics from CloudWatch (last 30 days). Enable S3 Request Metrics for accurate request/transfer data."
                    : "Pricing from AWS Price List API. CloudWatch metrics unavailable - enable S3 Request Metrics for accurate data."
            };

            cli.output(`S3 Cost Estimate:\n${JSON.stringify(costEstimate, null, 2)}`);

        } catch (error) {
            throw new Error(`Failed to get cost estimate: ${(error as Error).message}`);
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

    /**
     * Get S3 pricing rates for the current region.
     * Fetches real-time pricing from AWS Price List API.
     * 
     * Prices are in USD per GB per month for storage, and per 1,000 requests
     * (normalized from whatever bulk unit the AWS Price List API returns).
     * 
     * @throws Error if pricing cannot be fetched from AWS API
     */
    private getS3PricingRates(): {
        storage: Record<string, number>;
        requests: { put: number; get: number };
    } {
        const apiPricing = this.fetchS3PricingFromAPI();
        if (!apiPricing) {
            throw new Error('Failed to fetch pricing from AWS Price List API. Ensure your credentials have pricing:GetProducts permission.');
        }
        return apiPricing;
    }

    /**
     * Fetch S3 pricing from AWS Price List Service API.
     * The API is only available in us-east-1 and ap-south-1 regions.
     * 
     * @see https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-changes.html
     */
    private fetchS3PricingFromAPI(): {
        storage: Record<string, number>;
        requests: { put: number; get: number };
    } | null {
        // AWS Price List API endpoint (only available in us-east-1 and ap-south-1)
        const pricingRegion = 'us-east-1';
        const url = `https://api.pricing.${pricingRegion}.amazonaws.com/`;
        
        // Map our region to AWS location name for filtering
        const regionToLocation = this.getRegionToLocationMap();
        const location = regionToLocation[this.region];
        
        if (!location) {
            // Return null so getS3PricingRates() throws a clear error — there is no fallback.
            return null;
        }

        // Build the GetProducts request for S3 storage pricing
        const storageFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AmazonS3' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'productFamily', Value: 'Storage' }
        ];

        const storageRequestBody = {
            ServiceCode: 'AmazonS3',
            Filters: storageFilters,
            MaxResults: 100
        };

        const storageResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify(storageRequestBody)
        });

        if (storageResponse.statusCode !== 200) {
            cli.output(`AWS Pricing API returned status ${storageResponse.statusCode}: ${storageResponse.body}`);
            return null;
        }

        // Parse storage pricing from response
        const storagePricing = this.parseStoragePricingResponse(storageResponse.body);
        
        // Build the GetProducts request for S3 request pricing
        const requestFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AmazonS3' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'productFamily', Value: 'API Request' }
        ];

        const requestRequestBody = {
            ServiceCode: 'AmazonS3',
            Filters: requestFilters,
            MaxResults: 100
        };

        const requestResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify(requestRequestBody)
        });

        // Parse request pricing from response
        if (requestResponse.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${requestResponse.statusCode} for S3 request pricing`);
        }
        const requestPricing = this.parseRequestPricingResponse(requestResponse.body);
        if (!requestPricing) {
            throw new Error('Could not parse S3 request pricing from AWS Price List API response');
        }

        // If we got valid storage pricing, return it
        if (Object.keys(storagePricing).length > 0) {
            return {
                storage: storagePricing,
                requests: requestPricing
            };
        }

        return null;
    }

    /**
     * Parse storage pricing from AWS Price List API response.
     */
    private parseStoragePricingResponse(responseBody: string): Record<string, number> {
        const pricing: Record<string, number> = {};
        
        try {
            const data = JSON.parse(responseBody);
            const priceList = data.PriceList || [];
            
            for (const priceItemStr of priceList) {
                const priceItem = typeof priceItemStr === 'string' ? JSON.parse(priceItemStr) : priceItemStr;
                const product = priceItem.product;
                const terms = priceItem.terms;
                
                if (!product || !terms) continue;
                
                const attributes = product.attributes || {};
                const storageClass = attributes.storageClass || attributes.volumeType;
                const usageType = attributes.usagetype || '';
                
                // Map AWS storage class names to our internal names
                const storageClassMap: Record<string, string> = {
                    'General Purpose': 'STANDARD',
                    'Standard': 'STANDARD',
                    'Standard - Infrequent Access': 'STANDARD_IA',
                    'Infrequent Access': 'STANDARD_IA',
                    'One Zone - Infrequent Access': 'ONEZONE_IA',
                    'Intelligent-Tiering': 'INTELLIGENT_TIERING',
                    'Glacier Flexible Retrieval': 'GLACIER',
                    'Glacier': 'GLACIER',
                    'Glacier Instant Retrieval': 'GLACIER_IR',
                    'Glacier Deep Archive': 'DEEP_ARCHIVE',
                    'Reduced Redundancy': 'REDUCED_REDUNDANCY'
                };
                
                // Also check usagetype for storage class hints
                let mappedClass: string | undefined;
                if (storageClass) {
                    mappedClass = storageClassMap[storageClass];
                }
                if (!mappedClass && usageType) {
                    if (usageType.includes('TimedStorage-ByteHrs')) mappedClass = 'STANDARD';
                    else if (usageType.includes('TimedStorage-SIA-ByteHrs')) mappedClass = 'STANDARD_IA';
                    else if (usageType.includes('TimedStorage-ZIA-ByteHrs')) mappedClass = 'ONEZONE_IA';
                    else if (usageType.includes('TimedStorage-INT-FA-ByteHrs')) mappedClass = 'INTELLIGENT_TIERING';
                    else if (usageType.includes('TimedStorage-GlacierByteHrs')) mappedClass = 'GLACIER';
                    else if (usageType.includes('TimedStorage-GDA-ByteHrs')) mappedClass = 'DEEP_ARCHIVE';
                    else if (usageType.includes('TimedStorage-GIR-ByteHrs')) mappedClass = 'GLACIER_IR';
                    else if (usageType.includes('TimedStorage-RRS-ByteHrs')) mappedClass = 'REDUCED_REDUNDANCY';
                }
                
                if (!mappedClass) continue;
                
                // Extract price from OnDemand terms
                const onDemand = terms.OnDemand;
                if (!onDemand) continue;
                
                for (const termKey of Object.keys(onDemand)) {
                    const term = onDemand[termKey];
                    const priceDimensions = term.priceDimensions;
                    if (!priceDimensions) continue;
                    
                    for (const dimKey of Object.keys(priceDimensions)) {
                        const dimension = priceDimensions[dimKey];
                        const pricePerUnit = dimension.pricePerUnit;
                        if (pricePerUnit && pricePerUnit.USD) {
                            const price = parseFloat(pricePerUnit.USD);
                            if (price > 0 && !pricing[mappedClass]) {
                                pricing[mappedClass] = price;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            cli.output(`Warning: Failed to parse storage pricing response: ${(error as Error).message}`);
        }
        
        return pricing;
    }

    /**
     * Parse request pricing from AWS Price List API response.
     * 
     * Returns prices normalized to USD per 1,000 requests, matching the unit assumed
     * by callers: `(requestCount / 1000) * price`.
     * 
     * The unit field from the pricing dimension is inspected to determine the bulk
     * quantity the API used, and a corrective multiplier is applied so the returned
     * value is always "per 1,000 requests" regardless of what the API returns.
     */
    private parseRequestPricingResponse(responseBody: string): { put: number; get: number } | null {
        let putPrice: number | null = null;
        let getPrice: number | null = null;
        
        try {
            const data = JSON.parse(responseBody);
            const priceList = data.PriceList || [];
            
            for (const priceItemStr of priceList) {
                const priceItem = typeof priceItemStr === 'string' ? JSON.parse(priceItemStr) : priceItemStr;
                const product = priceItem.product;
                const terms = priceItem.terms;
                
                if (!product || !terms) continue;
                
                const attributes = product.attributes || {};
                const usageType = attributes.usagetype || '';
                const group = attributes.group || '';
                const groupDescription = attributes.groupDescription || '';
                
                // Determine if this is PUT or GET pricing
                let isPut = false;
                let isGet = false;
                
                if (group.includes('S3-API-Tier1') || groupDescription.includes('PUT') || 
                    groupDescription.includes('COPY') || groupDescription.includes('POST') ||
                    groupDescription.includes('LIST') || usageType.includes('Requests-Tier1')) {
                    isPut = true;
                } else if (group.includes('S3-API-Tier2') || groupDescription.includes('GET') ||
                           groupDescription.includes('SELECT') || usageType.includes('Requests-Tier2')) {
                    isGet = true;
                }
                
                if (!isPut && !isGet) continue;
                
                // Extract price from OnDemand terms
                const onDemand = terms.OnDemand;
                if (!onDemand) continue;
                
                for (const termKey of Object.keys(onDemand)) {
                    const term = onDemand[termKey];
                    const priceDimensions = term.priceDimensions;
                    if (!priceDimensions) continue;
                    
                    for (const dimKey of Object.keys(priceDimensions)) {
                        const dimension = priceDimensions[dimKey];
                        const pricePerUnit = dimension.pricePerUnit;
                        if (pricePerUnit && pricePerUnit.USD) {
                            const rawPrice = parseFloat(pricePerUnit.USD);
                            if (rawPrice > 0) {
                                // Normalize to "per 1,000 requests" so callers can use
                                // (count / 1000) * price regardless of the API's bulk unit.
                                const unit = (dimension.unit || '').toLowerCase();
                                let per1000Price: number;
                                if (unit.includes('million') || unit.includes('1,000,000') || unit.includes('1000000')) {
                                    // API returned price per million → convert to per 1,000
                                    per1000Price = rawPrice / 1000;
                                } else if (unit.includes('10,000') || unit.includes('10000')) {
                                    // API returned price per 10,000 → convert to per 1,000
                                    per1000Price = rawPrice / 10;
                                } else if (unit.includes('1,000') || unit.includes('1000') || unit.includes('requests')) {
                                    // API returned price per 1,000 (expected S3 unit) — use as-is
                                    per1000Price = rawPrice;
                                } else {
                                    // Unknown unit — assume per-request and scale up to per 1,000
                                    per1000Price = rawPrice * 1000;
                                }
                                if (isPut && putPrice === null) putPrice = per1000Price;
                                if (isGet && getPrice === null) getPrice = per1000Price;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            cli.output(`Warning: Failed to parse request pricing response: ${(error as Error).message}`);
        }
        
        if (putPrice !== null && getPrice !== null) {
            return {
                put: putPrice,
                get: getPrice
            };
        }
        
        return null;
    }

    /**
     * Fetch AWS data transfer out tiered pricing from AWS Price List API.
     * Returns an array of tier objects with beginRange (GB), endRange (GB), and pricePerGB.
     * AWS data transfer out pricing is tiered:
     *   - First 1 GB/month: free (0.00)
     *   - Up to 10 TB/month: tier 1 rate
     *   - Next 40 TB/month: tier 2 rate
     *   - Next 100 TB/month: tier 3 rate
     *   - Over 150 TB/month: tier 4 rate
     * @throws Error if pricing cannot be fetched
     */
    private fetchDataTransferOutTiers(): Array<{ beginRange: number; endRange: number; pricePerGb: number }> {
        const pricingRegion = 'us-east-1';
        const url = `https://api.pricing.${pricingRegion}.amazonaws.com/`;
        const location = this.getRegionToLocationMap()[this.region];

        if (!location) {
            throw new Error(`Unknown region ${this.region} for data transfer pricing lookup`);
        }

        const filters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AWSDataTransfer' },
            { Type: 'TERM_MATCH', Field: 'fromLocation', Value: location },
            { Type: 'TERM_MATCH', Field: 'transferType', Value: 'AWS Outbound' }
        ];

        const response = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AWSDataTransfer',
                Filters: filters,
                MaxResults: 10
            })
        });

        if (response.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${response.statusCode} for data transfer pricing`);
        }

        const tiers = this.parseDataTransferTiers(response.body);
        if (tiers.length === 0) {
            throw new Error('Could not parse data transfer tier pricing from AWS Price List API response');
        }

        return tiers;
    }

    /**
     * Parse tiered data transfer pricing from AWS Price List API response.
     * Extracts all price dimensions with their beginRange/endRange.
     */
    private parseDataTransferTiers(responseBody: string): Array<{ beginRange: number; endRange: number; pricePerGb: number }> {
        const tiers: Array<{ beginRange: number; endRange: number; pricePerGb: number }> = [];
        try {
            const data = JSON.parse(responseBody);
            if (!data.PriceList || data.PriceList.length === 0) {
                return tiers;
            }

            for (const priceItemStr of data.PriceList) {
                const product = typeof priceItemStr === 'string' ? JSON.parse(priceItemStr) : priceItemStr;
                const terms = product.terms?.OnDemand;
                if (!terms) continue;

                for (const termKey of Object.keys(terms)) {
                    const priceDimensions = terms[termKey].priceDimensions;
                    if (!priceDimensions) continue;
                    for (const dimKey of Object.keys(priceDimensions)) {
                        const dim = priceDimensions[dimKey];
                        const pricePerGb = parseFloat(dim.pricePerUnit?.USD || '0');
                        const beginRange = parseFloat(dim.beginRange || '0');
                        // endRange may be "Inf" for the last tier
                        const endRange = dim.endRange === 'Inf' ? Infinity : parseFloat(dim.endRange || '0');
                        tiers.push({ beginRange, endRange, pricePerGb });
                    }
                }
                // Use the first product that yields tiers
                if (tiers.length > 0) break;
            }
        } catch (_error) {
            // Parsing failed
        }

        // Sort tiers by beginRange ascending
        tiers.sort((a, b) => a.beginRange - b.beginRange);
        return tiers;
    }

    /**
     * Calculate data transfer out cost using tiered pricing from the AWS Price List API.
     * Applies each tier's rate to the corresponding volume slice.
     */
    private calculateTieredDataTransferCost(
        totalGb: number,
        tiers: Array<{ beginRange: number; endRange: number; pricePerGb: number }>
    ): number {
        let totalCost = 0;
        let remainingGb = totalGb;

        for (const tier of tiers) {
            if (remainingGb <= 0) break;
            const tierSize = tier.endRange === Infinity
                ? remainingGb
                : Math.min(remainingGb, tier.endRange - tier.beginRange);
            totalCost += tierSize * tier.pricePerGb;
            remainingGb -= tierSize;
        }

        return totalCost;
    }

    /**
     * Map AWS region codes to location names used in the Pricing API.
     */
    private getRegionToLocationMap(): Record<string, string> {
        return {
            'us-east-1': 'US East (N. Virginia)',
            'us-east-2': 'US East (Ohio)',
            'us-west-1': 'US West (N. California)',
            'us-west-2': 'US West (Oregon)',
            'af-south-1': 'Africa (Cape Town)',
            'ap-east-1': 'Asia Pacific (Hong Kong)',
            'ap-south-1': 'Asia Pacific (Mumbai)',
            'ap-south-2': 'Asia Pacific (Hyderabad)',
            'ap-southeast-1': 'Asia Pacific (Singapore)',
            'ap-southeast-2': 'Asia Pacific (Sydney)',
            'ap-southeast-3': 'Asia Pacific (Jakarta)',
            'ap-southeast-4': 'Asia Pacific (Melbourne)',
            'ap-northeast-1': 'Asia Pacific (Tokyo)',
            'ap-northeast-2': 'Asia Pacific (Seoul)',
            'ap-northeast-3': 'Asia Pacific (Osaka)',
            'ca-central-1': 'Canada (Central)',
            'eu-central-1': 'EU (Frankfurt)',
            'eu-central-2': 'EU (Zurich)',
            'eu-west-1': 'EU (Ireland)',
            'eu-west-2': 'EU (London)',
            'eu-west-3': 'EU (Paris)',
            'eu-south-1': 'EU (Milan)',
            'eu-south-2': 'EU (Spain)',
            'eu-north-1': 'EU (Stockholm)',
            'il-central-1': 'Israel (Tel Aviv)',
            'me-south-1': 'Middle East (Bahrain)',
            'me-central-1': 'Middle East (UAE)',
            'sa-east-1': 'South America (Sao Paulo)'
        };
    }

    /**
     * Get S3 data transfer metrics from CloudWatch for the last 30 days.
     * 
     * Fetches metrics:
     * - BytesDownloaded: Total bytes downloaded (data transfer OUT)
     * - BytesUploaded: Total bytes uploaded (data transfer IN)
     * 
     * Note: These metrics require S3 Request Metrics to be enabled on the bucket.
     * 
     * @returns Data transfer bytes or null if CloudWatch is unavailable
     */
    /**
     * Fetch bucket size in bytes from CloudWatch BucketSizeBytes metric, broken down
     * by storage class.
     *
     * CloudWatch publishes a separate BucketSizeBytes data point for each StorageType
     * dimension value (StandardStorage, StandardIAStorage, GlacierStorage, etc.) as a
     * daily metric. Fetching per-class sizes lets costs() apply the correct per-class
     * rate instead of always using the STANDARD rate.
     *
     * Period is set to 86400 (1 day) with Average statistic. Returns a map of
     * internal storage-class name → bytes. Falls back to { STANDARD: totalBytes }
     * using AllStorageTypes if per-class queries all return 0 (e.g. new bucket).
     */
    private getCloudWatchBucketSizeBytes(): Record<string, number> {
        const bucketName = this.getBucketName();
        const url = `https://monitoring.${this.region}.amazonaws.com/`;

        const endTime = new Date();
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - 2); // 2-day window to ensure at least one daily data point

        const fetchSizeForStorageType = (storageType: string): number => {
            try {
                const queryParams = [
                    'Action=GetMetricStatistics',
                    'Version=2010-08-01',
                    'Namespace=AWS%2FS3',
                    'MetricName=BucketSizeBytes',
                    `StartTime=${encodeURIComponent(startTime.toISOString())}`,
                    `EndTime=${encodeURIComponent(endTime.toISOString())}`,
                    'Period=86400', // 1 day — BucketSizeBytes is a daily metric
                    'Statistics.member.1=Average',
                    'Dimensions.member.1.Name=BucketName',
                    `Dimensions.member.1.Value=${encodeURIComponent(bucketName)}`,
                    'Dimensions.member.2.Name=StorageType',
                    `Dimensions.member.2.Value=${encodeURIComponent(storageType)}`
                ];

                const response = aws.get(`${url}?${queryParams.join('&')}`, {
                    service: 'monitoring',
                    region: this.region
                });

                if (response.statusCode !== 200) return 0;

                const averages: number[] = [];
                const avgRegex = /<Average>([\d.]+)<\/Average>/g;
                let match: RegExpExecArray | null;
                while ((match = avgRegex.exec(response.body)) !== null) {
                    averages.push(parseFloat(match[1]));
                }
                return averages.length > 0 ? Math.max(...averages) : 0;
            } catch (_error) {
                return 0;
            }
        };

        // CloudWatch StorageType dimension values → internal storage class names
        const storageTypeMap: Array<[string, string]> = [
            ['StandardStorage',               'STANDARD'],
            ['StandardIAStorage',             'STANDARD_IA'],
            ['OneZoneIAStorage',              'ONEZONE_IA'],
            ['IntelligentTieringFAStorage',   'INTELLIGENT_TIERING'],
            ['GlacierInstantRetrievalStorage','GLACIER_IR'],
            ['GlacierStorage',                'GLACIER'],
            ['DeepArchiveStorage',            'DEEP_ARCHIVE'],
            ['ReducedRedundancyStorage',      'REDUCED_REDUNDANCY']
        ];

        const result: Record<string, number> = {};
        let totalPerClass = 0;
        for (const [cwType, internalClass] of storageTypeMap) {
            const bytes = fetchSizeForStorageType(cwType);
            if (bytes > 0) {
                result[internalClass] = bytes;
                totalPerClass += bytes;
            }
        }

        // If no per-class data was returned (e.g. new bucket, metrics not yet populated),
        // fall back to AllStorageTypes so costs() still gets a total size.
        if (totalPerClass === 0) {
            const total = fetchSizeForStorageType('AllStorageTypes');
            if (total > 0) {
                result['STANDARD'] = total; // conservative: treat all as STANDARD
            }
        }

        return result;
    }

    /**
     * Fetch total object count from CloudWatch NumberOfObjects metric.
     *
     * NumberOfObjects uses the same BucketName + StorageType=AllStorageTypes dimensions
     * as BucketSizeBytes and is a daily metric. Returns null if the metric is
     * unavailable (e.g. new bucket or CloudWatch storage metrics not yet populated).
     */
    private getCloudWatchObjectCount(): number | null {
        try {
            const bucketName = this.getBucketName();
            const url = `https://monitoring.${this.region}.amazonaws.com/`;

            const endTime = new Date();
            const startTime = new Date();
            startTime.setDate(startTime.getDate() - 2);

            const queryParams = [
                'Action=GetMetricStatistics',
                'Version=2010-08-01',
                'Namespace=AWS%2FS3',
                'MetricName=NumberOfObjects',
                `StartTime=${encodeURIComponent(startTime.toISOString())}`,
                `EndTime=${encodeURIComponent(endTime.toISOString())}`,
                'Period=86400',
                'Statistics.member.1=Average',
                'Dimensions.member.1.Name=BucketName',
                `Dimensions.member.1.Value=${encodeURIComponent(bucketName)}`,
                'Dimensions.member.2.Name=StorageType',
                'Dimensions.member.2.Value=AllStorageTypes'
            ];

            const response = aws.get(`${url}?${queryParams.join('&')}`, {
                service: 'monitoring',
                region: this.region
            });

            if (response.statusCode !== 200) return null;

            const averages: number[] = [];
            const avgRegex = /<Average>([\d.]+)<\/Average>/g;
            let match: RegExpExecArray | null;
            while ((match = avgRegex.exec(response.body)) !== null) {
                averages.push(parseFloat(match[1]));
            }

            return averages.length > 0 ? Math.round(Math.max(...averages)) : null;
        } catch (_error) {
            return null;
        }
    }

    private getCloudWatchDataTransferMetrics(): {
        bytesDownloaded: number;
        bytesUploaded: number;
    } | null {
        try {
            const bucketName = this.getBucketName();
            
            // Calculate time range: last 30 days
            const endTime = new Date();
            const startTime = new Date();
            startTime.setDate(startTime.getDate() - 30);
            
            // Format timestamps for CloudWatch API
            const startTimeISO = startTime.toISOString();
            const endTimeISO = endTime.toISOString();
            
            // CloudWatch API endpoint
            const url = `https://monitoring.${this.region}.amazonaws.com/`;
            
            // Fetch BytesDownloaded metric (data transfer OUT)
            const bytesDownloaded = this.getCloudWatchMetric(
                url, bucketName, 'BytesDownloaded', startTimeISO, endTimeISO
            );
            
            // Fetch BytesUploaded metric (data transfer IN)
            const bytesUploaded = this.getCloudWatchMetric(
                url, bucketName, 'BytesUploaded', startTimeISO, endTimeISO
            );
            
            // If we got at least some metrics, return them
            if (bytesDownloaded !== null || bytesUploaded !== null) {
                return {
                    bytesDownloaded: bytesDownloaded ?? 0,
                    bytesUploaded: bytesUploaded ?? 0
                };
            }
            
            return null;
        } catch (error) {
            cli.output(`Note: CloudWatch data transfer metrics unavailable: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Get S3 request metrics from CloudWatch for the last 30 days.
     * 
     * Fetches metrics:
     * - AllRequests: Total number of HTTP requests
     * - GetRequests: Number of GET requests
     * - PutRequests: Number of PUT requests
     * 
     * @returns Request counts or null if CloudWatch is unavailable
     */
    private getCloudWatchRequestMetrics(): {
        allRequests: number;
        getRequests: number;
        putRequests: number;
    } | null {
        try {
            const bucketName = this.getBucketName();
            
            // Calculate time range: last 30 days
            const endTime = new Date();
            const startTime = new Date();
            startTime.setDate(startTime.getDate() - 30);
            
            // Format timestamps for CloudWatch API
            const startTimeISO = startTime.toISOString();
            const endTimeISO = endTime.toISOString();
            
            // CloudWatch API endpoint
            const url = `https://monitoring.${this.region}.amazonaws.com/`;
            
            // Fetch AllRequests metric
            const allRequestsCount = this.getCloudWatchMetric(
                url, bucketName, 'AllRequests', startTimeISO, endTimeISO
            );
            
            // Fetch GetRequests metric
            const getRequestsCount = this.getCloudWatchMetric(
                url, bucketName, 'GetRequests', startTimeISO, endTimeISO
            );
            
            // Fetch PutRequests metric
            const putRequestsCount = this.getCloudWatchMetric(
                url, bucketName, 'PutRequests', startTimeISO, endTimeISO
            );
            
            // If we got at least some metrics, return them
            if (allRequestsCount !== null || getRequestsCount !== null || putRequestsCount !== null) {
                return {
                    allRequests: allRequestsCount ?? 0,
                    getRequests: getRequestsCount ?? 0,
                    putRequests: putRequestsCount ?? 0
                };
            }
            
            return null;
        } catch (error) {
            cli.output(`Note: CloudWatch metrics unavailable: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     * 
     * Output format:
     * {
     *   "type": "aws-s3-bucket",
     *   "costs": {
     *     "month": {
     *       "amount": "12.34",
     *       "currency": "USD"
     *     }
     *   }
     * }
     */
    @action("costs")
    costs(): void {
        if (!this.state.bucket_name) {
            // Return zero cost if bucket doesn't exist
            const result = {
                type: "aws-s3-bucket",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        try {
            // Use CloudWatch BucketSizeBytes metric to get storage size per storage class
            // without listing objects. For buckets with millions of objects, paginated
            // ListObjectsV2 would require thousands of API calls and could time out.
            // CloudWatch publishes a separate daily BucketSizeBytes data point for each
            // StorageType dimension, so we can apply the correct per-class rate.
            const bucketSizeByClass = this.getCloudWatchBucketSizeBytes();

            // Get pricing rates for the region
            const pricing = this.getS3PricingRates();

            // Calculate storage cost by applying each class's rate to its measured size.
            let totalStorageCost = 0;
            for (const [storageClass, bytes] of Object.entries(bucketSizeByClass)) {
                const sizeGB = bytes / (1024 * 1024 * 1024);
                // Fall back to STANDARD rate for any unmapped class (should not happen)
                const rate = pricing.storage[storageClass] ?? pricing.storage['STANDARD'] ?? 0;
                totalStorageCost += sizeGB * rate;
            }
            
            // Get request metrics from CloudWatch
            const requestMetrics = this.getCloudWatchRequestMetrics();
            let requestCost = 0;
            if (requestMetrics) {
                const putRequestCost = (requestMetrics.putRequests / 1000) * pricing.requests.put;
                const getRequestCost = (requestMetrics.getRequests / 1000) * pricing.requests.get;
                requestCost = putRequestCost + getRequestCost;
            }
            
            // Get data transfer metrics from CloudWatch
            const dataTransferMetrics = this.getCloudWatchDataTransferMetrics();
            let dataTransferCost = 0;
            if (dataTransferMetrics && dataTransferMetrics.bytesDownloaded > 0) {
                const dataTransferOutGB = dataTransferMetrics.bytesDownloaded / (1024 * 1024 * 1024);
                const dataTransferTiers = this.fetchDataTransferOutTiers();
                dataTransferCost = this.calculateTieredDataTransferCost(dataTransferOutGB, dataTransferTiers);
            }
            
            const totalMonthlyCost = totalStorageCost + requestCost + dataTransferCost;
            
            const result = {
                type: "aws-s3-bucket",
                costs: {
                    month: {
                        amount: totalMonthlyCost.toFixed(2),
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));
            
        } catch (error) {
            // Return zero cost on error
            const result = {
                type: "aws-s3-bucket",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD",
                        error: (error as Error).message
                    }
                }
            };
            cli.output(JSON.stringify(result));
        }
    }

    /**
     * Fetch a single CloudWatch metric for the S3 bucket.
     */
    private getCloudWatchMetric(
        url: string,
        bucketName: string,
        metricName: string,
        startTime: string,
        endTime: string
    ): number | null {
        try {
            // Build CloudWatch GetMetricStatistics request
            // Manually build query string since URLSearchParams is not available
            const queryParams = [
                'Action=GetMetricStatistics',
                'Version=2010-08-01',
                'Namespace=AWS%2FS3',
                `MetricName=${encodeURIComponent(metricName)}`,
                `StartTime=${encodeURIComponent(startTime)}`,
                `EndTime=${encodeURIComponent(endTime)}`,
                'Period=2592000', // 30 days in seconds
                'Statistics.member.1=Sum',
                'Dimensions.member.1.Name=BucketName',
                `Dimensions.member.1.Value=${encodeURIComponent(bucketName)}`,
                'Dimensions.member.2.Name=FilterId',
                'Dimensions.member.2.Value=EntireBucket'
            ];
            
            const requestUrl = `${url}?${queryParams.join('&')}`;
            
            const response = aws.get(requestUrl, {
                service: 'monitoring',
                region: this.region
            });
            
            if (response.statusCode !== 200) {
                return null;
            }
            
            // Parse the XML response to extract the Sum value
            const sumMatch = response.body.match(/<Sum>([\d.]+)<\/Sum>/);
            if (sumMatch) {
                return Math.round(parseFloat(sumMatch[1]));
            }
            
            // No data points found (bucket may be new or have no requests)
            return 0;
        } catch (error) {
            return null;
        }
    }

} 