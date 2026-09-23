import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ClaudeHealthEvidence, CodexHealthEvidence, HealthEvidence, HealthEvidenceParams } from './protocol';

export const AI_HEALTH_SCHEMA_VERSION = 1;

/** One canonical Claude quota window: fraction 0..1 utilization, Unix-seconds reset. */
export interface CanonicalClaudeWindow {
  utilization: number;
  resetsAt: number | null;
}

export interface ClaudeProviderHealthState {
  provider: 'claude';
  /** Provenance of the most recent accepted change: Stadium push vs. the global OAuth reader. */
  evidenceType: 'rate_limit_event' | 'oauth_usage';
  rateLimitInfo: Record<string, unknown>;
  observedAt: string;
  source: {
    stadiumId: string;
    instanceId: string;
    gameId: string;
    playerInstanceId: string;
  };
}

export interface CodexProviderHealthState {
  provider: 'codex';
  evidenceType: 'account_rate_limits';
  rateLimitInfo: Record<string, unknown>;
  observedAt: string;
  source: ProviderHealthSource;
}

export interface ProviderHealthSource {
  stadiumId: string;
  instanceId: string;
  gameId: string;
  playerInstanceId: string;
}

export type ProviderHealthState = ClaudeProviderHealthState | CodexProviderHealthState;

export interface HealthAuthoritySnapshot {
  schemaVersion: typeof AI_HEALTH_SCHEMA_VERSION;
  updatedAt?: string;
  providers: { claude?: ClaudeProviderHealthState; codex?: CodexProviderHealthState };
}

export interface HealthStateStore {
  load(): unknown | undefined;
  save(state: HealthAuthoritySnapshot): void;
  quarantine(reason: string): string | undefined;
}

export interface HealthAuthorityOptions {
  now?: () => Date;
  onChange?: (snapshot: HealthAuthoritySnapshot) => void;
  warn?: (message: string) => void;
}

export function defaultHealthStatePath(): string {
  return path.join(os.homedir(), '.sideline', 'ai-health-state.json');
}

export function fileHealthStateStore(
  file = defaultHealthStatePath(),
  warn: (message: string) => void = () => undefined
): HealthStateStore {
  const quarantine = (): string | undefined => {
    if (!fs.existsSync(file)) return undefined;
    let backup = `${file}.bak`;
    if (fs.existsSync(backup)) backup = `${file}.${Date.now()}.bak`;
    try { fs.renameSync(file, backup); return backup; } catch { return undefined; }
  };

  return {
    load: () => {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        warn(`AI health state could not be read: ${messageOf(error)}`);
        const backup = quarantine();
        if (backup) warn(`Preserved unreadable AI health state at ${backup}.`);
        return undefined;
      }
    },
    save: (state) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      try {
        fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
        fs.renameSync(temp, file);
      } catch (error) {
        try { fs.unlinkSync(temp); } catch { /* Clean up only this attempted write. */ }
        throw error;
      }
    },
    quarantine: (reason) => {
      warn(`AI health state was ignored: ${reason}`);
      const backup = quarantine();
      if (backup) warn(`Preserved unsupported AI health state at ${backup}.`);
      return backup;
    }
  };
}

export class HealthAuthority {
  private state: HealthAuthoritySnapshot;
  private readonly now: () => Date;
  private readonly warn: (message: string) => void;

  constructor(private readonly store: HealthStateStore, private readonly options: HealthAuthorityOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.warn = options.warn ?? (() => undefined);
    this.state = this.restore();
  }

  ingest(params: HealthEvidenceParams): boolean {
    const evidence = validHealthEvidence(params.evidence);
    if (!evidence || !validSource(params)) return false;
    const provider = evidence.provider;
    const nowDate = this.now();
    const nowUnixSeconds = Math.floor(nowDate.getTime() / 1000);
    const rateLimitInfo = provider === 'claude'
      ? mergeClaudeRateLimitInfo(this.state.providers.claude?.rateLimitInfo, evidence.rate_limit_info, nowUnixSeconds, true)
      : mergeCodexRateLimitInfo(this.state.providers.codex?.rateLimitInfo, evidence.rate_limits, nowUnixSeconds);
    const factual = {
      provider,
      evidenceType: evidence.type,
      rateLimitInfo,
      source: {
        stadiumId: params.stadiumId,
        instanceId: params.instanceId,
        gameId: params.gameId,
        playerInstanceId: params.playerInstanceId
      }
    } as const;
    const previous = this.state.providers[provider];
    const unchanged = provider === 'claude'
      ? previous && claudeRateLimitInfoUnchanged(previous.rateLimitInfo, rateLimitInfo)
      : previous && JSON.stringify({ ...previous, observedAt: undefined }) === JSON.stringify({ ...factual, observedAt: undefined });
    if (unchanged) return false;
    const observedAt = nowDate.toISOString();
    this.state = {
      schemaVersion: AI_HEALTH_SCHEMA_VERSION,
      updatedAt: observedAt,
      providers: { ...this.state.providers, [provider]: { ...factual, observedAt } }
    };
    this.options.onChange?.(this.getSnapshot());
    return true;
  }

