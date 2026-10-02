/**
 * S57.39 Usage Freshness Coordinator — the healing half of Codex usage freshness.
 *
 * AlarmEngine only evaluates and alerts, and its `alarm:stale` is gated by Dad's
 * notification preferences, so healing never hangs off it. This coordinator reads the
 * same canonical freshness (providerFreshness) and arms ONE timer at the earliest of:
 *
 *   - Codex `staleAfter`                      → requestRead('stale')
 *   - earliest Codex window resetsAt + grace  → requestRead('reset')
 *
 * It never acquires anything itself; the reader owns acquisition, spacing and backoff.
 * Each deadline fires at most once; `rearm` runs on every HealthAuthority change.
 */

import { providerFreshness, type HealthAuthoritySnapshot } from './health-authority';

export const CODEX_RESET_GRACE_MS = 30_000;
const MAX_TIMER_MS = 2_147_483_647;

export type FreshnessDeadlineReason = 'stale' | 'reset';

export interface FreshnessDeadline {
  readonly reason: FreshnessDeadlineReason;
  /** Epoch ms. May already be past: a missed deadline is due now. */
  readonly at: number;
}

function resetSeconds(win: unknown): number | undefined {
  if (!win || typeof win !== 'object' || Array.isArray(win)) return undefined;
  const value = (win as Record<string, unknown>).resetsAt;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value > 1e11 ? Math.floor(value / 1000) : value;
}

/** Every Codex deadline implied by the snapshot, earliest first. Pure. */
export function codexFreshnessDeadlines(
  snapshot: HealthAuthoritySnapshot,
  now: Date,
  maxStaleAgeMinutes: number,
  resetGraceMs = CODEX_RESET_GRACE_MS
): FreshnessDeadline[] {
  const codex = snapshot.providers.codex;
  if (!codex) return [];
  const deadlines: FreshnessDeadline[] = [];
  const freshness = providerFreshness(codex, now, maxStaleAgeMinutes);
  if (freshness.staleAfter) deadlines.push({ reason: 'stale', at: Date.parse(freshness.staleAfter) + 1 });
  const info = codex.rateLimitInfo ?? {};
  const unified = info.unifiedWindows && typeof info.unifiedWindows === 'object' ? info.unifiedWindows as Record<string, unknown> : {};
  for (const win of [info.primary, info.secondary, unified.five_hour, unified.seven_day]) {
    const seconds = resetSeconds(win);
    if (seconds !== undefined) deadlines.push({ reason: 'reset', at: seconds * 1000 + resetGraceMs });
  }
  return deadlines.sort((a, b) => a.at - b.at);
}

export interface UsageFreshnessCoordinatorOptions {
  reader: { requestRead(reason: FreshnessDeadlineReason): Promise<boolean> };
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (handle: NodeJS.Timeout) => void;
  resetGraceMs?: number;
  log?: (message: string) => void;
}

export class UsageFreshnessCoordinator {
  private readonly now: () => Date;
  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (handle: NodeJS.Timeout) => void;
  private timer: NodeJS.Timeout | undefined;
  private armed: FreshnessDeadline | undefined;
  private readonly fired = new Set<string>();
  private last: { snapshot: HealthAuthoritySnapshot; maxStaleAgeMinutes: number } | undefined;
  private stopped = false;

  constructor(private readonly options: UsageFreshnessCoordinatorOptions) {
    this.now = options.now ?? (() => new Date());
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  /** The deadline the single timer is currently armed for (tests/diagnostics). */
  get armedDeadline(): FreshnessDeadline | undefined {
    return this.armed;
  }

  rearm(snapshot: HealthAuthoritySnapshot, maxStaleAgeMinutes: number): void {
    if (this.stopped) return;
    this.last = { snapshot, maxStaleAgeMinutes };
    if (this.timer) this.clearTimer(this.timer);
    this.timer = undefined;
    const now = this.now();
    const next = codexFreshnessDeadlines(snapshot, now, maxStaleAgeMinutes, this.options.resetGraceMs)
      .find((deadline) => !this.fired.has(key(deadline)));
    this.armed = next;
    if (!next) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, next.at - now.getTime()));
    this.timer = this.setTimer(() => { void this.fire(next); }, delay);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = undefined;
    this.armed = undefined;
  }

  private async fire(deadline: FreshnessDeadline): Promise<void> {
    this.timer = undefined;
    this.armed = undefined;
    if (this.stopped) return;
    this.fired.add(key(deadline));
    if (this.fired.size > 64) this.fired.delete(this.fired.values().next().value as string);
    try {
      await this.options.reader.requestRead(deadline.reason);
    } catch (error) {
      this.options.log?.(`[usage-freshness] ${deadline.reason} read failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    // A successful read re-arms through HealthAuthority; a refused/failed one must still
    // arm the next unfired deadline.
    if (!this.stopped && !this.timer && this.last) this.rearm(this.last.snapshot, this.last.maxStaleAgeMinutes);
  }
}

function key(deadline: FreshnessDeadline): string {
  return `${deadline.reason}:${deadline.at}`;
}
