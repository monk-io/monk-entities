import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import cli from "cli";
import secret from "secret";

function escapeXml(s: string): string {
    return s.replace(/[<>&'\"]/g, function (c) {
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

function buildLifecycleConfigXml(rules: any[]): string {
    const rulesXml = rules.map(rule => {
        let ruleXml = `<Rule>\n  <ID>${escapeXml(rule.id)}</ID>\n  <Status>${rule.status}</Status>`;
        if (rule.filter) {
            ruleXml += '\n  <Filter>';
            if (rule.filter.prefix) {
                ruleXml += `\n    <Prefix>${escapeXml(rule.filter.prefix)}</Prefix>`;
            }
            ruleXml += '\n  </Filter>';
        }
        if (rule.expiration) {
            ruleXml += '\n  <Expiration>';
            if (rule.expiration.days) {
                ruleXml += `\n    <Days>${rule.expiration.days}</Days>`;
            }
            ruleXml += '\n  </Expiration>';
        }
        ruleXml += '\n</Rule>';
        return ruleXml;
    }).join('');
    return `<LifecycleConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">\n${rulesXml}\n</LifecycleConfiguration>`;
}

export interface HetznerS3DefinitionBase {
    /** @description Hetzner Object Storage region, e.g. fsn1, nbg1, hel1 */
    region: string;
    /** @description Secret name for access key (defaults to hetzner-s3-access-key) */
    access_key_secret_ref?: string;
    /** @description Secret name for secret key (defaults to hetzner-s3-secret-key) */
    secret_key_secret_ref?: string;
}

export interface HetznerS3StateBase {
    existing?: boolean;
    /** @description S3-compatible endpoint */
    endpoint?: string;
}

export abstract class HetznerS3Entity<
    D extends HetznerS3DefinitionBase,
    S extends HetznerS3StateBase
> extends MonkEntity<D, S> {
    protected region!: string;
    protected accessKey!: string;
    protected secretKey!: string;

    protected override before(): void {
        this.region = this.definition.region;
        const accessRef = this.definition.access_key_secret_ref || "hetzner-s3-access-key";
        const secretRef = this.definition.secret_key_secret_ref || "hetzner-s3-secret-key";
        const ak = secret.get(accessRef);
        const sk = secret.get(secretRef);
        if (!ak || !sk) {
            throw new Error(`Missing Hetzner Object Storage credentials in secrets: access=${accessRef}, secret=${secretRef}`);
        }
        this.accessKey = ak;
        this.secretKey = sk;
    }

    protected abstract getBucketName(): string;

    protected getBucketUrl(bucketName: string, path?: string): string {
        const basePath = path ? (path.startsWith('?') ? path : `/${path}`) : "";
        return `https://${bucketName}.${this.region}.your-objectstorage.com${basePath}`;
    }

    protected getServiceUrl(path?: string): string {
        const basePath = path ? (path.startsWith('?') ? path : `/${path}`) : "";
        return `https://${this.region}.your-objectstorage.com${basePath}`;
    }

    protected headBucket(bucketName: string): any {
        const url = this.getBucketUrl(bucketName);
        const response = aws.do(url, {
            method: 'HEAD',
            service: 's3',
            region: this.region,
            access: this.accessKey,
            secret: this.secretKey
        } as any);
        if (response.statusCode !== 200 && response.statusCode !== 404) {
            throw new Error(`Failed to check bucket existence: ${response.statusCode} ${response.status}`);
        }
        return response;
    }

    protected bucketExists(bucketName: string): boolean {
        try {
            const response = this.headBucket(bucketName);
            return response.statusCode === 200;
        } catch (_e) {
            return false;
        }
    }

    protected createBucket(bucketName: string): any {
        const url = this.getServiceUrl(encodeURIComponent(bucketName));
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            access: this.accessKey,
            secret: this.secretKey
        } as any);
        if (response.statusCode !== 200 && response.statusCode !== 201) {
            throw new Error(`Failed to create bucket: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response;
    }

    protected deleteBucket(bucketName: string): any {
        const url = this.getBucketUrl(bucketName);
        const response = aws.delete(url, {
            service: 's3',
            region: this.region,
            access: this.accessKey,
            secret: this.secretKey
        } as any);
        if (response.statusCode !== 204 && response.statusCode !== 200 && response.statusCode !== 404) {
            throw new Error(`Failed to delete bucket: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response;
    }

    protected setBucketVersioning(bucketName: string, enabled: boolean): any {
        const url = this.getBucketUrl(bucketName, "?versioning");
        const versioningConfig = `<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">\n  <Status>${enabled ? 'Enabled' : 'Suspended'}</Status>\n</VersioningConfiguration>`;
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            access: this.accessKey,
            secret: this.secretKey,
            headers: { 'Content-Type': 'application/xml' },
            body: versioningConfig
        } as any);
        if (response.statusCode !== 200) {
            throw new Error(`Failed to set versioning: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response;
    }

    protected setBucketCors(bucketName: string, corsRules: any[]): any {
        const url = this.getBucketUrl(bucketName, "?cors");
        const corsRulesXml = corsRules.map(rule => `\n  <CORSRule>\n    ${rule.allowed_methods.map((m: string) => `<AllowedMethod>${m}</AllowedMethod>`).join('')}\n    ${rule.allowed_origins.map((o: string) => `<AllowedOrigin>${o}</AllowedOrigin>`).join('')}\n    ${rule.allowed_headers ? rule.allowed_headers.map((h: string) => `<AllowedHeader>${h}</AllowedHeader>`).join('') : ''}\n    ${rule.max_age_seconds ? `<MaxAgeSeconds>${rule.max_age_seconds}</MaxAgeSeconds>` : ''}\n  </CORSRule>`).join('');
        const corsConfig = `<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${corsRulesXml}\n</CORSConfiguration>`;
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            access: this.accessKey,
            secret: this.secretKey,
            headers: { 'Content-Type': 'application/xml' },
            body: corsConfig
        } as any);
        if (response.statusCode !== 200) {
            throw new Error(`Failed to set CORS: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response;
    }

    protected setBucketLifecycle(bucketName: string, rules: any[]): any {
        const url = this.getBucketUrl(bucketName, "?lifecycle");
        const lifecycleConfig = buildLifecycleConfigXml(rules);
        const response = aws.put(url, {
            service: 's3',
            region: this.region,
            access: this.accessKey,
            secret: this.secretKey,
            headers: { 'Content-Type': 'application/xml' },
            body: lifecycleConfig
        } as any);
        if (response.statusCode !== 200) {
            throw new Error(`Failed to set lifecycle: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response;
    }

    protected listBucketObjects(url: string): any {
        const response = aws.get(url, {
            service: 's3',
            region: this.region,
            access: this.accessKey,
            secret: this.secretKey
        } as any);
        if (response.statusCode !== 200) {
            throw new Error(`Failed to list bucket objects: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response;
    }

    protected generatePresignedUrlForObject(url: string, method: string, expires: number): any {
        try {
            const presignedResult = (aws as any).presign(url, {
                method,
                service: 's3',
                region: this.region,
                expire: expires,
                access: this.accessKey,
                secret: this.secretKey
            });
            return presignedResult;
        } catch (error) {
            throw new Error(`Failed to generate presigned URL: ${(error as Error).message}`);
        }
    }

    protected parseObjectKeysFromResponse(xmlResponse: string): string[] {
        const objectKeys: string[] = [];
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

    protected parseObjectInfoFromResponse(xmlResponse: string): Array<{ key: string; size: string; lastModified: string }> {
        const objects: Array<{ key: string; size: string; lastModified: string }> = [];
        const contentMatches = xmlResponse.match(/<Contents>[\s\S]*?<\/Contents>/g);
        if (contentMatches) {
            for (const match of contentMatches) {
                const keyMatch = match.match(/<Key>(.*?)<\/Key>/);
                const sizeMatch = match.match(/<Size>(.*?)<\/Size>/);
                const lastModifiedMatch = match.match(/<LastModified>(.*?)<\/LastModified>/);
                if (keyMatch && sizeMatch && lastModifiedMatch) {
                    objects.push({ key: keyMatch[1], size: sizeMatch[1], lastModified: lastModifiedMatch[1] });
                }
            }
        }
        return objects;
    }

    protected deleteObjectsBatch(bucketName: string, objectKeys: string[]): number {
        if (objectKeys.length === 0) return 0;
        const deleteObjectsXml = objectKeys.map(key => `<Object><Key>${escapeXml(key)}</Key></Object>`).join('');
        const deleteRequestXml = `<?xml version="1.0" encoding="UTF-8"?>\n<Delete xmlns="http://s3.amazonaws.com/doc/2006-03-01/">\n    ${deleteObjectsXml}\n</Delete>`;
        const url = this.getBucketUrl(bucketName, '?delete');
        const response = aws.post(url, {
            service: 's3',
            region: this.region,
            access: this.accessKey,
            secret: this.secretKey,
            headers: { 'Content-Type': 'application/xml' },
            body: deleteRequestXml
        } as any);
        if (response.statusCode !== 200) {
            cli.output(`Bulk delete failed (status ${response.statusCode}), falling back to individual deletes`);
            return this.deleteObjectsIndividually(bucketName, objectKeys);
        }
        return objectKeys.length;
    }

    protected deleteObjectsIndividually(bucketName: string, objectKeys: string[]): number {
        let deletedCount = 0;
        for (const key of objectKeys) {
            try {
                const url = this.getBucketUrl(bucketName, encodeURIComponent(key));
                const response = aws.delete(url, {
                    service: 's3',
                    region: this.region,
                    access: this.accessKey,
                    secret: this.secretKey
                } as any);
                if (response.statusCode === 204 || response.statusCode === 200) {
                    deletedCount++;
                } else {
                    cli.output(`Warning: failed to delete object ${key}: status ${response.statusCode}`);
                }
            } catch (e) {
                cli.output(`Warning: failed to delete object ${key}: ${(e as Error).message}`);
            }
        }
        return deletedCount;
    }
}
