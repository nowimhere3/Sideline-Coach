export interface BindingStore {
  load(): unknown;
  save(records: ControlledBindingRecord[]): Promise<void>;
}

export interface PendingPlayBinding {
  clientRef: string;
  turnRef?: string;
}

export interface ControlledBindingRecord {
  instanceId: string;
  playerType: string;
  seat: number;
  adapter: string;
  sessionRef: string;
  historyExpected: boolean;
  pendingPlay: PendingPlayBinding | null;
  gameId?: string;
}

export type RestorePlan =
  | { kind: 'restore'; record: ControlledBindingRecord }
  | { kind: 'needs-verification' | 'needs-decision'; record: ControlledBindingRecord; message: string };

const INSTANCE_PATTERN = /^(claude|codex|antigravity)-[0-9a-f]{8}$/;

export function isControlledBindingRecord(value: unknown): value is ControlledBindingRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if ((keys.length !== 7 && keys.length !== 8)
    || typeof record.instanceId !== 'string'
    || !INSTANCE_PATTERN.test(record.instanceId)
    || typeof record.playerType !== 'string'
    || record.playerType !== record.instanceId.slice(0, record.instanceId.indexOf('-'))
    || !Number.isSafeInteger(record.seat) || (record.seat as number) < 1
    || typeof record.adapter !== 'string' || !record.adapter
    || typeof record.sessionRef !== 'string' || record.sessionRef.length < 1 || record.sessionRef.length > 200
    || typeof record.historyExpected !== 'boolean'
    || !isPendingPlay(record.pendingPlay)) return false;
  if (keys.length === 8) {
    if (typeof record.gameId !== 'string' || !record.gameId || record.gameId.length > 100) return false;
  }
  return true;
}

export function planControlledRestores(
  stored: unknown,
  registeredAdapters: ReadonlySet<string>,
  activeGameId?: string
): RestorePlan[] {
  if (!Array.isArray(stored)) return [];
  const valid = stored.filter(isControlledBindingRecord).map(cloneRecord).sort((left, right) =>
    left.playerType.localeCompare(right.playerType)
    || left.seat - right.seat
    || left.instanceId.localeCompare(right.instanceId)
    || left.adapter.localeCompare(right.adapter)
    || left.sessionRef.localeCompare(right.sessionRef));
  const duplicateInstances = duplicateValues(valid.map((record) => record.instanceId));
  const duplicateSessions = duplicateValues(valid.map((record) => `${record.adapter}\u0000${record.sessionRef}`));

  return valid.map((record) => {
    if (duplicateInstances.has(record.instanceId)) {
      return { kind: 'needs-decision' as const, record, message: 'Duplicate controlled Player identity is quarantined.' };
    }
    if (duplicateSessions.has(`${record.adapter}\u0000${record.sessionRef}`)) {
      return { kind: 'needs-decision' as const, record, message: 'Two controlled Players claim the same provider conversation.' };
    }
    if (!registeredAdapters.has(record.adapter)) {
      return { kind: 'needs-verification' as const, record, message: `Controlled adapter '${record.adapter}' is not registered.` };
    }
    if (activeGameId && record.gameId && record.gameId !== activeGameId) {
      return {
        kind: 'needs-decision' as const,
        record,
        message: `Player conversation belongs to Game '${record.gameId}', but active Game is '${activeGameId}'.`
      };
    }
    if (activeGameId && !record.gameId && activeGameId !== 'unknown') {
      record.gameId = activeGameId;
    }
    return { kind: 'restore' as const, record };
  });
}

export function cloneRecord(record: ControlledBindingRecord): ControlledBindingRecord {
  return {
    instanceId: record.instanceId,
    playerType: record.playerType,
    seat: record.seat,
    adapter: record.adapter,
    sessionRef: record.sessionRef,
    historyExpected: record.historyExpected,
    pendingPlay: record.pendingPlay ? { ...record.pendingPlay } : null,
    ...(record.gameId ? { gameId: record.gameId } : {})
  };
}

function isPendingPlay(value: unknown): value is PendingPlayBinding | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pending = value as Record<string, unknown>;
  const keys = Object.keys(pending);
  return (keys.length === 1 || keys.length === 2)
    && keys.every((key) => key === 'clientRef' || key === 'turnRef')
    && validRef(pending.clientRef)
    && (pending.turnRef === undefined || validRef(pending.turnRef));
}

function validRef(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 200;
}

function duplicateValues(values: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}
