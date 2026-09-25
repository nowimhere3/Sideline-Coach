import type { InstanceLedgerEntry, LedgerRecentPlay, LedgerReportLink } from './work-ledger';
import { REPORT_GRACE_MS } from './work-ledger';

export type ExecutionState =
  | 'idle'
  | 'starting'
  | 'working'
  | 'queued'
  | 'waiting-capacity'
  | 'needs-you'
  | 'finished'
  | 'couldnt-finish'
  | 'unknown';

export type QueueReasonKind = 'own-current-play' | 'waiting-for-player' | 'unspecified';

export interface QueuedExecutionItem {
  readonly state: 'queued' | 'dispatching' | 'needs-attention';
  readonly attention?: string;
  readonly reasonKind?: QueueReasonKind;
  readonly waitingOnName?: string;
}

export interface ExecutionView {
  readonly instanceId: string;
  readonly state: ExecutionState;
  readonly revision: number;
  readonly playRef?: string;
  readonly summary?: string;
  readonly activitySummary?: string;
  readonly executionStartedAt?: number;
  readonly finishedAt?: number;
  readonly durationMs?: number;
  readonly report?: { readonly path: string; readonly filename?: string; readonly acknowledged: boolean };
  readonly awaitingReport?: boolean;
  readonly queue?: {
    readonly count: number;
    readonly head?: { readonly reasonKind: QueueReasonKind; readonly waitingOnName?: string };
  };
  readonly detail?: string;
  readonly executionType?: 'reasoning' | 'direct-shell' | 'scout-formation';
  readonly observed?: boolean;
}

export interface ProjectExecutionInput {
  readonly instanceId: string;
  readonly entry?: InstanceLedgerEntry;
  readonly pendingDispatch?: boolean;
  readonly queued?: readonly QueuedExecutionItem[];
  readonly controlState?: string;
  /** Reserved seam for Usage Sentinel; Slice A has no runtime producer. */
  readonly waitingCapacity?: boolean;
  readonly executionType?: 'reasoning' | 'direct-shell' | 'scout-formation';
  readonly now: number;
}

