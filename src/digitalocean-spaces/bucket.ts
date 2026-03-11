import { DOSpacesS3Entity, DOSpacesS3DefinitionBase, DOSpacesS3StateBase } from "./do-s3-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * Definition interface for DigitalOcean Spaces Bucket entity.
 * Configures bucket properties including versioning, access control, CORS, and lifecycle rules.
 * @interface SpacesBucketDefinition
 */
export interface SpacesBucketDefinition extends DOSpacesS3DefinitionBase {
    /** @description Space (bucket) name */
    bucket_name: string;
    /** @description Enable or disable bucket versioning (default: false) */
    versioning?: boolean;
    /** @description Whether to allow public reads/writes (DO doesn't support PublicAccessBlock; logs a warning) */
    public_read_access?: boolean;
    public_write_access?: boolean;
    /** @description CORS configuration for the bucket */
    cors_configuration?: {
        cors_rules: Array<{
            allowed_headers?: string[];
            allowed_methods: string[];
            allowed_origins: string[];
            expose_headers?: string[];
            max_age_seconds?: number;
        }>;
    };
    /** @description Lifecycle rules (S3-compatible). Note: lifecycle entity removed; configure via bucket */
    lifecycle_configuration?: {
        rules: Array<{
            id: string;
            status: "Enabled" | "Disabled";
            filter?: { prefix?: string; tags?: Record<string, string>; };
            expiration?: { days?: number; date?: string; };
            transitions?: Array<{ days?: number; date?: string; storage_class: string; }>;
        }>;
    };
    /** @description Resource tags for the bucket */
    tags?: Record<string, string>;
}

/**
 * State interface for DigitalOcean Spaces Bucket entity.
 * Contains runtime information about the created bucket.
 * @interface SpacesBucketState
 */
export interface SpacesBucketState extends DOSpacesS3StateBase {
    /** @description Bucket name */
    bucket_name?: string;
    /** @description DigitalOcean region where the bucket resides */
    region?: string;
}

/**
 * @description DigitalOcean Spaces Bucket entity.
 * Creates and manages DigitalOcean Spaces buckets for S3-compatible object storage.
 * 
 * ## Secrets
 * - Reads: `do-spaces-access-key`, `do-spaces-secret-key` - Spaces credentials
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.bucket_name` - Bucket name for SDK/API operations
 * - `state.region` - DigitalOcean region where the bucket resides
 * - `state.endpoint` - S3-compatible endpoint URL
 * 
 * ## Composing with Other Entities
 * Works with `digitalocean-spaces/spaces-keys` to create access credentials for bucket operations.
 */
export class SpacesBucket extends DOSpacesS3Entity<SpacesBucketDefinition, SpacesBucketState> {

    protected getBucketName(): string {
        return this.definition.bucket_name;
    }

    override create(): void {
        const bucketName = this.getBucketName();

        if (this.bucketExists(bucketName)) {
            this.state.existing = true;
            this.state.bucket_name = bucketName;
            this.state.region = this.region;
            this.state.endpoint = `${this.region}.digitaloceanspaces.com`;
            cli.output(`Space '${bucketName}' already exists in region ${this.region}`);
            // Still attempt to apply configuration on existing bucket
            this.configureBucket();
            return;
        }

        this.createBucket(bucketName);
        this.state.existing = true;;
        this.state.bucket_name = bucketName;
        this.state.region = this.region;
        this.state.endpoint = `${this.region}.digitaloceanspaces.com`;
        cli.output(`Created Space '${bucketName}' in region ${this.region}`);

        this.configureBucket();
    }

    override update(): void {
        if (!this.state.bucket_name) {
            this.create();
            return;
        }
        if (!this.state.endpoint) {
            this.state.endpoint = `${this.region}.digitaloceanspaces.com`;
        }
        this.configureBucket();
    }

    override delete(): void {
        const bucketName = this.state.bucket_name || this.getBucketName();
        if (!bucketName) {
            cli.output("No Space name available, nothing to delete");
            return;
        }
        this.deleteBucket(bucketName);
        this.state.bucket_name = undefined;
        this.state.region = undefined;
        this.state.endpoint = undefined;
        this.state.existing = false;
        cli.output(`Deleted Space '${bucketName}'`);
    }

