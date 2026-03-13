import { AWSAPIGatewayEntity, AWSAPIGatewayDefinition, AWSAPIGatewayState } from "./api-gateway-base.ts";
import { action } from "monkec/base";
import cli from "cli";
import aws from "cloud/aws";

/**
 * Definition interface for AWS API Gateway entity.
 * Configures API properties including protocol type (HTTP/WebSocket) and routes.
 * @interface APIGatewayDefinition
 */
export interface APIGatewayDefinition extends AWSAPIGatewayDefinition {
    name: string;
    protocol_type: "HTTP" | "WEBSOCKET";
    routes?: any;
    tags?: Record<string, string>;
}

/**
 * State interface for AWS API Gateway entity.
 * Contains runtime information about the created API.
 * @interface APIGatewayState
 */
export interface APIGatewayState extends AWSAPIGatewayState {
    /** @description API name */
    name?: string;
    /** @description Protocol type (HTTP or WEBSOCKET) */
    protocol_type?: string;
}

type RouteDef = Required<NonNullable<APIGatewayDefinition["routes"]>>[number];

/**
 * @description AWS API Gateway entity.
 * Creates and manages Amazon API Gateway HTTP APIs and WebSocket APIs.
 * Supports Lambda integrations with automatic route configuration and auto-deploy stages.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.api_id` - API ID for management operations
 * - `state.api_endpoint` - Invoke URL for API requests
 * - `state.name` - API name
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-lambda/function` - Backend integrations for API routes
 * - `aws-cognito/user-pool` - JWT authorizers for authentication
 * - `aws-iam/role` - IAM authorization for API access
 */
export class APIGateway extends AWSAPIGatewayEntity<APIGatewayDefinition, APIGatewayState> {

    protected getApiName(): string {
        return this.definition.name;
    }

    private getConfiguredRoutes(): RouteDef[] {
        const defAny: any = this.definition as any;
        const raw: any = defAny?.routes;

        const list: any[] = [];
        // 1) If routes is present, accept array or object map
        if (raw) {
            if (Array.isArray(raw)) {
                list.push(...raw);
            } else if (typeof raw === "object") {
                list.push(...Object.values(raw));
            }
        }

        // 2) Also accept top-level marshalled keys: routes!0, routes!1, ...
        if (defAny && typeof defAny === "object") {
            const routeKeys = Object.keys(defAny)
                .filter(k => /^routes!\d+$/.test(k))
                .sort((a, b) => parseInt(a.split("!")[1]) - parseInt(b.split("!")[1]));
            for (const k of routeKeys) {
                list.push(defAny[k]);
            }
        }

        if (list.length === 0) {
            cli.output("[aws-api-gateway] routes not present in definition");
            return [];
        }

        const normalized: RouteDef[] = [];
        for (const item of list) {
            if (!item || typeof item !== "object") continue;

            const path = item.path ?? item.Path ?? item.route ?? item.Route ?? item.uri;
            let method = item.method ?? item.Method ?? item.httpMethod ?? item.verb;
            const integration = item.integration ?? item.Integration ?? item.target;
            const integrationFunction = integration?.function ?? integration?.Function ?? integration?.lambdaArn ?? integration?.lambda ?? integration?.arn;

            if (typeof path === "string" && path && typeof method === "string" && integrationFunction) {
                normalized.push({
                    path: path,
                    method: String(method).toUpperCase(),
                    integration: { type: "lambda", function: String(integrationFunction) }
                } as RouteDef);
            }
        }

        cli.output(`[aws-api-gateway] normalized routes count: ${normalized.length}`);
        return normalized;
    }

    private findApiByName(name: string): string | null {
        const res = this.makeV2Request("GET", "/v2/apis");
        const items = (res.items || res.Items || []) as Array<Record<string, any>>;
        const api = items.find(i => (i.Name || i.name) === name);
        return (api?.ApiId || api?.apiId) || null;
    }

