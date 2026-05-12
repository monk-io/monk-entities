import { action } from "monkec/base";
import cli from "cli";
import {
  CloudflareEntity,
  type CloudflareEntityDefinition,
  type CloudflareEntityState,
} from "./cloudflare-base.ts";

/**
 * Definition interface for a Cloudflare Pages project (direct-upload type).
 * Reserves the project by name in the given account. Site code upload is
 * owned by the `cloudflare/wrangler-pages-deploy` runnable, not this entity.
 * @see https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/create/
 * @interface CloudflarePagesProjectDefinition
 */
export interface CloudflarePagesProjectDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare account ID that owns the project */
  account_id: string;
  /** @description Pages project name (3-58 chars, lowercase alphanumerics + dashes). Canonical identifier. */
  name: string;
  /**
   * @description Production branch name; surfaces in the dashboard and
   * controls which deploys are "production". Defaults to `main`.
   * @default main
   */
  production_branch?: string;
  /**
   * @description Plain (non-secret) environment variables to apply to the
   * production deployment config. Map of name → value. Secrets should be
   * pushed via wrangler at deploy time, not stored here.
   */
  production_env_vars?: Record<string, string>;
  /**
   * @description Plain (non-secret) environment variables to apply to the
   * preview deployment config. Map of name → value.
   */
  preview_env_vars?: Record<string, string>;
  /**
   * @description If true, delete() destroys the project. Default false (no-op).
   * @default false
   */
  allow_destructive_delete?: boolean;
}

/**
 * State interface for a Cloudflare Pages project.
 * @interface CloudflarePagesProjectState
 */
export interface CloudflarePagesProjectState extends CloudflareEntityState {
  /** @description Project name; canonical identifier (mirrors definition.name) */
  id?: string;
  /** @description Cloudflare-assigned subdomain, e.g. `my-app.pages.dev` */
  subdomain?: string;
  /** @description Active production branch reported by Cloudflare */
  production_branch?: string;
  /** @description ISO-8601 timestamp the project was created */
  created_on?: string;
  /** @description Custom domains currently bound to the project (managed separately by pages-domain) */
  domains?: string[];
  /** @description ID of the latest deployment, if any */
  latest_deployment_id?: string;
}

/**
 * @description Cloudflare Pages Project entity (direct-upload type).
 *
 * Reserves a Pages project as a Cloudflare resource. Detects-then-creates:
 * if a project with the given name exists, it is adopted; if not, a new
 * direct-upload project is created so other resources (custom domains,
 * deployments) can reference it. Site content is uploaded by the
 * `cloudflare/wrangler-pages-deploy` runnable.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `Cloudflare Pages: Edit` scope on the account.
 *
 * ## State Fields for Composition
 * - `state.id` — project name; pass to wrangler-pages-deploy as `project-name`
 *   and to `pages-domain` as `project_name`.
 * - `state.subdomain` — the `<name>.pages.dev` URL.
 *
 * ## Delete posture
 * Like `r2-bucket` and `workers-script`: delete is a no-op unless
 * `allow_destructive_delete: true` is set or the `force-delete` action is
 * invoked. Adopted projects (`state.existing = true`) are never deleted.
 *
 * ## Actions
 * - `get-info` — fetch project record
 * - `list-deployments` — list recent deployments
 * - `force-delete` — explicit destructive delete; refuses adopted projects
 */
