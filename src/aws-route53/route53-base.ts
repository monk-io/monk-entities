import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import cli from "cli";
import { parseRoute53Error, ROUTE53_API_BASE, ROUTE53_API_VERSION } from "./common.ts";

export interface AWSRoute53Definition {
    /** @description AWS region (used for signing; Route 53 is a global service) */
    region: string;
}

export interface AWSRoute53State {
    /** @description Indicates if the resource pre-existed before this entity managed it */
    existing: boolean;
}

export abstract class AWSRoute53Entity<
    TDefinition extends AWSRoute53Definition,
    TState extends AWSRoute53State
> extends MonkEntity<TDefinition, TState> {

    protected get region(): string {
        return this.definition.region || "us-east-1";
    }

    /**
     * Make a request to Route 53 API
     */
    protected route53Request(action: string, path: string, method: string = "GET", body?: string): any {
        const url = `${ROUTE53_API_BASE}/${ROUTE53_API_VERSION}${path}`;

        const options: any = {
            service: "route53",
            region: "us-east-1", // Route 53 signing always uses us-east-1
            headers: {} as Record<string, string>,
        };

        if (body) {
            options.headers["Content-Type"] = "application/xml";
            options.body = body;
        }

        cli.output(`[Route 53] ${method} ${path}`);

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
            throw new Error(`Route 53 API request failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        cli.output(`[Route 53 Response] Status: ${response.statusCode}`);
        if (response.body && response.statusCode >= 400) {
            cli.output(`[Route 53 Response] Body: ${response.body}`);
        }

        if (response.statusCode >= 400) {
            const errorMessage = parseRoute53Error(response);
            throw new Error(`Route 53 ${action} failed (${response.statusCode}): ${errorMessage}`);
        }

        return response;
    }

    /**
     * Poll a change until it reaches INSYNC status
     */
    protected waitForChange(changeId: string, maxAttempts: number = 30, intervalMs: number = 10000): void {
        const cleanId = changeId.replace(/^\/change\//, "");
        cli.output(`Waiting for change ${cleanId} to propagate...`);

        for (let i = 0; i < maxAttempts; i++) {
            const response = this.route53Request("GetChange", `/change/${cleanId}`);
            const status = this.extractFromBody(response.body, "Status");

            if (status === "INSYNC") {
                cli.output(`Change ${cleanId} propagated successfully`);
                return;
            }

            cli.output(`Change status: ${status} (attempt ${i + 1}/${maxAttempts})`);
            sleep(intervalMs);
        }

        cli.output(`Warning: Change ${cleanId} still PENDING after ${maxAttempts} attempts`);
    }

    /**
     * Simple XML value extraction from response body
     */
    protected extractFromBody(body: string, tagName: string): string | undefined {
        const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, "i");
        const match = body.match(regex);
        return match ? match[1] : undefined;
    }

    /**
     * Make a CloudWatch request to get metric statistics
     */
    protected getCloudWatchMetric(
        metricNamespace: string,
        metricName: string,
        dimensions: Array<{ Name: string; Value: string }>,
        stat: string = "Sum"
    ): number {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000);

        const dimParams = dimensions.map((d, i) =>
            `Dimensions.member.${i + 1}.Name=${encodeURIComponent(d.Name)}&Dimensions.member.${i + 1}.Value=${encodeURIComponent(d.Value)}`
        ).join("&");

        const queryParams = [
            `Action=GetMetricStatistics`,
            `Namespace=${encodeURIComponent(metricNamespace)}`,
            `MetricName=${encodeURIComponent(metricName)}`,
            dimParams,
            `StartTime=${startTime.toISOString()}`,
            `EndTime=${endTime.toISOString()}`,
            `Period=2592000`,
            `Statistics.member.1=${stat}`,
            `Version=2010-08-01`,
        ].join("&");

        const url = `https://monitoring.us-east-1.amazonaws.com/?${queryParams}`;

        try {
            const response = aws.get(url, {
                service: "monitoring",
                region: "us-east-1",
            });

            if (response.statusCode >= 400) {
                return 0;
            }

            const valueMatch = response.body.match(new RegExp(`<${stat}>([\\d.]+)</${stat}>`));
            return valueMatch ? parseFloat(valueMatch[1]) : 0;
        } catch {
            return 0;
        }
    }
}