    private createApi(): { apiId: string; endpoint?: string } {
        // API Gateway v2 CreateApi:
        // - HTTP: requires Name, ProtocolType only (no RouteSelectionExpression, no Protocol)
        // - WEBSOCKET: requires RouteSelectionExpression
        const isWebSocket = String(this.definition.protocol_type).toUpperCase() === "WEBSOCKET";
        const body: Record<string, any> = {
            name: this.definition.name,
            protocolType: String(this.definition.protocol_type).toUpperCase(),
        };
        if (this.definition.tags) {
            body.tags = this.definition.tags;
        }
        if (isWebSocket) {
            body.routeSelectionExpression = "$request.body.action";
        }
        const res = this.makeV2Request("POST", "/v2/apis", body);
        const rawId = (res as any).ApiId ?? (res as any).apiId;
        const apiId = typeof rawId === "string" ? rawId : (rawId ? String(rawId) : undefined);
        if (!apiId) {
            throw new Error("[aws-api-gateway] CreateApi did not return ApiId");
        }
        const endpointVal = (res as any).ApiEndpoint ?? (res as any).apiEndpoint;
        const endpoint = endpointVal ? String(endpointVal) : undefined;
        return { apiId, endpoint };
    }

    private getIntegrationId(apiId: string, integrationUri: string): string | null {
        const res = this.makeV2Request("GET", `/v2/apis/${encodeURIComponent(apiId)}/integrations`);
        const items = (res.items || res.Items || []) as Array<Record<string, any>>;
        const match = items.find(i => (i.IntegrationUri || i.integrationUri) === integrationUri);
        const id = match ? (match.IntegrationId || match.integrationId) : undefined;
        cli.output(`[aws-api-gateway] lookup integration: ${match ? "FOUND" : "NOT FOUND"}`);
        return id ? String(id) : null;
    }

    private routeExists(apiId: string, routeKey: string): boolean {
        const res = this.makeV2Request("GET", `/v2/apis/${encodeURIComponent(apiId)}/routes`);
        const items = (res.items || res.Items || []) as Array<Record<string, any>>;
        const exists = items.some(i => (i.RouteKey || i.routeKey) === routeKey);
        cli.output(`[aws-api-gateway] route check '${routeKey}': ${exists ? "EXISTS" : "MISSING"} (total: ${items.length})`);
        return exists;
    }

    private logExistingRoutes(apiId: string, context: string): void {
        try {
            const res = this.makeV2Request("GET", `/v2/apis/${encodeURIComponent(apiId)}/routes`);
            const items = (res.items || res.Items || []) as Array<Record<string, any>>;
            const keys = items.map(i => (i.RouteKey || i.routeKey));
            cli.output(`[aws-api-gateway] existing routes (${context}): ${items.length} -> ${JSON.stringify(keys)}`);
        } catch (_e) {
            cli.output(`[aws-api-gateway] failed to list routes (${context})`);
        }
    }

    private ensureRouteAndIntegration(apiId: string, route: RouteDef): void {
        // Create Lambda integration (AWS_PROXY)
        const routeKey = `${route.method.toUpperCase()} ${route.path}`;
        const lambdaArn = route.integration.function;
        const integrationUri = `arn:aws:apigateway:${this.definition.region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`;
        cli.output(`[aws-api-gateway] ensure route '${routeKey}' with integration URI: ${integrationUri}`);
        let integrationId: string | null = null;
        try {
            cli.output(`[aws-api-gateway] creating integration...`);
            const intRes = this.makeV2Request("POST", `/v2/apis/${encodeURIComponent(apiId)}/integrations`, {
                integrationType: "AWS_PROXY",
                integrationUri: integrationUri,
                payloadFormatVersion: "2.0",
                integrationMethod: "POST"
            });
            integrationId = String((intRes as any).IntegrationId || (intRes as any).integrationId);
            cli.output(`[aws-api-gateway] integration created: ${integrationId}`);
        } catch (e) {
            // If integration already exists, look it up
            const maybe = this.getIntegrationId(apiId, integrationUri);
            if (!maybe) throw e;
            integrationId = maybe;
            cli.output(`[aws-api-gateway] integration reused: ${integrationId}`);
        }

        // Create route (METHOD path)
        if (!this.routeExists(apiId, routeKey)) {
            cli.output(`[aws-api-gateway] creating route '${routeKey}' -> integrations/${integrationId}`);
            this.makeV2Request("POST", `/v2/apis/${encodeURIComponent(apiId)}/routes`, {
                routeKey: routeKey,
                target: `integrations/${integrationId}`,
            });
            cli.output(`[aws-api-gateway] route created: ${routeKey}`);
        } else {
            cli.output(`[aws-api-gateway] route already exists: ${routeKey}`);
        }
    }

