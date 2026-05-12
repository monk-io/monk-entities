/**
 * GCP Cloud Armor Security Policy Entity
 *
 * Creates and manages global Cloud Armor security policies (type=CLOUD_ARMOR)
 * that protect external/global HTTP(S) load balancer backend services from
 * web attacks and volumetric DDoS. Supports inline rules (IP allow/deny,
 * CEL expressions, rate limiting, redirects), a configurable default action,
 * Adaptive Protection toggle, and advanced JSON parsing options.
 *
 * Rules are reconciled against the live policy via the per-rule endpoints
 * (addRule/patchRule/removeRule) which don't require a fingerprint, avoiding
 * the concurrent-edit race that policy-level PATCH is prone to.
 *
 * @see https://cloud.google.com/armor/docs/security-policy-overview
 * @see https://cloud.google.com/compute/docs/reference/rest/v1/securityPolicies
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import {
    COMPUTE_API_URL,
    CLOUD_ARMOR_DEFAULT_PRIORITY,
    CloudArmorRuleAction,
    CloudArmorDdosProtection,
    CloudArmorJsonParsing,
    CloudArmorLogLevel,
    extractPriceFromSku,
} from "./common.ts";

/**
 * Rate-limit configuration for `throttle` and `rate_based_ban` rule actions.
 */
export interface CloudArmorRateLimitOptions {
    /**
     * @description Max requests allowed within the interval before action triggers
     */
    rate_limit_count: number;

    /**
     * @description Interval window in seconds for rate_limit_count
     */
    rate_limit_interval_sec: number;

    /**
     * @description Action applied to conforming (below threshold) requests
     */
    conform_action?: "allow";

    /**
     * @description Action applied when threshold is exceeded
     */
    exceed_action?: "deny(403)" | "deny(404)" | "deny(429)" | "deny(502)";

    /**
     * @description Key used to aggregate traffic for rate-limit matching
     */
    enforce_on_key?: "IP" | "ALL" | "HTTP_HEADER" | "XFF_IP" | "HTTP_COOKIE" | "HTTP_PATH" | "SNI" | "REGION_CODE";

    /**
     * @description Header/cookie name when enforce_on_key is HTTP_HEADER or HTTP_COOKIE
     */
    enforce_on_key_name?: string;

    /**
     * @description Ban duration in seconds (rate_based_ban only)
     */
    ban_duration_sec?: number;

    /**
     * @description Threshold count for ban (rate_based_ban only)
     */
    ban_threshold_count?: number;

    /**
     * @description Threshold interval for ban (rate_based_ban only)
     */
    ban_threshold_interval_sec?: number;
}

/**
 * Redirect configuration for `redirect` rule action.
 */
export interface CloudArmorRedirectOptions {
    /**
     * @description Redirect type: reCAPTCHA challenge or external HTTP 302
     */
    redirect_type: "GOOGLE_RECAPTCHA" | "EXTERNAL_302";

    /**
     * @description Target URL (required when redirect_type is EXTERNAL_302)
     */
    target?: string;
}

/**
 * Request-header mutation applied when a rule matches.
 */
export interface CloudArmorHeaderToAdd {
    /**
     * @description Header name
     */
    name: string;

    /**
     * @description Header value
     */
    value: string;
}

/**
 * A single security policy rule.
 *
 * Matching: provide either `src_ip_ranges` (IP CIDRs, max 10 per rule) OR
 * `match_expression` (CEL expression). If neither is set, the rule matches
 * all traffic (useful for catch-all rules).
 */
export interface CloudArmorRule {
    /**
     * @description Integer priority, 0-2147483646. Lower number = higher priority. Must be unique within the policy.
     */
    priority: number;

    /**
     * @description Action to apply on match
     */
    action: CloudArmorRuleAction;

    /**
     * @description Source IP CIDRs to match (max 10). Mutually exclusive with match_expression.
     */
    src_ip_ranges?: string[];

    /**
     * @description CEL match expression (e.g., origin.region_code == "US"). Mutually exclusive with src_ip_ranges.
     */
    match_expression?: string;

    /**
     * @description Human-readable rule description
     */
    rule_description?: string;

    /**
     * @description Log the rule without enforcing it
     */
    preview?: boolean;

    /**
     * @description Rate-limit config (required for throttle and rate_based_ban)
     */
    rate_limit?: CloudArmorRateLimitOptions;

    /**
     * @description Redirect config (required for redirect)
     */
    redirect?: CloudArmorRedirectOptions;

    /**
     * @description Request headers to add when the rule matches
     */
    request_headers_to_add?: CloudArmorHeaderToAdd[];
}

/**
 * Advanced policy-wide options (JSON parsing, logging, client IP source).
 */
export interface CloudArmorAdvancedOptions {
    /**
     * @description JSON parsing mode for request bodies
     */
    json_parsing?: CloudArmorJsonParsing;

    /**
     * @description Log verbosity for requests processed by this policy
     */
    log_level?: CloudArmorLogLevel;

    /**
     * @description Request headers used to derive the client IP (for X-Forwarded-For style setups)
     */
    user_ip_request_headers?: string[];
}

/**
 * Cloud Armor security policy definition
 */
export interface CloudArmorSecurityPolicyDefinition extends GcpEntityDefinition {
    /**
     * @description Policy name (1-63 chars, lowercase letters, digits, dashes, must start with a letter)
     */
    name: string;

    /**
     * @description Human-readable policy description
     */
    policy_description?: string;

    /**
     * @description Policy type. CLOUD_ARMOR protects backend services (default);
     * CLOUD_ARMOR_EDGE protects backend buckets at the edge. Must match the
     * kind of backend you intend to attach to.
     */
    policy_type?: "CLOUD_ARMOR" | "CLOUD_ARMOR_EDGE";

    /**
     * @description Action applied to requests not matching any user rule. Defaults to deny(403).
     */
    default_action?: "allow" | "deny(403)" | "deny(404)" | "deny(502)";

    /**
     * @description User-defined rules (in addition to the auto-created default rule at priority 2147483647)
     */
    rules?: CloudArmorRule[];

