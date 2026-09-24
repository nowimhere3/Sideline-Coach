/**
 * Canonical Remote Access v1 tunnel wire contract. The host RelayClient and the reference
 * relay both import these types; there is no second protocol schema.
 */

// --- Relay → Host ---

export interface RelayChallengeFrame {
  t: 'challenge';
  /** 32 random bytes, base64url. */
  nonce: string;
}

export interface RelayReqFrame {
  t: 'req';
  /** crypto.randomUUID() minted by the relay. */
  id: string;
  method: string;
  /** Path plus query string. */
  path: string;
  /** Strict allowlisted headers only. */
  headers: Record<string, string>;
  /** UTF-8 body (<= 1 MiB). */
  body?: string;
  /** Binary body, base64. */
  bodyB64?: string;
}

export interface RelayCancelFrame {
  t: 'cancel';
  id: string;
}

export interface RelayPingFrame {
  t: 'ping';
  ts: number;
}

export interface RelayGoAwayFrame {
  t: 'goaway';
  /** e.g. 'superseded' | 'shutdown' | 'protocol_error' */
  reason: string;
}

export type RelayToHostFrame = RelayChallengeFrame | RelayReqFrame | RelayCancelFrame | RelayPingFrame | RelayGoAwayFrame;

// --- Host → Relay ---

export interface HostHelloFrame {
  t: 'hello';
  v: 1;
  /** 20-char lowercase base32. */
  hostPublicId: string;
  /** Raw 32-byte Ed25519 public key as 64 lowercase hex chars. */
  publicKey: string;
  /** base64url Ed25519 signature over the raw nonce bytes. */
  sig: string;
  client: string;
}

export interface HostHeadFrame {
  t: 'head';
  id: string;
  status: number;
  headers: Record<string, string>;
}

export interface HostDataFrame {
  t: 'data';
  id: string;
  chunk?: string;
  /** Binary chunk, base64. */
  chunkB64?: string;
}

export interface HostEndFrame {
  t: 'end';
  id: string;
}

export interface HostErrorFrame {
  t: 'error';
  id: string;
  code: string;
}

export interface HostPongFrame {
  t: 'pong';
  ts: number;
}

export type HostToRelayFrame = HostHelloFrame | HostHeadFrame | HostDataFrame | HostEndFrame | HostErrorFrame | HostPongFrame;

export type TunnelFrame = RelayToHostFrame | HostToRelayFrame;
