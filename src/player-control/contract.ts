import type { ControlledBindingRecord } from './bindings';

export type ControlRefusalReason = 'busy' | 'closed' | 'invalid' | 'unavailable' | 'needs-verification';

export type DeliveryOutcome =
  | { kind: 'accepted'; turnRef: string }
  | { kind: 'refused'; reason: ControlRefusalReason; message: string }
  | { kind: 'unknown'; reason: string };

export interface PlayerAuthority {
  approvalPolicy: 'never';
  sandbox: 'danger-full-access';
}

export interface ControlOpenRequest {
  instanceId: string;
  playerType: string;
  seat: number;
  gameRoot: string;
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
  deliver(play: string, clientRef: string): Promise<DeliveryOutcome>;
  close(): Promise<void>;
  onEvent(listener: (event: ControlEvent) => void): () => void;
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
  | { kind: 'needs-sign-in' | 'needs-verification' | 'needs-decision'; message: string };

export class ControlOpenError extends Error {
  constructor(readonly outcome: Exclude<ControlOpenOutcome['kind'], 'ready'>, message: string) {
    super(message);
    this.name = 'ControlOpenError';
  }
}