    private createDefaultStage(apiId: string): void {
        // Ensure default "$default" stage exists and auto-deploy enabled
        try {
            this.makeV2Request("POST", `/v2/apis/${encodeURIComponent(apiId)}/stages`, {
                stageName: "$default",
                autoDeploy: true
            });
        } catch (_e) {
            // Ignore if stage exists
        }
    }

    private logDefinition(): void {
        try {
            cli.output(`[aws-api-gateway] definition summary: ${JSON.stringify(this.definition)}`);
        } catch (_e) {
            // ignore
        }
    }

    override create(): void {
        // Reuse existing if found by name
        const existingId = this.findApiByName(this.getApiName());
        this.logDefinition();
        if (existingId) {
            this.state.existing = true;
            this.state.api_id = existingId;
            this.state.name = this.definition.name;
            this.state.protocol_type = this.definition.protocol_type;
        } else {
            const { apiId, endpoint } = this.createApi();
            this.state.existing = false;
            this.state.api_id = apiId;
            this.state.api_endpoint = endpoint;
            this.state.name = this.definition.name;
            this.state.protocol_type = this.definition.protocol_type;
        }
        cli.output(`[aws-api-gateway] configured routes count: ${this.definition.routes ? this.definition.routes.length : 0}`);
        const routes = this.getConfiguredRoutes();
        cli.output(`[aws-api-gateway] configured routes count: ${routes.length}`);
        if (routes.length > 0) {
            for (const r of routes) {
                if (r.integration.type !== "lambda") continue;
                this.ensureRouteAndIntegration(this.state.api_id!, r);
            }
        }

        this.createDefaultStage(this.state.api_id!);
        this.logExistingRoutes(this.state.api_id!, "after-create");
    }

    @action("sync-routes")
    syncRoutes(): void {
        if (!this.state.api_id) {
            return;
        }
        const routes = this.getConfiguredRoutes();
        cli.output(`[aws-api-gateway] configured routes count: ${routes.length}`);
        if (routes.length > 0) {
            for (const r of routes) {
                if (r.integration.type !== "lambda") continue;
                this.ensureRouteAndIntegration(this.state.api_id, r);
            }
        }
        this.createDefaultStage(this.state.api_id);
        this.logExistingRoutes(this.state.api_id, "after-sync");
    }

    override start(): void {
        if (!this.state.api_id) {
            return;
        }
        const routes = this.getConfiguredRoutes();
        cli.output(`[aws-api-gateway] configured routes count: ${routes.length}`);
        if (routes.length > 0) {
            for (const r of routes) {
                if (r.integration.type !== "lambda") continue;
                this.ensureRouteAndIntegration(this.state.api_id, r);
            }
        }
        this.createDefaultStage(this.state.api_id);
        this.logExistingRoutes(this.state.api_id, "after-start");
    }

    override stop(): void {
        // No-op
    }

    override update(): void {
        // Minimal update support: ensure routes exist
        if (!this.state.api_id) {
            this.create();
            return;
        }
        const apiId = this.state.api_id;
        const routes = this.getConfiguredRoutes();
        cli.output(`[aws-api-gateway] configured routes count: ${routes.length}`);
        if (routes.length > 0) {
            for (const r of routes) {
                if (r.integration.type !== "lambda") continue;
                this.ensureRouteAndIntegration(apiId, r);
            }
        }
    }

    override delete(): void {
        if (!this.state.api_id) return;
        try {
            this.makeV2Request("DELETE", `/v2/apis/${encodeURIComponent(this.state.api_id)}`);
        } catch (_e) {
            // ignore
        }
        this.state.api_id = undefined;
        this.state.api_endpoint = undefined;
        this.state.existing = false;
    }

    override checkReadiness(): boolean {
        if (!this.state.api_id) return false;
        try {
            const res = this.makeV2Request("GET", `/v2/apis/${encodeURIComponent(this.state.api_id)}`);
            const hasEndpoint = !!res.ApiEndpoint;
            if (hasEndpoint) this.state.api_endpoint = res.ApiEndpoint;
            return hasEndpoint;
        } catch (_e) {
            return false;
        }
    }

