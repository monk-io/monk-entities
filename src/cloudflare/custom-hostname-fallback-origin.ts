import { action } from "monkec/base";
import cli from "cli";
import { CloudflareEntity, type CloudflareEntityDefinition, type CloudflareEntityState } from "./cloudflare-base.ts";

/**
 * Definition interface for the per-zone Cloudflare for SaaS fallback origin.
 * @see https://developers.cloudflare.com/api/operations/custom-hostname-fallback-origin-for-a-zone-update-fallback-origin-for-custom-hostnames
 * @interface CloudflareCustomHostnameFallbackOriginDefinition
 */
export interface CloudflareCustomHostnameFallbackOriginDefinition extends CloudflareEntityDefinition {
  /** @description Fallback zone ID owning the SaaS configuration */
  zone_id: string;
  /** @description Fallback origin hostname (e.g., proxy.bloccarbon.com) */
  origin: string;
}

/**
 * State interface for the Cloudflare for SaaS fallback origin.
 * @interface CloudflareCustomHostnameFallbackOriginState
 */
export interface CloudflareCustomHostnameFallbackOriginState extends CloudflareEntityState {
  /** @description Origin currently configured (echoes definition on success) */
  origin?: string;
  /** @description Provisioning status reported by Cloudflare */
  status?: string;
  /** @description Errors reported during fallback origin provisioning */
  errors?: string[];
}

/**
 * @description Cloudflare for SaaS Fallback Origin entity.
 * Configures the single per-zone fallback origin that all custom hostnames
 * route to by default. Detects an existing setting and adopts it when the
 * configured `origin` matches. Delete clears the fallback origin only for
 * non-adopted state (BlocCarbon-style: set once per environment).
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `SSL and Certificates: Edit` on the fallback zone.
 *
 * ## Actions
 * - `get-info` — fetch current fallback origin record
 */
export class CloudflareCustomHostnameFallbackOrigin extends CloudflareEntity<
  CloudflareCustomHostnameFallbackOriginDefinition,
  CloudflareCustomHostnameFallbackOriginState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const zoneId = this.definition.zone_id;
    const desired = this.definition.origin;

    const current = this.fetchFallback(zoneId);
    if (current?.origin === desired) {
      this.state = {
        origin: current.origin,
        status: current.status,
        errors: current.errors,
        existing: true,
      };
      cli.output(`🔗 Adopted existing fallback origin ${desired}`);
      return;
    }

    const res = this.request<any>(
      "PUT",
      `/zones/${zoneId}/custom_hostnames/fallback_origin`,
      { origin: desired }
    );
    const r = res?.result || {};
    this.state = {
      origin: r.origin || desired,
      status: r.status,
      errors: r.errors,
      existing: false,
    };
    cli.output(`✅ Set fallback origin ${desired}`);
  }

  override update(): void {
    if (!this.state.origin) {
      this.create();
      return;
    }
    if (this.state.origin === this.definition.origin) return;
    const zoneId = this.definition.zone_id;
    const res = this.request<any>(
      "PUT",
      `/zones/${zoneId}/custom_hostnames/fallback_origin`,
      { origin: this.definition.origin }
    );
    const r = res?.result || {};
    this.state.origin = r.origin || this.definition.origin;
    this.state.status = r.status;
    this.state.errors = r.errors;
  }

  override delete(): void {
    if (!this.state.origin) return;
    if (this.state.existing) {
      cli.output("Fallback origin pre-existed; skipping delete");
      return;
    }
    const zoneId = this.definition.zone_id;
    try {
      this.request("DELETE", `/zones/${zoneId}/custom_hostnames/fallback_origin`);
      cli.output(`🗑️ Cleared fallback origin for zone ${zoneId}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404")) {
        cli.output("Fallback origin already cleared");
        return;
      }
      throw e;
    }
  }

  override checkReadiness(): boolean {
    return Boolean(this.state.origin);
  }

  @action("get-info")
  getInfo(): void {
    const zoneId = this.definition.zone_id;
    const current = this.fetchFallback(zoneId);
    cli.output(JSON.stringify(current || {}, null, 2));
  }

  private fetchFallback(zoneId: string): any | null {
    try {
      const res = this.request<any>(
        "GET",
        `/zones/${zoneId}/custom_hostnames/fallback_origin`
      );
      return res?.result || null;
    } catch {
      return null;
    }
  }
}
