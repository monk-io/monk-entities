import { action } from "monkec/base";
import cli from "cli";
import {
  ResendEntity,
  type ResendEntityDefinition,
  type ResendEntityState,
} from "./resend-base.ts";

/**
 * Definition interface for a Resend sending domain.
 *
 * Resend issues a set of DNS records (SPF, DKIM, MX, optional Tracking)
 * on create. Verification happens out-of-band: the operator (or a sibling
 * `cloudflare-dns-record` entity) installs those records on the zone, and
 * Resend polls them until `status=verified`. This entity does NOT block
 * readiness on verification — it's intentionally optional, so the
 * declarative graph stays usable even before DNS propagates. Use the
 * `verify` action to trigger a re-check after DNS is in place.
 *
 * @see https://resend.com/docs/api-reference/domains/create-domain
 * @interface ResendDomainDefinition
 */
export interface ResendDomainDefinition extends ResendEntityDefinition {
  /** @description Domain name to register (e.g., "mail.example.com") */
  name: string;
  /** @description Resend sending region */
  region?: "us-east-1" | "eu-west-1" | "sa-east-1" | "ap-northeast-1";
  /** @description Custom return-path subdomain (default: "send") */
  custom_return_path?: string;
  /** @description Enable open tracking */
  open_tracking?: boolean;
  /** @description Enable click tracking */
  click_tracking?: boolean;
}

/**
 * State interface for a Resend domain.
 * @interface ResendDomainState
 */
export interface ResendDomainState extends ResendEntityState {
  /** @description Resend domain id (UUID) */
  id?: string;
  /** @description Domain name mirror */
  name?: string;
  /** @description not_started | pending | verified | failed | temporary_failure */
  status?: string;
  /** @description Sending region */
  region?: string;
  /** @description DNS records the operator must install (returned by Resend) */
  records?: Array<{
    record?: string;
    name?: string;
    type?: string;
    value?: string;
    ttl?: string;
    status?: string;
    priority?: number;
  }>;
  // Flattened records — scalar fields so they're consumable via
  // `connection-target("...") entity-state get-member("dkim_value")` etc.
  // Names are relative to the apex zone (e.g. "resend._domainkey.mail"),
  // matching what Resend returns. Append the zone name in the consumer
  // template to get the FQDN.
  /** @description DKIM record name (relative to apex zone) */
  dkim_name?: string;
  /** @description DKIM TXT record value (the public key string) */
  dkim_value?: string;
  /** @description SPF MX record name (relative to apex zone) */
  spf_mx_name?: string;
  /** @description SPF MX record target hostname */
  spf_mx_value?: string;
  /** @description SPF MX record priority (e.g., 10) */
  spf_mx_priority?: number;
  /** @description SPF TXT record name (relative to apex zone) */
  spf_txt_name?: string;
  /** @description SPF TXT record value */
  spf_txt_value?: string;
}

/**
 * @description Resend Domain entity.
 * Registers a sending domain with Resend. Adopts existing domains by
 * matching on `name`. Delete removes the domain from Resend; adopted
 * domains (`state.existing = true`) are skipped to keep deletion safe.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `resend-api-token`) — needs Full Access.
 *
 * ## Composition
 * - `state.records` — array of DNS records to install on your zone.
 *   Each entry has the shape Resend returns (`{ record, name, type,
 *   value, ttl, priority? }`). Wire to `cloudflare-dns-record` entities
 *   via templated members or read with `get-records`.
 *
 * ## Actions
 * - `get-info` — fetch current domain + status from Resend
 * - `get-records` — print just the records[] block
 * - `verify` — trigger Resend to re-poll DNS and update status
 */