    checkLiveness(): boolean {
        const id = this.state.api_id;
        if (!id) {
            throw new Error("API ID is missing");
        }
        const res = this.makeV2Request("GET", `/v2/apis/${encodeURIComponent(id)}`);
        const endpoint = (res as any).ApiEndpoint ?? (res as any).apiEndpoint;
        if (!endpoint) {
            throw new Error(`API ${id} has no endpoint yet`);
        }
        return true;
    }

    @action("get-endpoint")
    getEndpoint(): void {
        // Intentionally no cli import; consumers read from entity state
        // Nothing to output here; state carries endpoint
    }

    @action("list-routes")
    listRoutes(): void {
        if (!this.state.api_id) {
            cli.output("[aws-api-gateway] no api_id in state");
            return;
        }
        const res = this.makeV2Request("GET", `/v2/apis/${encodeURIComponent(this.state.api_id)}/routes`);
        const items = (res.items || res.Items || []) as Array<Record<string, any>>;
        const keys = items.map(i => (i.RouteKey || i.routeKey));
        cli.output(`[aws-api-gateway] routes (${this.state.api_id}): ${items.length}`);
        cli.output(JSON.stringify(keys, null, 2));
    }

    // ==================== COST ESTIMATION ====================

    /**
     * Parse pricing response from AWS Price List API
     */
    private parsePricingResponse(responseBody: string): number {
        try {
            const data = JSON.parse(responseBody);
            if (!data.PriceList || data.PriceList.length === 0) {
                return 0;
            }

            for (const priceItem of data.PriceList) {
                const product = typeof priceItem === 'string' ? JSON.parse(priceItem) : priceItem;
                const terms = product.terms?.OnDemand;
                if (!terms) continue;

                for (const termKey of Object.keys(terms)) {
                    const priceDimensions = terms[termKey].priceDimensions;
                    for (const dimKey of Object.keys(priceDimensions)) {
                        const pricePerUnit = parseFloat(priceDimensions[dimKey].pricePerUnit?.USD || '0');
                        if (pricePerUnit > 0) {
                            return pricePerUnit;
                        }
                    }
                }
            }
        } catch (error) {
            cli.output(`Warning: Failed to parse pricing: ${(error as Error).message}`);
        }
        return 0;
    }

    /**
     * Extract the unitOfMeasure string from the first price dimension in an AWS
     * Price List API response body. Returns a lower-cased string so callers can
     * check for keywords like "million" or "request".
     *
     * The AWS Price List API stores pricing in two ways depending on the service:
     *   - Per individual unit: pricePerUnit = 0.000001, unit = "per request"
     *   - Per bulk quantity:   pricePerUnit = 1.00,     unit = "per 1 million requests"
     *
     * Reading the unit field prevents applying a bulk-quantity multiplier when the
     * API has already expressed the price at that scale.
     */
    private parsePricingUnit(responseBody: string): string {
        try {
            const data = JSON.parse(responseBody);
            if (!data.PriceList || data.PriceList.length === 0) return '';
            const product = typeof data.PriceList[0] === 'string'
                ? JSON.parse(data.PriceList[0])
                : data.PriceList[0];
            const terms = product.terms?.OnDemand;
            if (!terms) return '';
            for (const termKey of Object.keys(terms)) {
                const priceDimensions = terms[termKey].priceDimensions;
                for (const dimKey of Object.keys(priceDimensions)) {
                    const unit: string = priceDimensions[dimKey].unit || '';
                    if (unit) return unit.toLowerCase();
                }
            }
        } catch {
            // Ignore parse errors — caller will use the safe default (per-unit)
        }
        return '';
    }