/** Pure Dad-neutral execution projection. First applicable semantic state wins. */
export function projectExecution(input: ProjectExecutionInput): ExecutionView {
  const entry = input.entry;
  const queued = input.queued ?? [];
  const latest = entry?.recentPlays[0];
  const queue = projectQueue(queued, Boolean(entry?.currentPlay));
  const base = {
    instanceId: input.instanceId,
    revision: entry?.revision ?? 0,
    ...(queue ? { queue } : {}),
    ...(input.executionType ? { executionType: input.executionType } : {})
  };

  const attention = queued.find((item) => item.state === 'needs-attention');
  const controlNeedsHuman = Boolean(entry?.currentPlay)
    && (input.controlState === 'needs-sign-in' || input.controlState === 'needs-decision');
  if (attention || controlNeedsHuman) {
    return {
      ...base,
      state: 'needs-you',
      playRef: entry?.currentPlay?.clientRef,
      summary: entry?.currentPlay?.promptSummary,
      ...(entry?.currentPlay?.activitySummary ? { activitySummary: entry.currentPlay.activitySummary } : {}),
      detail: attention?.attention ?? 'Coach needs your decision before this Player can continue.'
    };
  }

  if (entry?.workState === 'working' && (!entry.currentPlay || entry.currentPlay.executionStartedAt !== undefined)) {
    return {
      ...base,
      state: 'working',
      playRef: entry.currentPlay?.clientRef,
      summary: entry.currentPlay?.promptSummary,
      ...(entry.currentPlay?.activitySummary ? { activitySummary: entry.currentPlay.activitySummary } : {}),
      executionStartedAt: entry.currentPlay?.executionStartedAt
    };
  }

  if (input.pendingDispatch || (entry?.workState === 'working' && entry.currentPlay)) {
    return {
      ...base,
      state: 'starting',
      playRef: entry?.currentPlay?.clientRef,
      summary: entry?.currentPlay?.promptSummary,
      ...(entry?.currentPlay?.activitySummary ? { activitySummary: entry.currentPlay.activitySummary } : {})
    };
  }

  if (input.waitingCapacity) return { ...base, state: 'waiting-capacity' };
  if (queued.length) return { ...base, state: 'queued' };

  if (entry?.workState === 'unknown' || entry?.workState === 'disconnected') {
    const unknown = latest?.outcome === 'unknown' ? latest : undefined;
    if (!unknown || unknown.acknowledgedAt === undefined) {
      if (unknown) return terminalView(base, 'unknown', unknown, reportFor(entry?.reports, unknown), input.now);
      const isUnobserved = entry.currentPlay?.observed === false;
      return {
        ...base,
        state: 'unknown',
        playRef: entry.currentPlay?.clientRef,
        summary: entry.currentPlay?.promptSummary,
        executionStartedAt: entry.currentPlay?.executionStartedAt,
        ...(entry.currentPlay?.observed !== undefined ? { observed: entry.currentPlay.observed } : {}),
        detail: isUnobserved
          ? 'Command sent to terminal · execution unobserved'
          : 'Coach cannot confirm the current status of this Player.'
      };
    }
  }

  if (latest && ['blocked', 'failed', 'interrupted', 'not-sent'].includes(latest.outcome) && latest.acknowledgedAt === undefined) {
    return terminalView(base, 'couldnt-finish', latest, reportFor(entry?.reports, latest), input.now);
  }

  if (latest?.outcome === 'completed' || latest?.outcome === 'partial') {
    const report = reportFor(entry?.reports, latest);
    if (report && report.acknowledgedAt === undefined) return terminalView(base, 'finished', latest, report, input.now);
    const reportExpected = latest.reportRequested ?? (input.executionType === 'scout-formation');
    if (!report && reportExpected && input.now <= latest.finishedAt + REPORT_GRACE_MS) {
      return { ...terminalView(base, 'finished', latest, undefined, input.now), awaitingReport: true };
    }
    if (!report && !reportExpected && input.now <= latest.finishedAt + REPORT_GRACE_MS) {
      return terminalView(base, 'finished', latest, undefined, input.now);
    }
  }

  return { ...base, state: 'idle' };
}

function projectQueue(items: readonly QueuedExecutionItem[], hasCurrentPlay: boolean): ExecutionView['queue'] | undefined {
  if (!items.length) return undefined;
  const head = items[0];
  return {
    count: items.length,
    head: {
      reasonKind: head.reasonKind ?? (hasCurrentPlay ? 'own-current-play' : 'unspecified'),
      ...(head.waitingOnName ? { waitingOnName: head.waitingOnName } : {})
    }
  };
}

function reportFor(reports: readonly LedgerReportLink[] | undefined, play: LedgerRecentPlay | undefined): LedgerReportLink | undefined {
  if (!play) return undefined;
  return reports?.find((report) => report.clientRef === play.clientRef);
}

function terminalView(
  base: Pick<ExecutionView, 'instanceId' | 'revision' | 'queue' | 'executionType'>,
  state: 'unknown' | 'couldnt-finish' | 'finished',
  play: LedgerRecentPlay | undefined,
  report: LedgerReportLink | undefined,
  now: number
): ExecutionView {
  const executionStartedAt = play?.executionStartedAt;
  const finishedAt = play?.finishedAt;
  return {
    ...base,
    state,
    playRef: play?.clientRef,
    summary: play?.promptSummary,
    ...(play?.activitySummary ? { activitySummary: play.activitySummary } : {}),
    ...(executionStartedAt !== undefined ? { executionStartedAt } : {}),
    ...(play?.observed !== undefined ? { observed: play.observed } : {}),
    finishedAt,
    durationMs: executionStartedAt !== undefined && finishedAt !== undefined && play?.observed !== false
      ? Math.max(0, finishedAt - executionStartedAt)
      : undefined,
    report: report ? { path: report.path, filename: report.filename, acknowledged: report.acknowledgedAt !== undefined } : undefined,
    detail: state === 'unknown'
      ? (play?.observed === false ? 'Command sent to terminal · execution unobserved' : (play?.summary ?? 'Coach cannot confirm how this Play ended.'))
      : play?.summary
  };
}
