// Global Claude account usage reader — the zero-inference acquisition seam that keeps
// Claude health current even when Claude is being used outside Sideline. Ported from
// the proven `collectClaudeUsage` implementation in
// `Ai Usage - Real Time/src/providers/claude.js`.
//
// This reads Claude Code's OWN existing OAuth access token from disk and performs one
// read-only HTTPS GET against an undocumented Anthropic usage endpoint. It is not a
// model prompt: no Claude process, PTY, inference request, or token refresh is
// involved, and it consumes no Claude usage.
//
// One ControlPlaneDaemon owns exactly one ClaudeUsageReader (see daemon.ts). Games,
// Stadiums, and browser tabs never poll and never own a reader of their own.
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CanonicalClaudeWindow } from './health-authority';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA = 'oauth-2025-04-20';

// The OAuth account-usage endpoint is a reconciliation source, not a heartbeat —
// fast in-Play updates arrive via Claude's native rate_limit_event push instead
// (see structured-print.ts / stadium-client.ts). A 3-30 second cadence here was
// field-proven to trigger provider HTTP 429 throttling within ~10 seconds, so the
// floor is 3 minutes and the unit is minutes, not seconds.
export const CLAUDE_USAGE_CADENCE_MINUTES = [3, 5, 10, 15] as const;
export type ClaudeUsageCadenceMinutes = typeof CLAUDE_USAGE_CADENCE_MINUTES[number];
export const DEFAULT_CLAUDE_USAGE_CADENCE_MINUTES: ClaudeUsageCadenceMinutes = 5;

// Event-driven freshness: Claude work anywhere on this machine (Claude Code appends
// to its session transcripts) asks for ONE early read once that activity settles.
// Bounded so it can never become polling: a read happens at most once per
// ACTIVITY_MIN_SPACING, continuous work still converges every ACTIVITY_MAX_WAIT,
// and every read still honors the provider Retry-After and the fallback gate.
export const CLAUDE_ACTIVITY_SETTLE_MS = 15_000;
export const CLAUDE_ACTIVITY_MAX_WAIT_MS = 120_000;
export const CLAUDE_ACTIVITY_MIN_SPACING_MS = 90_000;

export function defaultClaudeActivityDir(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(configDir, 'projects');
}

/**
 * Watches Claude Code's transcript directory and calls `onActivity` whenever a
 * session transcript (*.jsonl) is written. Reads nothing from the files — the
 * write itself is the only signal. Returns a stop function. A missing directory
 * or a watcher error simply means no activity signal; polling still applies.
 */
