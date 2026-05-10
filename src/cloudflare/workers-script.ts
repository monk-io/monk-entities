import { action } from "monkec/base";
import cli from "cli";
import { CloudflareEntity, type CloudflareEntityDefinition, type CloudflareEntityState } from "./cloudflare-base.ts";

/**
 * Definition interface for a Cloudflare Worker script resource.
 * Reserves the Worker by name in the given account. Code upload is owned
 * by the `cloudflare/wrangler-deploy` runnable, not this entity.
 * @see https://developers.cloudflare.com/api/operations/worker-script-upload-worker-module
 * @interface CloudflareWorkersScriptDefinition
 */
export interface CloudflareWorkersScriptDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare account ID that owns the Worker */
  account_id: string;
  /** @description Worker script name; canonical identifier */
  name: string;
  /** @description Optional ISO date for the initial stub (e.g. "2025-04-01") */
  compatibility_date?: string;
  /**
   * @description If true, delete() destroys the script. Default false (no-op).
   * @default false
   */
  allow_destructive_delete?: boolean;
}

/**
 * State interface for a Cloudflare Worker script resource.
 * @interface CloudflareWorkersScriptState
 */
export interface CloudflareWorkersScriptState extends CloudflareEntityState {
  /** @description Worker name; canonical identifier (mirrors definition.name) */
  id?: string;
  /** @description ISO-8601 timestamp the script was created */
  created_on?: string;
  /** @description ISO-8601 timestamp of last modification */
  modified_on?: string;
  /** @description Worker's etag from the most recent operation */
  etag?: string;
}

/**
 * @description Cloudflare Worker Script entity.
 * Reserves a Worker name as a Cloudflare resource. Detects-then-stubs: if a
 * script with the given name exists, it is adopted; if not, a tiny stub is
 * uploaded so the resource exists and other entities/runnables can depend on
 * it. Code is then deployed via the `cloudflare/wrangler-deploy` runnable,
 * which overwrites the stub.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `Workers Scripts: Edit` scope on the account.
 *
 * ## State Fields for Composition
 * - `state.id` — script name, pass to wrangler-deploy as `script-name`
 *   and to `workers-route` as `script_name`.
 *
 * ## Delete posture
 * Like cloudflare-r2-bucket: delete is a no-op unless
 * `allow_destructive_delete: true` is set in the definition or the
 * `force-delete` action is invoked. Adopted scripts (`state.existing = true`)
 * are never deleted.
 *
 * ## Actions
 * - `get-info` — fetch script metadata from Cloudflare
 * - `force-delete` — explicit destructive delete; refuses adopted scripts
 */
