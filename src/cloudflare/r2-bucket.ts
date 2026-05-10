import { action } from "monkec/base";
import cli from "cli";
import { CloudflareEntity, type CloudflareEntityDefinition, type CloudflareEntityState } from "./cloudflare-base.ts";

/**
 * Definition interface for Cloudflare R2 Bucket entity.
 * Manages an R2 bucket within a Cloudflare account.
 * @see https://developers.cloudflare.com/api/operations/r2-create-bucket
 * @interface CloudflareR2BucketDefinition
 */
export interface CloudflareR2BucketDefinition extends CloudflareEntityDefinition {
  /** @description Cloudflare account ID that owns the bucket */
  account_id: string;
  /** @description Bucket name (3-63 chars, S3-compatible). Canonical R2 identifier. */
  name: string;
  /** @description Optional region hint at create time */
  location_hint?: "wnam" | "enam" | "weur" | "eeur" | "apac";
  /** @description Storage class; defaults to Standard */
  storage_class?: "Standard" | "InfrequentAccess";
  /**
   * @description If true, delete() will destroy the bucket. Defaults to false (no-op delete).
   * @default false
   */
  allow_destructive_delete?: boolean;
}

/**
 * State interface for Cloudflare R2 Bucket entity.
 * @interface CloudflareR2BucketState
 */
export interface CloudflareR2BucketState extends CloudflareEntityState {
  /** @description Bucket name; canonical R2 identifier */
  id?: string;
  /** @description S3-compatible endpoint URL for SDK consumers */
  endpoint?: string;
  /** @description ISO-8601 timestamp the bucket was created */
  created_on?: string;
  /** @description Active location echoed back by Cloudflare */
  location?: string;
  /** @description Active storage class */
  storage_class?: string;
}

/**
 * @description Cloudflare R2 Bucket entity.
 * Detects-then-creates an R2 bucket in the given account. Adopts pre-existing
 * buckets by name. delete() is a no-op by default; opt in with
 * `allow_destructive_delete: true` or call the `force-delete` action.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `cloudflare-api-token`) — needs
 *   `Workers R2 Storage:Edit` permission.
 * - Writes: none.
 *
 * ## State Fields for Composition
 * - `state.id` - Bucket name; pass to S3 SDK consumers as the bucket key
 * - `state.endpoint` - `https://{account_id}.r2.cloudflarestorage.com`
 *
 * ## Actions
 * - `get-info` - Fetch bucket metadata
 * - `force-delete` - Explicit destructive delete (refuses if state.existing)
 */
export class CloudflareR2Bucket extends CloudflareEntity<CloudflareR2BucketDefinition, CloudflareR2BucketState> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const accountId = this.definition.account_id;
    const name = this.definition.name;

    const existing = this.findBucket(accountId, name);
    if (existing) {
      this.state = {
        id: name,
        endpoint: this.endpointFor(accountId),
        created_on: existing.creation_date || existing.created_on,
        location: existing.location,
        storage_class: existing.storage_class,
        existing: true,
      };
      cli.output(`📦 Adopted existing R2 bucket ${name}`);
      return;
    }

    const payload: Record<string, unknown> = { name };
    if (this.definition.location_hint) payload.locationHint = this.definition.location_hint;
    if (this.definition.storage_class) payload.storageClass = this.definition.storage_class;

    const created = this.request<any>("POST", `/accounts/${accountId}/r2/buckets`, payload);
    const result = created?.result || {};

    this.state = {
      id: name,
      endpoint: this.endpointFor(accountId),
      created_on: result.creation_date || result.created_on,
      location: result.location,
      storage_class: result.storage_class || this.definition.storage_class || "Standard",
      existing: false,
    };
    cli.output(`✅ Created R2 bucket ${name}`);
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    // Bucket settings (name, location, storage class) are immutable post-create.
    // Refresh metadata so state stays consistent with provider.
    try {
      const accountId = this.definition.account_id;
      const info = this.request<any>("GET", `/accounts/${accountId}/r2/buckets/${this.state.id}`);
      const r = info?.result;
      if (r) {
        this.state.location = r.location || this.state.location;
        this.state.storage_class = r.storage_class || this.state.storage_class;
        this.state.created_on = r.creation_date || r.created_on || this.state.created_on;
        this.state.endpoint = this.endpointFor(accountId);
      }
    } catch {
      // ignore refresh errors; keep prior state
    }
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("Bucket existed before this entity; skipping delete");
      return;
    }
    if (!this.definition.allow_destructive_delete) {
      cli.output(
        `R2 bucket ${this.state.id} delete is disabled. Set allow_destructive_delete: true ` +
          `or invoke the force-delete action to remove it.`
      );
      return;
    }
    this.destroyBucket();
  }

  override checkReadiness(): boolean {
    return Boolean(this.state.id);
  }

  @action("get-info")
  getInfo(): void {
    if (!this.state.id) {
      cli.output("No bucket yet");
      return;
    }
    const accountId = this.definition.account_id;
    const res = this.request<any>("GET", `/accounts/${accountId}/r2/buckets/${this.state.id}`);
    cli.output(JSON.stringify(res?.result || {}, null, 2));
  }

  @action("force-delete")
  forceDelete(): void {
    if (!this.state.id) {
      cli.output("No bucket to delete");
      return;
    }
    if (this.state.existing) {
      cli.output(
        `Refusing force-delete: bucket ${this.state.id} pre-existed and was adopted. ` +
          `Delete it manually if intentional.`
      );
      return;
    }
    this.destroyBucket();
  }

  private destroyBucket(): void {
    const accountId = this.definition.account_id;
    try {
      this.request("DELETE", `/accounts/${accountId}/r2/buckets/${this.state.id}`);
      cli.output(`🗑️ Deleted R2 bucket ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      // Tolerate already-gone bucket (force-delete then lifecycle delete, or
      // out-of-band deletion).
      if (msg.includes("404") || msg.includes("10006")) {
        cli.output(`R2 bucket ${this.state.id} already gone`);
        return;
      }
      throw e;
    }
  }

  private endpointFor(accountId: string): string {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  private findBucket(accountId: string, name: string): any | null {
    try {
      const res = this.request<any>("GET", `/accounts/${accountId}/r2/buckets/${name}`);
      return res?.result || null;
    } catch {
      return null;
    }
  }
}