  /**
   * Accepts an already-acquired, already-trusted canonical Claude read (the global
   * OAuth usage reader — never a Stadium/network evidence packet, so it bypasses
   * `validHealthEvidence`/`validSource` entirely). Converges into the exact same
   * merge, per-window preservation, and window-only dedupe as push evidence, so
   * push and the reader can never become competing truths.
   */
  ingestClaudeUsage(windows: Partial<Record<ClaudeWindowKey, CanonicalClaudeWindow>>): boolean {
    if (Object.keys(windows).length === 0) return false;
    const nowDate = this.now();
    const rateLimitInfo = mergeClaudeRateLimitInfo(this.state.providers.claude?.rateLimitInfo, { unifiedWindows: windows }, Math.floor(nowDate.getTime() / 1000), true);
    const previous = this.state.providers.claude;
    if (previous && claudeRateLimitInfoUnchanged(previous.rateLimitInfo, rateLimitInfo)) return false;
    const observedAt = nowDate.toISOString();
    const factual: ClaudeProviderHealthState = {
      provider: 'claude',
      evidenceType: 'oauth_usage',
      rateLimitInfo,
      source: {
        stadiumId: 'control-plane', instanceId: 'claude-oauth-reader',
        gameId: 'control-plane', playerInstanceId: 'claude-oauth-reader'
      },
      observedAt
    };
    this.state = {
      schemaVersion: AI_HEALTH_SCHEMA_VERSION,
      updatedAt: observedAt,
      providers: { ...this.state.providers, claude: factual }
    };
    this.options.onChange?.(this.getSnapshot());
    return true;
  }

  pruneExpired(nowDate = this.now()): boolean {
    const nowUnixSeconds = Math.floor(nowDate.getTime() / 1000);
    let changed = false;
    const nextProviders = { ...this.state.providers };

    if (this.state.providers.claude) {
      const merged = mergeClaudeRateLimitInfo(this.state.providers.claude.rateLimitInfo, {}, nowUnixSeconds, false);
      if (!claudeRateLimitInfoUnchanged(this.state.providers.claude.rateLimitInfo, merged)) {
        nextProviders.claude = { ...this.state.providers.claude, rateLimitInfo: merged, observedAt: nowDate.toISOString() };
        changed = true;
      }
    }

    if (this.state.providers.codex) {
      const merged = pruneCodexRateLimitInfo(this.state.providers.codex.rateLimitInfo, nowUnixSeconds);
      if (JSON.stringify(this.state.providers.codex.rateLimitInfo) !== JSON.stringify(merged)) {
        nextProviders.codex = { ...this.state.providers.codex, rateLimitInfo: merged, observedAt: nowDate.toISOString() };
        changed = true;
      }
    }

    if (!changed) return false;
    this.state = {
      schemaVersion: AI_HEALTH_SCHEMA_VERSION,
      updatedAt: nowDate.toISOString(),
      providers: nextProviders
    };
    this.options.onChange?.(this.getSnapshot());
    return true;
  }

  getSnapshot(): HealthAuthoritySnapshot {
    return structuredClone(this.state);
  }

  flush(): boolean {
    try {
      this.store.save(this.getSnapshot());
      return true;
    } catch (error) {
      this.warn(`AI health state could not be saved: ${messageOf(error)}`);
      return false;
    }
  }

  private restore(): HealthAuthoritySnapshot {
    const loaded = this.store.load();
    if (loaded === undefined) return emptySnapshot();
    if (!validSnapshot(loaded)) {
      const version = isObject(loaded) ? loaded.schemaVersion : undefined;
      this.store.quarantine(`unsupported or malformed schemaVersion ${String(version)}`);
      return emptySnapshot();
    }
    return structuredClone(loaded);
  }
}

const CLAUDE_WINDOW_KEYS = ['five_hour', 'seven_day'] as const;
export type ClaudeWindowKey = typeof CLAUDE_WINDOW_KEYS[number];

