import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import cli from "cli";
import { parseSNSError } from "./common.ts";

export interface AWSSNSDefinition {
    /** @description AWS region for SNS operations */
    region: string;
}

export interface AWSSNSState {
    /** @description Indicates if the resource pre-existed before this entity managed it */
    existing: boolean;
}

export abstract class AWSSNSEntity<
    TDefinition extends AWSSNSDefinition,
    TState extends AWSSNSState
> extends MonkEntity<TDefinition, TState> {
    
    protected get region(): string {
        return this.definition.region;
    }

    /**
     * Make a request to SNS API using query-based format
     */
    protected snsRequest(action: string, params: Record<string, string> = {}): any {
        const url = `https://sns.${this.region}.amazonaws.com/`;
        
        // Build query string parameters
        const queryParams: Record<string, string> = {
            Action: action,
            Version: "2010-03-31",
            ...params
        };

        // Convert params to URL-encoded body
        const body = Object.entries(queryParams)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join("&");

        // Log for debugging
        cli.output(`[SNS API] ${action} ${url}`);
        cli.output(`[SNS API Request Body] ${body}`);

        let response: any;
        try {
            response = aws.post(url, {
                service: "sns",
                region: this.region,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: body
            });
        } catch (error) {
            throw new Error(`SNS API request failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Log response for debugging
        cli.output(`[SNS API Response] Status: ${response.statusCode}`);
        if (response.body) {
            cli.output(`[SNS API Response] Body: ${response.body}`);
        }
        if (response.error) {
            cli.output(`[SNS API Response] Error: ${response.error}`);
        }

        if (response.statusCode >= 400) {
            const errorMessage = parseSNSError(response);
            throw new Error(`SNS API error (${action}): ${errorMessage}`);
        }

        return response;
    }

    /**
     * Parse XML response and extract a specific field
     */
    protected parseXmlField(xml: string, fieldName: string): string | undefined {
        const regex = new RegExp(`<${fieldName}>([^<]*)<\/${fieldName}>`, "i");
        const match = regex.exec(xml);
        return match ? match[1] : undefined;
    }

    /**
     * Parse XML array of items
     */
    protected parseXmlArray(xml: string, containerTag: string, itemTag: string): string[] {
        const results: string[] = [];
        const containerRegex = new RegExp(`<${containerTag}>(.*?)<\/${containerTag}>`, "gs");
        const containerMatch = containerRegex.exec(xml);
        
        if (containerMatch && containerMatch[1]) {
            const itemRegex = new RegExp(`<${itemTag}>([^<]*)<\/${itemTag}>`, "g");
            let match;
            while ((match = itemRegex.exec(containerMatch[1])) !== null) {
                results.push(match[1]);
            }
        }
        
        return results;
    }
}