    /**
     * Map AWS region codes to location names for Pricing API
     */
    private getRegionToLocationMap(): Record<string, string> {
        return {
            'us-east-1': 'US East (N. Virginia)',
            'us-east-2': 'US East (Ohio)',
            'us-west-1': 'US West (N. California)',
            'us-west-2': 'US West (Oregon)',
            'af-south-1': 'Africa (Cape Town)',
            'ap-east-1': 'Asia Pacific (Hong Kong)',
            'ap-south-1': 'Asia Pacific (Mumbai)',
            'ap-south-2': 'Asia Pacific (Hyderabad)',
            'ap-southeast-1': 'Asia Pacific (Singapore)',
            'ap-southeast-2': 'Asia Pacific (Sydney)',
            'ap-southeast-3': 'Asia Pacific (Jakarta)',
            'ap-southeast-4': 'Asia Pacific (Melbourne)',
            'ap-northeast-1': 'Asia Pacific (Tokyo)',
            'ap-northeast-2': 'Asia Pacific (Seoul)',
            'ap-northeast-3': 'Asia Pacific (Osaka)',
            'ca-central-1': 'Canada (Central)',
            'eu-central-1': 'EU (Frankfurt)',
            'eu-central-2': 'EU (Zurich)',
            'eu-west-1': 'EU (Ireland)',
            'eu-west-2': 'EU (London)',
            'eu-west-3': 'EU (Paris)',
            'eu-south-1': 'EU (Milan)',
            'eu-south-2': 'EU (Spain)',
            'eu-north-1': 'EU (Stockholm)',
            'il-central-1': 'Israel (Tel Aviv)',
            'me-south-1': 'Middle East (Bahrain)',
            'me-central-1': 'Middle East (UAE)',
            'sa-east-1': 'South America (Sao Paulo)'
        };
    }

    /**
     * Fetch API Gateway pricing from AWS Price List API
     */
    private fetchAPIGatewayPricing(): {
        requestPerMillion: number;
        connectionMinutePerMillion: number;
        source: string;
    } {
        const pricingRegion = 'us-east-1';
        const url = `https://api.pricing.${pricingRegion}.amazonaws.com/`;
        const location = this.getRegionToLocationMap()[this.region];
        if (!location) {
            throw new Error(`Unsupported region for API Gateway pricing: ${this.region}`);
        }

        const filters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AmazonApiGateway' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location }
        ];