    /**
     * @description Enable Adaptive Protection Layer 7 DDoS defense (requires Cloud Armor Enterprise for ML features)
     */
    adaptive_protection?: boolean;

    /**
     * @description DDoS protection tier. ADVANCED requires Cloud Armor Enterprise.
     */
    ddos_protection?: CloudArmorDdosProtection;

    /**
     * @description Advanced JSON parsing, logging, and client-IP options
     */
    advanced_options?: CloudArmorAdvancedOptions;
}

/**
 * Cloud Armor security policy state
 */
export interface CloudArmorSecurityPolicyState extends GcpEntityState {
    /**
     * @description Server-generated numeric ID
     */
    id?: string;

    /**
     * @description Full resource self-link (used when attaching to backend services)
     */
    self_link?: string;

    /**
     * @description Fingerprint for concurrent-update control on policy-level PATCH
     */
    fingerprint?: string;

    /**
     * @description Self-links of backend services this entity has attached the policy to
     */
    attached_backends?: string[];
}

/**
 * @description Manages a global Cloud Armor security policy (type=CLOUD_ARMOR) that
 * protects external/global HTTP(S) load balancer backend services. Supports inline
 * rules with IP or CEL matching, rate limiting, redirects, header mutations, a
 * configurable default action, Adaptive Protection, and advanced JSON parsing.
 *
 * ## Required Permissions
 * - `compute.securityPolicies.create` / `.get` / `.list` / `.update` / `.delete` / `.use`
 * - `compute.securityPolicies.addRule` / `.getRule` / `.patchRule` / `.removeRule`
 * - `compute.backendServices.list` / `.get` / `.setSecurityPolicy` / `.setEdgeSecurityPolicy`
 * - `compute.backendBuckets.list` / `.setEdgeSecurityPolicy`
 *   (the list/edge perms are used by delete()'s auto-detach pass; the rest by the attach/detach actions)
 * - `compute.globalOperations.get` — poll long-running operations
 * - `monitoring.timeSeries.list` — cost estimation metrics
 * - `cloudbilling.services.list` — cost estimation pricing
 *
 * All of the above are contained in `roles/compute.securityAdmin`.
 *
 * ## Secrets
 * - Reads: none (authenticated via gcp provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.id` - Numeric policy resource ID
 * - `state.self_link` - Full resource URL — use for manual wiring when another entity needs the policy reference
 * - `state.attached_backends` - Backend services this entity has attached to
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/cloud-cdn-backend-service` — attach via the `attach-backend-service` action
 *   passing the backend service name or self-link
 * - `gcp/service-usage` — enable `compute.googleapis.com` before creating policies
 */
export class CloudArmorSecurityPolicy extends GcpEntity<CloudArmorSecurityPolicyDefinition, CloudArmorSecurityPolicyState> {

    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    protected getEntityName(): string {
        return `Cloud Armor Policy ${this.definition.name || 'unnamed'}`;
    }

    private getResourceUrl(): string {
        return `${COMPUTE_API_URL}/projects/${this.projectId}/global/securityPolicies/${this.definition.name}`;
    }

    private getCollectionUrl(): string {
        return `${COMPUTE_API_URL}/projects/${this.projectId}/global/securityPolicies`;
    }

    private getOperationUrl(operationName: string): string {
        return `${COMPUTE_API_URL}/projects/${this.projectId}/global/operations/${operationName}`;
    }

    private waitForComputeOperation(operationName: string): void {
        const opName = operationName.split("/").pop() || operationName;
        this.waitForOperation(this.getOperationUrl(opName), 60, 5000);
    }

    private getPolicy(): any | null {
        return this.checkResourceExists(this.getResourceUrl());
    }

    private populateState(resource: any): void {
        this.state.id = resource.id?.toString();
        this.state.self_link = resource.selfLink;
        this.state.fingerprint = resource.fingerprint;
    }

    private defaultAction(): string {
        return this.definition.default_action || "deny(403)";
    }

    /**
     * MonkEC runtime represents YAML arrays inside an object's properties as flattened
     * indexed keys (e.g. `rules!0`, `rules!1`) rather than a proper JS array on the
     * parent object. This helper reads either form and returns a real array.
     */
    private collectArray<T>(obj: any, key: string): T[] {
        if (!obj) return [];
        if (Array.isArray(obj[key])) return obj[key] as T[];
        const out: T[] = [];
        let i = 0;
        while (obj[`${key}!${i}`] !== undefined) {
            out.push(obj[`${key}!${i}`] as T);
            i++;
        }
        return out;
    }

    private collectUserRules(): CloudArmorRule[] {
        return this.collectArray<CloudArmorRule>(this.definition, "rules");
    }

    // ---------- Rule encoding ----------

    private encodeMatch(rule: any): any {
        const srcIpRanges = this.collectArray<string>(rule, "src_ip_ranges");
        if (srcIpRanges.length > 0) {
            return {
                versionedExpr: "SRC_IPS_V1",
                config: { srcIpRanges },
            };
        }
        if (rule.match_expression) {
            return { expr: { expression: rule.match_expression } };
        }
        // Catch-all (matches everything) — used for default rule
        return {
            versionedExpr: "SRC_IPS_V1",
            config: { srcIpRanges: ["*"] },
        };
    }

    private encodeRateLimit(rl: CloudArmorRateLimitOptions): any {
        const out: any = {
            rateLimitThreshold: {
                count: rl.rate_limit_count,
                intervalSec: rl.rate_limit_interval_sec,
            },
        };
        if (rl.conform_action) out.conformAction = rl.conform_action;
        if (rl.exceed_action) out.exceedAction = rl.exceed_action;
        if (rl.enforce_on_key) out.enforceOnKey = rl.enforce_on_key;
        if (rl.enforce_on_key_name) out.enforceOnKeyName = rl.enforce_on_key_name;
        if (rl.ban_duration_sec !== undefined) out.banDurationSec = rl.ban_duration_sec;
        if (rl.ban_threshold_count !== undefined || rl.ban_threshold_interval_sec !== undefined) {
            out.banThreshold = {
                count: rl.ban_threshold_count ?? rl.rate_limit_count,
                intervalSec: rl.ban_threshold_interval_sec ?? rl.rate_limit_interval_sec,
            };
        }
        return out;
    }

