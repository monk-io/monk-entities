import { AWSAPIGatewayEntity, AWSAPIGatewayDefinition, AWSAPIGatewayState } from "./base.ts";
import { action } from "monkec/base";
import cli from "cli";

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
}


