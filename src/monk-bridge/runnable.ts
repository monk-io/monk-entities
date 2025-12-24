import { action } from "monkec/base";
import cli from "cli";
import { MonkBridgeBase, type MonkBridgeBaseDefinition } from "./monk-bridge-base.ts";

export interface RunnableDefinition extends MonkBridgeBaseDefinition {
  runnable: string;
}

export interface PublicEndpoint {
  source: "balancer" | "container";
  name: string;
  address?: string;
  port?: string;
  healthy?: boolean;
  raw?: unknown;
}

export interface RunnableState {
  last_synced_at?: number;
  runnable?: string;
  template?: string;
  instance_ids?: string[];
  is_run?: boolean;
  endpoints?: PublicEndpoint[];
}

const ALLOWED: ReadonlyArray<string> = [
  "templates.Describe",
  "cluster.Peers",
] as const;

/**
 * @description Monk Bridge Runnable entity.
 * Connects to remote Monk clusters and retrieves runnable information.
 * Enables cross-cluster resource visibility and management.
 * 
 * ## Secrets
 * - Reads: secret name from `monkcode_secret_ref` property - Monk cluster connection code
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.endpoints` - Public endpoints of the runnable
 * - `state.is_run` - Whether the runnable is currently running
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `monk-bridge/cluster` - Remote cluster connection
 */
export class Runnable extends MonkBridgeBase<RunnableDefinition, RunnableState> {
  static readonly readiness = { period: 10, initialDelay: 1, attempts: 12 } as const;
  protected getBaseAllowedMethods(): ReadonlyArray<string> { return ALLOWED; }

  override create(): void {
    if (!this.definition.runnable || this.definition.runnable.trim() === "") throw new Error("runnable is required");

    const desc = this.safeCall("templates.Describe", { Runnable: this.definition.runnable }) as any;

    let peerIPByID: Record<string, string> = {};
    try {
      const peers = this.safeCall("cluster.Peers", null) as any[];
      if (Array.isArray(peers)) {
        for (const p of peers) {
          const id = p?.ID || p?.Id || p?.id;
          const ip = p?.PublicIP || p?.publicIP || p?.public_ip;
          if (id && ip) peerIPByID[id] = String(ip);
        }
      }
    } catch {}

    const endpoints = this.extractEndpoints(desc, peerIPByID);
    const instanceIds: string[] = Array.isArray(desc?.InstanceIds) ? desc.InstanceIds : [];
    const template: string | undefined = desc?.Template || desc?.template;
    const isRun: boolean | undefined = typeof desc?.IsRun === "boolean" ? desc.IsRun : undefined;
    this.state.endpoints = endpoints;
    this.state.runnable = this.definition.runnable;
    if (template) this.state.template = String(template);
    if (instanceIds && instanceIds.length > 0) this.state.instance_ids = instanceIds.map(String);
    if (typeof isRun === "boolean") this.state.is_run = isRun;
    this.state.last_synced_at = Date.now();
  }

  override update(): void {
    this.create();
  }

  @action("refresh")
  refresh(): void {
    this.update();
    cli.output("Refreshed runnable description");
  }

  @action("describe")
  describeAction(): void {
    const res = this.safeCall("templates.Describe", { Runnable: this.definition.runnable }) as unknown;
    cli.output(JSON.stringify(res || {}, null, 2));
  }

  private extractEndpoints(desc: any, peerIPByID: Record<string, string>): PublicEndpoint[] {
    const endpoints: PublicEndpoint[] = [];
    try {
      const balancers: any[] = Array.isArray(desc?.Balancers) ? desc.Balancers : [];
      for (const b of balancers) {
        const address = b?.Address;
        const port = String(b?.FrontendPort || b?.Port || "");
        const name = (b?.Name || b?.AliasName || "balancer").toString();
        if (address && port) endpoints.push({ source: "balancer", name, address, port, healthy: Boolean(b?.Healthy), raw: b });
      }
    } catch {}

    try {
      const cd = desc?.ContainerDetails;
      if (cd && typeof cd === "object") {
        for (const group of Object.values(cd as Record<string, any>)) {
          if (!group || typeof group !== "object") continue;
          for (const [k, c] of Object.entries(group as Record<string, any>)) {
            const name = (c?.Name || c?.ShortName || k || "container").toString();
            const peerId = c?.PeerID || c?.peerID || c?.peerId;
            const ipFromPeer = peerId && peerIPByID[peerId] ? peerIPByID[peerId] : undefined;

            let added = false;
            const pubs: any[] = Array.isArray((c as any)?.PublicPorts)
              ? (c as any).PublicPorts
              : Array.isArray((c as any)?.public_ports)
              ? (c as any).public_ports
              : Array.isArray((c as any)?.publicPorts)
              ? (c as any).publicPorts
              : [];
            for (const p of pubs) {
              const parsed = this.parsePublicPort(String(p));
              const finalIP = parsed.ip || ipFromPeer;
              const finalPort = parsed.port;
              if (finalPort) {
                endpoints.push({ source: "container", name, address: finalIP, port: finalPort, raw: c });
                added = true;
              }
            }

            // Fallback: parse from Ports entries like "0.0.0.0:8888:80/TCP" or "5432:5432/TCP" or with "public"
            if (!added) {
              const ports: any[] = Array.isArray((c as any)?.Ports)
                ? (c as any).Ports
                : Array.isArray((c as any)?.ports)
                ? (c as any).ports
                : [];
              for (const p of ports) {
                const s = String(p);
                const parsed = this.parsePublicPort(s);
                const finalIP = parsed.ip || ipFromPeer;
                const finalPort = parsed.port;
                if (finalPort) {
                  endpoints.push({ source: "container", name, address: finalIP, port: finalPort, raw: c });
                  added = true;
                }
              }
            }
          }
        }
      }
    } catch {}

    return endpoints;
  }

  private parsePublicPort(s: string): { ip?: string; port?: string } {
    let left = s.trim();
    if (left.includes("->")) left = left.split("->")[0];
    if (left.includes("/")) left = left.split("/")[0];
    // trim leading text like "open TCP "
    left = left.replace(/^[^0-9]+/, "");

    if (left.includes(":")) {
      const parts = left.split(":").map((x) => x.trim()).filter((x) => x.length > 0);
      // Pattern: ip:hostPort:containerPort
      if (parts.length >= 3 && parts[0].includes(".")) {
        return { ip: parts[0], port: parts[1] };
      }
      // Pattern: ip:port
      if (parts.length === 2 && parts[0].includes(".")) {
        return { ip: parts[0], port: parts[1] };
      }
      // Pattern: hostPort:containerPort
      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        return { port: parts[0] };
      }
      // Fallback to last numeric segment as port
      const last = parts.reverse().find((p) => /^\d+$/.test(p));
      return { port: last };
    }
    const portOnly = left && /\d+/.test(left) ? left : undefined;
    return { port: portOnly };
  }
}