export function watchClaudeActivity(
  dir: string,
  onActivity: () => void,
  log: (message: string) => void = () => undefined,
  watchImpl: typeof fsSync.watch = fsSync.watch
): () => void {
  let watcher: fsSync.FSWatcher | undefined;
  try {
    watcher = watchImpl(dir, { recursive: true, persistent: false }, (_event, filename) => {
      if (typeof filename === 'string' && filename.endsWith('.jsonl')) onActivity();
    });
    watcher.on('error', (error) => {
      log(`[claude-usage-reader] activity watch stopped: ${error instanceof Error ? error.message : String(error)}`);
      watcher?.close();
    });
  } catch (error) {
    log(`[claude-usage-reader] activity watch unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return () => undefined;
  }
  return () => watcher?.close();
}

export function isClaudeUsageCadenceMinutes(value: unknown): value is ClaudeUsageCadenceMinutes {
  return (CLAUDE_USAGE_CADENCE_MINUTES as readonly number[]).includes(value as number);
}

// Internal fallback gates are strictly bounded to the configured refresh cadence (never self-escalating).

export type ClaudeUsageFailureCode =
  | 'credentials_unreadable'
  | 'credential_expired'
  | 'auth_rejected'
  | 'malformed_response'
  | 'network_error'
  | 'rate_limited';

export type ClaudeUsageWindows = Partial<Record<'five_hour' | 'seven_day', CanonicalClaudeWindow>>;

export type ClaudeUsageOutcome =
  | { ok: true; windows: ClaudeUsageWindows }
  | { ok: false; code: ClaudeUsageFailureCode; reason: string; retryAfterMs?: number };

// BREADCRUMB for a future Scoreboard polish Play: `lastSuccessAt` here (this
// reader's own acquisition status) is a DIFFERENT timestamp than
// ClaudeProviderHealthState.observedAt in health-authority.ts (the last time
// the STORED canonical facts actually changed — push or reader, whichever last
// produced a real change). An unchanged-but-successful reader check advances
// `lastSuccessAt` without advancing `observedAt`. Both are real, both are
// already exposed distinctly (GET /api/ai-health's `acquisition.claude` vs.
// `health.providers.claude.observedAt`) — do not collapse them into one label.
// The Scoreboard currently only surfaces `observedAt` ("Observed: …"), which
// can read stale relative to a real, recent, merely-unchanged reader check.
// Deciding how to surface both without cluttering the Compact surface is
// future UI work, not something this Play's polling-policy repair resolves.
export interface ClaudeUsageStatus {
  state: 'idle' | 'ok' | 'unavailable' | 'rate_limited';
  code?: ClaudeUsageFailureCode;
  reason?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  gateType?: 'provider-directed gate' | 'Sideline fallback gate';
  gatedUntil?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Maps one OAuth window to the canonical shape. OAuth utilization is a 0..100
 * percent; canonical is a 0..1 fraction. OAuth resets_at is an ISO string;
 * canonical resetsAt is Unix seconds. A missing or invalid window is omitted,
 * never zero-filled.
 *
 * Exception — the provider's own post-reset / session-not-started shape:
 * `{ utilization: 0, resets_at: null }`. After a 5H reset and before the first
 * message, Anthropic PRESENTS five_hour with a null reset (Claude Code's own
 * /usage renders it as "Current session 0% used" with no reset line; it only
 * renders that row when five_hour is a present object). That is positive
 * provider evidence of the idle state, so it maps to canonical
 * `{ utilization: 0, resetsAt: null }`. Any other null/absent reset stays invalid.
 */
function canonicalWindowFromOAuth(raw: unknown): CanonicalClaudeWindow | undefined {
  if (!isObject(raw)) return undefined;
  const percent = raw.utilization;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) return undefined;
  if (percent === 0 && raw.resets_at === null) return { utilization: 0, resetsAt: null };
  const resetRaw = raw.resets_at;
  const ms = typeof resetRaw === 'string' ? Date.parse(resetRaw) : NaN;
  if (!Number.isFinite(ms)) return undefined;
  return { utilization: Math.round((percent / 100) * 10_000) / 10_000, resetsAt: Math.floor(ms / 1000) };
}

/** Missing/invalid windows are simply absent from the result, never zero-filled. */
export function canonicalClaudeWindowsFromOAuth(payload: unknown): ClaudeUsageWindows {
  if (!isObject(payload)) return {};
  const windows: ClaudeUsageWindows = {};
  const fiveHour = canonicalWindowFromOAuth(payload.five_hour);
  if (fiveHour) windows.five_hour = fiveHour;
  const sevenDay = canonicalWindowFromOAuth(payload.seven_day);
  if (sevenDay) windows.seven_day = sevenDay;
  return windows;
}

export interface ReadClaudeUsageOptions {
  timeoutMs?: number;
  credentialPath?: string;
  fetchImpl?: typeof fetch;
  readFileImpl?: (path: string, encoding: 'utf8') => Promise<string>;
  now?: () => number;
  signal?: AbortSignal;
}

export function defaultClaudeCredentialPath(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(configDir, '.credentials.json');
}

/**
 * Performs one read-only usage request using Claude Code's existing OAuth access
 * token. The token is read fresh on every call (so Claude Code's own rotation is
 * picked up) and lives only in local scope: it is never logged, persisted, returned,
 * or included in an error/reason string.
 */
export async function readClaudeUsageOnce(options: ReadClaudeUsageOptions = {}): Promise<ClaudeUsageOutcome> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const credentialPath = options.credentialPath ?? defaultClaudeCredentialPath();
  const readFileImpl = options.readFileImpl ?? ((p: string) => fs.readFile(p, 'utf8'));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;

  let credentials: unknown;
  try {
    credentials = JSON.parse(await readFileImpl(credentialPath, 'utf8'));
  } catch {
    return { ok: false, code: 'credentials_unreadable', reason: 'Claude Code OAuth credentials are unavailable or malformed.' };
  }

  const oauth = isObject(credentials) ? credentials.claudeAiOauth : undefined;
  const accessToken = isObject(oauth) ? oauth.accessToken : undefined;
  if (typeof accessToken !== 'string' || !accessToken) {
    return { ok: false, code: 'credentials_unreadable', reason: 'Claude Code OAuth access token is unavailable.' };
  }
  const expiresAt = isObject(oauth) ? oauth.expiresAt : undefined;
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt <= now()) {
    return { ok: false, code: 'credential_expired', reason: 'Claude Code OAuth access token is expired; refresh was not attempted.' };
  }

  let response: Response;
  try {
    response = await fetchImpl(USAGE_URL, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'anthropic-beta': OAUTH_BETA,
        accept: 'application/json'
      },
      signal: options.signal ?? AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    return { ok: false, code: 'network_error', reason: error instanceof Error && error.name === 'TimeoutError' ? 'Timed out reading Claude usage.' : 'Claude usage request failed.' };
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    return {
      ok: false, code: 'rate_limited', reason: 'Claude usage endpoint returned HTTP 429.',
      ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? { retryAfterMs: retryAfterSeconds * 1000 } : {})
    };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, code: 'auth_rejected', reason: `Claude usage endpoint rejected the OAuth token (HTTP ${response.status}).` };
  }
  if (!response.ok) {
    return { ok: false, code: 'network_error', reason: `Claude usage endpoint was unavailable (HTTP ${response.status}).` };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, code: 'malformed_response', reason: 'Claude usage endpoint returned malformed JSON.' };
  }
  if (!isObject(payload)) {
    return { ok: false, code: 'malformed_response', reason: 'Claude usage endpoint returned a malformed payload.' };
  }

  return { ok: true, windows: canonicalClaudeWindowsFromOAuth(payload) };
}

export interface ClaudeUsageReaderOptions {
  /** Ingests an acquired read into HealthAuthority; returns whether it produced a change. */
  ingest: (windows: ClaudeUsageWindows) => boolean;
  initialCadenceMinutes?: ClaudeUsageCadenceMinutes;
  timeoutMs?: number;
  credentialPath?: string;
  fetchImpl?: typeof fetch;
  readFileImpl?: (path: string, encoding: 'utf8') => Promise<string>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (handle: NodeJS.Timeout) => void;
  log?: (message: string) => void;
  onStatusChange?: (status: ClaudeUsageStatus) => void;
}

/**
 * One global, daemon-owned Claude usage reader. Lifecycle: `start()` performs an
 * immediate acquisition, then runs a `setTimeout` chain (never `setInterval`) at the
 * configured cadence; `stop()` clears the pending timer and aborts any request in
 * flight. A single shared in-flight promise means an overlapping scheduled tick or
 * manual `refresh()` joins the same request rather than starting another one.
 */
export class ClaudeUsageReader {
  private readonly ingestFn: (windows: ClaudeUsageWindows) => boolean;
  private readonly timeoutMs: number;
  private readonly credentialPath: string | undefined;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly readFileImpl: ((path: string, encoding: 'utf8') => Promise<string>) | undefined;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (handle: NodeJS.Timeout) => void;
  private readonly log: (message: string) => void;
  private readonly onStatusChange: (status: ClaudeUsageStatus) => void;

  private cadenceMinutes: ClaudeUsageCadenceMinutes;
  private backoffIndex = -1;
  private timer: NodeJS.Timeout | undefined;
  private controller: AbortController | undefined;
  private inFlight: Promise<ClaudeUsageOutcome> | undefined;
  private stopped = true;
  private providerGatedUntilMs: number | undefined;
  private fallbackGatedUntilMs: number | undefined;
  private lastAttemptMs: number | undefined;
  private lastOutcome: ClaudeUsageOutcome | undefined;
  private status: ClaudeUsageStatus = { state: 'idle' };
  private lastChanged = false;
  private activityTimer: NodeJS.Timeout | undefined;
  private activityStartedMs: number | undefined;

  constructor(options: ClaudeUsageReaderOptions) {
    this.ingestFn = options.ingest;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.credentialPath = options.credentialPath;
    this.fetchImpl = options.fetchImpl;
    this.readFileImpl = options.readFileImpl;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
    this.log = options.log ?? (() => undefined);
    this.onStatusChange = options.onStatusChange ?? (() => undefined);
    this.cadenceMinutes = options.initialCadenceMinutes ?? DEFAULT_CLAUDE_USAGE_CADENCE_MINUTES;
  }

  getStatus(): ClaudeUsageStatus {
    return { ...this.status };
  }

  getCadenceMinutes(): ClaudeUsageCadenceMinutes {
    return this.cadenceMinutes;
  }

  /** Rejects any value outside the 3/5/10/15 allowlist; the current cadence is kept. */
  setCadenceMinutes(minutes: number): boolean {
    if (!isClaudeUsageCadenceMinutes(minutes)) return false;
    this.cadenceMinutes = minutes;
    return true;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.runAndSchedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
    if (this.activityTimer) {
      this.clearTimer(this.activityTimer);
      this.activityTimer = undefined;
    }
    this.activityStartedMs = undefined;
    this.controller?.abort();
  }

  /**
   * Claude work was observed (no usage facts — just "something happened"). Debounces
   * a burst of activity into one early read: once activity has been quiet for
   * CLAUDE_ACTIVITY_SETTLE_MS, or after CLAUDE_ACTIVITY_MAX_WAIT_MS of continuous
   * activity, and never sooner than CLAUDE_ACTIVITY_MIN_SPACING_MS after the last
   * attempt. The read itself honors every provider/fallback gate, then restarts the
   * normal cadence from now, so activity never adds a second polling loop.
   */
  noteClaudeActivity(): void {
    if (this.stopped) return;
    const now = this.now();
    this.activityStartedMs ??= now;
    const settledAt = Math.min(now + CLAUDE_ACTIVITY_SETTLE_MS, this.activityStartedMs + CLAUDE_ACTIVITY_MAX_WAIT_MS);
    const spacedAt = this.lastAttemptMs === undefined ? now : this.lastAttemptMs + CLAUDE_ACTIVITY_MIN_SPACING_MS;
    const at = Math.max(settledAt, spacedAt);
    if (this.activityTimer) this.clearTimer(this.activityTimer);
    this.activityTimer = this.setTimer(() => {
      this.activityTimer = undefined;
      this.activityStartedMs = undefined;
      if (this.stopped) return;
      if (this.timer) {
        this.clearTimer(this.timer);
        this.timer = undefined;
      }
      void this.runAndSchedule();
    }, Math.max(0, at - now));
    if (typeof this.activityTimer.unref === 'function') this.activityTimer.unref();
  }

  /**
   * Forced read for `POST /api/ai-health/refresh`. Joins an in-flight request.
   * MUST NOT bypass an explicit active provider Retry-After (`provider-directed gate`).
   * MAY bypass Sideline's own internal fallback gate (`Sideline fallback gate`).
   * Guarded against rapid button-spam with a small local minimum-attempt guard.
   * Restarts the scheduled cadence from now once it finishes.
   */
  async refresh(): Promise<{ outcome: ClaudeUsageOutcome; changed: boolean }> {
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }

    const now = this.now();
    // 1. MUST NOT bypass an explicit active provider Retry-After
    if (this.providerGatedUntilMs !== undefined && now < this.providerGatedUntilMs) {
      const outcome: ClaudeUsageOutcome = {
        ok: false,
        code: 'rate_limited',
        reason: 'Claude usage endpoint is rate-limited; waiting for Retry-After to elapse.',
        retryAfterMs: this.providerGatedUntilMs - now
      };
      this.applyGatedOutcome(outcome, 'provider-directed gate', this.providerGatedUntilMs);
      if (!this.stopped) this.scheduleNext(outcome);
      return { outcome, changed: false };
    }

    // 2. Prevent rapid button-spam with a small local minimum-attempt guard (2 seconds)
    if (this.lastAttemptMs !== undefined && (now - this.lastAttemptMs) < 2000 && this.lastOutcome) {
      return { outcome: this.lastOutcome, changed: this.lastChanged };
    }

    // 3. MAY bypass Sideline's own internal fallback gate and make one real acquisition attempt
    const outcome = await this.read({ allowFallbackBypass: true });
    if (!this.stopped) this.scheduleNext(outcome);
    return { outcome, changed: this.lastChanged };
  }

  private async runAndSchedule(): Promise<void> {
    const outcome = await this.read();
    this.scheduleNext(outcome);
  }

  private read(options?: { allowFallbackBypass?: boolean }): Promise<ClaudeUsageOutcome> {
    if (this.inFlight) return this.inFlight;
    const now = this.now();

    // Provider-directed gate: MUST NOT bypass
    if (this.providerGatedUntilMs !== undefined && now < this.providerGatedUntilMs) {
      const outcome: ClaudeUsageOutcome = {
        ok: false,
        code: 'rate_limited',
        reason: 'Claude usage endpoint is rate-limited; waiting for Retry-After to elapse.',
        retryAfterMs: this.providerGatedUntilMs - now
      };
      this.applyGatedOutcome(outcome, 'provider-directed gate', this.providerGatedUntilMs);
      return Promise.resolve(outcome);
    }

    // Sideline fallback gate: automatic path honors it, manual refresh may bypass
    if (!options?.allowFallbackBypass && this.fallbackGatedUntilMs !== undefined && now < this.fallbackGatedUntilMs) {
      const outcome: ClaudeUsageOutcome = {
        ok: false,
        code: 'rate_limited',
        reason: 'Claude usage endpoint is in internal fallback gate; waiting for cadence to elapse.'
      };
      this.applyGatedOutcome(outcome, 'Sideline fallback gate', this.fallbackGatedUntilMs);
      return Promise.resolve(outcome);
    }

    this.controller = new AbortController();
    this.inFlight = readClaudeUsageOnce({
      timeoutMs: this.timeoutMs,
      credentialPath: this.credentialPath,
      fetchImpl: this.fetchImpl,
      readFileImpl: this.readFileImpl,
      now: this.now,
      signal: this.controller.signal
    })
      .then((outcome) => {
        this.applyOutcome(outcome);
        return outcome;
      })
      .finally(() => {
        this.inFlight = undefined;
        this.controller = undefined;
      });
    return this.inFlight;
  }

  private applyOutcome(outcome: ClaudeUsageOutcome): void {
    const attemptedAt = new Date(this.now()).toISOString();
    this.lastAttemptMs = this.now();
    this.lastOutcome = outcome;
    if (outcome.ok) {
      this.providerGatedUntilMs = undefined;
      this.fallbackGatedUntilMs = undefined;
      // Structural facts only, never token/credential/raw-payload content — the
      // shape of what the provider actually returned around a reset boundary,
      // where five_hour can be temporarily omitted while seven_day stays valid.
      this.log(`[claude-usage-reader] shape: five_hour_present=${Boolean(outcome.windows.five_hour)} five_hour_not_started=${outcome.windows.five_hour?.resetsAt === null} seven_day_present=${Boolean(outcome.windows.seven_day)}`);
      this.lastChanged = this.ingestFn(outcome.windows);
      this.setStatus({
        state: 'ok',
        lastAttemptAt: attemptedAt,
        lastSuccessAt: attemptedAt,
        gateType: undefined,
        gatedUntil: undefined
      });
      return;
    }
    this.lastChanged = false;
    let gateType: 'provider-directed gate' | 'Sideline fallback gate';
    let gatedUntil: string | undefined;

    if (outcome.code === 'rate_limited' && outcome.retryAfterMs !== undefined && outcome.retryAfterMs > 0) {
      gateType = 'provider-directed gate';
      this.providerGatedUntilMs = this.now() + outcome.retryAfterMs;
      this.fallbackGatedUntilMs = undefined;
      gatedUntil = new Date(this.providerGatedUntilMs).toISOString();
    } else {
      gateType = 'Sideline fallback gate';
      // Sideline fallback gate must NOT exceed the configured refresh cadence
      const delayMs = this.cadenceMinutes * 60_000;
      this.fallbackGatedUntilMs = this.now() + delayMs;
      this.providerGatedUntilMs = undefined;
      gatedUntil = new Date(this.fallbackGatedUntilMs).toISOString();
    }

    this.log(`[claude-usage-reader] ${outcome.code}: ${outcome.reason} (${gateType})`);
    this.setStatus({
      state: outcome.code === 'rate_limited' ? 'rate_limited' : 'unavailable',
      code: outcome.code,
      reason: outcome.reason,
      gateType,
      gatedUntil,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: this.status.lastSuccessAt
    });
  }

  private applyGatedOutcome(
    outcome: ClaudeUsageOutcome,
    gateType: 'provider-directed gate' | 'Sideline fallback gate',
    gatedUntilMs: number
  ): void {
    const attemptedAt = new Date(this.now()).toISOString();
    this.lastChanged = false;
    this.setStatus({
      state: 'rate_limited',
      code: outcome.ok ? undefined : outcome.code,
      reason: outcome.ok ? undefined : outcome.reason,
      gateType,
      gatedUntil: new Date(gatedUntilMs).toISOString(),
      lastAttemptAt: attemptedAt,
      lastSuccessAt: this.status.lastSuccessAt
    });
  }

  private setStatus(next: ClaudeUsageStatus): void {
    const changed = next.state !== this.status.state
      || next.code !== this.status.code
      || next.gateType !== this.status.gateType
      || next.gatedUntil !== this.status.gatedUntil;
    this.status = next;
    if (changed) this.onStatusChange(this.getStatus());
  }

  private scheduleNext(outcome: ClaudeUsageOutcome): void {
    if (this.stopped) return;
    let delayMs: number;
    const now = this.now();
    if (outcome.ok) {
      this.backoffIndex = -1;
      delayMs = this.cadenceMinutes * 60_000;
    } else if (this.providerGatedUntilMs !== undefined && this.providerGatedUntilMs > now) {
      delayMs = this.providerGatedUntilMs - now;
    } else {
      // Fallback gate: capped at configured refresh cadence, never self-escalates
      delayMs = this.cadenceMinutes * 60_000;
    }
    // Two callers can join one in-flight read (scheduled tick + manual/activity
    // read); each reschedules, so replace any pending timer — never run two chains.
    if (this.timer) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => { void this.runAndSchedule(); }, delayMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }
}