export class CloudflarePagesProject extends CloudflareEntity<
  CloudflarePagesProjectDefinition,
  CloudflarePagesProjectState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const accountId = this.definition.account_id;
    const name = this.definition.name;

    const existing = this.fetchProject(accountId, name);
    if (existing) {
      this.state = {
        id: name,
        subdomain: existing.subdomain,
        production_branch: existing.production_branch,
        created_on: existing.created_on,
        domains: existing.domains || [],
        latest_deployment_id: existing.latest_deployment?.id,
        existing: true,
      };
      cli.output(`📄 Adopted existing Pages project ${name}`);
      this.applyEnvVars();
      return;
    }

    const body = {
      name,
      production_branch: this.definition.production_branch || "main",
    };
    const created = this.request<any>(
      "POST",
      `/accounts/${accountId}/pages/projects`,
      body
    );
    const result = created?.result || {};
    this.state = {
      id: name,
      subdomain: result.subdomain,
      production_branch: result.production_branch || body.production_branch,
      created_on: result.created_on,
      domains: result.domains || [],
      latest_deployment_id: result.latest_deployment?.id,
      existing: false,
    };
    cli.output(`✅ Created Pages project ${name} (${this.state.subdomain || ""})`);
    this.applyEnvVars();
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    this.applyEnvVars();
    const accountId = this.definition.account_id;
    const meta = this.fetchProject(accountId, this.state.id);
    if (meta) {
      this.state.subdomain = meta.subdomain || this.state.subdomain;
      this.state.production_branch = meta.production_branch || this.state.production_branch;
      this.state.domains = meta.domains || this.state.domains;
      this.state.latest_deployment_id =
        meta.latest_deployment?.id || this.state.latest_deployment_id;
    }
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Pages project existed before this entity; skipping delete");
      return;
    }
    if (!this.definition.allow_destructive_delete) {
      cli.output(
        `Pages project ${this.state.id} delete is disabled. Set allow_destructive_delete: true ` +
          `or invoke the force-delete action to remove it.`
      );
      return;
    }
    this.destroyProject();
  }

  override checkReadiness(): boolean {
    return Boolean(this.state.id);
  }

  @action("get-info")
  getInfo(): void {
    if (!this.state.id) {
      cli.output("No Pages project yet");
      return;
    }
    const accountId = this.definition.account_id;
    const meta = this.fetchProject(accountId, this.state.id);
    cli.output(JSON.stringify(meta || {}, null, 2));
  }

  @action("list-deployments")
  listDeployments(): void {
    if (!this.state.id) {
      cli.output("No Pages project yet");
      return;
    }
    const accountId = this.definition.account_id;
    const res = this.request<any>(
      "GET",
      `/accounts/${accountId}/pages/projects/${this.state.id}/deployments`
    );
    const deployments: any[] = res?.result || [];
    cli.output(`📦 ${deployments.length} deployment(s)`);
    for (const d of deployments.slice(0, 20)) {
      const stage = d?.latest_stage?.name || "?";
      const status = d?.latest_stage?.status || "?";
      cli.output(`  - ${d.id} env=${d.environment} stage=${stage} status=${status} url=${d.url || ""}`);
    }
  }

  @action("force-delete")
  forceDelete(): void {
    if (!this.state.id) {
      cli.output("No Pages project to delete");
      return;
    }
    if (this.state.existing) {
      cli.output(
        `Refusing force-delete: Pages project ${this.state.id} pre-existed and was adopted. ` +
          `Delete manually if intentional.`
      );
      return;
    }
    this.destroyProject();
  }

  private applyEnvVars(): void {
    const prod = this.definition.production_env_vars;
    const preview = this.definition.preview_env_vars;
    if (!prod && !preview) return;
    if (!this.state.id) return;

    const accountId = this.definition.account_id;
    const envObj = (vars?: Record<string, string>) => {
      if (!vars) return undefined;
      const out: Record<string, { value: string }> = {};
      for (const k of Object.keys(vars)) out[k] = { value: vars[k] };
      return out;
    };
    const deploymentConfigs: Record<string, any> = {};
    const prodEnv = envObj(prod);
    const previewEnv = envObj(preview);
    if (prodEnv) deploymentConfigs.production = { env_vars: prodEnv };
    if (previewEnv) deploymentConfigs.preview = { env_vars: previewEnv };

    try {
      this.request<any>(
        "PATCH",
        `/accounts/${accountId}/pages/projects/${this.state.id}`,
        { deployment_configs: deploymentConfigs }
      );
    } catch (e: any) {
      cli.output(`Pages project env-var PATCH failed: ${e?.message || e}`);
    }
  }

  private destroyProject(): void {
    const accountId = this.definition.account_id;
    try {
      this.request(
        "DELETE",
        `/accounts/${accountId}/pages/projects/${this.state.id}`
      );
      cli.output(`🗑️ Deleted Pages project ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404") || msg.includes("8000007")) {
        cli.output(`Pages project ${this.state.id} already gone`);
        return;
      }
      throw e;
    }
  }

  private fetchProject(accountId: string, name: string): any | null {
    try {
      const res = this.request<any>(
        "GET",
        `/accounts/${accountId}/pages/projects/${name}`
      );
      return res?.result || null;
    } catch {
      return null;
    }
  }
}
