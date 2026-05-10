import { action } from "monkec/base";
import cli from "cli";
import { CloudflareEntity, type CloudflareEntityDefinition, type CloudflareEntityState } from "./cloudflare-base.ts";

/**
 * Definition interface for a Cloudflare for SaaS custom hostname.
 * @see https://developers.cloudflare.com/api/operations/custom-hostname-for-a-zone-create-custom-hostname
 * @interface CloudflareCustomHostnameDefinition
 */
export interface CloudflareCustomHostnameDefinition extends CloudflareEntityDefinition {
  /** @description Fallback zone ID owning the SaaS configuration */
  zone_id: string;
  /** @description Tenant's vanity hostname (e.g., carbon.acme.com) */
  hostname: string;
  /** @description ACME validation method; default http */
  ssl_method?: "http" | "txt" | "email";
  /** @description Certificate type; only DV is supported */
  ssl_type?: "dv";
  /** @description Optional SSL settings overrides */
  ssl_settings?: {
    min_tls_version?: "1.0" | "1.1" | "1.2" | "1.3";
    http2?: "on" | "off";
    early_hints?: "on" | "off";
  };
  /** @description Custom origin to route requests to (overrides fallback origin) */
  custom_origin_server?: string;
  /** @description SNI to send to the custom origin */
  custom_origin_sni?: string;
}

/**
 * State interface for a Cloudflare custom hostname.
 * @interface CloudflareCustomHostnameState
 */
export interface CloudflareCustomHostnameState extends CloudflareEntityState {
  /** @description Cloudflare custom hostname ID */
  id?: string;
  /** @description Hostname-level status (pending|active|blocked|moved) */
  status?: string;
  /** @description SSL provisioning status */
  ssl_status?: string;
  /** @description Cloudflare-side SSL record ID */
  ssl_id?: string;
  /** @description Most recent verification errors surfaced by the API */
  verification_errors?: string[];
  /** @description Applied custom origin (used for change detection) */
  applied_custom_origin?: string;
}

/**
 * @description Cloudflare for SaaS / Custom Hostname entity.
 * Manages a tenant-facing vanity hostname on a fallback zone. Adoption-safe:
 * existing hostnames are picked up by matching on `hostname`. Delete removes
 * the hostname (tenant-scoped lifecycle), but skips adopted records.
 *
 * Readiness intentionally returns true once `state.id` is set — ACME issuance
 * depends on the tenant's CNAME being in place, which is outside Monk's
 * control. Use the `get-info` action to inspect `ssl_status` and the
 * `trigger-revalidation` action to force a recheck after DNS changes.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `SSL and Certificates: Edit` on the fallback zone.
 *
 * ## Actions
 * - `get-info` — fetch current hostname + SSL state from Cloudflare
 * - `trigger-revalidation` — force the SaaS layer to re-check DNS/ACME
 */
export class CloudflareCustomHostname extends CloudflareEntity<
  CloudflareCustomHostnameDefinition,
  CloudflareCustomHostnameState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const zoneId = this.definition.zone_id;
    const hostname = this.definition.hostname;

    const existing = this.findHostname(zoneId, hostname);
    if (existing?.id) {
      this.state = {
        id: existing.id,
        status: existing.status,
        ssl_status: existing.ssl?.status,
        ssl_id: existing.ssl?.id,
        applied_custom_origin: existing.custom_origin_server,
        existing: true,
      };
      cli.output(`🔗 Adopted existing custom hostname ${hostname}`);
      return;
    }

    const created = this.request<any>(
      "POST",
      `/zones/${zoneId}/custom_hostnames`,
      this.buildPayload()
    );
    const r = created?.result || {};
    this.state = {
      id: r.id,
      status: r.status,
      ssl_status: r.ssl?.status,
      ssl_id: r.ssl?.id,
      verification_errors: r.verification_errors,
      applied_custom_origin: r.custom_origin_server,
      existing: false,
    };
    cli.output(`✅ Created custom hostname ${hostname} (ssl ${r.ssl?.status || "pending"})`);
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    const zoneId = this.definition.zone_id;
    const res = this.request<any>(
      "PATCH",
      `/zones/${zoneId}/custom_hostnames/${this.state.id}`,
      this.buildPayload()
    );
    const r = res?.result || {};
    this.state.status = r.status || this.state.status;
    this.state.ssl_status = r.ssl?.status || this.state.ssl_status;
    this.state.ssl_id = r.ssl?.id || this.state.ssl_id;
    this.state.verification_errors = r.verification_errors;
    this.state.applied_custom_origin = r.custom_origin_server;
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Custom hostname existed before this entity; skipping delete");
      return;
    }
    const zoneId = this.definition.zone_id;
    try {
      this.request("DELETE", `/zones/${zoneId}/custom_hostnames/${this.state.id}`);
      cli.output(`🗑️ Deleted custom hostname ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404") || msg.includes("1436")) {
        cli.output(`Custom hostname ${this.state.id} already gone`);
        return;
      }
      throw e;
    }
  }

  override checkReadiness(): boolean {
    // ACME completion depends on the tenant's CNAME, which is outside our
    // control. Treat "the resource exists" as ready and let operators
    // monitor ssl_status via get-info.
    return Boolean(this.state.id);
  }

  @action("get-info")
  getInfo(): void {
    if (!this.state.id) {
      cli.output("No custom hostname yet");
      return;
    }
    const zoneId = this.definition.zone_id;
    const res = this.request<any>(
      "GET",
      `/zones/${zoneId}/custom_hostnames/${this.state.id}`
    );
    const r = res?.result || {};
    this.state.status = r.status || this.state.status;
    this.state.ssl_status = r.ssl?.status || this.state.ssl_status;
    this.state.verification_errors = r.verification_errors;
    cli.output(JSON.stringify(r, null, 2));
  }

  @action("trigger-revalidation")
  triggerRevalidation(): void {
    if (!this.state.id) {
      cli.output("No custom hostname to revalidate");
      return;
    }
    const zoneId = this.definition.zone_id;
    // Cloudflare's documented re-validation trigger is a PATCH with an
    // ssl block that has the same method/type — it re-arms the cert
    // issuance state machine without changing config.
    this.request("PATCH", `/zones/${zoneId}/custom_hostnames/${this.state.id}`, {
      ssl: {
        method: this.definition.ssl_method || "http",
        type: this.definition.ssl_type || "dv",
      },
    });
    cli.output(`🔁 Triggered revalidation for ${this.definition.hostname}`);
  }

  private buildPayload(): any {
    const payload: any = {
      hostname: this.definition.hostname,
      ssl: {
        method: this.definition.ssl_method || "http",
        type: this.definition.ssl_type || "dv",
      },
    };
    if (this.definition.ssl_settings) {
      payload.ssl.settings = this.definition.ssl_settings;
    }
    if (this.definition.custom_origin_server) {
      payload.custom_origin_server = this.definition.custom_origin_server;
    }
    if (this.definition.custom_origin_sni) {
      payload.custom_origin_sni = this.definition.custom_origin_sni;
    }
    return payload;
  }

  private findHostname(zoneId: string, hostname: string): any | null {
    try {
      const res = this.request<any>(
        "GET",
        `/zones/${zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`
      );
      const list = res?.result || [];
      for (const r of list) {
        if (r?.hostname === hostname && r?.id) return r;
      }
      return null;
    } catch {
      return null;
    }
  }
}
