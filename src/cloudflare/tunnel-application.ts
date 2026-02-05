import cli from "cli";
import { CloudflareEntity, type CloudflareEntityDefinition, type CloudflareEntityState } from "./cloudflare-base.ts";

/**
 * Definition interface for Cloudflare Tunnel Application entity.
 * Configures tunnel ingress and DNS for a published application.
 * @see https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/
 * @interface CloudflareTunnelApplicationDefinition
 */
export interface CloudflareTunnelApplicationDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare account ID that owns the tunnel */
  account_id: string;
  /** @description Tunnel ID to attach the application to */
  tunnel_id: string;
  /** @description Public hostname for the application (e.g., app.example.com) */
  hostname: string;
  /** @description Origin service URL for the application (e.g., http://localhost:8001) */
  service: string;
  /** @description Zone ID for DNS record creation; alternatively provide zone_name */
  zone_id?: string;
  /** @description Zone name for DNS record creation; used to resolve zone_id */
  zone_name?: string;
  /**
   * @description Whether the DNS record is proxied by Cloudflare
   * @default true
   */
  proxied?: boolean;
  /** @description Optional origin request settings for Cloudflare Tunnel */
  origin_request?: Record<string, any>;
  /**
   * @description Catch-all ingress service for unmatched requests
   * @default http_status:404
   */
  catch_all_service?: string;
}

/**
 * State interface for Cloudflare Tunnel Application entity.
 * Contains runtime information about ingress and DNS record.
 * @interface CloudflareTunnelApplicationState
 */
export interface CloudflareTunnelApplicationState extends CloudflareEntityState {
  /** @description Tunnel ID for the application */
  tunnel_id?: string;
  /** @description Application hostname */
  hostname?: string;
  /** @description Zone ID for DNS record */
  zone_id?: string;
  /** @description DNS record ID */
  dns_record_id?: string;
  /** @description Whether the DNS record existed before creation */
  dns_record_existing?: boolean;
  /** @description Last applied hostname */
  applied_hostname?: string;
  /** @description Last applied zone ID */
  applied_zone_id?: string;
  /** @description Tunnel domain for DNS content */
  tunnel_domain?: string;
}

/**
 * @description Cloudflare Tunnel Application entity.
 * Publishes a service through a Cloudflare Tunnel and creates a DNS record.
 * Updates the tunnel ingress configuration for the target hostname.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Cloudflare API token (defaults to `cloudflare-api-token`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.hostname` - Public hostname for consumers
 * - `state.dns_record_id` - DNS record ID for reference
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `cloudflare/cloudflare-tunnel` - Provides tunnel ID and token
 * - `cloudflare/cloudflare-dns-record` - Alternative DNS management
 */
export class CloudflareTunnelApplication extends CloudflareEntity<
  CloudflareTunnelApplicationDefinition,
  CloudflareTunnelApplicationState
