import { action } from "monkec/base";
import cli from "cli";
import { CloudflareEntity, type CloudflareEntityDefinition, type CloudflareEntityState } from "./cloudflare-base.ts";

/**
 * Definition interface for a Cloudflare Workers route.
 * Maps a URL pattern on a zone to a Worker script.
 * @see https://developers.cloudflare.com/workers/configuration/routing/routes/
 * @interface CloudflareWorkersRouteDefinition
 */
export interface CloudflareWorkersRouteDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare zone ID that owns this route */
  zone_id: string;
  /** @description URL pattern (e.g., "example.com/api/*") */
  route_pattern: string;
  /** @description Worker script name to bind to the pattern */
  script_name: string;
}

/**
 * State interface for a Cloudflare Workers route.
 * @interface CloudflareWorkersRouteState
 */
export interface CloudflareWorkersRouteState extends CloudflareEntityState {
  /** @description Route ID assigned by Cloudflare */
  id?: string;
}

/**
 * @description Cloudflare Workers Route entity.
 * Binds a URL pattern on a zone to a Worker script. Adopts existing routes
 * by matching on (pattern, script_name). delete() removes the route — routes
 * are pure bindings with no persistent data, so destructive delete is safe by
 * default.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `Workers Routes: Edit` scope on the zone.
 *
 * ## State Fields for Composition
 * - `state.id` — route ID, used for update/delete
 *
 * ## Actions
 * - `get-info` — fetch the route record
 */
export class CloudflareWorkersRoute extends CloudflareEntity<
  CloudflareWorkersRouteDefinition,
  CloudflareWorkersRouteState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const zoneId = this.definition.zone_id;
    const pattern = this.definition.route_pattern;
    const scriptName = this.definition.script_name;

    const existing = this.findRoute(zoneId, pattern, scriptName);
    if (existing?.id) {
      this.state = { id: existing.id, existing: true };
      cli.output(`🔗 Adopted existing Workers route ${pattern} → ${scriptName}`);
      return;
    }

    const created = this.request<any>(
      "POST",
      `/zones/${zoneId}/workers/routes`,
      { pattern, script: scriptName }
    );
    const id = created?.result?.id;
    this.state = { id, existing: false };
    cli.output(`✅ Created Workers route ${pattern} → ${scriptName}`);
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    const zoneId = this.definition.zone_id;
    this.request("PUT", `/zones/${zoneId}/workers/routes/${this.state.id}`, {
      pattern: this.definition.route_pattern,
      script: this.definition.script_name,
    });
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Route existed before this entity; skipping delete");
      return;
    }
    const zoneId = this.definition.zone_id;
    try {
      this.request("DELETE", `/zones/${zoneId}/workers/routes/${this.state.id}`);
      cli.output(`🗑️ Deleted Workers route ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404")) {
        cli.output(`Route ${this.state.id} already gone`);
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
      cli.output("No route yet");
      return;
    }
    const zoneId = this.definition.zone_id;
    const res = this.request<any>(
      "GET",
      `/zones/${zoneId}/workers/routes/${this.state.id}`
    );
    cli.output(JSON.stringify(res?.result || {}, null, 2));
  }

  private findRoute(
    zoneId: string,
    pattern: string,
    scriptName: string
  ): { id: string } | null {
    try {
      const res = this.request<any>("GET", `/zones/${zoneId}/workers/routes`);
      const routes = res?.result || [];
      for (const r of routes) {
        if (r?.pattern === pattern && r?.script === scriptName && r?.id) {
          return { id: r.id };
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
