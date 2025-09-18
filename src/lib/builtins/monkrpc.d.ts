/**
 * Monk RPC client module exposed in the Goja runtime
 */
declare module "monkrpc" {
  /** Options to establish a connection to a Monk cluster */
  export interface ConnectOptions {
    /** Encoded monkcode (preferred). Example: "monk://..." */
    monkcode?: string;
    /** Optional bearer token to set immediately after connect */
    token?: string;

    /** Explicit P2P connect parameters (alternative to monkcode) */
    id?: string;
    password?: string;
    peers?: string[];

    /** Local socket connect alternative */
    socket?: string;

    /** SSH tunnel alternative */
    ssh?: {
      host: string;
      port: number;
      username: string;
      identity: string;
    };
  }

  /** Minimal client surface available in Goja */
  export interface MonkClient {
    /** Updates access token in the underlying RPC context */
    setToken(token: string): void;
    /** Calls an RPC method with an optional payload, returns result */
    call<T = any>(method: string, payload?: any): T;
  }

  /**
   * Connect to a Monk cluster. Returns a client with `setToken` and `call` methods.
   */
  export function connect(opts: ConnectOptions): MonkClient;

  const _default: { connect: typeof connect };
  export default _default;
}


