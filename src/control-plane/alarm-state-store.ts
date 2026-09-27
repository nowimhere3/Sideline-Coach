import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const ALARM_STATE_SCHEMA_VERSION = 1;

export type AlarmRuleState = 'NORMAL' | 'LOW' | 'CRITICAL' | 'UNKNOWN';

export interface PersistedAlarmRuleState {
  readonly state: AlarmRuleState;
  readonly enteredAt: string;
  readonly lastEventType?: string;
  readonly lastEventId?: string;
  readonly lastFiredAt?: string;
  /** Canonical absolute reset timestamp retained only for clock-horizon reconciliation. */
  readonly horizonResetsAt?: number;
  /** The reset-cycle timestamp is the durable reset-event dedupe token. */
  readonly lastProcessedResetCycle?: number;
}

export interface AlarmStateSnapshot {
  readonly schemaVersion: typeof ALARM_STATE_SCHEMA_VERSION;
  readonly rules: Record<string, PersistedAlarmRuleState>;
}

export interface AlarmStateStore {
  load(): AlarmStateSnapshot;
  save(snapshot: AlarmStateSnapshot): void;
}

export function emptyAlarmState(): AlarmStateSnapshot {
  return { schemaVersion: ALARM_STATE_SCHEMA_VERSION, rules: {} };
}

export function defaultAlarmStatePath(): string {
  return path.join(os.homedir(), '.sideline', 'alarm-state.json');
}

export function fileAlarmStateStore(
  file = defaultAlarmStatePath(),
  warn: (message: string) => void = () => undefined
): AlarmStateStore {
  return {
    load: () => {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
        if (validAlarmState(parsed)) return structuredClone(parsed);
        warn('AI alarm state was ignored because its schema was unsupported or malformed.');
        quarantine(file, warn);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          warn(`AI alarm state could not be read: ${messageOf(error)}`);
          quarantine(file, warn);
        }
      }
      return emptyAlarmState();
    },
    save: (snapshot) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      try {
        fs.writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
        fs.renameSync(temp, file);
      } catch (error) {
        try { fs.unlinkSync(temp); } catch { /* Clean up only this attempted write. */ }
        throw error;
      }
    }
  };
}

function validAlarmState(value: unknown): value is AlarmStateSnapshot {
  if (!isObject(value) || value.schemaVersion !== ALARM_STATE_SCHEMA_VERSION || !isObject(value.rules)) return false;
  return Object.entries(value.rules).every(([key, rule]) => {
    if (!/^(claude|codex):(five_hour|weekly)$/.test(key) || !isObject(rule)) return false;
    if (!['NORMAL', 'LOW', 'CRITICAL', 'UNKNOWN'].includes(String(rule.state))) return false;
    if (!validDate(rule.enteredAt)) return false;
    if (rule.lastEventType !== undefined && typeof rule.lastEventType !== 'string') return false;
    if (rule.lastEventId !== undefined && typeof rule.lastEventId !== 'string') return false;
    if (rule.lastFiredAt !== undefined && !validDate(rule.lastFiredAt)) return false;
    return validOptionalTimestamp(rule.horizonResetsAt) && validOptionalTimestamp(rule.lastProcessedResetCycle);
  });
}

function validOptionalTimestamp(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function quarantine(file: string, warn: (message: string) => void): void {
  if (!fs.existsSync(file)) return;
  const base = `${file}.bak`;
  const target = fs.existsSync(base) ? `${file}.${Date.now()}.bak` : base;
  try {
    fs.renameSync(file, target);
    warn(`Preserved unreadable AI alarm state at ${target}.`);
  } catch { /* Best effort; alarm evaluation continues from an empty state. */ }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