> {
  static readonly readiness = { period: 10, initialDelay: 2, attempts: 20 };

  override create(): void {
    this.ensureIngressConfig();
    this.ensureDnsRecord();
  }

  override update(): void {
    if (!this.definition.tunnel_id) {
      cli.output("Tunnel ID missing; skipping update");
      return;
    }
    const desiredHostname = this.getCanonicalHostname();
    const desiredZoneId = this.resolveZoneId();
    const hostnameChanged = Boolean(this.state.applied_hostname && this.state.applied_hostname !== desiredHostname);
    const zoneChanged = Boolean(this.state.applied_zone_id && this.state.applied_zone_id !== desiredZoneId);
    const shouldRemoveOldRecord = Boolean(
      this.state.dns_record_id &&
      this.state.dns_record_existing === false &&
      (hostnameChanged || zoneChanged)
    );

    if (shouldRemoveOldRecord) {
      const zoneId = this.state.applied_zone_id;
      if (zoneId) {
        try {
          this.request("DELETE", `/zones/${zoneId}/dns_records/${this.state.dns_record_id}`);
        } catch {
          // ignore cleanup errors
        }
      }
    }
    this.ensureIngressConfig();
    this.ensureDnsRecord();
  }

  override delete(): void {
    this.removeIngressConfig();
    if (this.state.dns_record_id && this.state.dns_record_existing === false && this.state.applied_zone_id) {
      try {
        this.request("DELETE", `/zones/${this.state.applied_zone_id}/dns_records/${this.state.dns_record_id}`);
        cli.output(`🗑️ Deleted DNS record ${this.state.dns_record_id}`);
      } catch (e) {
        cli.output(`⚠️ Failed to delete DNS record: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  override checkReadiness(): boolean {
    return Boolean(this.state.hostname);
  }

  private ensureIngressConfig(): void {
    const accountId = this.definition.account_id;
    const tunnelId = this.definition.tunnel_id;
    const hostname = this.getCanonicalHostname();
    const catchAllService = this.definition.catch_all_service || "http_status:404";
    const ingressRule: Record<string, any> = {
      hostname,
      service: this.definition.service,
    };
    if (this.definition.origin_request) {
      ingressRule.originRequest = this.definition.origin_request;
    }

    let existingIngress: any[] = [];
    try {
      const current = this.request<any>("GET", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`);
      existingIngress = current?.result?.config?.ingress || [];
    } catch {
      existingIngress = [];
    }

    const filtered = existingIngress.filter((r) => r && r.hostname !== hostname);
    const catchAllIndex = filtered.findIndex((r) => r && !r.hostname);
    let catchAllRule: any | null = null;
    if (catchAllIndex >= 0) {
      catchAllRule = filtered.splice(catchAllIndex, 1)[0];
    }
    if (!catchAllRule) {
      catchAllRule = { service: catchAllService };
    }
    const ingress = [...filtered, ingressRule, catchAllRule];

    this.request("PUT", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
      config: { ingress },
    });

    this.state.hostname = hostname;
    this.state.tunnel_id = tunnelId;
    this.state.tunnel_domain = `${tunnelId}.cfargotunnel.com`;
  }

  private removeIngressConfig(): void {
    const accountId = this.definition.account_id;
    const tunnelId = this.definition.tunnel_id;
    const hostname = this.getCanonicalHostname();
    try {
      const current = this.request<any>("GET", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`);
      const existingIngress = current?.result?.config?.ingress || [];
      const filtered = existingIngress.filter((r: any) => r && r.hostname !== hostname);
      if (filtered.length === existingIngress.length) return;
      this.request("PUT", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
        config: { ingress: filtered },
      });
    } catch {
      // ignore cleanup errors
    }
  }

  private ensureDnsRecord(): void {
    const zoneId = this.resolveZoneId();
    if (!zoneId) {
      this.state.zone_id = undefined;
      return;
    }

    const hostname = this.getCanonicalHostname();
    const tunnelDomain = `${this.definition.tunnel_id}.cfargotunnel.com`;
    const proxied = typeof this.definition.proxied === "boolean" ? this.definition.proxied : true;

    const existing = this.findDnsRecord(zoneId, hostname);
    if (existing) {
      if (existing.content !== tunnelDomain || existing.proxied !== proxied) {
        const payload = {
          type: "CNAME",
          name: hostname,
          content: tunnelDomain,
          proxied,
          ttl: 1,
        };
        try {
          this.request("PUT", `/zones/${zoneId}/dns_records/${existing.id}`, payload);
        } catch {
          // ignore update errors; state still reflects existing record
        }
      }
      this.state = {
        ...this.state,
        dns_record_id: existing.id,
        zone_id: zoneId,
        dns_record_existing: true,
        applied_hostname: hostname,
        applied_zone_id: zoneId,
        tunnel_domain: tunnelDomain,
      };
      return;
    }

    const payload = {
      type: "CNAME",
      name: hostname,
      content: tunnelDomain,
      proxied,
      ttl: 1,
    };
    const created = this.request<any>("POST", `/zones/${zoneId}/dns_records`, payload);
    const recordId = created?.result?.id;

    this.state = {
      ...this.state,
      dns_record_id: recordId,
      zone_id: zoneId,
      dns_record_existing: false,
      applied_hostname: hostname,
      applied_zone_id: zoneId,
      tunnel_domain: tunnelDomain,
    };
  }

  private resolveZoneId(): string | undefined {
    if (this.definition.zone_id) return this.definition.zone_id;
    if (!this.definition.zone_name) return undefined;
    const z = this.findZoneByName(this.definition.zone_name);
    return z?.id;
  }

  private findZoneByName(name: string): { id: string } | null {
    try {
      const res = this.request<any>("GET", `/zones?name=${encodeURIComponent(name)}`);
      const first = res?.result?.[0];
      if (first?.id) return { id: first.id };
      return null;
    } catch {
      return null;
    }
  }

  private getCanonicalHostname(): string {
    const raw = this.definition.hostname;
    const zoneName = this.definition.zone_name;
    if (raw === "@" && zoneName) return zoneName;
    if (!raw.includes(".") && zoneName) return `${raw}.${zoneName}`;
    return raw;
  }

  private findDnsRecord(zoneId: string, name: string): { id: string; content?: string; proxied?: boolean } | null {
    try {
      const res = this.request<any>(
        "GET",
        `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`
      );
      const first = res?.result?.[0];
      if (first?.id) return { id: first.id, content: first.content, proxied: first.proxied };
      return null;
    } catch {
      return null;
    }
  }
}

