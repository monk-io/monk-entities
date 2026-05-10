import { action } from "monkec/base";
import cli from "cli";
import {
  CloudflareEntity,
  type CloudflareEntityDefinition,
  type CloudflareEntityState,
} from "./cloudflare-base.ts";

/**
 * Definition interface for a Cloudflare Workers cron trigger.
 * Owns the full cron list for a Worker script — applying this entity is a
 * full-replace of the script's `/schedules`. Don't mix with crons managed
 * by wrangler.toml; this entity will clobber them.
 * @see https://developers.cloudflare.com/api/operations/worker-cron-trigger-update-cron-triggers
 * @interface CloudflareWorkersCronTriggerDefinition
 */
export interface CloudflareWorkersCronTriggerDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare account ID */
  account_id: string;
  /** @description Worker script name whose cron list this entity owns */
  script_name: string;
  /**
   * @description List of cron expressions (standard 5-field UTC).
   * An empty list disables all crons on the script.
   */
  crons: string[];
}

/**
 * State interface for a Cloudflare Workers cron trigger.
 * @interface CloudflareWorkersCronTriggerState
 */
export interface CloudflareWorkersCronTriggerState extends CloudflareEntityState {
  /** @description Synthetic id: "{account_id}/{script_name}" */
  id?: string;
  /** @description Most recently applied cron list */
  applied_crons?: string[];
}

/**
 * @description Cloudflare Workers Cron Trigger entity.
 * Manages the cron schedule list for a Worker script via the
 * `PUT /schedules` endpoint (full-replace semantics — this entity owns
 * the entire list). Adoption: any pre-existing list with the same set of
 * cron strings is treated as adopted; otherwise a PUT is issued on create.
 * Delete clears the schedule list (PUT []) unless `state.existing` is true.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `Workers Scripts: Edit` scope on the account.
 *
 * ## Actions
 * - `get-schedules` — list current schedules from Cloudflare
 * - `apply` — re-apply the configured cron list (useful after script swap)
 */
export class CloudflareWorkersCronTrigger extends CloudflareEntity<
  CloudflareWorkersCronTriggerDefinition,
  CloudflareWorkersCronTriggerState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const accountId = this.definition.account_id;
    const scriptName = this.definition.script_name;
    const desired: string[] = ((this.definition.crons as any) || []).slice();

    const current = this.getSchedules(accountId, scriptName);
    const currentList = (current || []).map((s) => s.cron).filter(Boolean);

    if (
      currentList.length > 0 &&
      this.sameSet(currentList, desired)
    ) {
      this.state = {
        id: `${accountId}/${scriptName}`,
        applied_crons: currentList,
        existing: true,
      };
      cli.output(
        `⏰ Adopted existing cron schedule on ${scriptName}: [${currentList.join(", ")}]`
      );
      return;
    }

    this.putSchedules(accountId, scriptName, desired);
    this.state = {
      id: `${accountId}/${scriptName}`,
      applied_crons: desired.slice(),
      existing: false,
    };
    cli.output(
      `✅ Applied ${desired.length} cron(s) on ${scriptName}: [${desired.join(", ")}]`
    );
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    const accountId = this.definition.account_id;
    const scriptName = this.definition.script_name;
    const desired: string[] = ((this.definition.crons as any) || []).slice();

    if (
      this.state.applied_crons &&
      this.sameSet(this.state.applied_crons, desired)
    ) {
      return;
    }
    this.putSchedules(accountId, scriptName, desired);
    this.state.applied_crons = desired.slice();
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Cron schedule existed before this entity; skipping delete");
      return;
    }
    const accountId = this.definition.account_id;
    const scriptName = this.definition.script_name;
    try {
      this.putSchedules(accountId, scriptName, []);
      cli.output(`🗑️ Cleared cron schedule on ${scriptName}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404") || msg.includes("10007")) {
        cli.output(`Script ${scriptName} already gone; nothing to clear`);
        return;
      }
      throw e;
    }
  }

  override checkReadiness(): boolean {
    return Boolean(this.state.id);
  }

  @action("get-schedules")
  getSchedulesAction(): void {
    const accountId = this.definition.account_id;
    const scriptName = this.definition.script_name;
    const schedules = this.getSchedules(accountId, scriptName);
    cli.output(JSON.stringify(schedules || [], null, 2));
  }

  @action("apply")
  apply(): void {
    const accountId = this.definition.account_id;
    const scriptName = this.definition.script_name;
    const desired: string[] = ((this.definition.crons as any) || []).slice();
    this.putSchedules(accountId, scriptName, desired);
    this.state.applied_crons = desired.slice();
    cli.output(`✅ Re-applied cron schedule on ${scriptName}`);
  }

  private getSchedules(
    accountId: string,
    scriptName: string
  ): Array<{ cron: string }> {
    try {
      const res = this.request<any>(
        "GET",
        `/accounts/${accountId}/workers/scripts/${scriptName}/schedules`
      );
      const result = res?.result;
      if (Array.isArray(result)) return result;
      if (Array.isArray(result?.schedules)) return result.schedules;
      return [];
    } catch {
      return [];
    }
  }

  private putSchedules(
    accountId: string,
    scriptName: string,
    crons: string[]
  ): void {
    const body = crons.map((c) => ({ cron: c }));
    this.request<any>(
      "PUT",
      `/accounts/${accountId}/workers/scripts/${scriptName}/schedules`,
      body
    );
  }

  private sameSet(
    a: readonly string[],
    b: readonly string[]
  ): boolean {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return false;
    }
    return true;
  }
}
