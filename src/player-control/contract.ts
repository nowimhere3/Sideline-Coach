import type { ControlledBindingRecord } from './bindings';
import type { ProviderCapabilitySnapshot } from '../capability-types';

export type ControlRefusalReason = 'busy' | 'closed' | 'invalid' | 'unavailable' | 'needs-verification';

export interface DeliverOptions {
  model?: string;
  effort?: string;
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

export type ProviderPlayerAuthority = AcceptEditsPlayerAuthority | FullAutonomyPlayerAuthority;
export type PlayerAuthority = CodexPlayerAuthority | ProviderPlayerAuthority;

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
  | { kind: 'turn'; state: 'accepted' | 'started' | 'completed' | 'failed' | 'interrupted' | 'unknown'; turnRef?: string; summary: string }
  | { kind: 'progress'; category: 'message' | 'command' | 'tool'; summary: string }
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
  | { kind: 'failed' | 'needs-sign-in' | 'needs-verification' | 'needs-decision'; message: string };

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
    };

export class ControlOpenError extends Error {
  constructor(readonly outcome: Exclude<ControlOpenOutcome['kind'], 'ready'>, message: string) {
    super(message);
    this.name = 'ControlOpenError';
  }
}