    private encodeRedirect(r: CloudArmorRedirectOptions): any {
        const out: any = { type: r.redirect_type };
        if (r.target) out.target = r.target;
        return out;
    }

    private encodeHeaderAction(headers: CloudArmorHeaderToAdd[]): any {
        return {
            requestHeadersToAdds: headers.map((h) => ({
                headerName: h.name,
                headerValue: h.value,
            })),
        };
    }

    private encodeRule(rule: any): any {
        const body: any = {
            priority: rule.priority,
            action: rule.action,
            match: this.encodeMatch(rule),
        };
        if (rule.rule_description) body.description = rule.rule_description;
        if (rule.preview !== undefined) body.preview = rule.preview;
        if (rule.rate_limit) body.rateLimitOptions = this.encodeRateLimit(rule.rate_limit);
        if (rule.redirect) body.redirectOptions = this.encodeRedirect(rule.redirect);
        const headers = this.collectArray<CloudArmorHeaderToAdd>(rule, "request_headers_to_add");
        if (headers.length > 0) {
            body.headerAction = this.encodeHeaderAction(headers);
        }
        return body;
    }

    private defaultRuleBody(action: string): any {
        return {
            priority: CLOUD_ARMOR_DEFAULT_PRIORITY,
            action,
            match: {
                versionedExpr: "SRC_IPS_V1",
                config: { srcIpRanges: ["*"] },
            },
            description: "default rule",
        };
    }

    // ---------- Policy-level body ----------

    private buildPolicyBody(includeRules: boolean): any {
        const body: any = {
            name: this.definition.name,
            type: this.definition.policy_type || "CLOUD_ARMOR",
        };
        if (this.definition.policy_description) {
            body.description = this.definition.policy_description;
        }
        if (this.definition.adaptive_protection !== undefined) {
            body.adaptiveProtectionConfig = {
                layer7DdosDefenseConfig: { enable: this.definition.adaptive_protection },
            };
        }
        if (this.definition.ddos_protection) {
            body.ddosProtectionConfig = { ddosProtection: this.definition.ddos_protection };
        }
        if (this.definition.advanced_options) {
            const ao: any = this.definition.advanced_options;
            const advanced: any = {};
            if (ao.json_parsing) advanced.jsonParsing = ao.json_parsing;
            if (ao.log_level) advanced.logLevel = ao.log_level;
            const userIpHeaders = this.collectArray<string>(ao, "user_ip_request_headers");
            if (userIpHeaders.length > 0) {
                advanced.userIpRequestHeaders = userIpHeaders;
            }
            if (Object.keys(advanced).length > 0) {
                body.advancedOptionsConfig = advanced;
            }
        }
        if (includeRules) {
            const userRules = this.collectUserRules().map((r) => this.encodeRule(r));
            body.rules = [...userRules, this.defaultRuleBody(this.defaultAction())];
        }
        return body;
    }

    // ---------- Lifecycle ----------

    override create(): void {
        // `existing` is sticky — set once on the first create() (true =
        // adopted a pre-existing policy, false = we created it) and never
        // flipped again. A mid-deploy retry that finds its own just-created
        // policy cannot reclassify itself as adopted.
        //
        // `force_ownership: true` in the definition overrides the adopt
        // branch: record `existing=false` so delete() cleans the resource
        // up. Use when you know this stack previously created it but
        // Monk's ledger was lost (e.g. after a cluster reset).
        const firstRun = this.state.existing === undefined;
        const existing = this.getPolicy();
        if (existing) {
            if (firstRun) {
                if (this.definition.force_ownership) {
                    cli.output(`Cloud Armor policy ${this.definition.name} already exists; reclaiming ownership (force_ownership=true)`);
                    this.state.existing = false;
                } else {
                    cli.output(`Cloud Armor policy ${this.definition.name} already exists, adopting`);
                    this.state.existing = true;
                }
            } else {
                cli.output(
                    `Cloud Armor policy ${this.definition.name} present (existing=${this.state.existing ? "adopted" : "owned"}); reconciling`,
                );
            }
            this.populateState(existing);
            return;
        }

        // Two-phase create: POST the policy shell without rules (GCP auto-creates the
        // default rule at priority 2147483647), then addRule each user rule and patch
        // the default if a non-default action was requested. The single-POST-with-rules
        // path is brittle — GCP sometimes accepts the policy while silently dropping
        // the user rules, leaving only the default in place.
        cli.output(`Creating Cloud Armor security policy: ${this.definition.name}`);
        const shellBody = this.buildPolicyBody(false);
        const operation = this.post(this.getCollectionUrl(), shellBody);
        if (operation?.name) {
            cli.output("Waiting for policy creation...");
            this.waitForComputeOperation(operation.name);
        }

        // Refresh to pick up fingerprint + self_link needed for subsequent calls.
        let resource = this.getPolicy();
        if (resource) this.populateState(resource);

        // GCP creates the default rule with action `allow`. If the user wants a
        // different default, patch it. Always patch when `default_action` was set in
        // the definition so the final policy deterministically matches what's declared.
        const desiredDefault = this.defaultAction();
        cli.output(`Setting default rule action to ${desiredDefault}`);
        this.callPatchRule(CLOUD_ARMOR_DEFAULT_PRIORITY, { action: desiredDefault });

        // Add each user rule via the per-rule endpoint.
        const userRules = this.collectUserRules();
        for (const r of userRules) {
            cli.output(`Adding rule at priority ${r.priority}`);
            this.callAddRule(this.encodeRule(r));
        }

        // Final state refresh.
        resource = this.getPolicy();
        if (resource) this.populateState(resource);
        if (firstRun) {
            this.state.existing = false;
        }
        this.state.attached_backends = this.state.attached_backends || [];

        cli.output(`Cloud Armor policy ${this.definition.name} created with ${userRules.length} user rule(s) + default (${desiredDefault})`);
    }

