import { action } from "monkec/base";
import cli from "cli";
import secret from "secret";
import {
  ResendEntity,
  type ResendEntityDefinition,
  type ResendEntityState,
} from "./resend-base.ts";

/**
 * Definition interface for a Resend API key.
 *
 * The API key value is returned by Resend *once* on create, and is
 * written to the Monk secret named by `token_secret_ref`. Subsequent
 * reads of the key from Resend are not possible — only metadata.
 *
 * Adoption: keys are matched by `name`. An adopted key cannot have its
 * token re-fetched, so `token_secret_ref` is set in state but the actual
 * secret value won't be touched on adopt — the operator is responsible
 * for the secret in that case.
 *
 * @see https://resend.com/docs/api-reference/api-keys/create-api-key
 * @interface ResendApiKeyDefinition
 */
export interface ResendApiKeyDefinition extends ResendEntityDefinition {
  /** @description Human-readable key name (≤50 chars) */
  name: string;
  /** @description Permission scope; default "sending_access" */
  permission?: "full_access" | "sending_access";
  /**
   * @description Restrict to a specific domain by id. Only valid with
   * `permission: "sending_access"`.
   */
  domain_id?: string;
  /**
   * @description Monk secret name to write the key value to. Required —
   * the API key has no purpose if not stored. Default: `resend-api-key-{name}`.
   */
  token_secret_ref?: string;
}

/**
 * State interface for a Resend API key.
 * @interface ResendApiKeyState
 */
export interface ResendApiKeyState extends ResendEntityState {
  /** @description Resend API key id */
  id?: string;
  /** @description Key name mirror */
  name?: string;
  /** @description Where the key token was written */
  token_secret_ref?: string;
  /** @description Created-at timestamp */
  created_at?: string;
}

/**
 * @description Resend API Key entity.
 * Creates a scoped API key on Resend and writes the returned token to a
 * Monk secret. Adopts existing keys by name (token NOT re-fetched —
 * Resend only returns it on create). Delete revokes the key.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `resend-api-token`) — Full Access needed
 *   to create scoped keys.
 * - Writes: `token_secret_ref` (defaults to `resend-api-key-{name}`).
 *
 * ## Actions
 * - `list-keys` — list all keys on the account
 */
export class ResendApiKey extends ResendEntity<
  ResendApiKeyDefinition,
  ResendApiKeyState
> {
  static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

  override create(): void {
    const tokenSecretRef = this.tokenSecretRef();

    const existing = this.findByName(this.definition.name);
    if (existing?.id) {
      this.state = {
        id: existing.id,
        name: existing.name || this.definition.name,
        token_secret_ref: tokenSecretRef,
        created_at: existing.created_at,
        existing: true,
      };
      cli.output(
        `🔑 Adopted existing Resend API key ${existing.name} (${existing.id}); ` +
          `token not re-fetched.`
      );
      return;
    }

    const body: any = {
      name: this.definition.name,
      permission: this.definition.permission || "sending_access",
    };
    if (this.definition.domain_id) body.domain_id = this.definition.domain_id;

    const created = this.request<any>("POST", "/api-keys", body);
    const token = created?.token;
    if (!token) {
      throw new Error(
        `Resend API key created (id=${created?.id}) but response had no token field`
      );
    }
    secret.set(tokenSecretRef, token);

    this.state = {
      id: created?.id,
      name: this.definition.name,
      token_secret_ref: tokenSecretRef,
      created_at: created?.created_at,
      existing: false,
    };
    cli.output(
      `✅ Created Resend API key ${this.definition.name} (${this.state.id}); ` +
        `token written to secret ${tokenSecretRef}`
    );
  }

  override update(): void {
    if (!this.state.id) {
      this.create();
      return;
    }
    // API keys are immutable except for delete-and-recreate. No-op.
  }

  override delete(): void {
    if (!this.state.id) return;
    if (this.state.existing) {
      cli.output("API key existed before this entity; skipping delete");
      return;
    }
    try {
      this.request("DELETE", `/api-keys/${this.state.id}`);
      cli.output(`🗑️ Revoked Resend API key ${this.state.id}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("404")) {
        cli.output(`API key ${this.state.id} already gone`);
        return;
      }
      throw e;
    }
  }

  override checkReadiness(): boolean {
    return Boolean(this.state.id);
  }

  @action("list-keys")
  listKeys(): void {
    const res = this.request<any>("GET", "/api-keys");
    cli.output(JSON.stringify(res?.data || res || [], null, 2));
  }

  private tokenSecretRef(): string {
    return (
      this.definition.token_secret_ref ||
      `resend-api-key-${this.definition.name}`
    );
  }

  private findByName(name: string): any | null {
    try {
      const res = this.request<any>("GET", "/api-keys");
      const list: any[] = res?.data || [];
      for (const k of list) {
        if (k?.name === name && k?.id) return k;
      }
      return null;
    } catch {
      return null;
    }
  }
}
