import { DOSpacesS3Entity, DOSpacesS3DefinitionBase, DOSpacesS3StateBase } from "./do-s3-base.ts";
import cli from "cli";
import * as MonkecBase from "monkec/base";
const action = MonkecBase.action;

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

export interface SpacesBucketState extends DOSpacesS3StateBase {
    bucket_name?: string;
    region?: string;
}

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

    // --- Actions parity with aws-s3 ---

    @action()
    getBucketInfo(_args?: MonkecBase.Args): void {
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
    listObjects(args?: MonkecBase.Args): void {
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
    generatePresignedUrl(args?: MonkecBase.Args): void {
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
    emptyBucket(_args?: MonkecBase.Args): void {
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
    getBucketStatistics(_args?: MonkecBase.Args): void {
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