        const response = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AmazonApiGateway',
                Filters: filters,
                MaxResults: 100
            })
        });

        if (response.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${response.statusCode} for API Gateway pricing`);
        }

        let requestPerMillion = 0;
        let connectionMinutePerMillion = 0;

        try {
            const data = JSON.parse(response.body);
            if (data.PriceList && data.PriceList.length > 0) {
                for (const priceItem of data.PriceList) {
                    const product = typeof priceItem === 'string' ? JSON.parse(priceItem) : priceItem;
                    const attributes = product.product?.attributes || {};
                    const usageType = (attributes.usagetype || '').toLowerCase();
                    const group = (attributes.group || '').toLowerCase();
                    const terms = product.terms?.OnDemand;
                    if (!terms) continue;

                    let pricePerUnit = 0;
                    let itemUnit = '';
                    for (const termKey of Object.keys(terms)) {
                        const priceDimensions = terms[termKey].priceDimensions;
                        for (const dimKey of Object.keys(priceDimensions)) {
                            const dim = priceDimensions[dimKey];
                            const p = parseFloat(dim.pricePerUnit?.USD || '0');
                            if (p > 0) {
                                pricePerUnit = p;
                                itemUnit = (dim.unit || '').toLowerCase();
                                break;
                            }
                        }
                        if (pricePerUnit > 0) break;
                    }

                    if (pricePerUnit <= 0) continue;

                    // The AWS Price List API returns pricePerUnit as the price for one unit.
                    // The unit field (unitOfMeasure) tells us what "one unit" is for THIS item.
                    // For API Gateway: unit is typically "per request" (individual request),
                    // so we multiply by 1,000,000 to get the per-million rate.
                    // Guard: if the unit already expresses a bulk quantity (e.g. "per 1 million"),
                    // use the price as-is to avoid a 1,000,000× overcharge.
                    const perMillionFactor = itemUnit.includes('million') ? 1 : 1_000_000;

                    // Match WebSocket connection minutes
                    if (usageType.includes('connectionminute') || group.includes('websocket-connection')) {
                        connectionMinutePerMillion = pricePerUnit * perMillionFactor;
                    }
                    // Match API requests (HTTP or WebSocket messages)
                    else if (requestPerMillion === 0 && (usageType.includes('apirequest') || usageType.includes('message') || group.includes('api-request'))) {
                        requestPerMillion = pricePerUnit * perMillionFactor;
                    }
                }
            }
        } catch {
            // Fall through to error check below
        }

        if (requestPerMillion <= 0) {
            // Fallback to the simpler parser
            const perRequest = this.parsePricingResponse(response.body);
            if (perRequest <= 0) {
                throw new Error('Could not parse API Gateway pricing from AWS Price List API response');
            }
            // parsePricingResponse returns raw pricePerUnit; apply the same unit-aware conversion.
            const fallbackUnit = this.parsePricingUnit(response.body);
            const perMillionFactor = fallbackUnit.includes('million') ? 1 : 1_000_000;
            requestPerMillion = perRequest * perMillionFactor;
        }

        return {
            requestPerMillion,
            connectionMinutePerMillion,
            source: 'AWS Price List API'
        };
    }

    /**
     * Get CloudWatch metrics for API Gateway (last 30 days)
     */
    private getAPIGatewayCloudWatchMetrics(): {
        totalRequests: number;
        connectionMinutes?: number;
    } | null {
        if (!this.state.api_id) return null;

        try {
            const endTime = new Date().toISOString();
            const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

            const queryParams = [
                'Action=GetMetricStatistics',
                'Version=2010-08-01',
                'Namespace=AWS%2FApiGateway',
                'MetricName=Count',
                `StartTime=${encodeURIComponent(startTime)}`,
                `EndTime=${encodeURIComponent(endTime)}`,
                'Period=2592000',
                'Statistics.member.1=Sum',
                'Dimensions.member.1.Name=ApiId',
                `Dimensions.member.1.Value=${encodeURIComponent(this.state.api_id)}`
            ];

            const cwUrl = `https://monitoring.${this.region}.amazonaws.com/?${queryParams.join('&')}`;
            const response = aws.get(cwUrl, {
                service: 'monitoring',
                region: this.region
            });

            let totalRequests = 0;
            if (response.statusCode === 200) {
                const sumMatch = response.body.match(/<Sum>([\d.]+)<\/Sum>/);
                totalRequests = sumMatch ? parseFloat(sumMatch[1]) : 0;
            }

            // For WebSocket APIs, estimate connection minutes from ConnectCount × assumed
            // average session duration.
            //
            // **Known platform limitation**: AWS CloudWatch does not expose a direct
            // "connection duration" or "connection minutes" metric for API Gateway WebSocket
            // APIs.  IntegrationLatency (backend response time, typically milliseconds) was
            // previously used as a proxy, but it measures per-message latency, not session
            // lifetime — WebSocket connections typically stay open for minutes to hours, so
            // that approach underestimated connection minutes by several orders of magnitude.
            //
            // The current approach uses ConnectCount × AVG_SESSION_MINUTES (10 minutes),
            // which is a rough but order-of-magnitude-correct estimate for most workloads.
            // Users with known session durations should treat this as an approximation.
            const AVG_WEBSOCKET_SESSION_MINUTES = 10;
            const isWebSocket = String(this.state.protocol_type || this.definition.protocol_type).toUpperCase() === 'WEBSOCKET';
            let connectionMinutes: number | undefined;

            if (isWebSocket) {
                try {
                    // Fetch ConnectCount metric
                    const connectParams = [
                        'Action=GetMetricStatistics',
                        'Version=2010-08-01',
                        'Namespace=AWS%2FApiGateway',
                        'MetricName=ConnectCount',
                        `StartTime=${encodeURIComponent(startTime)}`,
                        `EndTime=${encodeURIComponent(endTime)}`,
                        'Period=2592000',
                        'Statistics.member.1=Sum',
                        'Dimensions.member.1.Name=ApiId',
                        `Dimensions.member.1.Value=${encodeURIComponent(this.state.api_id)}`
                    ];

                    const connectUrl = `https://monitoring.${this.region}.amazonaws.com/?${connectParams.join('&')}`;
                    const connectResponse = aws.get(connectUrl, {
                        service: 'monitoring',
                        region: this.region
                    });

                    if (connectResponse.statusCode === 200) {
                        const connectMatch = connectResponse.body.match(/<Sum>([\d.]+)<\/Sum>/);
                        const connectCount = connectMatch ? parseFloat(connectMatch[1]) : 0;
                        if (connectCount > 0) {
                            connectionMinutes = connectCount * AVG_WEBSOCKET_SESSION_MINUTES;
                        }
                    }
                } catch {
                    // Connection minutes not available
                }
            }

            return { totalRequests, connectionMinutes };
        } catch (error) {
            return null;
        }
    }

    /**
     * Get detailed cost estimate for the API Gateway
     */
    @action("get-cost-estimate")
    getCostEstimate(): void {
        if (!this.state.api_id) {
            throw new Error("API Gateway not created yet");
        }

        const pricing = this.fetchAPIGatewayPricing();
        const isHttp = String(this.state.protocol_type || this.definition.protocol_type).toUpperCase() !== 'WEBSOCKET';

        cli.output(`\n💰 Cost Estimate for API Gateway: ${this.state.name}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📊 API Configuration:`);
        cli.output(`   API Name: ${this.state.name}`);
        cli.output(`   API ID: ${this.state.api_id}`);
        cli.output(`   Protocol: ${isHttp ? 'HTTP' : 'WebSocket'}`);
        cli.output(`   Endpoint: ${this.state.api_endpoint || 'N/A'}`);
        cli.output(`   Region: ${this.region}`);

        cli.output(`\n💵 Pricing (${pricing.source}):`);
        cli.output(`   Requests: $${pricing.requestPerMillion.toFixed(2)} per million`);
        if (!isHttp) {
            if (pricing.connectionMinutePerMillion > 0) {
                cli.output(`   Connection Minutes: $${pricing.connectionMinutePerMillion.toFixed(2)} per million`);
            } else {
                cli.output(`   Connection Minutes: Rate not available from API`);
            }
        }
        cli.output(`   First 1 million requests/month: Free (free tier, first 12 months)`);

        const metrics = this.getAPIGatewayCloudWatchMetrics();
        let totalMonthlyCost = 0;

        if (metrics) {
            const requestCost = (metrics.totalRequests / 1000000) * pricing.requestPerMillion;
            totalMonthlyCost += requestCost;

            cli.output(`\n📈 Usage (Last 30 Days from CloudWatch):`);
            cli.output(`   Total Requests: ${metrics.totalRequests.toLocaleString()}`);

            cli.output(`\n💵 Cost Breakdown:`);
            cli.output(`   Request Costs: $${requestCost.toFixed(4)}`);

            // WebSocket connection-minute cost
            if (!isHttp && pricing.connectionMinutePerMillion > 0 && metrics.connectionMinutes !== undefined && metrics.connectionMinutes > 0) {
                const connectionCost = (metrics.connectionMinutes / 1000000) * pricing.connectionMinutePerMillion;
                totalMonthlyCost += connectionCost;
                cli.output(`   Connection Minutes: ${metrics.connectionMinutes.toLocaleString()} (estimated: ConnectCount × 10 min avg session) × $${pricing.connectionMinutePerMillion.toFixed(2)}/M = $${connectionCost.toFixed(4)}`);
            } else if (!isHttp) {
                cli.output(`   Connection Minutes: Not measured from CloudWatch`);
            }
        } else {
            cli.output(`\n⚠️ CloudWatch metrics unavailable - usage costs not included`);
        }

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`💰 ESTIMATED MONTHLY COST: $${totalMonthlyCost.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📝 Notes:`);
        cli.output(`   - API Gateway is purely usage-based (no fixed monthly cost)`);
        cli.output(`   - Does not include: Data transfer, caching, custom domain names`);
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     */
    @action("costs")
    costs(): void {
        if (!this.state.api_id) {
            const result = {
                type: "aws-api-gateway",
                costs: { month: { amount: "0", currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        try {
            const pricing = this.fetchAPIGatewayPricing();
            let totalMonthlyCost = 0;

            const metrics = this.getAPIGatewayCloudWatchMetrics();
            if (metrics) {
                totalMonthlyCost += (metrics.totalRequests / 1000000) * pricing.requestPerMillion;

                // WebSocket connection-minute cost
                if (metrics.connectionMinutes !== undefined && metrics.connectionMinutes > 0 && pricing.connectionMinutePerMillion > 0) {
                    totalMonthlyCost += (metrics.connectionMinutes / 1000000) * pricing.connectionMinutePerMillion;
                }
            }

            const result = {
                type: "aws-api-gateway",
                costs: { month: { amount: totalMonthlyCost.toFixed(2), currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
        } catch (error) {
            const result = {
                type: "aws-api-gateway",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } }
            };
            cli.output(JSON.stringify(result));
        }
    }
}