    override update(): void {
        const current = this.getPolicy();
        if (!current) {
            cli.output(`Cloud Armor policy ${this.definition.name} missing, recreating`);
            this.create();
            return;
        }
        this.populateState(current);

        // 1) Policy-level PATCH for top-level config changes.
        this.patchTopLevelIfChanged(current);

        // 2) Reconcile default rule action.
        const currentDefaultRule = (current.rules || []).find((r: any) => r.priority === CLOUD_ARMOR_DEFAULT_PRIORITY);
        const desiredDefault = this.defaultAction();
        if (currentDefaultRule && currentDefaultRule.action !== desiredDefault) {
            cli.output(`Updating default rule action: ${currentDefaultRule.action} -> ${desiredDefault}`);
            this.callPatchRule(CLOUD_ARMOR_DEFAULT_PRIORITY, { action: desiredDefault });
        }

        // 3) Reconcile user rules by priority.
        this.reconcileUserRules(current.rules || []);

        cli.output(`Cloud Armor policy ${this.definition.name} updated`);
    }

    private patchTopLevelIfChanged(current: any): void {
        const paths: string[] = [];
        const patch: any = {};

        const desiredDesc = this.definition.policy_description || "";
        if ((current.description || "") !== desiredDesc) {
            patch.description = desiredDesc;
            paths.push("description");
        }

        if (this.definition.adaptive_protection !== undefined) {
            const currentEnabled = current.adaptiveProtectionConfig?.layer7DdosDefenseConfig?.enable === true;
            if (currentEnabled !== this.definition.adaptive_protection) {
                patch.adaptiveProtectionConfig = {
                    layer7DdosDefenseConfig: { enable: this.definition.adaptive_protection },
                };
                paths.push("adaptiveProtectionConfig.layer7DdosDefenseConfig.enable");
            }
        }

        if (this.definition.ddos_protection) {
            const currentDdos = current.ddosProtectionConfig?.ddosProtection;
            if (currentDdos !== this.definition.ddos_protection) {
                patch.ddosProtectionConfig = { ddosProtection: this.definition.ddos_protection };
                paths.push("ddosProtectionConfig.ddosProtection");
            }
        }

        if (this.definition.advanced_options) {
            const ao = this.definition.advanced_options;
            const currentAdv = current.advancedOptionsConfig || {};
            const advanced: any = {};
            let advChanged = false;
            if (ao.json_parsing && currentAdv.jsonParsing !== ao.json_parsing) {
                advanced.jsonParsing = ao.json_parsing;
                paths.push("advancedOptionsConfig.jsonParsing");
                advChanged = true;
            }
            if (ao.log_level && currentAdv.logLevel !== ao.log_level) {
                advanced.logLevel = ao.log_level;
                paths.push("advancedOptionsConfig.logLevel");
                advChanged = true;
            }
            const desiredUserIpHeaders = this.collectArray<string>(ao, "user_ip_request_headers");
            if (desiredUserIpHeaders.length > 0 || (ao && ao["user_ip_request_headers"] !== undefined)) {
                const cur = currentAdv.userIpRequestHeaders || [];
                if (JSON.stringify(cur) !== JSON.stringify(desiredUserIpHeaders)) {
                    advanced.userIpRequestHeaders = desiredUserIpHeaders;
                    paths.push("advancedOptionsConfig.userIpRequestHeaders");
                    advChanged = true;
                }
            }
            if (advChanged) {
                patch.advancedOptionsConfig = { ...(currentAdv.jsonParsing || currentAdv.logLevel || currentAdv.userIpRequestHeaders ? currentAdv : {}), ...advanced };
            }
        }

        if (paths.length === 0) return;

        patch.fingerprint = current.fingerprint;
        const url = `${this.getResourceUrl()}?updateMask=${encodeURIComponent(paths.join(","))}`;
        cli.output(`Patching policy fields: ${paths.join(", ")}`);
        const op = this.patch(url, patch);
        if (op?.name) this.waitForComputeOperation(op.name);

        const refreshed = this.getPolicy();
        if (refreshed) this.populateState(refreshed);
    }

    private reconcileUserRules(existingRules: any[]): void {
        const declared: Map<number, CloudArmorRule> = new Map();
        for (const r of this.collectUserRules()) {
            declared.set(r.priority, r);
        }
        const existingByPriority: Map<number, any> = new Map();
        for (const r of existingRules) {
            if (r.priority !== CLOUD_ARMOR_DEFAULT_PRIORITY) {
                existingByPriority.set(r.priority, r);
            }
        }

        // Remove rules that are in live but not declared.
        for (const [priority] of existingByPriority) {
            if (!declared.has(priority)) {
                cli.output(`Removing rule at priority ${priority}`);
                this.callRemoveRule(priority);
            }
        }

        // Add or patch declared rules.
        for (const [priority, rule] of declared) {
            const existing = existingByPriority.get(priority);
            const encoded = this.encodeRule(rule as CloudArmorRule);
            if (!existing) {
                cli.output(`Adding rule at priority ${priority}`);
                this.callAddRule(encoded);
            } else if (!this.rulesEqual(existing, encoded)) {
                cli.output(`Patching rule at priority ${priority}`);
                // patchRule does not accept priority in body
                const { priority: _p, ...patchBody } = encoded;
                this.callPatchRule(priority, patchBody);
            }
        }
    }

    private rulesEqual(liveRule: any, encoded: any): boolean {
        return JSON.stringify(this.normalizeRule(liveRule)) === JSON.stringify(this.normalizeRule(encoded));
    }

    /**
     * Reduce a rule (live from GCP or locally encoded) to only the fields this entity
     * controls. GCP augments rule responses with server-computed fields like
     * `rateLimitOptions.enforceOnKeyConfigs` that aren't in our request body; if we
     * compared those directly, every update() would see a diff and trigger a spurious
     * patchRule.
     */
    private normalizeRule(rule: any): any {
        if (!rule) return rule;
        return {
            action: rule.action,
            description: rule.description || "",
            preview: rule.preview === true,
            match: this.normalizeMatch(rule.match),
            rateLimitOptions: this.normalizeRateLimit(rule.rateLimitOptions),
            redirectOptions: this.normalizeRedirect(rule.redirectOptions),
            headerAction: this.normalizeHeaderAction(rule.headerAction),
        };
    }

