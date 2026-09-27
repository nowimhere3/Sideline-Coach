import * as crypto from 'node:crypto';
import type { ControlledBindingRecord } from './bindings';
import type { ProviderCapabilitySnapshot } from '../capability-types';

/**
 * `session-changed`: the caller required a specific provider conversation
 * (`expectedSessionKey`) and this Player no longer holds it. Refused before any
 * provider send, so nothing reached the other conversation.
 */
export type ControlRefusalReason = 'busy' | 'closed' | 'invalid' | 'unavailable' | 'needs-verification' | 'session-changed';

/**
 * Structured proof that THIS turn ended because the provider refused it on a usage or rate
 * limit. Adapters set it only from provider-emitted structured evidence scoped to the turn:
 *   codex-turn-error         the failed turn's certified `TurnError.codexErrorInfo`
 *                            (`usageLimitExceeded` | `rateLimitExceeded`)
 *   claude-rate-limit-event  a `rate_limit_event` inside this Play's own run, for this Play's
 *                            session, with `status: 'rejected'` and no covering overage
 * Never from failure text, never from account-level scarcity (HealthAuthority / AlarmEngine).
 * Absent means "not proven", not "not a limit".
 */
export interface ProviderLimitBlocker {
  readonly kind: 'provider-limit';
  /** Resource pool whose provider refused the turn (R1 pool identity). */
  readonly pool: string;
  /** Provider window id, only when the provider named it for this refusal. */
  readonly window?: string;
  /** Unix seconds, only when the provider stated it for this refusal. */
  readonly resetsAt?: number;
  readonly evidence: 'codex-turn-error' | 'claude-rate-limit-event';
  /** The provider's own code: `usageLimitExceeded`, `rateLimitExceeded`, or `rejected`. */
  readonly providerCode: string;
}

const BLOCKER_EVIDENCE: ReadonlySet<string> = new Set(['codex-turn-error', 'claude-rate-limit-event']);
const BOUNDED_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Validates a blocker that crossed a process or storage boundary. Anything malformed is dropped. */
export function parseProviderLimitBlocker(value: unknown): ProviderLimitBlocker | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== 'provider-limit' || typeof raw.pool !== 'string' || !BOUNDED_ID.test(raw.pool)) return undefined;
  if (typeof raw.evidence !== 'string' || !BLOCKER_EVIDENCE.has(raw.evidence)) return undefined;
  if (typeof raw.providerCode !== 'string' || !BOUNDED_ID.test(raw.providerCode)) return undefined;
  if (raw.window !== undefined && (typeof raw.window !== 'string' || !BOUNDED_ID.test(raw.window))) return undefined;
  if (raw.resetsAt !== undefined && (typeof raw.resetsAt !== 'number' || !Number.isSafeInteger(raw.resetsAt) || raw.resetsAt <= 0)) return undefined;
  return {
    kind: 'provider-limit',
    pool: raw.pool,
    ...(raw.window !== undefined ? { window: raw.window as string } : {}),
    ...(raw.resetsAt !== undefined ? { resetsAt: raw.resetsAt as number } : {}),
    evidence: raw.evidence as ProviderLimitBlocker['evidence'],
    providerCode: raw.providerCode
  };
}

/**
 * The one stable identity of a provider conversation that may leave Player Control: a digest
 * of the provider session ref. Enough to tell conversations apart, useless to resume one.
 * The same conversation (restored) keeps its key; a fresh conversation always gets a new one.
 */
export function providerSessionKey(providerSessionRef: string | undefined): string | undefined {
  if (!providerSessionRef) return undefined;
  return crypto.createHash('sha256').update(providerSessionRef).digest('hex').slice(0, 8);
}

/** Preconditions checked by the Player Control Host before anything reaches the provider. */
export interface DeliverPreconditions {
  /** Refuse with `session-changed` unless this Player still holds exactly this conversation. */
  readonly expectedSessionKey?: string;
}

export interface DeliverOptions {
  model?: string;
  effort?: string;
  /** Provider-native custom agent selection; execution policy remains adapter-owned. */
  agent?: string;
}

export type DeliveryOutcome =
  | { kind: 'accepted'; turnRef: string }
  | { kind: 'refused'; reason: ControlRefusalReason; message: string }
  | { kind: 'unknown'; reason: string };

/** Codex's certified Stage 1.17 authority. */
export interface CodexPlayerAuthority {
  approvalPolicy: 'never';
  sandbox: 'danger-full-access';
}

/** Restricted provider authority retained for the future "Ask for risky actions" setting. */
export interface AcceptEditsPlayerAuthority {
  permission: 'accept-edits';
}

/** Explicit human opt-in: the Coach-managed provider may execute without prompts. */
export interface FullAutonomyPlayerAuthority {
  permission: 'full-autonomy';
}

/** Provider-backed Scout authority: reconnaissance tools only, no Game mutation. */
export interface ReadOnlyScoutPlayerAuthority {
  permission: 'read-only-scout';
}

export type ProviderPlayerAuthority = AcceptEditsPlayerAuthority | FullAutonomyPlayerAuthority;
export type PlayerAuthority = CodexPlayerAuthority | ProviderPlayerAuthority | ReadOnlyScoutPlayerAuthority;

export function isCodexAuthority(authority: PlayerAuthority): authority is CodexPlayerAuthority {
  return (authority as CodexPlayerAuthority).approvalPolicy === 'never' && (authority as CodexPlayerAuthority).sandbox === 'danger-full-access';
}

