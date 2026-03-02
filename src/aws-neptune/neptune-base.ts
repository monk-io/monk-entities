import { MonkEntity, action } from "monkec/base";
import aws from "cloud/aws";

// Re-export action decorator to avoid duplicate 'base' variable in compiled output
export { action };

/**
 * Base definition interface for AWS Neptune entities.
 * @interface AWSNeptuneDefinition
 */
export interface AWSNeptuneDefinition {
    /** @description AWS region for the Neptune resource */
    region: string;
}

/**
 * Base state interface for AWS Neptune entities.
 * @interface AWSNeptuneState
 */
export interface AWSNeptuneState {
    /** @description Indicates if the resource pre-existed before this entity managed it */
    existing?: boolean;
}

export interface NeptuneErrorResponse {
    Error?: {
        Type?: string;
        Code?: string;
        Message?: string;
    };
    RequestId?: string;
}

/**
 * Base class for AWS Neptune entities.
 * Provides common HTTP client setup and request handling for Neptune API.
 * Neptune uses the same API style as RDS (form-urlencoded requests with XML responses).
 */
export abstract class AWSNeptuneEntity<
    TDefinition extends AWSNeptuneDefinition,
    TState extends AWSNeptuneState
> extends MonkEntity<TDefinition, TState> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    /**
     * Make a request to the AWS Neptune API
     * @param action - The Neptune API action (e.g., "CreateDBCluster")
     * @param params - The request parameters as an object
     * @returns Parsed response object
     */
    protected makeNeptuneRequest(action: string, params: Record<string, any> = {}): any {
        const url = `https://rds.${this.region}.amazonaws.com/`;
        
        // Build URL-encoded form data for Neptune API
        const formParams: Record<string, string> = {
            'Action': action,
            'Version': '2014-10-31'
        };
        
        // Add parameters to form data
        this.addParamsToFormData(formParams, params);
        
        // Convert to URL-encoded string
        const formBody = Object.entries(formParams)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        
        const response = aws.post(url, {
            service: 'rds',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody
        });

        if (response.statusCode >= 400) {
            let errorMessage = `Neptune API error: ${response.statusCode} ${response.status}`;
            
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

        return response.body;
    }

    /**
     * Add parameters to form data, handling nested objects and arrays
     */
    private addParamsToFormData(formParams: Record<string, string>, params: Record<string, any>, prefix: string = ''): void {
        for (const [key, value] of Object.entries(params)) {
            const paramKey = prefix ? `${prefix}.${key}` : key;
            
            if (value === undefined || value === null) {
                continue;
            }
            
            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === 'object' && item !== null) {
                        this.addParamsToFormData(formParams, item, `${paramKey}.member.${index + 1}`);
                    } else {
                        formParams[`${paramKey}.member.${index + 1}`] = String(item);
                    }
                });
            } else if (typeof value === 'object') {
                this.addParamsToFormData(formParams, value, paramKey);
            } else if (typeof value === 'boolean') {
                formParams[paramKey] = value ? 'true' : 'false';
            } else {
                formParams[paramKey] = String(value);
            }
        }
    }

    /**
     * Extract a value from XML response
     */
    protected extractXmlValue(xml: string, tag: string): string | undefined {
        const match = new RegExp(`<${tag}>(.*?)</${tag}>`).exec(xml);
        return match ? match[1] : undefined;
    }

    /**
     * Extract multiple values from XML response (for arrays)
     */
    protected extractXmlValues(xml: string, tag: string): string[] {
        const values: string[] = [];
        const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 'g');
        let match;
        while ((match = regex.exec(xml)) !== null) {
            values.push(match[1]);
        }
        return values;
    }

    /**
     * Check if an error indicates the resource was not found
     */
    protected isNotFoundError(error: unknown): boolean {
        if (error instanceof Error) {
            return error.message.includes('NotFound') ||
                   error.message.includes('not found');
        }
        return false;
    }

    /**
     * Check if an error indicates the resource already exists
     */
    protected isAlreadyExistsError(error: unknown): boolean {
        if (error instanceof Error) {
            return error.message.includes('AlreadyExists');
        }
        return false;
    }

    /**
     * Simple delay implementation using busy wait
     */
    protected delay(seconds: number): void {
        const delayMs = seconds * 1000;
        const start = Date.now();
        while (Date.now() - start < delayMs) {
            // Busy wait
        }
    }
}
