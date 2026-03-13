import { HetznerS3Entity, HetznerS3DefinitionBase, HetznerS3StateBase } from "./s3-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * @interface HetznerBucketDefinition
 */
export interface HetznerBucketDefinition extends HetznerS3DefinitionBase {
    /** @description Bucket name */
    bucket_name: string;
    /** @description Enable or disable bucket versioning (default: false) */
    versioning?: boolean;
    /** @description CORS configuration for the bucket */
    cors_configuration?: {
        cors_rules: Array<{
            allowed_headers?: string[];
            allowed_methods: string[];
            allowed_origins: string[];
            max_age_seconds?: number;
        }>;
    };
    /** @description Lifecycle rules (S3-compatible) */
    lifecycle_configuration?: {
        rules: Array<{
            id: string;
            status: "Enabled" | "Disabled";
            filter?: { prefix?: string; };
            expiration?: { days?: number; };
        }>;
    };
}

/**
 * @interface HetznerBucketState
 */
export interface HetznerBucketState extends HetznerS3StateBase {
    /** @description Bucket name */
    bucket_name?: string;
    /** @description Hetzner region */
    region?: string;
}

/**
 * @description Hetzner Object Storage Bucket entity.
 * Creates and manages S3-compatible buckets on Hetzner Object Storage.
 *
 * ## Secrets
 * - Reads: `hetzner-s3-access-key`, `hetzner-s3-secret-key` - S3 credentials
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.bucket_name` - Bucket name
 * - `state.region` - Hetzner region
 * - `state.endpoint` - S3-compatible endpoint URL
 *
 * ## Composing with Other Entities
 * Works with `hetzner-object-storage/credentials` to create S3 access credentials.
 */
export class Bucket extends HetznerS3Entity<HetznerBucketDefinition, HetznerBucketState> {

    protected getBucketName(): string {
        return this.definition.bucket_name;
    }

    override create(): void {
        const bucketName = this.getBucketName();

        if (this.bucketExists(bucketName)) {
            this.state.existing = true;
            this.state.bucket_name = bucketName;
            this.state.region = this.region;
            this.state.endpoint = `${this.region}.your-objectstorage.com`;
            cli.output(`Bucket '${bucketName}' already exists in region ${this.region}`);
            this.configureBucket();
            return;
        }

        this.createBucket(bucketName);
        this.state.existing = true;
        this.state.bucket_name = bucketName;
        this.state.region = this.region;
        this.state.endpoint = `${this.region}.your-objectstorage.com`;
        cli.output(`Created bucket '${bucketName}' in region ${this.region}`);

        this.configureBucket();
    }

    override update(): void {
        if (!this.state.bucket_name) {
            this.create();
            return;
        }
        if (!this.state.endpoint) {
            this.state.endpoint = `${this.region}.your-objectstorage.com`;
        }
        this.configureBucket();
    }

    override delete(): void {
        const bucketName = this.state.bucket_name || this.getBucketName();
        if (!bucketName) {
            cli.output("No bucket name available, nothing to delete");
            return;
        }
        this.deleteBucket(bucketName);
        this.state.bucket_name = undefined;
        this.state.region = undefined;
        this.state.endpoint = undefined;
        this.state.existing = false;
        cli.output(`Deleted bucket '${bucketName}'`);
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

        if (this.definition.versioning !== undefined) {
            try { this.setBucketVersioning(bucketName, !!this.definition.versioning); }
            catch (e) { cli.output(`Warning: failed to set versioning: ${(e as Error).message}`); }
        }

        if (this.definition.cors_configuration?.cors_rules) {
            try { this.setBucketCors(bucketName, [...this.definition.cors_configuration.cors_rules]); }
            catch (e) { cli.output(`Warning: failed to set CORS: ${(e as Error).message}`); }
        }

        if (this.definition.lifecycle_configuration?.rules) {
            try { this.setBucketLifecycle(bucketName, [...this.definition.lifecycle_configuration.rules]); }
            catch (e) { cli.output(`Warning: failed to set lifecycle: ${(e as Error).message}`); }
        }
    }

    // --- Actions ---

    @action()
    getBucketInfo(_args?: Args): void {
        const bucketName = this.getBucketName();
        try {
            const info = {
                bucket_name: bucketName,
                region: this.region,
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
