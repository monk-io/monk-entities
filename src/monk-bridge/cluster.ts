import { action } from "monkec/base";
import cli from "cli";
import { MonkBridgeBase, type MonkBridgeBaseDefinition } from "./monk-bridge-base.ts";

export interface ClusterDefinition extends MonkBridgeBaseDefinition {
  expose_balancers?: boolean;
  filters?: {
    path_filter?: string;
    tags_filter?: string[];
    names_filter?: string[];
    local?: boolean;
  };
  fetch_templates_info?: boolean;
}

export interface ClusterState {
  existing?: boolean;
  last_synced_at?: number;
  version?: string;
  // Avoid top-level maps; use arrays and flat fields
  balancers_list?: Array<{ address: string; port: string; protocol: string; publish: boolean }>;
  cluster_summary_id?: string;
  cluster_summary_name?: string;
  cluster_summary_open_ports?: string | number;
  templates_info?: unknown;
  peers?: Array<{ id: string; public_ip?: string; name?: string; region?: string; provider?: string; version?: string }>;
}

const ALLOWED: ReadonlyArray<string> = [
  "cluster.Info",
  "cluster.Peers",
  "internal.GetVersion",
  "templates.GetState",
  "templates.Balancers",
] as const;

export class Cluster extends MonkBridgeBase<ClusterDefinition, ClusterState> {
  protected getBaseAllowedMethods(): ReadonlyArray<string> { return ALLOWED; }

  override create(): void {
    const info = this.safeCall("cluster.Info", null) as any;
    const versionResp = this.safeCall("internal.GetVersion", null) as any;
    const balancers = this.safeCall("templates.Balancers", null) as Record<string, any> | any[] | null;

    // Peers (minimal view)
    let peersMin: Array<{ id: string; public_ip?: string; name?: string; region?: string; provider?: string; version?: string }> | undefined;
    try {
      const peers = this.safeCall("cluster.Peers", null) as any[];
      if (Array.isArray(peers)) {
        peersMin = peers.map((p) => ({
          id: p?.id || p?.ID || p?.Id || "",
          public_ip: p?.publicIP || p?.PublicIP || p?.public_ip,
          name: p?.name || p?.Name,
          region: p?.region || p?.Region,
          provider: p?.provider || p?.Provider,
          version: p?.version || p?.Version,
        })).filter((p) => p.id);
      }
    } catch {}

    const balancersMap = this.normalizeBalancers(balancers);
    const services = this.definition.expose_balancers === false ? {} : this.servicesFromBalancers(balancersMap);

    // Store only as an array on state
    this.state.balancers_list = Object.values(services);
    this.state.version = versionResp?.Version || versionResp?.version || "";
    this.state.last_synced_at = Date.now();
    this.state.existing = true;
    if (peersMin) this.state.peers = peersMin;

    // Flatten cluster summary
    this.state.cluster_summary_id = info?.ID || info?.Id || info?.id || this.state.cluster_summary_id;
    this.state.cluster_summary_name = info?.Name || info?.name || this.state.cluster_summary_name;
    this.state.cluster_summary_open_ports = info?.OpenPorts || info?.openPorts || this.state.cluster_summary_open_ports;

    this.refreshTemplatesData();
  }

  override update(): void {
    this.create();
  }

  // No special readiness check; default behavior is immediate readiness

  @action("refresh")
  refresh(): void {
    this.update();
    try {
      const v = this.safeCall("internal.GetVersion", null) as any;
      this.state.version = v?.Version || v?.version || this.state.version || "";
    } catch {}
    cli.output("Refreshed remote cluster data");
  }

  private normalizeBalancers(input: Record<string, any> | any[] | null): Record<string, any> {
    if (!input) return {};
    if (Array.isArray(input)) {
      const map: Record<string, any> = {};
      for (const it of input) {
        const key = (it?.name || it?.aliasName || it?.path || `balancer-${Object.keys(map).length + 1}`) as string;
        map[key] = it;
      }
      return map;
    }
    return input;
  }

  private servicesFromBalancers(balancers: Record<string, any>): Record<string, { address: string; port: string; protocol: string; publish: boolean }> {
    const out: Record<string, { address: string; port: string; protocol: string; publish: boolean }> = {};
    for (const [key, b] of Object.entries(balancers)) {
      if (!b || !b.Address) continue;
      const port = String(b.FrontendPort || b.Port || "");
      const safeName = `balancer-${(b.Name || b.AliasName || key).toLowerCase().replace(/[^a-z0-9-]/g, "-")}-${port}`.replace(/-+/g, "-");
      out[safeName] = { address: b.Address, port, protocol: "tcp", publish: true };
    }
    return out;
  }

  private refreshTemplatesData(): void {
    const f = this.definition.filters || {};

    // Always use templates.GetState by default
    let info: unknown = undefined;
    if (this.isAllowed("templates.GetState")) {
      const payload = {
        PeerID: "",
        TagsFilter: Array.isArray(f.tags_filter) ? f.tags_filter : [],
        NameFilter: "",
        Local: Boolean(f.local),
        All: true,
        FindGroups: true,
        FindRunnables: true,
        FindEntities: true,
      };
      const state = this.safeCall("templates.GetState", payload) as any;
      // Unwrap ListTree if present
      if (state && Array.isArray(state.ListTree)) {
        info = state.ListTree;
      } else {
        info = state;
      }
    }

    if (info !== undefined) this.state.templates_info = info;
  }
}


