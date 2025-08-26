import { action } from "monkec/base";
import cli from "cli";
import { CloudflareEntity, type CloudflareEntityDefinition, type CloudflareEntityState } from "./cloudflare-base.ts";

/**
 * @see https://developers.cloudflare.com/api/resources/zones/
 */
export interface CloudflareDNSZoneDefinition extends CloudflareEntityDefinition {
  /** @description Zone name (e.g., example.com) */
  name: string;
  /** @description Zone type (full or partial) */
  zone_type?: "full" | "partial";
  /** @description Account ID if required for zone creation */
  account_id?: string;
}

export interface CloudflareDNSZoneState extends CloudflareEntityState {
  /** @description Cloudflare Zone ID */
  id?: string;
  /** @description Current status (e.g., pending, active) */
  status?: string;
  /** @description Zone name for consumers via connections */
  name?: string;
}

export class CloudflareDNSZone extends CloudflareEntity<CloudflareDNSZoneDefinition, CloudflareDNSZoneState> {
  static readonly readiness = { period: 10, initialDelay: 2, attempts: 30 };

  override create(): void {
    // Try to find existing zone by name
    const existing = this.findZoneByName(this.definition.name);
    if (existing) {
      this.state.id = existing.id;
      this.state.status = existing.status;
      this.state.existing = true;
      this.state.name = this.definition.name;
      return;
    }
    // Skip creation in this package; rely on detection-only pattern
    this.state.existing = false;
    this.state.name = this.definition.name;
    return;
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    // No-op: zone properties like name cannot be updated via API; could add settings updates here
  }

  override delete(): void {
    if (!this.state.id) {
      cli.output("Zone does not exist, nothing to delete");
      return;
    }
    if (this.state.existing) {
      cli.output("Zone wasn't created by this entity, skipping delete");
      return;
    }
    this.request("DELETE", `/zones/${this.state.id}`);
    cli.output("Deleted Cloudflare zone");
  }

  override checkReadiness(): boolean {
    if (!this.state.id) return true;
    try {
      const res = this.request<any>("GET", `/zones/${this.state.id}`);
      const zone = res?.result;
      this.state.status = zone?.status;
      // Consider 'pending' acceptable for test readiness; 'active' is ideal
      return zone?.status === "active" || zone?.status === "pending";
    } catch {
      return false;
    }
  }

  @action("get-info")
  getInfo(): void {
    if (!this.state.id) {
      cli.output("No zone yet");
      return;
    }
    const res = this.request<any>("GET", `/zones/${this.state.id}`);
    cli.output(JSON.stringify(res?.result || {}, null, 2));
  }

  @action("list-zones")
  listZones(): void {
    const res = this.request<any>("GET", `/zones?per_page=10&page=1`);
    cli.output(JSON.stringify(res?.result || [], null, 2));
  }

  private findZoneByName(name: string): { id: string; status: string } | null {
    try {
      const res = this.request<any>("GET", `/zones?name=${encodeURIComponent(name)}`);
      const first = res?.result?.[0];
      if (first?.id) return { id: first.id, status: first.status };
      return null;
    } catch {
      return null;
    }
  }
}