    override checkReadiness(): boolean {
        if (!this.getBucketName()) return false;
        try {
            return this.bucketExists(this.getBucketName());
        } catch (_e) {
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    private configureBucket(): void {
        const bucketName = this.getBucketName();

        // Versioning
        if (this.definition.versioning !== undefined) {
            try { this.setBucketVersioning(bucketName, !!this.definition.versioning); }
            catch (e) { cli.output(`Warning: failed to set versioning: ${(e as Error).message}`); }
        }

        // Public access (warn only on DO)
        const pra = this.definition.public_read_access ?? false;
        const pwa = this.definition.public_write_access ?? false;
        try { this.setBucketPublicAccessBlock(bucketName, pra, pwa); }
        catch (e) { cli.output(`Warning: public access config not applied: ${(e as Error).message}`); }

        // CORS
        if (this.definition.cors_configuration?.cors_rules) {
            try { this.setBucketCors(bucketName, [...this.definition.cors_configuration.cors_rules]); }
            catch (e) { cli.output(`Warning: failed to set CORS: ${(e as Error).message}`); }
        }

        // Lifecycle
        if (this.definition.lifecycle_configuration?.rules) {
            try { this.setBucketLifecycle(bucketName, [...this.definition.lifecycle_configuration.rules]); }
            catch (e) { cli.output(`Warning: failed to set lifecycle: ${(e as Error).message}`); }
        }

        // Tags
        if (this.definition.tags) {
            try { this.setBucketTags(bucketName, this.definition.tags); }
            catch (e) { cli.output(`Warning: failed to set tags: ${(e as Error).message}`); }
        }
    }

    // =========================================================================
    // Cost Estimation
    // =========================================================================

    /**
     * DigitalOcean Spaces has fixed, published pricing with no dynamic pricing API.
     * This is a known limitation: DigitalOcean does not expose Spaces pricing
     * through an API endpoint, so these values are sourced from the official
     * pricing page (https://www.digitalocean.com/pricing/spaces).
     *
     * Pricing is per-account (not per-bucket), so per-bucket reporting is
     * inherently approximate when multiple buckets exist.
     *
     * - $5/month base: includes 250 GB storage + 1 TB outbound transfer
     * - $0.02/GB for additional storage beyond 250 GB
     * - $0.01/GB for additional outbound transfer beyond 1 TB
     */
    private getSpacesPricing(): {
        baseMonthly: number;
        includedStorageGb: number;
        includedTransferGb: number;
        additionalStoragePerGb: number;
        additionalTransferPerGb: number;
        source: string;
    } {
        return {
            baseMonthly: 5.00,
            includedStorageGb: 250,
            includedTransferGb: 1024, // 1 TB
            additionalStoragePerGb: 0.02,
            additionalTransferPerGb: 0.01,
            source: 'DigitalOcean Spaces fixed pricing'
        };
    }

    /**
     * Get current bucket storage usage
     */
    private getBucketStorageUsage(): { totalSizeBytes: number; objectCount: number } {
        const bucketName = this.getBucketName();
        try {
            let totalSize = 0;
            let totalObjects = 0;
            let continuationToken: string | undefined;

            do {
                let listUrl = this.getBucketUrl(bucketName, '?list-type=2&max-keys=1000');
                if (continuationToken) listUrl += `&continuation-token=${encodeURIComponent(continuationToken)}`;
                const listResponse = this.listBucketObjects(listUrl);
                const objectInfo = this.parseObjectInfoFromResponse(listResponse.body);
                totalObjects += objectInfo.length;
                totalSize += objectInfo.reduce((sum, obj) => sum + parseInt(obj.size, 10), 0);
                const nextTokenMatch = listResponse.body.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
                continuationToken = nextTokenMatch ? nextTokenMatch[1] : undefined;
            } while (continuationToken);

            return { totalSizeBytes: totalSize, objectCount: totalObjects };
        } catch {
            return { totalSizeBytes: 0, objectCount: 0 };
        }
    }

    /**
     * Get detailed cost estimate for the Spaces bucket
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const bucketName = this.getBucketName();

        cli.output(`\n💰 Cost Estimate for DigitalOcean Spaces: ${bucketName}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📊 Bucket Configuration:`);
        cli.output(`   Bucket Name: ${bucketName}`);
        cli.output(`   Region: ${this.region}`);
        cli.output(`   Versioning: ${this.definition.versioning || false}`);

        const pricing = this.getSpacesPricing();

        cli.output(`\n💵 Pricing (${pricing.source}):`);
        cli.output(`   Base: $${pricing.baseMonthly.toFixed(2)}/month`);
        cli.output(`   Included Storage: ${pricing.includedStorageGb} GB`);
        cli.output(`   Included Transfer: ${pricing.includedTransferGb} GB (1 TB)`);
        cli.output(`   Additional Storage: $${pricing.additionalStoragePerGb.toFixed(2)}/GB`);
        cli.output(`   Additional Transfer: $${pricing.additionalTransferPerGb.toFixed(2)}/GB`);

        // Get actual storage usage
        const usage = this.getBucketStorageUsage();
        const storageSizeGb = usage.totalSizeBytes / (1024 * 1024 * 1024);

        cli.output(`\n📈 Current Usage:`);
        cli.output(`   Objects: ${usage.objectCount}`);
        cli.output(`   Storage: ${storageSizeGb.toFixed(4)} GB (${usage.totalSizeBytes.toLocaleString()} bytes)`);

        // Calculate cost
        let totalMonthlyCost = pricing.baseMonthly;
        const additionalStorageGb = Math.max(0, storageSizeGb - pricing.includedStorageGb);
        if (additionalStorageGb > 0) {
            const additionalStorageCost = additionalStorageGb * pricing.additionalStoragePerGb;
            totalMonthlyCost += additionalStorageCost;
            cli.output(`   Additional Storage: ${additionalStorageGb.toFixed(2)} GB ($${additionalStorageCost.toFixed(2)})`);
        }

        cli.output(`\n💵 Cost Breakdown (Monthly):`);
        cli.output(`   Base Plan: $${pricing.baseMonthly.toFixed(2)}`);
        if (additionalStorageGb > 0) {
            cli.output(`   Additional Storage: $${(additionalStorageGb * pricing.additionalStoragePerGb).toFixed(2)}`);
        }
        cli.output(`   Transfer: Usage-based (not estimated)`);

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`💰 ESTIMATED MONTHLY COST: $${totalMonthlyCost.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📝 Notes:`);
        cli.output(`   - Base plan includes 250 GB storage and 1 TB outbound transfer`);
        cli.output(`   - Inbound transfer is always free`);
        cli.output(`   - CDN transfer is included in the outbound transfer allowance`);
        cli.output(`   - Spaces pricing is per-account, not per-bucket`);
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     */
    @action("costs")
    costs(): void {
        try {
            const pricing = this.getSpacesPricing();
            const usage = this.getBucketStorageUsage();
            const storageSizeGb = usage.totalSizeBytes / (1024 * 1024 * 1024);

            let totalMonthlyCost = pricing.baseMonthly;
            const additionalStorageGb = Math.max(0, storageSizeGb - pricing.includedStorageGb);
            if (additionalStorageGb > 0) {
                totalMonthlyCost += additionalStorageGb * pricing.additionalStoragePerGb;
            }

            const result = {
                type: "digitalocean-spaces-bucket",
                costs: {
                    month: {
                        amount: totalMonthlyCost.toFixed(2),
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));
        } catch (error) {
            const result = {
                type: "digitalocean-spaces-bucket",
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

    // --- Actions parity with aws-s3 ---

    @action()
    getBucketInfo(_args?: Args): void {
        const bucketName = this.getBucketName();
        try {
            const location = this.getBucketLocation(bucketName);
            const info = {
                bucket_name: bucketName,
                region: this.region,
                location: location.LocationConstraint || this.region,
                url: this.getBucketUrl(bucketName)
            };
            cli.output(`Bucket Information:\n${JSON.stringify(info, null, 2)}`);
        } catch (e) {
            throw new Error(`Failed to get bucket info: ${(e as Error).message}`);
        }
    }

    @action()
    listObjects(args?: Args): void {
        const bucketName = this.getBucketName();
        const prefix = args?.prefix as string || '';
        const maxKeys = parseInt(args?.max_keys as string || '1000', 10);
        const url = this.getBucketUrl(bucketName, `?list-type=2&max-keys=${maxKeys}${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ''}`);
        try {
            const listResponse = this.listBucketObjects(url);
            const objectInfo = this.parseObjectInfoFromResponse(listResponse.body);
            cli.output(`Found ${objectInfo.length} objects in bucket ${bucketName}:`);
            if (objectInfo.length > 0) {
                objectInfo.forEach(obj => cli.output(`  - ${obj.key} (${obj.size} bytes, modified: ${obj.lastModified})`));
            } else {
                cli.output("  (bucket is empty)");
            }
        } catch (e) {
            throw new Error(`Failed to list objects: ${(e as Error).message}`);
        }
    }

    @action()
    generatePresignedUrl(args?: Args): void {
        const bucketName = this.getBucketName();
        const objectKey = args?.object_key as string;
        const method = args?.method as string || 'GET';
        const expires = parseInt(args?.expires as string || '3600', 10);
        if (!objectKey) throw new Error('object_key parameter is required');
        const url = this.getBucketUrl(bucketName, objectKey);
        try {
            const presigned = this.generatePresignedUrlForObject(url, method, expires);
            cli.output(`Presigned URL for ${method} ${objectKey}:`);
            cli.output(`URL: ${presigned.url}`);
            if (presigned.headers && Object.keys(presigned.headers).length > 0) {
                cli.output(`Headers: ${JSON.stringify(presigned.headers, null, 2)}`);
            }
        } catch (e) {
            throw new Error(`Failed to generate presigned URL: ${(e as Error).message}`);
        }
    }

    @action()
    emptyBucket(_args?: Args): void {
        const bucketName = this.getBucketName();
        try {
            let deleted = 0;
            let continuationToken: string | undefined;
            do {
                let listUrl = this.getBucketUrl(bucketName, '?list-type=2&max-keys=1000');
                if (continuationToken) listUrl += `&continuation-token=${encodeURIComponent(continuationToken)}`;
                const listResponse = this.listBucketObjects(listUrl);
                const objectKeys = this.parseObjectKeysFromResponse(listResponse.body);
                if (objectKeys.length === 0) break;
                deleted += this.deleteObjectsBatch(bucketName, objectKeys);
                const nextTokenMatch = listResponse.body.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
                continuationToken = nextTokenMatch ? nextTokenMatch[1] : undefined;
            } while (continuationToken);
            cli.output(`Successfully deleted ${deleted} objects from bucket ${bucketName}`);
        } catch (e) {
            throw new Error(`Failed to empty bucket: ${(e as Error).message}`);
        }
    }

    @action()
    getBucketStatistics(_args?: Args): void {
        const bucketName = this.getBucketName();
        try {
            let totalObjects = 0;
            let totalSize = 0;
            let continuationToken: string | undefined;
            do {
                let listUrl = this.getBucketUrl(bucketName, '?list-type=2&max-keys=1000');
                if (continuationToken) listUrl += `&continuation-token=${encodeURIComponent(continuationToken)}`;
                const listResponse = this.listBucketObjects(listUrl);
                const objectInfo = this.parseObjectInfoFromResponse(listResponse.body);
                totalObjects += objectInfo.length;
                totalSize += objectInfo.reduce((sum, obj) => sum + parseInt(obj.size, 10), 0);
                const nextTokenMatch = listResponse.body.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
                continuationToken = nextTokenMatch ? nextTokenMatch[1] : undefined;
            } while (continuationToken);
            const stats = {
                bucket_name: bucketName,
                total_objects: totalObjects,
                total_size_bytes: totalSize,
                total_size_mb: Math.round(totalSize / (1024 * 1024) * 100) / 100,
                total_size_gb: Math.round(totalSize / (1024 * 1024 * 1024) * 100) / 100
            };
            cli.output(`Bucket Statistics:\n${JSON.stringify(stats, null, 2)}`);
        } catch (e) {
            throw new Error(`Failed to get bucket statistics: ${(e as Error).message}`);
        }
    }
}