function claudeWindowKey(info: Record<string, unknown>): ClaudeWindowKey | undefined {
  const type = info.rateLimitType;
  return type === 'five_hour' || type === 'seven_day' ? type : undefined;
}

// Canonical Claude window read order: real provider shape (unifiedWindows),
// then legacy dual-window retention nesting, then legacy flat rateLimitType frame.
function extractClaudeWindows(info: Record<string, unknown> | undefined): Partial<Record<ClaudeWindowKey, unknown>> {
  if (!info) return {};
  if (isObject(info.unifiedWindows)) {
    const existing: Partial<Record<ClaudeWindowKey, unknown>> = {};
    for (const key of CLAUDE_WINDOW_KEYS) {
      if (isObject(info.unifiedWindows[key])) existing[key] = info.unifiedWindows[key];
    }
    if (Object.keys(existing).length > 0) return existing;
  }
  const existing: Partial<Record<ClaudeWindowKey, unknown>> = {};
  for (const key of CLAUDE_WINDOW_KEYS) {
    if (isObject(info[key])) existing[key] = info[key];
  }
  if (Object.keys(existing).length > 0) return existing;
  const ownKey = claudeWindowKey(info);
  return ownKey ? { [ownKey]: info } : {};
}

// Claude dedupe compares canonical quota windows (source/provenance noise never
// causes a false change). If neither side carries recognizable window structure,
// falls back to comparing the raw facts so genuinely different unknown-shape
// evidence is never mistaken for a replay.
function claudeRateLimitInfoUnchanged(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): boolean {
  const previousWindows = extractClaudeWindows(previous);
  const nextWindows = extractClaudeWindows(next);
  if (Object.keys(previousWindows).length > 0 || Object.keys(nextWindows).length > 0) {
    return JSON.stringify(previousWindows) === JSON.stringify(nextWindows);
  }
  return JSON.stringify(previous) === JSON.stringify(next);
}

function windowResetsAt(win: unknown): number | undefined {
  if (!isObject(win)) return undefined;
  const resetsAt = win.resetsAt;
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return undefined;
  return resetsAt > 1e11 ? Math.floor(resetsAt / 1000) : resetsAt;
}

// Merges per window against `nowUnixSeconds`:
//  - An incoming window normally overwrites its own key.
//  - A window missing from incoming evidence preserves the previously known
//    window ONLY while it has not yet expired (previous.resetsAt > now). An
//    expired window with no fresh replacement is dropped, never retained
//    indefinitely as current truth.
//  - An incoming window whose resetsAt is older than the stored window's
//    resetsAt is rejected as a stale replay (reset-cycle monotonicity); the
//    newer stored cycle is kept, itself still subject to the same expiry rule.
// The result retains canonical unifiedWindows.five_hour / unifiedWindows.seven_day
// alongside whatever legacy top-level fields the incoming evidence carried.
// Distinct Claude cycles are at least 5 hours apart, so resets this close are one cycle.
const CLAUDE_SAME_CYCLE_TOLERANCE_SECONDS = 15 * 60;

function sameClaudeCycle(a: number | undefined, b: number | undefined): boolean {
  return a !== undefined && b !== undefined && Math.abs(a - b) <= CLAUDE_SAME_CYCLE_TOLERANCE_SECONDS;
}

