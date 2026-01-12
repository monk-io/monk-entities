import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import cli from "cli";
import { parseSESError } from "./common.ts";

export interface AWSSESDefinition {
    /** @description AWS region for SES operations */
    region: string;
}

export interface AWSSESState {
    /** @description Indicates if the resource pre-existed before this entity managed it */
    existing: boolean;
}

export abstract class AWSSESEntity<
    TDefinition extends AWSSESDefinition,
    TState extends AWSSESState
> extends MonkEntity<TDefinition, TState> {
    
    protected get region(): string {
        return this.definition.region;
    }

    /**
     * Make a request to SES API v2
     */
    protected sesRequest(action: string, path: string, method: string = "GET", body?: string): any {
        const url = `https://email.${this.region}.amazonaws.com${path}`;
        
        const options: any = {
            service: "email",
            region: this.region,
            headers: {} as Record<string, string>
        };

        if (body) {
            options.headers["Content-Type"] = "application/json";
            options.body = body;
        }

        // Always log for debugging
        cli.output(`[SES API] ${method} ${url}`);
        if (body) {
            cli.output(`[SES API Request Body] ${body}`);
        }

        let response: any;
        try {
            if (method === "GET") {
                response = aws.get(url, options);
            } else if (method === "POST") {
                response = aws.post(url, options);
            } else if (method === "PUT") {
                response = aws.put(url, options);
            } else if (method === "DELETE") {
                response = aws.delete(url, options);
            } else {
                throw new Error(`Unsupported HTTP method: ${method}`);
            }
        } catch (error) {
            throw new Error(`SES API request failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Always log full response for debugging
        cli.output(`[SES API Response] Status: ${response.statusCode}`);
        cli.output(`[SES API Response] Headers: ${JSON.stringify(response.headers || {})}`);
        if (response.body) {
            cli.output(`[SES API Response] Body: ${response.body}`);
        }
        if (response.error) {
            cli.output(`[SES API Response] Error: ${response.error}`);
        }

        if (response.statusCode >= 400) {
            const errorMessage = parseSESError(response);
            throw new Error(`SES API error (${action}): ${errorMessage}`);
        }

        // Parse JSON response if present
        if (response.body && response.statusCode >= 200 && response.statusCode < 300) {
            try {
                return JSON.parse(response.body);
            } catch (e) {
                // Not JSON, return raw response
                return response;
            }
        }

        return response;
    }

    /**
     * Enable debug mode to print API requests and responses
     */
    protected get debug(): boolean {
        // Can be overridden in derived classes or controlled via definition
        return false;
    }
}