    private normalizeMatch(m: any): any {
        if (!m) return undefined;
        return {
            versionedExpr: m.versionedExpr,
            config: m.config ? { srcIpRanges: m.config.srcIpRanges } : undefined,
            expr: m.expr ? { expression: m.expr.expression } : undefined,
        };
    }

    private normalizeRateLimit(rl: any): any {
        if (!rl) return undefined;
        const out: any = {};
        if (rl.rateLimitThreshold) {
            out.rateLimitThreshold = {
                count: rl.rateLimitThreshold.count,
                intervalSec: rl.rateLimitThreshold.intervalSec,
            };
        }
        if (rl.conformAction !== undefined) out.conformAction = rl.conformAction;
        if (rl.exceedAction !== undefined) out.exceedAction = rl.exceedAction;
        if (rl.enforceOnKey !== undefined) out.enforceOnKey = rl.enforceOnKey;
        if (rl.enforceOnKeyName !== undefined) out.enforceOnKeyName = rl.enforceOnKeyName;
        if (rl.banDurationSec !== undefined) out.banDurationSec = rl.banDurationSec;
        if (rl.banThreshold) {
            out.banThreshold = {
                count: rl.banThreshold.count,
                intervalSec: rl.banThreshold.intervalSec,
            };
        }
        return out;
    }

    private normalizeRedirect(r: any): any {
        if (!r) return undefined;
        const out: any = { type: r.type };
        if (r.target !== undefined) out.target = r.target;
        return out;
    }