function sameWindowIgnoringReset(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b)) return false;
  const { resetsAt: _a, ...restA } = a;
  const { resetsAt: _b, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

/**
 * Which acquired Claude windows the stored authority state does NOT reflect —
 * i.e. the merge kept an older value instead of this read. Used so a Refresh
 * never reports a read as current when part of it was not accepted.
 */
export function claudeWindowsNotReflected(
  snapshot: HealthAuthoritySnapshot,
  acquired: Partial<Record<ClaudeWindowKey, CanonicalClaudeWindow>>
): ClaudeWindowKey[] {
  const stored = extractClaudeWindows(snapshot.providers.claude?.rateLimitInfo);
  return CLAUDE_WINDOW_KEYS.filter((key) => {
    const want = acquired[key];
    if (!want) return false;
    const have = stored[key];
    if (!isObject(have) || have.utilization !== want.utilization) return true;
    if (want.resetsAt === null) return have.resetsAt !== null;
    return !sameClaudeCycle(windowResetsAt(have), windowResetsAt(want));
  });
}

function isPostResetClaudeWindow(win: unknown): boolean {
  if (!isObject(win)) return false;
  return win.utilization === 0 && (win.resetsAt === null || win.resetsAt === undefined);
}

function mergeClaudeRateLimitInfo(
  previous: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
  nowUnixSeconds: number,
  isSuccessfulAcquisition = false
): Record<string, unknown> {
  const previousWindows = extractClaudeWindows(previous);
  const incomingWindows = extractClaudeWindows(incoming);
  if (Object.keys(previousWindows).length === 0 && Object.keys(incomingWindows).length === 0) return incoming;

  const mergedWindows: Partial<Record<ClaudeWindowKey, unknown>> = {};
  for (const key of CLAUDE_WINDOW_KEYS) {
    const prevWin = previousWindows[key];
    const incWin = incomingWindows[key];
    const prevResetsAt = windowResetsAt(prevWin);

    if (incWin !== undefined) {
      const incResetsAt = windowResetsAt(incWin);
      // Same cycle: the provider's reset for ONE cycle jitters by ~1-2s between
      // reads (OAuth reports fractional seconds that drift; the native push reports
      // whole seconds). Field-proven: stored seven_day 1790424001 vs fresh OAuth
      // 1790423999 froze Weekly at 60% while Claude said 62%. Within tolerance the
      // fresh read always wins; the stored object is kept only when nothing but the
      // reset jitter differs, so jitter alone never reports a false change.
      if (sameClaudeCycle(prevResetsAt, incResetsAt)) {
        mergedWindows[key] = sameWindowIgnoringReset(prevWin, incWin) ? prevWin : incWin;
        continue;
      }
      const staleReplay = prevWin !== undefined && prevResetsAt !== undefined && incResetsAt !== undefined && incResetsAt < prevResetsAt;
      // A provider "not started" frame cannot describe a cycle that is still
      // running: while the stored active window has not reset yet, it is newer.
      const staleIdle = isPostResetClaudeWindow(incWin) && prevResetsAt !== undefined && prevResetsAt > nowUnixSeconds;
      if (staleReplay || staleIdle) {
        if ((prevResetsAt as number) > nowUnixSeconds) mergedWindows[key] = prevWin;
        continue;
      }
      mergedWindows[key] = incWin;
      continue;
    }

    // Post-reset / not-started state:
    // If acquisition succeeded, the previous 5H window has expired (or was already in post-reset state),
    // and the successful current provider response contains no active five_hour window,
    // represent the idle state: 100% left / 0% used / Reset: UNKNOWN.
    if (key === 'five_hour' && isSuccessfulAcquisition && (
      (prevResetsAt !== undefined && prevResetsAt <= nowUnixSeconds) ||
      isPostResetClaudeWindow(prevWin) ||
      (typeof previous?._lastExpiredFiveHourResetsAt === 'number' && (previous._lastExpiredFiveHourResetsAt as number) <= nowUnixSeconds) ||
      (typeof previous?.lastExpiredFiveHourResetsAt === 'number' && (previous.lastExpiredFiveHourResetsAt as number) <= nowUnixSeconds)
    )) {
      mergedWindows.five_hour = { utilization: 0, resetsAt: null };
      continue;
    }

    if (prevWin !== undefined && (prevResetsAt === undefined || prevResetsAt > nowUnixSeconds)) {
      mergedWindows[key] = prevWin;
    }
  }

  const { unifiedWindows: _incomingUnifiedWindows, ...rest } = incoming;
  const result: Record<string, unknown> = { ...rest, unifiedWindows: mergedWindows };

  // Retain expired 5H tracking across merges until a real active 5H cycle arrives:
  const prev5HResetsAt = windowResetsAt(previousWindows.five_hour);
  const activeIncoming5H = incomingWindows.five_hour !== undefined && !isPostResetClaudeWindow(incomingWindows.five_hour);

  if (!activeIncoming5H) {
    if (prev5HResetsAt !== undefined && prev5HResetsAt <= nowUnixSeconds) {
      result._lastExpiredFiveHourResetsAt = prev5HResetsAt;
      result.lastExpiredFiveHourResetsAt = prev5HResetsAt;
    } else if (typeof previous?._lastExpiredFiveHourResetsAt === 'number') {
      result._lastExpiredFiveHourResetsAt = previous._lastExpiredFiveHourResetsAt;
      result.lastExpiredFiveHourResetsAt = previous._lastExpiredFiveHourResetsAt;
    } else if (typeof previous?.lastExpiredFiveHourResetsAt === 'number') {
      result._lastExpiredFiveHourResetsAt = previous.lastExpiredFiveHourResetsAt;
      result.lastExpiredFiveHourResetsAt = previous.lastExpiredFiveHourResetsAt;
    }
  }

  return result;
}

export const CODEX_WINDOW_KEYS = ['primary', 'secondary'] as const;
export type CodexWindowKey = typeof CODEX_WINDOW_KEYS[number];

function mergeCodexRateLimitInfo(
  previous: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
  nowUnixSeconds: number
): Record<string, unknown> {
  if (!previous && !incoming) return {};
  if (!previous) return incoming;

  const merged: Record<string, unknown> = { ...previous, ...incoming };

  for (const key of CODEX_WINDOW_KEYS) {
    const prevWin = previous[key];
    const incWin = incoming[key];

    if (incWin === null) {
      merged[key] = null;
      continue;
    }

    if (isObject(incWin)) {
      const prevResetsAt = windowResetsAt(prevWin);
      const incResetsAt = windowResetsAt(incWin);
      const staleReplay = isObject(prevWin) && prevResetsAt !== undefined && incResetsAt !== undefined && incResetsAt < prevResetsAt;
      if (staleReplay) {
        if (prevResetsAt !== undefined && prevResetsAt > nowUnixSeconds) {
          merged[key] = prevWin;
        } else {
          delete merged[key];
        }
        continue;
      }
      merged[key] = incWin;
      continue;
    }

    // Window missing (undefined) in incoming evidence:
    // preserve previously known window ONLY while not yet expired.
    if (prevWin === null) {
      merged[key] = null;
      continue;
    }

    if (isObject(prevWin)) {
      const prevResetsAt = windowResetsAt(prevWin);
      if (prevResetsAt === undefined || prevResetsAt > nowUnixSeconds) {
        merged[key] = prevWin;
      } else {
        delete merged[key];
      }
    } else {
      delete merged[key];
    }
  }

  return merged;
}

export function pruneCodexRateLimitInfo(
  info: Record<string, unknown> | undefined,
  nowUnixSeconds: number
): Record<string, unknown> {
  if (!info) return {};
  const pruned: Record<string, unknown> = { ...info };
  for (const key of CODEX_WINDOW_KEYS) {
    const win = pruned[key];
    const resetsAt = windowResetsAt(win);
    if (resetsAt !== undefined && resetsAt <= nowUnixSeconds) {
      delete pruned[key];
    }
  }
  return pruned;
}

export interface CanonicalCodexWindow {
  readonly usedPercent: number;
  readonly resetsAt: number;
  readonly windowDurationMins: number;
}

export interface ResolvedCodexWindows {
  readonly fiveHour?: CanonicalCodexWindow;
  readonly weekly?: CanonicalCodexWindow;
}

export function resolveCodexWindows(
  rateLimitInfo: Record<string, unknown> | undefined,
  nowDate: Date = new Date()
): ResolvedCodexWindows {
  if (!rateLimitInfo || typeof rateLimitInfo !== 'object') return {};

  const nowUnixSeconds = Math.floor(nowDate.getTime() / 1000);
  const result: { fiveHour?: CanonicalCodexWindow; weekly?: CanonicalCodexWindow } = {};

  const candidates: unknown[] = [
    rateLimitInfo.primary,
    rateLimitInfo.secondary,
    isObject(rateLimitInfo.unifiedWindows) ? (rateLimitInfo.unifiedWindows as Record<string, unknown>).five_hour : undefined,
    isObject(rateLimitInfo.unifiedWindows) ? (rateLimitInfo.unifiedWindows as Record<string, unknown>).seven_day : undefined
  ].filter(isObject);

  for (const candidate of candidates) {
    const obj = candidate as Record<string, unknown>;
    const duration = typeof obj.windowDurationMins === 'number' ? obj.windowDurationMins : undefined;
    const type = typeof obj.rateLimitType === 'string' ? obj.rateLimitType : undefined;
    const isFiveHour = duration === 300 || type === 'five_hour';
    const isWeekly = duration === 10080 || type === 'seven_day';

    if (!isFiveHour && !isWeekly) continue;

    const usedPercent = typeof obj.usedPercent === 'number' && Number.isFinite(obj.usedPercent)
      ? obj.usedPercent
      : (typeof obj.utilization === 'number' && Number.isFinite(obj.utilization) ? Math.round(obj.utilization * 100) : undefined);

    if (usedPercent === undefined) continue;

    const resetsAt = windowResetsAt(obj);
    if (resetsAt !== undefined && resetsAt <= nowUnixSeconds) {
      // Expired: drop from current factual health, resolve as UNKNOWN / pending fresh acquisition.
      // Never fabricate 100%, never retain expired old percentage.
      continue;
    }

    const windowData: CanonicalCodexWindow = {
      usedPercent,
      resetsAt: resetsAt ?? (typeof obj.resetsAt === 'number' ? obj.resetsAt : 0),
      windowDurationMins: duration ?? (isFiveHour ? 300 : 10080)
    };

    if (isFiveHour && !result.fiveHour) {
      result.fiveHour = windowData;
    } else if (isWeekly && !result.weekly) {
      result.weekly = windowData;
    }
  }

  return result;
}

function emptySnapshot(): HealthAuthoritySnapshot {
  return { schemaVersion: AI_HEALTH_SCHEMA_VERSION, providers: {} };
}

function validSnapshot(value: unknown): value is HealthAuthoritySnapshot {
  if (!isObject(value) || value.schemaVersion !== AI_HEALTH_SCHEMA_VERSION || !isObject(value.providers)) return false;
  if (value.updatedAt !== undefined && !validDate(value.updatedAt)) return false;
  const keys = Object.keys(value.providers);
  if (keys.some((key) => key !== 'claude' && key !== 'codex')) return false;
  const claude = value.providers.claude;
  const codex = value.providers.codex;
  return (claude === undefined || validProviderState(claude, 'claude'))
    && (codex === undefined || validProviderState(codex, 'codex'));
}

function validProviderState(value: unknown, provider: 'claude' | 'codex'): value is ProviderHealthState {
  if (!isObject(value) || value.provider !== provider) return false;
  if (provider === 'claude'
    ? (value.evidenceType !== 'rate_limit_event' && value.evidenceType !== 'oauth_usage')
    : value.evidenceType !== 'account_rate_limits') return false;
  if (!validDate(value.observedAt) || !isObject(value.source)) return false;
  const source = value.source;
  return validBoundedObject(value.rateLimitInfo)
    && ['stadiumId', 'instanceId', 'gameId', 'playerInstanceId'].every((key) => validIdentity(source[key]));
}

function validHealthEvidence(value: unknown): HealthEvidence | undefined {
  return validClaudeEvidence(value) ?? validCodexEvidence(value);
}

function validClaudeEvidence(value: unknown): ClaudeHealthEvidence | undefined {
  if (!isObject(value) || value.provider !== 'claude' || value.type !== 'rate_limit_event') return undefined;
  if (Object.keys(value).some((key) => !['provider', 'type', 'rate_limit_info'].includes(key))) return undefined;
  const info = boundedCopy(value.rate_limit_info);
  return info ? { provider: 'claude', type: 'rate_limit_event', rate_limit_info: info } : undefined;
}

function validCodexEvidence(value: unknown): CodexHealthEvidence | undefined {
  if (!isObject(value) || value.provider !== 'codex' || value.type !== 'account_rate_limits') return undefined;
  if (Object.keys(value).some((key) => !['provider', 'type', 'rate_limits'].includes(key))) return undefined;
  const facts = boundedCopy(value.rate_limits);
  return facts ? { provider: 'codex', type: 'account_rate_limits', rate_limits: facts } : undefined;
}

function validSource(value: HealthEvidenceParams): boolean {
  return [value.stadiumId, value.instanceId, value.gameId, value.playerInstanceId].every(validIdentity);
}

function validIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 500;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validBoundedObject(value: unknown): value is Record<string, unknown> {
  return boundedCopy(value) !== undefined;
}

function boundedCopy(value: unknown): Record<string, unknown> | undefined {
  if (!isObject(value)) return undefined;
  let nodes = 0;
  const copy = (input: unknown, depth: number): unknown => {
    if (++nodes > 100 || depth > 4) return undefined;
    if (input === null || typeof input === 'boolean' || (typeof input === 'number' && Number.isFinite(input))) return input;
    if (typeof input === 'string') return input.length <= 500 ? input : undefined;
    if (Array.isArray(input)) {
      if (input.length > 20) return undefined;
      const output = input.map((item) => copy(item, depth + 1));
      return output.some((item) => item === undefined) ? undefined : output;
    }
    if (!isObject(input)) return undefined;
    const entries = Object.entries(input);
    if (entries.length > 30) return undefined;
    const output: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      if (!key || key.length > 100) return undefined;
      const copied = copy(item, depth + 1);
      if (copied === undefined) return undefined;
      output[key] = copied;
    }
    return output;
  };
  return copy(value, 0) as Record<string, unknown> | undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
