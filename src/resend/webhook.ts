import { action } from "monkec/base";
import cli from "cli";
import secret from "secret";
import {
  ResendEntity,
  type ResendEntityDefinition,
  type ResendEntityState,
} from "./resend-base.ts";

/**
 * Definition interface for a Resend webhook endpoint.
 *
 * The signing secret is returned by Resend *once* on create and written
 * to the Monk secret named by `signing_secret_ref`. Adoption matches on
 * `endpoint` URL; an adopted webhook's secret cannot be re-fetched.
 *
 * @see https://resend.com/docs/api-reference/webhooks/create-webhook
 * @interface ResendWebhookDefinition
 */
export interface ResendWebhookDefinition extends ResendEntityDefinition {
  /** @description Target URL Resend will POST events to */
  endpoint: string;
  /**
   * @description Event types to subscribe to (e.g., "email.sent",
   * "email.bounced", "email.delivered", "email.complained",
   * "email.opened", "email.clicked")
   */
  events: string[];
  /**
   * @description Monk secret name to write the signing secret to.
   * Default: `resend-webhook-secret`.
   */
  signing_secret_ref?: string;
}

/**
 * State interface for a Resend webhook.
 * @interface ResendWebhookState
 */
export interface ResendWebhookState extends ResendEntityState {
  /** @description Resend webhook id */
  id?: string;
  /** @description Endpoint URL mirror */
  endpoint?: string;
  /** @description Where the signing secret was written */
  signing_secret_ref?: string;
  /** @description Events the webhook is subscribed to */
  applied_events?: string[];
}

/**
 * @description Resend Webhook entity.
 * Subscribes a target URL to Resend delivery events and stores the
 * returned signing secret in a Monk secret. Adopts existing webhooks by
 * endpoint URL. Updates events via PATCH. Delete removes the webhook.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `resend-api-token`).
 * - Writes: `signing_secret_ref` (defaults to `resend-webhook-secret`).
 *
 * ## Actions
 * - `get-info` — fetch the webhook record from Resend
 */
export class ResendWebhook extends ResendEntity<
  ResendWebhookDefinition,
  ResendWebhookState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const signingSecretRef = this.signingSecretRef();

    const existing = this.findByEndpoint(this.definition.endpoint);
    if (existing?.id) {
      this.state = {
        id: existing.id,
        endpoint: existing.endpoint || this.definition.endpoint,
        signing_secret_ref: signingSecretRef,
        applied_events: existing.events,
        existing: true,
      };
      cli.output(
        `🪝 Adopted existing Resend webhook ${existing.id}; signing secret not re-fetched.`
      );
      return;
    }

    const body = {
      endpoint: this.definition.endpoint,
      events: this.definition.events,
    };
    const created = this.request<any>("POST", "/webhooks", body);
    const signingSecret = created?.signing_secret;
    if (signingSecret) {
      secret.set(signingSecretRef, signingSecret);
    }

    this.state = {
      id: created?.id,
      endpoint: this.definition.endpoint,
      signing_secret_ref: signingSecret ? signingSecretRef : undefined,
      applied_events: this.definition.events.slice(),
      existing: false,
    };
    cli.output(
      `✅ Created Resend webhook ${this.state.id} → ${this.definition.endpoint}` +
        (signingSecret ? ` (signing secret → ${signingSecretRef})` : "")
    );
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    const eventsChanged =
      !this.state.applied_events ||
      !this.sameSet(this.state.applied_events, this.definition.events);
    const endpointChanged = this.state.endpoint !== this.definition.endpoint;
    if (!eventsChanged && !endpointChanged) return;

    const body: any = {};
    if (endpointChanged) body.endpoint = this.definition.endpoint;
    if (eventsChanged) body.events = this.definition.events;

    try {
      this.request<any>("PATCH", `/webhooks/${this.state.id}`, body);
      this.state.endpoint = this.definition.endpoint;
      this.state.applied_events = this.definition.events.slice();
    } catch (e: any) {
      cli.output(`Webhook PATCH failed: ${e?.message || e}`);
      throw e;
    }
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Webhook existed before this entity; skipping delete");
      return;
    }
    try {
      this.request("DELETE", `/webhooks/${this.state.id}`);
      cli.output(`🗑️ Deleted Resend webhook ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404")) {
        cli.output(`Webhook ${this.state.id} already gone`);
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
      cli.output("No webhook yet");
      return;
    }
    const res = this.request<any>("GET", `/webhooks/${this.state.id}`);
    cli.output(JSON.stringify(res || {}, null, 2));
  }

  private signingSecretRef(): string {
    return this.definition.signing_secret_ref || "resend-webhook-secret";
  }

  private findByEndpoint(endpoint: string): any | null {
    try {
      const res = this.request<any>("GET", "/webhooks");
      const list: any[] = res?.data || [];
      for (const w of list) {
        if (w?.endpoint === endpoint && w?.id) return w;
      }
      return null;
    } catch {
      return null;
    }
  }

  private sameSet(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    return true;
  }
}
