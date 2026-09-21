/**
 * Time formatting helpers (S55.1).
 *
 * Provides central, deterministic human-facing time formatting respecting
 * Dad's 12-hour (AM/PM) vs 24-hour preference and Calgary (America/Edmonton)
 * dynamic daylight saving time (MDT in summer, MST in winter).
 *
 * Preserves machine-safe timestamp IDs and filenames (e.g. 2026-09-20_205707_342_MDT).
 */

export type TimeFormatPreference = '12h' | '24h';
export const TIME_FORMAT_VALUES: readonly TimeFormatPreference[] = ['12h', '24h'];
export const DEFAULT_TIME_FORMAT: TimeFormatPreference = '12h';

export function isTimeFormatPreference(value: unknown): value is TimeFormatPreference {
  return value === '12h' || value === '24h';
}

export interface FormatHumanTimeOptions {
  seconds?: boolean;
  timeZone?: boolean;
  date?: boolean;
}

/**
 * Returns the truthful local timezone abbreviation (MDT vs MST) for Calgary (America/Edmonton).
 * Never hardcodes MST year-round: dynamically resolves daylight saving time.
 */
export function getTimeZoneAbbr(date: Date, timeZone = 'America/Edmonton'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, timeZoneName: 'short' }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value || 'MDT';
  } catch {
    return 'MDT';
  }
}

/**
 * Central human-facing time formatter.
 *
 * Examples:
 * - 12h: "8:57 PM" or full "September 20, 2026 · 8:57:07 PM MDT"
 * - 24h: "20:57" or full "September 20, 2026 · 20:57:07 MDT"
 */
export function formatHumanTime(
  timestamp: number | string | Date,
  preference: TimeFormatPreference = DEFAULT_TIME_FORMAT,
  options: FormatHumanTimeOptions = {}
): string {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return '';
  const is24 = preference === '24h';
  const timeZone = 'America/Edmonton';

  const timeOpts: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: is24 ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: !is24
  };
  if (options.seconds) timeOpts.second = '2-digit';
  if (options.timeZone) timeOpts.timeZoneName = 'short';

  if (options.date) {
    const dateStr = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(d);
    const timeStr = new Intl.DateTimeFormat('en-US', timeOpts).format(d);
    return `${dateStr} · ${timeStr}`;
  }

  return new Intl.DateTimeFormat('en-US', timeOpts).format(d);
}
