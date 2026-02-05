import { action } from "monkec/base";
import cli from "cli";
import secret from "secret";
import { CloudflareEntity, type CloudflareEntityDefinition, type CloudflareEntityState } from "./cloudflare-base.ts";

/**
 * Definition interface for Cloudflare Tunnel entity.
 * Configures tunnel creation and token storage.
 * @see https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/
 * @interface CloudflareTunnelDefinition
 */
export interface CloudflareTunnelDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare account ID that owns the tunnel */
  account_id: string;
  /** @description Human-readable tunnel name */
  name: string;
  /**
   * @description Config source for the tunnel ("cloudflare" or "local")
   * @default cloudflare
   */
  config_src?: "cloudflare" | "local";
  /**
   * @description Secret name to store the tunnel token; defaults to cloudflare-tunnel-token
   * @minLength 1
   * @maxLength 64
   */
  token_secret_ref?: string;
}

/**
 * State interface for Cloudflare Tunnel entity.
 * Contains runtime information about the tunnel.
 * @interface CloudflareTunnelState
 */
export interface CloudflareTunnelState extends CloudflareEntityState {
  /** @description Tunnel ID */
  id?: string;
  /** @description Tunnel name */
  name?: string;
  /** @description Current tunnel status (inactive, healthy, etc.) */
  status?: string;
  /** @description Account ID that owns the tunnel */
  account_id?: string;
  /** @description Secret name where the tunnel token is stored */
  token_secret_ref?: string;
  /** @description Tunnel domain for CNAME records (<tunnel-id>.cfargotunnel.com) */
  tunnel_domain?: string;
}

/**
 * @description Cloudflare Tunnel entity.
 * Creates and manages Cloudflare Tunnels for secure connectivity.
 * Stores the tunnel token in a Monk secret for use with cloudflared.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Cloudflare API token (defaults to `cloudflare-api-token`)
 * - Writes: secret name from `token_secret_ref` property - Tunnel token (defaults to `cloudflare-tunnel-token`)
 * 
 * ## State Fields for Composition
 * - `state.id` - Tunnel ID for routing and config updates
 * - `state.tunnel_domain` - CNAME target (<tunnel-id>.cfargotunnel.com)
 * - `state.token_secret_ref` - Secret name where token is stored
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `cloudflare/cloudflare-tunnel-application` - Publish applications through the tunnel
 */
export class CloudflareTunnel extends CloudflareEntity<CloudflareTunnelDefinition, CloudflareTunnelState> {
  static readonly readiness = { period: 10, initialDelay: 2, attempts: 30 };

  override create(): void {
    const accountId = this.definition.account_id;
    const existing = this.findTunnelByName(accountId, this.definition.name);
    if (existing) {
      this.state = {
        id: existing.id,
        name: existing.name,
        status: existing.status,
        account_id: accountId,
        token_secret_ref: this.definition.token_secret_ref || "cloudflare-tunnel-token",
        tunnel_domain: `${existing.id}.cfargotunnel.com`,
        existing: true,
      };
      this.ensureTokenSecret(existing.id);
      return;
    }

    const payload = {
      name: this.definition.name,
      config_src: this.definition.config_src || "cloudflare",
    };
    const created = this.request<any>("POST", `/accounts/${accountId}/cfd_tunnel`, payload);
    const result = created?.result;
    const tunnelId = result?.id;
    const token = result?.token;
    const tokenSecretRef = this.definition.token_secret_ref || "cloudflare-tunnel-token";

    if (tunnelId) {
      if (token) {
        secret.set(tokenSecretRef, token);
      } else {
        this.ensureTokenSecret(tunnelId);
      }
    }

    this.state = {
      id: tunnelId,
      name: result?.name || this.definition.name,
      status: result?.status,
      account_id: accountId,
      token_secret_ref: tokenSecretRef,
      tunnel_domain: tunnelId ? `${tunnelId}.cfargotunnel.com` : undefined,
      existing: false,
    };
    cli.output(`✅ Created Cloudflare Tunnel ${this.definition.name}`);
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    const accountId = this.definition.account_id;
    try {
      const info = this.request<any>("GET", `/accounts/${accountId}/cfd_tunnel/${this.state.id}`);
      const result = info?.result;
      this.state = {
        ...this.state,
        name: result?.name || this.state.name,
        status: result?.status || this.state.status,
        tunnel_domain: this.state.id ? `${this.state.id}.cfargotunnel.com` : this.state.tunnel_domain,
      };
    } catch {
      // no-op; keep previous state
    }
    if (this.state.id) {
      this.ensureTokenSecret(this.state.id);
    }
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Tunnel existed before this entity; skipping delete");
      return;
    }
    const accountId = this.definition.account_id;
    this.request("DELETE", `/accounts/${accountId}/cfd_tunnel/${this.state.id}`);
    cli.output(`🗑️ Deleted Cloudflare Tunnel ${this.state.id}`);
  }

  override checkReadiness(): boolean {
    if (!this.state.id) return false;
    try {
      const accountId = this.definition.account_id;
      const info = this.request<any>("GET", `/accounts/${accountId}/cfd_tunnel/${this.state.id}`);
      const status = info?.result?.status;
      if (status) this.state.status = status;
      return true;
    } catch {
      return false;
    }
  }

  @action("get-info")
  getInfo(): void {
    if (!this.state.id) {
      cli.output("No tunnel yet");
      return;
    }
    const accountId = this.definition.account_id;
    const res = this.request<any>("GET", `/accounts/${accountId}/cfd_tunnel/${this.state.id}`);
    cli.output(JSON.stringify(res?.result || {}, null, 2));
  }

  private findTunnelByName(accountId: string, name: string): { id: string; name: string; status: string } | null {
    try {
      const res = this.request<any>("GET", `/accounts/${accountId}/cfd_tunnel?name=${encodeURIComponent(name)}`);
      const first = res?.result?.[0];
      if (first?.id) return { id: first.id, name: first.name, status: first.status };
      return null;
    } catch {
      return null;
    }
  }

  private ensureTokenSecret(tunnelId: string): void {
    const tokenSecretRef = this.definition.token_secret_ref || "cloudflare-tunnel-token";
    if (!tunnelId) return;
    try {
      const res = this.request<any>("GET", `/accounts/${this.definition.account_id}/cfd_tunnel/${tunnelId}/token`);
      const token = res?.result?.token || res?.result;
      if (token) {
        secret.set(tokenSecretRef, token);
        this.state.token_secret_ref = tokenSecretRef;
      }
    } catch {
      // ignore token sync errors
    }
  }
}