    private normalizeHeaderAction(h: any): any {
        if (!h) return undefined;
        const adds = h.requestHeadersToAdds || [];
        return {
            requestHeadersToAdds: adds.map((a: any) => ({
                headerName: a.headerName,
                headerValue: a.headerValue,
            })),
        };
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Cloud Armor policy ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getPolicy();
        if (!existing) {
            cli.output(`Cloud Armor policy ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting Cloud Armor policy: ${this.definition.name}`);

        // Cloud Armor policies can be attached to backend services
        // (`securityPolicy` / `edgeSecurityPolicy`) and backend buckets
        // (`edgeSecurityPolicy`). On group teardown those referring
        // resources are *usually* deleted in the same pass, so a short
        // retry loop is enough. But when this policy is attached to a
        // resource the user wants to keep — or when GCP doesn't drop the
        // reference during the referring resource's own delete — we need
        // to detach proactively before the delete will succeed.
        // 24 × 10s = 240s. After auto-detach succeeds GCP can take 60–120s
        // to drop the reverse-reference on the security policy, which is
        // why the previous 12-retry window (120s) wasn't enough even
        // when the PATCH on the referring backend bucket succeeded.
        const maxAttempts = 24;
        const delayMs = 10000;
        let detachAttempted = false;
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const op = this.httpDelete(this.getResourceUrl());
                if (op?.name) {
                    cli.output("Waiting for policy deletion...");
                    this.waitForComputeOperation(op.name);
                }
                cli.output(`Cloud Armor policy ${this.definition.name} deleted`);
                return;
            } catch (error) {
                lastErr = error;
                const msg = error instanceof Error ? error.message : String(error);
                const stillAttached =
                    msg.includes("resourceInUseByAnotherResource") ||
                    msg.includes("is already being used") ||
                    msg.includes("still attached");
                if (!stillAttached || attempt === maxAttempts) {
                    if (stillAttached) {
                        throw new Error(
                            `Cannot delete policy ${this.definition.name}: it is still attached to one or more backend services after ${attempt} attempts. ` +
                            `Detach first via 'detach-backend-service' action or by setting the backend's securityPolicy to "". Underlying error: ${msg}`
                        );
                    }
                    throw error;
                }
                // First time we see the "still attached" error, scan all
                // backend services + buckets in the project, clear any
                // reference to this policy, then resume the retry loop so
                // the wait still covers any in-flight teardown of the
                // referring resource itself.
                if (!detachAttempted) {
                    detachAttempted = true;
                    try {
                        this.detachAllReferrers();
                    } catch (detachErr) {
                        cli.output(
                            `Warning: auto-detach pass failed: ${detachErr instanceof Error ? detachErr.message : String(detachErr)}`,
                        );
                    }
                }
                cli.output(
                    `Policy still attached (attempt ${attempt}/${maxAttempts}); waiting ${delayMs / 1000}s for referring resources to finish teardown...`,
                );
                sleep(delayMs);
            }
        }
        throw lastErr ?? new Error("cloud-armor delete retry loop exited unexpectedly");
    }

    /**
     * Walk all backend services + backend buckets in the project and clear
     * any `securityPolicy` / `edgeSecurityPolicy` reference to this policy.
     * Best-effort: surfaces enumeration / detach errors as warnings rather
     * than throwing, so the caller can still decide whether to keep
     * retrying the policy delete.
     */
    private detachAllReferrers(): void {
        const policyName = this.definition.name;
        const matches = (ref: any): boolean =>
            typeof ref === "string" && ref.length > 0 &&
            (ref === policyName ||
             ref.endsWith(`/securityPolicies/${policyName}`));

        // Robustly stringify thrown values: Goja's native bridge can throw
        // plain objects with no `.message`, which used to surface in logs
        // as the literal string "[object Object]" and made it impossible
        // to tell whether the detach succeeded or silently failed.
        const errStr = (err: unknown): string => {
            if (err instanceof Error) return err.message || String(err);
            if (err && typeof err === "object") {
                const m = (err as any).message;
                if (typeof m === "string" && m.length) return m;
                try { return JSON.stringify(err); } catch { /* fall through */ }
            }
            return String(err);
        };

        // Detach a single resource. Returns true on success, false on
        // caught failure (with a descriptive cli.output line).
        //
        // GCP exposes two ways to clear a security-policy reference and
        // each has its own gotcha:
        //   - `POST <resource>/setEdgeSecurityPolicy` (or setSecurityPolicy)
        //     with `{ "securityPolicy": "" }` — *rejected* with "URL is
        //     malformed" because the parser requires a valid resource URL.
        //   - `PATCH <resource>` with `{ "<field>": null }` — accepted, but
        //     the reverse-reference on the security policy itself doesn't
        //     fully drop for tens of seconds, so a follow-up policy delete
        //     can still race.
        // We use the PATCH path because it's the only one that succeeds at
        // the API level, and rely on the outer retry loop to wait out the
        // propagation lag.
        const detach = (
            resourceUrl: string,
            patchField: "securityPolicy" | "edgeSecurityPolicy",
            label: string,
        ): boolean => {
            const body: any = {};
            body[patchField] = null;
            try {
                const op = this.patch(resourceUrl, body);
                if (op?.name) {
                    try {
                        this.waitForComputeOperation(op.name);
                    } catch (waitErr) {
                        cli.output(
                            `Warning: detach LRO wait failed for ${label}: ${errStr(waitErr)}`,
                        );
                        return false;
                    }
                }
                cli.output(`Detached ${label}`);
                return true;
            } catch (patchErr) {
                cli.output(
                    `Warning: PATCH (clear ${patchField}) on ${label} threw: ${errStr(patchErr)}`,
                );
                return false;
            }
        };

        // Backend services.
        try {
            const list = this.get(
                `${COMPUTE_API_URL}/projects/${this.projectId}/global/backendServices`,
            );
            for (const be of (list.items || [])) {
                const beUrl = `${COMPUTE_API_URL}/projects/${this.projectId}/global/backendServices/${be.name}`;
                if (matches(be.securityPolicy)) {
                    cli.output(`Auto-detaching from backend service ${be.name} (securityPolicy)`);
                    detach(beUrl, "securityPolicy", `backend service ${be.name}`);
                }
                if (matches(be.edgeSecurityPolicy)) {
                    cli.output(`Auto-detaching from backend service ${be.name} (edgeSecurityPolicy)`);
                    detach(beUrl, "edgeSecurityPolicy", `backend service ${be.name} (edge)`);
                }
            }
        } catch (err) {
            cli.output(`Warning: could not list backend services for auto-detach: ${errStr(err)}`);
        }

        // Backend buckets (edge-only attachment).
        try {
            const list = this.get(
                `${COMPUTE_API_URL}/projects/${this.projectId}/global/backendBuckets`,
            );
            for (const bb of (list.items || [])) {
                if (matches(bb.edgeSecurityPolicy)) {
                    cli.output(`Auto-detaching from backend bucket ${bb.name} (edgeSecurityPolicy)`);
                    const bbUrl = `${COMPUTE_API_URL}/projects/${this.projectId}/global/backendBuckets/${bb.name}`;
                    detach(bbUrl, "edgeSecurityPolicy", `backend bucket ${bb.name}`);
                }
            }
        } catch (err) {
            cli.output(`Warning: could not list backend buckets for auto-detach: ${errStr(err)}`);
        }
    }

    override checkReadiness(): boolean {
        const resource = this.getPolicy();
        if (!resource) return false;
        this.populateState(resource);
        const ruleCount = (resource.rules || []).length;
        cli.output(`Cloud Armor policy ${this.definition.name} ready (${ruleCount} rules)`);
        return true;
    }

    checkLiveness(): boolean {
        return this.getPolicy() !== null;
    }

    // ---------- Rule endpoint helpers ----------

    private callAddRule(ruleBody: any): void {
        const op = this.post(`${this.getResourceUrl()}/addRule`, ruleBody);
        if (op?.name) this.waitForComputeOperation(op.name);
    }

    private callPatchRule(priority: number, ruleBody: any): void {
        const url = `${this.getResourceUrl()}/patchRule?priority=${priority}`;
        const op = this.post(url, ruleBody);
        if (op?.name) this.waitForComputeOperation(op.name);
    }

    private callRemoveRule(priority: number): void {
        const url = `${this.getResourceUrl()}/removeRule?priority=${priority}`;
        const op = this.post(url);
        if (op?.name) this.waitForComputeOperation(op.name);
    }

    // ---------- Actions ----------

    @action("get-info")
    getInfo(_args?: Args): void {
        const resource = this.getPolicy();
        if (!resource) throw new Error("Cloud Armor policy not found");
        cli.output(JSON.stringify(resource, null, 2));
    }

    @action("list-rules")
    listRules(_args?: Args): void {
        const resource = this.getPolicy();
        if (!resource) throw new Error("Cloud Armor policy not found");
        const rules = (resource.rules || []).slice().sort((a: any, b: any) => a.priority - b.priority);
        if (rules.length === 0) {
            cli.output("No rules");
            return;
        }
        cli.output(`Rules for ${this.definition.name}:`);
        for (const r of rules) {
            const isDefault = r.priority === CLOUD_ARMOR_DEFAULT_PRIORITY;
            const matchDesc = r.match?.config?.srcIpRanges
                ? `src=${r.match.config.srcIpRanges.join(",")}`
                : r.match?.expr?.expression
                    ? `expr="${r.match.expr.expression}"`
                    : "*";
            const preview = r.preview ? " [PREVIEW]" : "";
            const label = isDefault ? " (default)" : "";
            cli.output(`  ${r.priority}${label}: ${r.action} ${matchDesc}${preview}${r.description ? ` -- ${r.description}` : ""}`);
        }
    }

    @action("add-rule")
    addRule(args?: Args): void {
        const priority = this.requireIntArg(args, "priority");
        const ruleAction = this.requireStringArg(args, "action");
        if (priority === CLOUD_ARMOR_DEFAULT_PRIORITY) {
            throw new Error(`Priority ${CLOUD_ARMOR_DEFAULT_PRIORITY} is reserved for the default rule; use set-default-action`);
        }
        const srcIpRanges = this.getStringArg(args, "src_ip_ranges");
        const matchExpr = this.getStringArg(args, "match_expression");
        if (srcIpRanges && matchExpr) {
            throw new Error("Provide src_ip_ranges OR match_expression, not both");
        }
        const rule: CloudArmorRule = {
            priority,
            action: ruleAction as CloudArmorRuleAction,
            src_ip_ranges: srcIpRanges ? srcIpRanges.split(",").map((s) => s.trim()).filter((s) => s) : undefined,
            match_expression: matchExpr || undefined,
            rule_description: this.getStringArg(args, "rule_description") || undefined,
            preview: this.getBoolArg(args, "preview"),
        };
        cli.output(`Adding rule at priority ${priority}`);
        this.callAddRule(this.encodeRule(rule));
        cli.output(`Rule added`);
    }

    @action("update-rule")
    updateRule(args?: Args): void {
        const priority = this.requireIntArg(args, "priority");
        const ruleAction = this.getStringArg(args, "action");
        const srcIpRanges = this.getStringArg(args, "src_ip_ranges");
        const matchExpr = this.getStringArg(args, "match_expression");
        if (srcIpRanges && matchExpr) {
            throw new Error("Provide src_ip_ranges OR match_expression, not both");
        }
        const ruleDescription = this.getStringArg(args, "rule_description");
        const preview = this.getBoolArg(args, "preview");

        const body: any = {};
        if (ruleAction) body.action = ruleAction;
        if (srcIpRanges) {
            body.match = this.encodeMatch({ src_ip_ranges: srcIpRanges.split(",").map((s) => s.trim()).filter((s) => s) });
        } else if (matchExpr) {
            body.match = this.encodeMatch({ match_expression: matchExpr });
        }
        if (ruleDescription !== undefined) body.description = ruleDescription;
        if (preview !== undefined) body.preview = preview;
        if (Object.keys(body).length === 0) throw new Error("No update fields provided");

        cli.output(`Patching rule at priority ${priority}`);
        this.callPatchRule(priority, body);
        cli.output(`Rule updated`);
    }

    @action("remove-rule")
    removeRule(args?: Args): void {
        const priority = this.requireIntArg(args, "priority");
        if (priority === CLOUD_ARMOR_DEFAULT_PRIORITY) {
            throw new Error(`Priority ${CLOUD_ARMOR_DEFAULT_PRIORITY} is the default rule and cannot be removed`);
        }
        cli.output(`Removing rule at priority ${priority}`);
        this.callRemoveRule(priority);
        cli.output(`Rule removed`);
    }

    @action("set-default-action")
    setDefaultAction(args?: Args): void {
        const newAction = this.requireStringArg(args, "action");
        cli.output(`Setting default action to ${newAction}`);
        this.callPatchRule(CLOUD_ARMOR_DEFAULT_PRIORITY, { action: newAction });
        cli.output(`Default action updated`);
    }

    @action("attach-backend-service")
    attachBackendService(args?: Args): void {
        const be = this.requireStringArg(args, "backend_service");
        if (!this.state.self_link) {
            const resource = this.getPolicy();
            if (resource) this.populateState(resource);
        }
        if (!this.state.self_link) {
            throw new Error("Policy self_link not available — is the policy created?");
        }
        const beUrl = this.resolveBackendServiceUrl(be);
        cli.output(`Attaching policy to backend service: ${beUrl}`);
        const op = this.post(`${beUrl}/setSecurityPolicy`, { securityPolicy: this.state.self_link });
        if (op?.name) this.waitForComputeOperation(op.name);

        this.state.attached_backends = this.state.attached_backends || [];
        if (this.state.attached_backends.indexOf(beUrl) === -1) {
            this.state.attached_backends.push(beUrl);
        }
        cli.output(`Attached to ${beUrl}`);
    }

    @action("detach-backend-service")
    detachBackendService(args?: Args): void {
        const be = this.requireStringArg(args, "backend_service");
        const beUrl = this.resolveBackendServiceUrl(be);
        cli.output(`Detaching policy from backend service: ${beUrl}`);
        const op = this.post(`${beUrl}/setSecurityPolicy`, { securityPolicy: "" });
        if (op?.name) this.waitForComputeOperation(op.name);

        if (this.state.attached_backends) {
            this.state.attached_backends = this.state.attached_backends.filter((u) => u !== beUrl);
        }
        cli.output(`Detached from ${beUrl}`);
    }

    private resolveBackendServiceUrl(nameOrUrl: string): string {
        if (nameOrUrl.indexOf("://") !== -1 || nameOrUrl.indexOf("/projects/") === 0) {
            return nameOrUrl.indexOf("://") !== -1 ? nameOrUrl : `${COMPUTE_API_URL}${nameOrUrl}`;
        }
        return `${COMPUTE_API_URL}/projects/${this.projectId}/global/backendServices/${nameOrUrl}`;
    }

    // ---------- Arg helpers ----------

    private getStringArg(args: Args | undefined, key: string): string | undefined {
        if (!args) return undefined;
        const v = (args as any)[key];
        if (v === undefined || v === null) return undefined;
        return String(v);
    }

    private requireStringArg(args: Args | undefined, key: string): string {
        const v = this.getStringArg(args, key);
        if (!v) throw new Error(`Missing required arg: ${key}`);
        return v;
    }

    private requireIntArg(args: Args | undefined, key: string): number {
        const v = this.getStringArg(args, key);
        if (!v) throw new Error(`Missing required arg: ${key}`);
        const n = parseInt(v, 10);
        if (isNaN(n)) throw new Error(`Arg ${key} must be an integer, got: ${v}`);
        return n;
    }

    private getBoolArg(args: Args | undefined, key: string): boolean | undefined {
        const v = this.getStringArg(args, key);
        if (v === undefined) return undefined;
        return v === "true" || v === "1" || v === "yes";
    }

    // ---------- Cost estimation ----------

    private fetchCloudArmorPricing(): {
        policyPerHour: number;
        rulePerHour: number;
        requestPerMillion: number;
        source: string;
    } {
        const fallback = {
            policyPerHour: 0.006849315, // ~$5/month
            rulePerHour: 0.001369863,   // ~$1/month per rule
            requestPerMillion: 0.75,     // global
            source: "Published pricing (fallback)",
        };
        try {
            const billingApiUrl = "https://cloudbilling.googleapis.com/v1";
            const servicesResp = this.get(`${billingApiUrl}/services?pageSize=5000`);
            if (!servicesResp.services || !Array.isArray(servicesResp.services)) return fallback;
            const armorSvc = servicesResp.services.find((s: any) =>
                (s.displayName || "").toLowerCase().includes("cloud armor")
            );
            if (!armorSvc || !armorSvc.name) return fallback;

            const skusResp = this.get(`${billingApiUrl}/${armorSvc.name}/skus?currencyCode=USD&pageSize=1000`);
            if (!skusResp.skus || !Array.isArray(skusResp.skus)) return fallback;

            let policyRate = 0;
            let ruleRate = 0;
            let requestRate = 0;
            for (const sku of skusResp.skus) {
                const desc = (sku.description || "").toLowerCase();
                const price = extractPriceFromSku(sku);
                if (price <= 0) continue;
                if (desc.includes("policy") && !desc.includes("rule") && !desc.includes("request")) {
                    if (policyRate === 0) policyRate = price;
                } else if (desc.includes("rule") && !desc.includes("request")) {
                    if (ruleRate === 0) ruleRate = price;
                } else if (desc.includes("request")) {
                    if (requestRate === 0) requestRate = price;
                }
            }
            if (policyRate > 0 || ruleRate > 0 || requestRate > 0) {
                return {
                    policyPerHour: policyRate > 0 ? policyRate : fallback.policyPerHour,
                    rulePerHour: ruleRate > 0 ? ruleRate : fallback.rulePerHour,
                    requestPerMillion: requestRate > 0 ? requestRate : fallback.requestPerMillion,
                    source: "GCP Cloud Billing Catalog API",
                };
            }
        } catch {
            // Fall through
        }
        return fallback;
    }

    private getRequestCount(): number {
        // Sum load balancer request counts across any attached backends over last 30 days.
        const backends = this.state.attached_backends || [];
        if (backends.length === 0) return 0;
        let total = 0;
        const endTime = new Date().toISOString();
        const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        for (const backendUrl of backends) {
            const parts = backendUrl.split("/");
            const name = parts[parts.length - 1];
            try {
                const filter = encodeURIComponent(
                    `metric.type="loadbalancing.googleapis.com/https/backend_request_count" AND resource.labels.backend_name="${name}"`
                );
                const url = `https://monitoring.googleapis.com/v3/projects/${this.projectId}/timeSeries?filter=${filter}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;
                const resp = this.get(url);
                if (resp.timeSeries && Array.isArray(resp.timeSeries)) {
                    for (const ts of resp.timeSeries) {
                        for (const point of (ts.points || [])) {
                            total += parseInt(point.value?.int64Value || point.value?.doubleValue || "0", 10);
                        }
                    }
                }
            } catch {
                // ignore per-backend metric errors
            }
        }
        return total;
    }

    private calculateMonthlyCost(): { total: number; policyCost: number; rulesCost: number; requestCost: number; pricing: any; ruleCount: number; requestCount: number } {
        const pricing = this.fetchCloudArmorPricing();
        const ruleCount = this.collectUserRules().length + 1; // +1 default rule
        const hoursPerMonth = 730;
        const policyCost = pricing.policyPerHour * hoursPerMonth;
        const rulesCost = pricing.rulePerHour * hoursPerMonth * ruleCount;
        const requestCount = this.getRequestCount();
        const requestCost = (requestCount / 1_000_000) * pricing.requestPerMillion;
        const total = policyCost + rulesCost + requestCost;
        return { total, policyCost, rulesCost, requestCost, pricing, ruleCount, requestCount };
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const name = this.definition.name;
        cli.output(`\nCost Estimate for Cloud Armor Security Policy: ${name}`);
        cli.output(`${"=".repeat(60)}`);

        const { total, policyCost, rulesCost, requestCost, pricing, ruleCount, requestCount } = this.calculateMonthlyCost();
        const attachedCount = (this.state.attached_backends || []).length;

        cli.output(`\nConfiguration:`);
        cli.output(`  Name: ${name}`);
        cli.output(`  User rules: ${this.collectUserRules().length}`);
        cli.output(`  Default rule action: ${this.defaultAction()}`);
        cli.output(`  Total rules (incl. default): ${ruleCount}`);
        cli.output(`  Attached backend services: ${attachedCount}`);

        cli.output(`\nPricing (${pricing.source}):`);
        cli.output(`  Policy: $${pricing.policyPerHour.toFixed(7)}/hour (~$${(pricing.policyPerHour * 730).toFixed(2)}/month)`);
        cli.output(`  Rule:   $${pricing.rulePerHour.toFixed(7)}/hour (~$${(pricing.rulePerHour * 730).toFixed(2)}/month/rule)`);
        cli.output(`  Requests: $${pricing.requestPerMillion.toFixed(4)}/1M requests (global)`);

        cli.output(`\nUsage (Last 30 Days from Cloud Monitoring):`);
        if (attachedCount === 0) {
            cli.output(`  No attached backend services — request count = 0`);
        } else {
            cli.output(`  Requests: ${requestCount.toLocaleString()} across ${attachedCount} backend(s)`);
        }

        cli.output(`\nMonthly Cost Components:`);
        cli.output(`  Policy:   $${policyCost.toFixed(2)}`);
        cli.output(`  Rules:    $${rulesCost.toFixed(2)} (${ruleCount} × $${(pricing.rulePerHour * 730).toFixed(2)})`);
        cli.output(`  Requests: $${requestCost.toFixed(2)}`);

        cli.output(`\n${"=".repeat(60)}`);
        cli.output(`ESTIMATED MONTHLY COST: $${total.toFixed(2)}`);
        cli.output(`${"=".repeat(60)}`);

        cli.output(`\nNotes:`);
        cli.output(`  - Cloud Armor Standard (pay-as-you-go). Enterprise subscription not included.`);
        cli.output(`  - Request count only counts traffic through attached backend services.`);
        cli.output(`  - Adaptive Protection ML features require Cloud Armor Enterprise.`);
    }

    @action("costs")
    costs(_args?: Args): void {
        if (!this.state.id) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-armor-security-policy",
                costs: { month: { amount: "0", currency: "USD" } },
            }));
            return;
        }
        try {
            const { total } = this.calculateMonthlyCost();
            cli.output(JSON.stringify({
                type: "gcp-cloud-armor-security-policy",
                costs: { month: { amount: total.toFixed(2), currency: "USD" } },
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-armor-security-policy",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } },
            }));
        }
    }
}
