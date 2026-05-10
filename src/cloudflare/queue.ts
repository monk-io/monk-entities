import { action } from "monkec/base";
import cli from "cli";
import {
  CloudflareEntity,
  type CloudflareEntityDefinition,
  type CloudflareEntityState,
} from "./cloudflare-base.ts";

/**
 * Definition interface for a Cloudflare Queue.
 * @see https://developers.cloudflare.com/api/resources/queues/methods/create/
 * @interface CloudflareQueueDefinition
 */
export interface CloudflareQueueDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare account ID that owns the queue */
  account_id: string;
  /** @description Queue name; canonical identifier within the account */
  name: string;
  /** @description Optional queue-level settings */
  settings?: {
    /** @description Seconds to delay before delivery; 0–42300 */
    delivery_delay?: number;
    /** @description Pause/resume delivery to consumers */
    delivery_paused?: boolean;
    /** @description Retention seconds; 60–1209600 (14 days max) */
    message_retention_period?: number;
  };
  /**
   * @description If true, delete() destroys the queue. Default false (no-op).
   * @default false
   */
  allow_destructive_delete?: boolean;
}

/**
 * State interface for a Cloudflare Queue.
 * @interface CloudflareQueueState
 */
export interface CloudflareQueueState extends CloudflareEntityState {
  /** @description Cloudflare queue id (canonical identifier) */
  id?: string;
  /** @description Queue name mirror (handy for downstream composition) */
  name?: string;
  /** @description ISO-8601 timestamp the queue was created */
  created_on?: string;
  /** @description ISO-8601 timestamp of last modification */
  modified_on?: string;
}

/**
 * @description Cloudflare Queue entity.
 * Manages an account-scoped Queue. Adopts existing queues by name. Delete is
 * disabled by default (queues may hold messages); set
 * `allow_destructive_delete: true` or invoke `force-delete` to remove.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `Workers Queues: Edit` scope on the account.
 *
 * ## State Fields for Composition
 * - `state.id` — queue ID, used in consumer bindings.
 * - `state.name` — queue name, used by Worker producer/consumer bindings.
 *
 * ## Actions
 * - `get-info` — fetch the queue record
 * - `send-message` — push a single message (body via `message` arg)
 * - `pull-messages` — pull up to 25 messages and print their bodies
 * - `drain-messages` — pull-and-ack all messages until empty (test cleanup helper)
 * - `force-delete` — explicit destructive delete; refuses adopted queues
 */
