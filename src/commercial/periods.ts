import type { Period } from './grants';

/**
 * S57.2 §6.2 — pure period arithmetic. Every function takes `now` and a local-time
 * offset resolver so tests are deterministic regardless of the machine's zone.
 *
 *   lifetime          'lifetime'                    no reset
 *   daily             'dYYYY-MM-DD' (local day)     next local midnight
 *   monthly calendar  'YYYY-MM' (local month)       first of next local month
 *   monthly anchored  'cN' (billing cycle, UTC)     next anchor-day boundary (day clamped to month length)
 *   rolling N days    daily sub-buckets 'dYYYY-MM-DD'; the last N days are summed; capacity frees at local midnight
 */

export const DAY_MS = 86_400_000;

/** Milliseconds to ADD to a UTC instant to get local wall-clock time at that instant. */
export type LocalOffset = (ms: number) => number;

export const systemLocalOffset: LocalOffset = (ms) => -new Date(ms).getTimezoneOffset() * 60_000;

export const fixedLocalOffset = (minutes: number): LocalOffset => () => minutes * 60_000;

function localDayIndex(ms: number, offset: LocalOffset): number {
  return Math.floor((ms + offset(ms)) / DAY_MS);
}

function dayIndexKey(dayIndex: number): string {
  return `d${new Date(dayIndex * DAY_MS).toISOString().slice(0, 10)}`;
}

/** UTC instant of local midnight that begins local day `dayIndex`. */
function localMidnight(dayIndex: number, offset: LocalOffset): number {
  const guess = dayIndex * DAY_MS;
  return guess - offset(guess - offset(guess));
}

export function dayKey(now: number, offset: LocalOffset = systemLocalOffset): string {
  return dayIndexKey(localDayIndex(now, offset));
}

/** The daily bucket keys a rolling window of `days` covers, today first. */
export function rollingDayKeys(days: number, now: number, offset: LocalOffset = systemLocalOffset): string[] {
  const today = localDayIndex(now, offset);
  return Array.from({ length: days }, (_, back) => dayIndexKey(today - back));
}

function addMonthsClampedUtc(anchor: number, months: number): number {
  const start = new Date(anchor);
  const timeOfDay = anchor - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const total = start.getUTCFullYear() * 12 + start.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)) + timeOfDay;
}

/** Billing cycle index n such that boundary(n) <= now < boundary(n + 1). */
export function anchoredCycle(anchor: number, now: number): number {
  const a = new Date(anchor);
  const b = new Date(now);
  let n = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  while (addMonthsClampedUtc(anchor, n) > now) n--;
  while (addMonthsClampedUtc(anchor, n + 1) <= now) n++;
  return n;
}

/** Storage key for a charge made at `now` under `period`. */
export function periodKey(period: Period, now: number, offset: LocalOffset = systemLocalOffset): string {
  switch (period.kind) {
    case 'lifetime':
      return 'lifetime';
    case 'daily':
    case 'rolling':
      return dayKey(now, offset);
    case 'monthly': {
      if (period.anchor === 'calendar') {
        const local = new Date(now + offset(now));
        return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
      }
      return `c${anchoredCycle(period.anchor, now)}`;
    }
  }
}

/** Bucket keys whose usage counts toward the allowance at `now`. */
export function countedKeys(period: Period, now: number, offset: LocalOffset = systemLocalOffset): string[] {
  return period.kind === 'rolling' ? rollingDayKeys(period.days, now, offset) : [periodKey(period, now, offset)];
}

/**
 * The next instant at which usage stops counting (a reset, or for rolling windows the
 * next local midnight when the oldest day drops out). `undefined` for lifetime.
 */
export function periodEnd(period: Period, now: number, offset: LocalOffset = systemLocalOffset): number | undefined {
  switch (period.kind) {
    case 'lifetime':
      return undefined;
    case 'daily':
    case 'rolling':
      return localMidnight(localDayIndex(now, offset) + 1, offset);
    case 'monthly': {
      if (period.anchor === 'calendar') {
        const local = new Date(now + offset(now));
        const nextLocalMonthStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1);
        return nextLocalMonthStart - offset(nextLocalMonthStart - offset(nextLocalMonthStart));
      }
      return addMonthsClampedUtc(period.anchor, anchoredCycle(period.anchor, now) + 1);
    }
  }
}
