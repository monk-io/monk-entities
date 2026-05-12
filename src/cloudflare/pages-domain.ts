import { action } from "monkec/base";
import cli from "cli";
import {
  CloudflareEntity,
  type CloudflareEntityDefinition,
  type CloudflareEntityState,
} from "./cloudflare-base.ts";

/**
 * Definition interface for a Cloudflare Pages custom domain.
 * Binds a hostname to an existing Pages project. The DNS record pointing
 * to `<project>.pages.dev` is owned separately (cloudflare/dns-record).
 * @see https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/methods/create/
 * @interface CloudflarePagesDomainDefinition
 */
export interface CloudflarePagesDomainDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare account ID that owns the Pages project */
  account_id: string;
  /** @description Pages project name. Wire via connection-target to a cloudflare/pages-project entity. */
  project_name: string;
  /** @description Fully-qualified hostname to attach (e.g. `app.example.com`) */
  domain: string;
  /**
   * @description If true, delete() detaches the domain. Default false (no-op).
   * @default false
   */
  allow_destructive_delete?: boolean;
}

/**
 * State interface for a Cloudflare Pages custom domain.
 * @interface CloudflarePagesDomainState
 */
export interface CloudflarePagesDomainState extends CloudflareEntityState {
  /** @description Domain name (canonical identifier; mirrors definition.domain) */
  id?: string;
  /** @description Validation status reported by Cloudflare (e.g. `pending`, `active`) */
  status?: string;
  /** @description Verification data returned by Cloudflare (CNAME target etc.) */
  verification_data?: any;
  /** @description ISO-8601 timestamp the binding was created */
  created_on?: string;
}

/**
 * @description Cloudflare Pages Custom Domain entity.
 *
 * Attaches a hostname to an existing Pages project. Detect-then-create:
 * if the hostname is already bound to the project, it is adopted. Delete
 * is a no-op unless opted in.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `Cloudflare Pages: Edit` scope on the account.
 *
 * ## Composition
 * - Wire `project_name` from a `cloudflare/pages-project` entity-state.
 * - Create the actual DNS record separately via `cloudflare/dns-record`,
 *   pointing to `<project>.pages.dev`.
 *
 * ## Actions
 * - `get-info` — fetch current binding record
 * - `retry-validation` — re-run Cloudflare's validation checks
 * - `force-delete` — explicit destructive delete (refuses adopted bindings)
 */
export class CloudflarePagesDomain extends CloudflareEntity<
  CloudflarePagesDomainDefinition,
  CloudflarePagesDomainState
> {
  static readonly readiness = { period: 10, initialDelay: 2, attempts: 12 };

  override create(): void {
    const existing = this.fetchDomain();
    if (existing) {
      this.state = {
        id: this.definition.domain,
        status: existing.status,
        verification_data: existing.verification_data,
        created_on: existing.created_on,
        existing: true,
      };
      cli.output(`🌐 Adopted existing Pages domain ${this.definition.domain}`);
      return;
    }

    const { account_id, project_name, domain } = this.definition;
    const created = this.request<any>(
      "POST",
      `/accounts/${account_id}/pages/projects/${project_name}/domains`,
      { name: domain }
    );
    const result = created?.result || {};
    this.state = {
      id: domain,
      status: result.status,
      verification_data: result.verification_data,
      created_on: result.created_on,
      existing: false,
    };
    cli.output(`✅ Attached Pages domain ${domain} to ${project_name}`);
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    const meta = this.fetchDomain();
    if (meta) {
      this.state.status = meta.status || this.state.status;
      this.state.verification_data = meta.verification_data || this.state.verification_data;
    }
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Pages domain existed before this entity; skipping delete");
      return;
    }
    if (!this.definition.allow_destructive_delete) {
      cli.output(
        `Pages domain ${this.state.id} delete is disabled. Set allow_destructive_delete: true ` +
          `or invoke the force-delete action to detach it.`
      );
      return;
    }
    this.detachDomain();
  }

  override checkReadiness(): boolean {
    if (!this.state.id) return false;
    const meta = this.fetchDomain();
    if (!meta) return false;
    this.state.status = meta.status || this.state.status;
    return this.state.status === "active";
  }

  @action("get-info")
  getInfo(): void {
    if (!this.state.id) {
      cli.output("No Pages domain yet");
      return;
    }
    const meta = this.fetchDomain();
    cli.output(JSON.stringify(meta || {}, null, 2));
  }

  @action("retry-validation")
  retryValidation(): void {
    if (!this.state.id) {
      cli.output("No Pages domain yet");
      return;
    }
    const { account_id, project_name } = this.definition;
    const res = this.request<any>(
      "PATCH",
      `/accounts/${account_id}/pages/projects/${project_name}/domains/${this.state.id}`,
      {}
    );
    cli.output(JSON.stringify(res?.result || {}, null, 2));
  }

  @action("force-delete")
  forceDelete(): void {
    if (!this.state.id) {
      cli.output("No Pages domain to delete");
      return;
    }
    if (this.state.existing) {
      cli.output(
        `Refusing force-delete: Pages domain ${this.state.id} pre-existed and was adopted.`
      );
      return;
    }
    this.detachDomain();
  }

  private detachDomain(): void {
    const { account_id, project_name } = this.definition;
    try {
      this.request(
        "DELETE",
        `/accounts/${account_id}/pages/projects/${project_name}/domains/${this.state.id}`
      );
      cli.output(`🗑️ Detached Pages domain ${this.state.id} from ${project_name}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404")) {
        cli.output(`Pages domain ${this.state.id} already gone`);
        return;
      }
      throw e;
    }
  }

  private fetchDomain(): any | null {
    const { account_id, project_name, domain } = this.definition;
    try {
      const res = this.request<any>(
        "GET",
        `/accounts/${account_id}/pages/projects/${project_name}/domains/${domain}`
      );
      return res?.result || null;
    } catch {
      return null;
    }
  }
}
