import { action } from "monkec/base";
import cli from "cli";
import {
  CloudflareEntity,
  type CloudflareEntityDefinition,
  type CloudflareEntityState,
} from "./cloudflare-base.ts";

/**
 * Definition interface for a Cloudflare Queue Worker consumer.
 * Binds a Worker script as the consumer for a queue. One worker consumer
 * per queue (CF API constraint).
 * @see https://developers.cloudflare.com/api/resources/queues/subresources/consumers/methods/create/
 * @interface CloudflareQueueConsumerDefinition
 */
export interface CloudflareQueueConsumerDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare account ID */
  account_id: string;
  /** @description Cloudflare queue ID (typically wired via connection-target) */
  queue_id: string;
  /**
   * @description Consumer type. "worker" binds a script; "http_pull" enables
   * the REST pull API on the queue. Default: "worker".
   */
  consumer_type?: "worker" | "http_pull";
  /**
   * @description Worker script name that will receive messages. Required
   * for `consumer_type: "worker"`; ignored for `"http_pull"`.
   */
  script_name?: string;
  /** @description Optional consumer delivery settings */
  settings?: {
    /** @description Max messages per batch */
    batch_size?: number;
    /** @description Max concurrent invocations */
    max_concurrency?: number;
    /** @description Retries before dead-letter / drop */
    max_retries?: number;
    /** @description Max wait (ms) before delivering a partial batch */
    max_wait_time_ms?: number;
    /** @description Delay (s) before retrying a failed message */
    retry_delay?: number;
  };
  /** @description Optional dead-letter queue name */
  dead_letter_queue?: string;
}

/**
 * State interface for a Cloudflare Queue consumer.
 * @interface CloudflareQueueConsumerState
 */
export interface CloudflareQueueConsumerState extends CloudflareEntityState {
  /** @description Cloudflare consumer ID */
  id?: string;
  /** @description Queue ID this consumer is bound to */
  queue_id?: string;
  /** @description Worker script name (mirror for diagnostics) */
  script_name?: string;
}

/**
 * @description Cloudflare Queue Consumer entity.
 * Binds a Worker script as the consumer for a queue. Adopts existing
 * consumers by matching `(queue_id, script_name)`. Delete removes the
 * binding (the script and queue are untouched). Adopted consumers
 * (`state.existing = true`) are skipped on delete.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `Workers Queues: Edit` scope on the account.
 *
 * ## Actions
 * - `get-info` — print the consumer record
 * - `list-consumers` — list all consumers on the bound queue (debugging)
 */
export class CloudflareQueueConsumer extends CloudflareEntity<
  CloudflareQueueConsumerDefinition,
  CloudflareQueueConsumerState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const accountId = this.definition.account_id;
    const queueId = this.definition.queue_id;
    const type = this.definition.consumer_type || "worker";
    const scriptName = this.definition.script_name;

    if (type === "worker" && !scriptName) {
      throw new Error("script_name is required when consumer_type is 'worker'");
    }

    const existing = this.findConsumer(accountId, queueId, type, scriptName);
    if (existing?.consumer_id) {
      this.state = {
        id: existing.consumer_id,
        queue_id: queueId,
        script_name: scriptName,
        existing: true,
      };
      cli.output(
        `🔗 Adopted existing queue consumer ${existing.consumer_id} (${type}${scriptName ? ` → ${scriptName}` : ""})`
      );
      return;
    }

    const body: any = { type };
    if (type === "worker") body.script_name = scriptName;
    if (this.definition.settings) body.settings = this.definition.settings;
    if (this.definition.dead_letter_queue) {
      body.dead_letter_queue = this.definition.dead_letter_queue;
    }

    const created = this.request<any>(
      "POST",
      `/accounts/${accountId}/queues/${queueId}/consumers`,
      body
    );
    const result = created?.result || {};
    this.state = {
      id: result.consumer_id || result.id,
      queue_id: queueId,
      script_name: scriptName,
      existing: false,
    };
    cli.output(
      `✅ Bound queue consumer (${type}): ${scriptName || "http_pull"} → queue ${queueId} (${this.state.id})`
    );
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    const accountId = this.definition.account_id;
    const queueId = this.definition.queue_id;

    const type = this.definition.consumer_type || "worker";
    const body: any = { type };
    if (type === "worker") body.script_name = this.definition.script_name;
    if (this.definition.settings) body.settings = this.definition.settings;
    if (this.definition.dead_letter_queue) {
      body.dead_letter_queue = this.definition.dead_letter_queue;
    }

    try {
      this.request<any>(
        "PATCH",
        `/accounts/${accountId}/queues/${queueId}/consumers/${this.state.id}`,
        body
      );
    } catch (e: any) {
      cli.output(`Consumer PATCH failed: ${e?.message || e}`);
    }
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Consumer existed before this entity; skipping delete");
      return;
    }
    const accountId = this.definition.account_id;
    const queueId = this.definition.queue_id;
    try {
      this.request(
        "DELETE",
        `/accounts/${accountId}/queues/${queueId}/consumers/${this.state.id}`
      );
      cli.output(`🗑️ Deleted queue consumer ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404")) {
        cli.output(`Consumer ${this.state.id} already gone`);
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
      cli.output("No consumer yet");
      return;
    }
    const accountId = this.definition.account_id;
    const queueId = this.definition.queue_id;
    const res = this.request<any>(
      "GET",
      `/accounts/${accountId}/queues/${queueId}/consumers`
    );
    const consumers: any[] = res?.result || [];
    const match = consumers.find(
      (c) => (c.consumer_id || c.id) === this.state.id
    );
    cli.output(JSON.stringify(match || { consumers }, null, 2));
  }

  @action("list-consumers")
  listConsumers(): void {
    const accountId = this.definition.account_id;
    const queueId = this.definition.queue_id;
    const res = this.request<any>(
      "GET",
      `/accounts/${accountId}/queues/${queueId}/consumers`
    );
    cli.output(JSON.stringify(res?.result || [], null, 2));
  }

  private findConsumer(
    accountId: string,
    queueId: string,
    type: "worker" | "http_pull",
    scriptName?: string
  ): any | null {
    try {
      const res = this.request<any>(
        "GET",
        `/accounts/${accountId}/queues/${queueId}/consumers`
      );
      const consumers: any[] = res?.result || [];
      for (const c of consumers) {
        const cid = c?.consumer_id || c?.id;
        if (!cid) continue;
        const cType = c?.type || (c?.script_name ? "worker" : "http_pull");
        if (type === "worker") {
          if (cType === "worker" && c?.script_name === scriptName) {
            return { ...c, consumer_id: cid };
          }
        } else {
          if (cType === "http_pull") return { ...c, consumer_id: cid };
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
