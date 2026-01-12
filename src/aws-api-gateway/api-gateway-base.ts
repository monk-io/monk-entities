import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import cli from "cli";

export interface AWSAPIGatewayDefinition {
    region: string;
}

export interface AWSAPIGatewayState {
    existing?: boolean;
    api_id?: string;
    api_endpoint?: string;
}

type GatewayV2Response = Record<string, any> & {
    ApiId?: string;
    Name?: string;
    ProtocolType?: string;
    ApiEndpoint?: string;
    Items?: Array<Record<string, any>>;
};

export abstract class AWSAPIGatewayEntity<
    D extends AWSAPIGatewayDefinition,
    S extends AWSAPIGatewayState
> extends MonkEntity<D, S> {

    protected region!: string;

    protected override before(): void {
        this.region = this.definition.region;
    }

    protected makeV2Request(method: string, path: string, body?: any): GatewayV2Response {
        const url = `https://apigateway.${this.region}.amazonaws.com${path}`;

        const options: any = {
            service: "apigateway",
            region: this.region,
            headers: {},
            timeout: 30000,
        };

        if (body !== undefined) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        try {
            const printableBody = options.body ? options.body.toString() : "";
            cli.output(`[aws-api-gateway] request ${method} ${path}`);
            if (printableBody && printableBody.length > 0) {
                cli.output(`[aws-api-gateway] body: ${printableBody}`);
            }
        } catch (_e) {
            // ignore logging errors
        }

        let response: any;
        if (method === "GET") {
            response = aws.get(url, options);
        } else if (method === "POST") {
            response = aws.post(url, options);
        } else if (method === "PUT") {
            response = aws.put(url, options);
        } else if (method === "DELETE") {
            response = aws.delete(url, options);
        } else if (method === "PATCH") {
            response = aws.do(url, { ...options, method: "PATCH" });
        } else {
            throw new Error(`Unsupported HTTP method: ${method}`);
        }

        if (response.statusCode >= 400) {
            let errorMessage = `AWS API Gateway V2 API error: ${response.statusCode} ${response.status}`;
            try {
                const parsed = JSON.parse(response.body);
                if (parsed.message) errorMessage += ` - ${parsed.message}`;
                if (parsed.__type) errorMessage += ` (${parsed.__type})`;
            } catch (_e) {
                errorMessage += ` - Raw response: ${response.body}`;
            }
            throw new Error(errorMessage);
        }

        if (!response.body) {
            return response;
        }

        try {
            return JSON.parse(response.body) as GatewayV2Response;
        } catch (e) {
            throw new Error(`Failed to parse API Gateway response: ${e instanceof Error ? e.message : "Unknown error"}`);
        }
    }
}


