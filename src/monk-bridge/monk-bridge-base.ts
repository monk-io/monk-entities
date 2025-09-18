import { MonkEntity } from "monkec/base";
import secret from "secret";
import cli from "cli";
import monk from "monkrpc";

export interface MonkBridgeBaseDefinition {
  monkcode_secret_ref: string;
  allowed_methods?: string[];
}

export abstract class MonkBridgeBase<D extends MonkBridgeBaseDefinition, S extends object> extends MonkEntity<D, S> {
  protected client?: ReturnType<typeof monk.connect>;
  private allowed!: Set<string>;

  protected getBaseAllowedMethods(): ReadonlyArray<string> { return []; }

  protected override before(): void {
    const configured = Array.isArray(this.definition.allowed_methods)
      ? this.definition.allowed_methods.filter((m) => typeof m === "string")
      : undefined;
    const base = new Set(this.getBaseAllowedMethods());
    if (configured && configured.length > 0) for (const m of configured) base.add(m);
    this.allowed = base;
  }

  protected safeCall<T = unknown>(method: string, payload?: unknown): T {
    if (!this.allowed.has(method)) throw new Error(`Method not allowed by entity policy: ${method}`);
    this.debugRpc(method, payload);
    const c = this.ensureClient();
    return c.call<T>(method, payload);
  }

  protected isAllowed(method: string): boolean { return this.allowed.has(method); }

  protected ensureClient(): ReturnType<typeof monk.connect> {
    if (this.client) return this.client;
    const code = secret.get(this.definition.monkcode_secret_ref);
    if (!code) throw new Error(`Missing monkcode in secret: ${this.definition.monkcode_secret_ref}`);
    this.client = monk.connect({ monkcode: code });
    return this.client;
  }

  private debugRpc(method: string, payload: unknown): void {
    return; // enable to log all rpc calls
    try {
      const preview = this.payloadPreview(payload);
      if (preview === undefined) cli.output(`monk/rpc ${method}`);
      else cli.output(`monk/rpc ${method} ${preview}`);
    } catch {
      cli.output(`monk/rpc ${method}`);
    }
  }

  private payloadPreview(payload: unknown): string | undefined {
    if (payload === undefined || payload === null) return undefined;
    if (typeof payload !== "object") return JSON.stringify(payload);
    const keys = Object.keys(payload as Record<string, unknown>);
    const limit = 6;
    const obj: Record<string, unknown> = {};
    for (const k of keys.slice(0, limit)) {
      const v = (payload as Record<string, unknown>)[k];
      obj[k] = typeof v === "object" && v !== null ? "[object]" : v;
    }
    if (keys.length > limit) (obj as any).__truncated__ = true; // deno-lint-ignore no-explicit-any
    return JSON.stringify(obj);
  }
}