export class CloudflareWorkersScript extends CloudflareEntity<
  CloudflareWorkersScriptDefinition,
  CloudflareWorkersScriptState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const accountId = this.definition.account_id;
    const name = this.definition.name;

    const existing = this.fetchScript(accountId, name);
    if (existing) {
      this.state = {
        id: name,
        created_on: existing.created_on,
        modified_on: existing.modified_on,
        etag: existing.etag,
        existing: true,
      };
      cli.output(`📜 Adopted existing Worker script ${name}`);
      return;
    }

    const meta = this.uploadStub(accountId, name);
    this.state = {
      id: name,
      created_on: meta?.created_on,
      modified_on: meta?.modified_on,
      etag: meta?.etag,
      existing: false,
    };
    cli.output(`✅ Created Worker script ${name} (stub; deploy code via cloudflare/wrangler-deploy)`);
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    // Content is owned by wrangler-deploy. Just refresh metadata.
    const meta = this.fetchScript(this.definition.account_id, this.state.id);
    if (meta) {
      this.state.modified_on = meta.modified_on || this.state.modified_on;
      this.state.etag = meta.etag || this.state.etag;
    }
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Script existed before this entity; skipping delete");
      return;
    }
    if (!this.definition.allow_destructive_delete) {
      cli.output(
        `Worker script ${this.state.id} delete is disabled. Set allow_destructive_delete: true ` +
          `or invoke the force-delete action to remove it.`
      );
      return;
    }
    this.destroyScript();
  }

  override checkReadiness(): boolean {
    return Boolean(this.state.id);
  }

  @action("get-info")
  getInfo(): void {
    if (!this.state.id) {
      cli.output("No script yet");
      return;
    }
    const meta = this.fetchScript(this.definition.account_id, this.state.id);
    cli.output(JSON.stringify(meta || {}, null, 2));
  }

  @action("force-delete")
  forceDelete(): void {
    if (!this.state.id) {
      cli.output("No script to delete");
      return;
    }
    if (this.state.existing) {
      cli.output(
        `Refusing force-delete: script ${this.state.id} pre-existed and was adopted. ` +
          `Delete manually if intentional.`
      );
      return;
    }
    this.destroyScript();
  }

  private destroyScript(): void {
    const accountId = this.definition.account_id;
    try {
      this.request("DELETE", `/accounts/${accountId}/workers/scripts/${this.state.id}`);
      cli.output(`🗑️ Deleted Worker script ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404") || msg.includes("10007")) {
        cli.output(`Worker script ${this.state.id} already gone`);
        return;
      }
      if (msg.includes("10064")) {
        // Script is still bound as a queue consumer. Stack-level cleanup
        // typically removes the consumer in parallel; surface a warning
        // but don't fail the delete — the orphan will resolve once the
        // queue/consumer is gone.
        cli.output(
          `Worker script ${this.state.id} still bound as a queue consumer; ` +
            `remove the consumer first. Skipping script delete.`
        );
        return;
      }
      throw e;
    }
  }

  private fetchScript(accountId: string, name: string): any | null {
    try {
      // Existence check — body returned but not used.
      this.request<any>("GET", `/accounts/${accountId}/workers/scripts/${name}`);
      const meta = this.tryFetchScriptMeta(accountId, name);
      return meta || { id: name };
    } catch {
      return null;
    }
  }

  private tryFetchScriptMeta(accountId: string, name: string): any | null {
    try {
      const res = this.request<any>(
        "GET",
        `/accounts/${accountId}/workers/scripts/${name}/settings`
      );
      return res?.result || null;
    } catch {
      return null;
    }
  }

  /**
   * Upload a minimal stub Worker via the multipart script-upload endpoint.
   * This reserves the script name as a real CF resource so dependent
   * entities (routes, queue consumers, cron triggers) can wire to it.
   * The body is overwritten on the first `wrangler deploy`.
   *
   * Module syntax with `fetch`, `queue`, and `scheduled` handlers — the
   * Cloudflare API refuses to attach a queue consumer or cron trigger to
   * a script that doesn't export the corresponding handler. The literal
   * `export default` is split below to bypass esbuild's tree-shaker,
   * which strips it from compiled string literals.
   */
  private uploadStub(accountId: string, name: string): any | null {
    const exp = "export" + " " + "default";
    const stub =
      `${exp} {\n` +
      `  async fetch() { return new Response("monk: pending wrangler-deploy", { status: 503 }); },\n` +
      `  async queue() { /* monk stub: drops messages until wrangler deploys real handler */ },\n` +
      `  async scheduled() { /* monk stub: no-op cron handler */ }\n` +
      `};\n`;
    const metadata = {
      main_module: "script.js",
      compatibility_date: this.definition.compatibility_date || "2025-04-01",
    };

    const boundary = "----monk" + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="metadata"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="script.js"; filename="script.js"\r\n` +
      `Content-Type: application/javascript+module\r\n\r\n` +
      `${stub}\r\n` +
      `--${boundary}--\r\n`;

    const res = this.http.request<any>(
      "PUT",
      `/accounts/${accountId}/workers/scripts/${name}`,
      {
        body,
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
      }
    );

    if (!res.ok) {
      throw new Error(
        `Worker script stub upload failed: ${res.statusCode} ${res.status} - ${
          typeof res.data === "string" ? res.data : JSON.stringify(res.data)
        }`
      );
    }
    return res.data?.result || null;
  }
}
