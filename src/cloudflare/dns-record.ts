import { action } from "monkec/base";
import cli from "cli";
import { CloudflareEntity, type CloudflareEntityDefinition, type CloudflareEntityState } from "./cloudflare-base.ts";

/**
 * Cloudflare DNS Record entity
 * @see https://developers.cloudflare.com/api/resources/dns/records/
 */
export interface CloudflareDNSRecordDefinition extends CloudflareEntityDefinition {
  /** @description Zone ID; alternatively provide zone_name */
  zone_id?: string;
  /** @description Zone name; used to resolve zone_id if zone_id not provided */
  zone_name?: string;
  /** @description DNS record type (A, AAAA, CNAME, TXT, MX, NS, SRV, CAA, etc.) */
  record_type: string;
  /** @description Record name (e.g., www or full name like www.example.com) */
  name: string;
  /** @description Record content (IP address, target, text, etc.) */
  content?: string;
  /** @description TTL in seconds (1 for auto) */
  ttl?: number;
  /** @description Whether the record is proxied by Cloudflare (A/AAAA/CNAME only) */
  proxied?: boolean;
  /** @description Record priority (for MX/SRV) */
  priority?: number;
  /** @description Additional data for complex types (SRV/CAA) */
  data?: any;
}

export interface CloudflareDNSRecordState extends CloudflareEntityState {
  /** @description Record identifier in Cloudflare */
  record_id?: string;
  /** @description Zone id resolved for this record */
  zone_id?: string;
}

export class CloudflareDNSRecord extends CloudflareEntity<CloudflareDNSRecordDefinition, CloudflareDNSRecordState> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 20 };

  override create(): void {
    const zoneId = this.resolveZoneId();
    if (!zoneId) {
      // Detection-only: cannot resolve without zone, mark as non-existing
      this.state.existing = false;
      return;
    }
    // Try to find existing record by type and name
    const existing = this.findRecord(zoneId, this.definition.record_type, this.definition.name);
    if (existing) {
      this.state.record_id = existing.id;
      this.state.zone_id = zoneId;
      this.state.existing = true;
      return;
    }
    // Create DNS record when missing
    const payload: any = {
      type: this.definition.record_type,
      name: this.definition.name,
    };
    if (this.definition.content !== undefined) payload.content = this.definition.content;
    if (typeof this.definition.ttl === "number") payload.ttl = this.definition.ttl;
    if (typeof this.definition.proxied === "boolean") payload.proxied = this.definition.proxied;
    if (typeof this.definition.priority === "number") payload.priority = this.definition.priority;
    if (this.definition.data) payload.data = this.definition.data;

    const created = this.request<any>("POST", `/zones/${zoneId}/dns_records`, payload);
    const createdId = created?.result?.id;
    if (createdId) {
      this.state.record_id = createdId;
      this.state.zone_id = zoneId;
      this.state.existing = false;
    } else {
      // Fallback: attempt to locate after creation
      const newRec = this.findRecord(zoneId, this.definition.record_type, this.definition.name);
      if (newRec) {
        this.state.record_id = newRec.id;
        this.state.zone_id = zoneId;
        this.state.existing = false;
      }
    }
    return;
  }

  override update(): void {
    const zoneId = this.resolveZoneId();
    if (!zoneId) return; // nothing to do
    if (!this.state.record_id) {
      // Try to resolve existing or create
      const existing = this.findRecord(zoneId, this.definition.record_type, this.definition.name);
      if (!existing) return void this.create();
      this.state.record_id = existing.id;
    }
    const payload: any = {
      type: this.definition.record_type,
      name: this.definition.name,
    };
    if (this.definition.content !== undefined) payload.content = this.definition.content;
    if (typeof this.definition.ttl === "number") payload.ttl = this.definition.ttl;
    if (typeof this.definition.proxied === "boolean") payload.proxied = this.definition.proxied;
    if (typeof this.definition.priority === "number") payload.priority = this.definition.priority;
    if (this.definition.data) payload.data = this.definition.data;

    this.request("PUT", `/zones/${zoneId}/dns_records/${this.state.record_id}`, payload);
  }

  override delete(): void {
    if (!this.state.zone_id || !this.state.record_id) {
      cli.output("DNS record does not exist, nothing to delete");
      return;
    }
    if (this.state.existing) {
      cli.output("Record wasn't created by this entity, skipping delete");
      return;
    }
    this.request("DELETE", `/zones/${this.state.zone_id}/dns_records/${this.state.record_id}`);
    cli.output("Deleted DNS record");
  }

  override checkReadiness(): boolean {
    const zoneId = this.state.zone_id || this.definition.zone_id || this.resolveZoneId();
    if (!zoneId) return true;
    if (!this.state.record_id) {
      const existing = this.findRecord(zoneId, this.definition.record_type, this.definition.name);
      if (existing) this.state.record_id = existing.id;
    }
    return Boolean(this.state.record_id);
  }

  @action("get-info")
  getInfo(): void {
    const zoneId = this.resolveZoneId();
    if (!zoneId) {
      cli.output("Zone not found or not accessible; cannot fetch record info");
      return;
    }
    const rec = this.findRecord(zoneId, this.definition.record_type, this.definition.name);
    cli.output(JSON.stringify(rec || {}, null, 2));
  }

  private resolveZoneId(): string | undefined {
    if (this.state.zone_id) return this.state.zone_id;
    if (this.definition.zone_id) {
      this.state.zone_id = this.definition.zone_id;
      return this.state.zone_id;
    }
    if (!this.definition.zone_name) return undefined;
    const z = this.findZoneByName(this.definition.zone_name);
    if (!z?.id) return undefined;
    this.state.zone_id = z.id;
    return z.id;
  }

  private findZoneByName(name?: string): { id: string } | null {
    if (!name) return null;
    try {
      const res = this.request<any>("GET", `/zones?name=${encodeURIComponent(name)}`);
      const first = res?.result?.[0];
      if (first?.id) return { id: first.id };
      return null;
    } catch {
      return null;
    }
  }

  private findRecord(zoneId: string, recordType: string, name: string): { id: string; type: string; name: string } | null {
    const candidateNames: string[] = [name];
    const zoneName = this.definition.zone_name;
    if (zoneName) {
      if (name == "@") {
        candidateNames.push(zoneName);
      } else if (!name.includes(".")) {
        candidateNames.push(`${name}.${zoneName}`);
      }
    }
    for (const candidate of candidateNames) {
      try {
        const query = `/zones/${zoneId}/dns_records?type=${encodeURIComponent(recordType)}&name=${encodeURIComponent(candidate)}`;
        const res = this.request<any>("GET", query);
        const first = res?.result?.[0];
        if (first?.id) return { id: first.id, type: first.type, name: first.name };
      } catch {
        // continue trying other candidates
      }
    }
    return null;
  }
}


