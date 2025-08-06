import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

import {
    parseS3Error
} from "./common.ts";

export interface AWSS3Definition {
    region: string;
    bucket_name: string;
    versioning?: boolean;
    public_read_access?: boolean;
    public_write_access?: boolean;
    cors_configuration?: {
        cors_rules: Array<{
            allowed_headers?: string[];
            allowed_methods: string[];
            allowed_origins: string[];
            expose_headers?: string[];
            max_age_seconds?: number;
        }>;
    };
    lifecycle_configuration?: {
        rules: Array<{
            id: string;
            status: "Enabled" | "Disabled";
            filter?: {
                prefix?: string;
                tags?: Record<string, string>;
            };
            expiration?: {
                days?: number;
                date?: string;
            };
            noncurrent_version_expiration?: {
                noncurrent_days: number;
            };
            transitions?: Array<{
                days?: number;
                date?: string;
                storage_class: "STANDARD_IA" | "ONEZONE_IA" | "GLACIER" | "DEEP_ARCHIVE";
            }>;
        }>;
    };
    server_side_encryption?: {
        rules: Array<{
            apply_server_side_encryption_by_default: {
                sse_algorithm: "AES256" | "aws:kms";
                kms_master_key_id?: string;
            };
            bucket_key_enabled?: boolean;
        }>;
    };
    tags?: Record<string, string>;
}

export interface AWSS3State {
    existing: boolean;
    bucket_name?: string;
    region?: string;
    location?: string;
}

export interface S3HeadBucketResponse {
    // Empty response body for successful HEAD requests
}

export interface S3LocationResponse {
    LocationConstraint?: string;
}

export interface S3VersioningResponse {
    Status?: "Enabled" | "Suspended";
    MfaDelete?: "Enabled" | "Disabled";
}

export interface S3CorsResponse {
    CORSRules?: Array<{
        AllowedHeaders?: string[];
        AllowedMethods: string[];
        AllowedOrigins: string[];
        ExposeHeaders?: string[];
        MaxAgeSeconds?: number;
    }>;
}

export interface S3ErrorResponse {
    Error?: {
        Code?: string;
        Message?: string;
        RequestId?: string;
        HostId?: string;
    };
}

export abstract class AWSS3Entity<TDefinition extends AWSS3Definition, TState extends AWSS3State> extends MonkEntity<TDefinition, TState> {
    protected get region(): string {
        return this.definition.region;
    }

    protected abstract getBucketName(): string;

    protected getBucketUrl(bucketName: string, path?: string): string {
        // Query parameters should not have leading slash, object paths should
        const basePath = path ? (path.startsWith('?') ? path : `/${path}`) : "";
        return `https://${bucketName}.s3.${this.region}.amazonaws.com${basePath}`;
    }

    protected bucketExists(bucketName: string): boolean {
        try {
            const response = this.headBucket(bucketName);
            return response.statusCode === 200;
        } catch (error) {
            return false;
        }
    }

    protected headBucket(bucketName: string): any {
        const url = this.getBucketUrl(bucketName);
        
        const response = aws.do(url, {
            method: 'HEAD',
            service: 's3',
            region: this.region
        });

        if (response.statusCode !== 200 && response.statusCode !== 404) {
            const error = parseS3Error(response);
            throw new Error(`Failed to check bucket existence: ${error}`);
        }
        
        return response;
    }