export function isAcceptEditsAuthority(authority: PlayerAuthority): authority is AcceptEditsPlayerAuthority {
  return (authority as AcceptEditsPlayerAuthority).permission === 'accept-edits';
}

export function isFullAutonomyAuthority(authority: PlayerAuthority): authority is FullAutonomyPlayerAuthority {
  return (authority as FullAutonomyPlayerAuthority).permission === 'full-autonomy';
}

export function isProviderAuthority(authority: PlayerAuthority): authority is ProviderPlayerAuthority {
  return isAcceptEditsAuthority(authority) || isFullAutonomyAuthority(authority);
}

export function isReadOnlyScoutAuthority(authority: PlayerAuthority): authority is ReadOnlyScoutPlayerAuthority {
  return (authority as ReadOnlyScoutPlayerAuthority).permission === 'read-only-scout';
}

export interface ControlOpenRequest {
  instanceId: string;
  playerType: string;
  seat: number;
  gameRoot: string;
  gameId?: string;
  authority: PlayerAuthority;
}

export type ControlEvent =
  | { kind: 'channel'; state: 'ready' | 'exited' | 'lost'; summary: string }
  | { kind: 'turn'; state: 'accepted' | 'started' | 'completed' | 'failed' | 'interrupted' | 'unknown'; turnRef?: string; summary: string; blocker?: ProviderLimitBlocker }
  /** `streaming`: `summary` is a fragment of one message (e.g. a token delta), to be concatenated. */
  | { kind: 'progress'; category: 'message' | 'command' | 'tool'; summary: string; streaming?: boolean }
  | { kind: 'request'; state: 'declined'; summary: string }
  | { kind: 'settings'; model?: string; effort?: string; runtimeVersion: string };

export interface PlayerControl {
  readonly instanceId: string;
  readonly providerSessionRef: string;
  readonly runtimeVersion: string;
  readonly model?: string;
  readonly effort?: string;
  readonly state: 'ready' | 'active' | 'lost' | 'closed' | 'needs-verification';
  deliver(play: string, clientRef: string, options?: DeliverOptions): Promise<DeliveryOutcome>;
  close(): Promise<void>;
  onEvent(listener: (event: ControlEvent) => void): () => void;
  queryCapabilities?(): Promise<ProviderCapabilitySnapshot>;
  /**
   * Stop the running Play, where the provider mechanism truly supports it. Resolves
   * false when nothing was running. A stopped Play may have made partial changes.
   */
  interrupt?(): Promise<boolean>;
}

export interface PlayerControlFactory {
  readonly adapterId: string;
  open(request: ControlOpenRequest): Promise<PlayerControl>;
  restore(request: ControlOpenRequest, binding: ControlledBindingRecord): Promise<ControlRestoreOutcome>;
}

export type ControlOpenOutcome =
  | { kind: 'ready'; control: PlayerControl }
  | { kind: 'failed' | 'needs-sign-in' | 'needs-verification' | 'needs-decision'; message: string; /** Technical detail for Dev Mode; never Dad-facing. */ diagnostic?: string };

export type ReconciledPlayOutcome =
  | { kind: 'none' }
  | { kind: 'completed' | 'interrupted' | 'unknown'; summary: string }
  | { kind: 'failed'; summary: string };

export type ControlRestoreOutcome =
  | { kind: 'ready'; control: PlayerControl; reconciliation: ReconciledPlayOutcome; openedFresh: boolean }
  | {
      kind: 'needs-sign-in' | 'needs-verification' | 'needs-decision';
      message: string;
      /**
       * Provider capability truth observed from the same process before it closed.
       * A conversation that cannot be reopened says nothing about which models the
       * provider offers, so a failed restore must not erase that knowledge.
       */
      capabilities?: import('../capability-types').ProviderCapabilitySnapshot;
      /** Technical diagnostic detail preserved for Dev Mode, logging, and triage. */
      diagnostic?: string;
    };

export class ControlOpenError extends Error {
  /** `message` is Dad-facing; `diagnostic` carries technical detail (version, compatibility, reason) for Dev Mode. */
  constructor(readonly outcome: Exclude<ControlOpenOutcome['kind'], 'ready'>, message: string, readonly diagnostic?: string) {
    super(message);
    this.name = 'ControlOpenError';
  }
}

/**
 * Detects raw technical process/plumbing details that should never appear on customer-facing Player surfaces.
 */
export function containsTechnicalPlumbing(text: string): boolean {
  return /(?:command failed|powershell(?:\.exe)?|cmd(?:\.exe)?|\/bin\/(?:ba)?sh|get-command|convertto-json|\[pscustomobject\]|-erroraction|-nologo|-noprofile|\b(?:ENOENT|EACCES|EPERM|ECONNREFUSED|ECONNRESET)\b|\bspawn\b|exited with code|stdout closed|stderr closed|\b(?:stdout|stderr)\b|\bat\s+(?:[A-Za-z]:\\|\/|\w+\.))/i.test(text);
}

/**
 * Normalizes a message for customer-facing Player state by stripping raw command/process
 * plumbing and falling back to a clean, truthful summary if plumbing is detected.
 */
export function sanitizeCustomerMessage(message: string | undefined, fallback: string): string {
  if (!message || typeof message !== 'string') return fallback;
  const trimmed = message.trim();
  if (!trimmed || containsTechnicalPlumbing(trimmed)) return fallback;
  return trimmed;
}