export class CloudflareQueue extends CloudflareEntity<
  CloudflareQueueDefinition,
  CloudflareQueueState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const accountId = this.definition.account_id;
    const name = this.definition.name;

    const existing = this.findQueueByName(accountId, name);
    if (existing?.queue_id) {
      this.state = {
        id: existing.queue_id,
        name: existing.queue_name || name,
        created_on: existing.created_on,
        modified_on: existing.modified_on,
        existing: true,
      };
      cli.output(`📬 Adopted existing Queue ${name} (${existing.queue_id})`);
      this.applySettings();
      return;
    }

    const body: any = { queue_name: name };
    if (this.definition.settings) body.settings = this.definition.settings;
    const created = this.request<any>(
      "POST",
      `/accounts/${accountId}/queues`,
      body
    );
    const result = created?.result || {};
    this.state = {
      id: result.queue_id,
      name: result.queue_name || name,
      created_on: result.created_on,
      modified_on: result.modified_on,
      existing: false,
    };
    cli.output(`✅ Created Queue ${name} (${result.queue_id})`);
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    this.applySettings();
    const accountId = this.definition.account_id;
    try {
      const res = this.request<any>(
        "GET",
        `/accounts/${accountId}/queues/${this.state.id}`
      );
      const q = res?.result;
      if (q?.modified_on) this.state.modified_on = q.modified_on;
    } catch {
      // best-effort refresh
    }
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Queue existed before this entity; skipping delete");
      return;
    }
    if (!this.definition.allow_destructive_delete) {
      cli.output(
        `Queue ${this.state.id} delete is disabled. Set allow_destructive_delete: true ` +
          `or invoke the force-delete action to remove it.`
      );
      return;
    }
    this.destroyQueue();
  }

  override checkReadiness(): boolean {
    return Boolean(this.state.id);
  }

  @action("get-info")
  getInfo(): void {
    if (!this.state.id) {
      cli.output("No queue yet");
      return;
    }
    const accountId = this.definition.account_id;
    const res = this.request<any>(
      "GET",
      `/accounts/${accountId}/queues/${this.state.id}`
    );
    cli.output(JSON.stringify(res?.result || {}, null, 2));
  }

  @action("send-message")
  sendMessage(args?: any): void {
    if (!this.state.id) {
      cli.output("No queue yet");
      return;
    }
    const accountId = this.definition.account_id;
    const message = args?.message ?? `monk-test ${Date.now()}`;
    const body = {
      messages: [
        { body: String(message), content_type: "text" },
      ],
    };
    const res = this.request<any>(
      "POST",
      `/accounts/${accountId}/queues/${this.state.id}/messages/batch`,
      body
    );
    cli.output(`📤 Sent message: ${String(message)}`);
    cli.output(JSON.stringify(res?.result || res || {}, null, 2));
  }

  @action("pull-messages")
  pullMessages(args?: any): void {
    if (!this.state.id) {
      cli.output("No queue yet");
      return;
    }
    const accountId = this.definition.account_id;
    const batchSize = Number(args?.batch_size ?? 25);
    const visibilityMs = Number(args?.visibility_timeout_ms ?? 5000);
    const res = this.request<any>(
      "POST",
      `/accounts/${accountId}/queues/${this.state.id}/messages/pull`,
      { batch_size: batchSize, visibility_timeout_ms: visibilityMs }
    );
    const messages: any[] = res?.result?.messages || [];
    cli.output(`📥 Pulled ${messages.length} message(s)`);
    for (const m of messages) {
      cli.output(`  - id=${m.id} body=${JSON.stringify(m.body)}`);
    }
    cli.output(JSON.stringify(res?.result || {}, null, 2));
  }

  @action("drain-messages")
  drainMessages(): void {
    if (!this.state.id) {
      cli.output("No queue yet");
      return;
    }
    const accountId = this.definition.account_id;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const res = this.request<any>(
        "POST",
        `/accounts/${accountId}/queues/${this.state.id}/messages/pull`,
        { batch_size: 100, visibility_timeout_ms: 1000 }
      );
      const messages: any[] = res?.result?.messages || [];
      if (messages.length === 0) break;
      total += messages.length;
      const acks = messages.map((m) => ({ lease_id: m.lease_id }));
      try {
        this.request<any>(
          "POST",
          `/accounts/${accountId}/queues/${this.state.id}/messages/ack`,
          { acks, retries: [] }
        );
      } catch (e: any) {
        cli.output(`ack failed: ${e?.message || e}`);
        break;
      }
    }
    cli.output(`🧹 Purged ${total} message(s)`);
  }

  @action("force-delete")
  forceDelete(): void {
    if (!this.state.id) {
      cli.output("No queue to delete");
      return;
    }
    if (this.state.existing) {
      cli.output(
        `Refusing force-delete: queue ${this.state.id} pre-existed and was adopted.`
      );
      return;
    }
    this.destroyQueue();
  }

  private applySettings(): void {
    if (!this.definition.settings || !this.state.id) return;
    const accountId = this.definition.account_id;
    try {
      this.request<any>(
        "PATCH",
        `/accounts/${accountId}/queues/${this.state.id}`,
        { settings: this.definition.settings }
      );
    } catch (e: any) {
      cli.output(`Queue settings PATCH failed: ${e?.message || e}`);
    }
  }

  private destroyQueue(): void {
    const accountId = this.definition.account_id;
    try {
      this.request("DELETE", `/accounts/${accountId}/queues/${this.state.id}`);
      cli.output(`🗑️ Deleted Queue ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404")) {
        cli.output(`Queue ${this.state.id} already gone`);
        return;
      }
      throw e;
    }
  }

  private findQueueByName(
    accountId: string,
    name: string
  ): any | null {
    try {
      const res = this.request<any>(
        "GET",
        `/accounts/${accountId}/queues`
      );
      const queues: any[] = res?.result || [];
      for (const q of queues) {
        if (q?.queue_name === name && q?.queue_id) return q;
      }
      return null;
    } catch {
      return null;
    }
  }
}