    protected createBucket(bucketName: string): any {
        const url = this.getBucketUrl(bucketName);
        
        let body = "";
        // Only include location constraint if not us-east-1
        if (this.region !== "us-east-1") {
            body = `<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                <LocationConstraint>${this.region}</LocationConstraint>
            </CreateBucketConfiguration>`;
        }

        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            headers: {
                'Content-Type': 'application/xml'
            },
            body: body
        });

        if (response.statusCode !== 200) {
            const error = parseS3Error(response);
            throw new Error(`Failed to create bucket: ${error}`);
        }
        
        return response;
    }

    protected deleteBucket(bucketName: string): any {
        const url = this.getBucketUrl(bucketName);
        
        const response = aws.delete(url, {
            service: 's3',
            region: this.region
        });

        if (response.statusCode !== 204 && response.statusCode !== 404) {
            const error = parseS3Error(response);
            throw new Error(`Failed to delete bucket: ${error}`);
        }
        
        return response;
    }

    protected getBucketLocation(bucketName: string): S3LocationResponse {
        const url = this.getBucketUrl(bucketName, "?location");
        
        const response = aws.get(url, {
            service: 's3',
            region: this.region
        });

        if (response.statusCode !== 200) {
            const error = parseS3Error(response);
            throw new Error(`Failed to get bucket location: ${error}`);
        }
        
        // Parse the location from XML response
        const locationMatch = response.body.match(/<LocationConstraint>(.*?)<\/LocationConstraint>/);
        return {
            LocationConstraint: locationMatch ? locationMatch[1] : undefined
        };
    }

    protected setBucketVersioning(bucketName: string, enabled: boolean): any {
        const url = this.getBucketUrl(bucketName, "?versioning");
        
        const versioningConfig = `<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            <Status>${enabled ? 'Enabled' : 'Suspended'}</Status>
        </VersioningConfiguration>`;
        
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            headers: {
                'Content-Type': 'application/xml'
            },
            body: versioningConfig
        });

        if (response.statusCode !== 200) {
            const error = parseS3Error(response);
            throw new Error(`Failed to set bucket versioning: ${error}`);
        }
        
        return response;
    }

    protected setBucketPublicAccessBlock(bucketName: string, publicReadAccess: boolean, publicWriteAccess: boolean): any {
        const url = this.getBucketUrl(bucketName, "?publicAccessBlock");
        
        const publicAccessBlockConfig = `<PublicAccessBlockConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            <BlockPublicAcls>${!publicWriteAccess}</BlockPublicAcls>
            <IgnorePublicAcls>${!publicWriteAccess}</IgnorePublicAcls>
            <BlockPublicPolicy>${!publicReadAccess}</BlockPublicPolicy>
            <RestrictPublicBuckets>${!publicReadAccess}</RestrictPublicBuckets>
        </PublicAccessBlockConfiguration>`;
        
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            headers: {
                'Content-Type': 'application/xml'
            },
            body: publicAccessBlockConfig
        });

        if (response.statusCode !== 200) {
            const error = parseS3Error(response);
            throw new Error(`Failed to set bucket public access block: ${error}`);
        }
        
        return response;
    }

    protected setBucketCors(bucketName: string, corsRules: any[]): any {
        const url = this.getBucketUrl(bucketName, "?cors");
        
        const corsRulesXml = corsRules.map(rule => `
            <CORSRule>
                ${rule.allowed_methods.map((method: string) => `<AllowedMethod>${method}</AllowedMethod>`).join('')}
                ${rule.allowed_origins.map((origin: string) => `<AllowedOrigin>${origin}</AllowedOrigin>`).join('')}
                ${rule.allowed_headers ? rule.allowed_headers.map((header: string) => `<AllowedHeader>${header}</AllowedHeader>`).join('') : ''}
                ${rule.expose_headers ? rule.expose_headers.map((header: string) => `<ExposeHeader>${header}</ExposeHeader>`).join('') : ''}
                ${rule.max_age_seconds ? `<MaxAgeSeconds>${rule.max_age_seconds}</MaxAgeSeconds>` : ''}
            </CORSRule>
        `).join('');
        
        const corsConfig = `<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            ${corsRulesXml}
        </CORSConfiguration>`;
        
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            headers: {
                'Content-Type': 'application/xml'
            },
            body: corsConfig
        });

        if (response.statusCode !== 200) {
            const error = parseS3Error(response);
            throw new Error(`Failed to set bucket CORS: ${error}`);
        }
        
        return response;
    }

    protected setBucketTags(bucketName: string, tags: Record<string, string>): any {
        const url = this.getBucketUrl(bucketName, "?tagging");
        
        const tagsXml = Object.entries(tags).map(([key, value]) => `
            <Tag>
                <Key>${key}</Key>
                <Value>${value}</Value>
            </Tag>
        `).join('');
        
        const taggingConfig = `<Tagging xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            <TagSet>
                ${tagsXml}
            </TagSet>
        </Tagging>`;
        
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            headers: {
                'Content-Type': 'application/xml'
            },
            body: taggingConfig
        });

        if (response.statusCode !== 200) {
            const error = parseS3Error(response);
            throw new Error(`Failed to set bucket tags: ${error}`);
        }
        
        return response;
    }
} 