export class ResendDomain extends ResendEntity<
  ResendDomainDefinition,
  ResendDomainState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const existing = this.findByName(this.definition.name);
    if (existing?.id) {
      const full = this.fetchDomain(existing.id);
      this.state = {
        id: existing.id,
        name: existing.name || this.definition.name,
        status: full?.status || existing.status,
        region: full?.region || existing.region,
        records: full?.records || [],
        existing: true,
      };
      this.flattenRecords();
      cli.output(
        `📧 Adopted existing Resend domain ${this.state.name} (${this.state.id})`
      );
      return;
    }

    const body: any = { name: this.definition.name };
    if (this.definition.region) body.region = this.definition.region;
    if (this.definition.custom_return_path)
      body.custom_return_path = this.definition.custom_return_path;
    if (this.definition.open_tracking !== undefined)
      body.open_tracking = this.definition.open_tracking;
    if (this.definition.click_tracking !== undefined)
      body.click_tracking = this.definition.click_tracking;

    const created = this.request<any>("POST", "/domains", body);
    this.state = {
      id: created?.id,
      name: created?.name || this.definition.name,
      status: created?.status,
      region: created?.region,
      records: created?.records || [],
      existing: false,
    };
    this.flattenRecords();
    cli.output(
      `✅ Created Resend domain ${this.state.name} (${this.state.id}) — status: ${this.state.status}`
    );
    if (this.state.records && this.state.records.length) {
      cli.output(
        `   Install ${this.state.records.length} DNS record(s) and run the verify action.`
      );
    }
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    const full = this.fetchDomain(this.state.id);
    if (full) {
      this.state.status = full.status || this.state.status;
      this.state.region = full.region || this.state.region;
      this.state.records = full.records || this.state.records;
      this.flattenRecords();
    }
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Domain existed before this entity; skipping delete");
      return;
    }
    try {
      this.request("DELETE", `/domains/${this.state.id}`);
      cli.output(`🗑️ Deleted Resend domain ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404")) {
        cli.output(`Domain ${this.state.id} already gone`);
        return;
      }
      throw e;
    }
  }

  override checkReadiness(): boolean {
    return Boolean(this.state.id);
  }

  @action("get-info")
  getInfo(): void {
    if (!this.state.id) {
      cli.output("No domain yet");
      return;
    }
    const full = this.fetchDomain(this.state.id);
    cli.output(JSON.stringify(full || {}, null, 2));
  }

  @action("get-records")
  getRecords(): void {
    if (!this.state.id) {
      cli.output("No domain yet");
      return;
    }
    const full = this.fetchDomain(this.state.id);
    cli.output(JSON.stringify(full?.records || [], null, 2));
  }

  @action("verify")
  verify(): void {
    if (!this.state.id) {
      cli.output("No domain yet");
      return;
    }
    // Resend rejects empty-body POSTs with 400 "Request body must be valid
    // JSON" — pass an explicit `{}` even though no fields are needed.
    this.request("POST", `/domains/${this.state.id}/verify`, {});
    const full = this.fetchDomain(this.state.id);
    if (full) {
      this.state.status = full.status || this.state.status;
      this.state.records = full.records || this.state.records;
      this.flattenRecords();
    }
    cli.output(
      `🔁 Verification triggered. Current status: ${this.state.status}`
    );
  }

  private flattenRecords(): void {
    const records = this.state.records || [];
    for (const r of records) {
      const kind = (r?.record || "").toUpperCase();
      const type = (r?.type || "").toUpperCase();
      if (kind === "DKIM" && type === "TXT") {
        this.state.dkim_name = r.name;
        this.state.dkim_value = r.value;
      } else if (kind === "SPF" && type === "MX") {
        this.state.spf_mx_name = r.name;
        this.state.spf_mx_value = r.value;
        this.state.spf_mx_priority = r.priority;
      } else if (kind === "SPF" && type === "TXT") {
        this.state.spf_txt_name = r.name;
        this.state.spf_txt_value = r.value;
      }
    }
  }

  private fetchDomain(id: string): any | null {
    try {
      return this.request<any>("GET", `/domains/${id}`);
    } catch {
      return null;
    }
  }

  private findByName(name: string): any | null {
    try {
      const res = this.request<any>("GET", "/domains");
      const list: any[] = res?.data || [];
      for (const d of list) {
        if (d?.name === name && d?.id) return d;
      }
      return null;
    } catch {
      return null;
    }
  }
}
