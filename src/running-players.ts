/**
 * Running Players preference — what Coach does when it finds a supported Player
 * already running in a Game that Coach did not start.
 *
 *   ask       (default) Offer "Add to Roster". Never seize a human's process.
 *   auto-add  Adopt it automatically. Ownership stays `adopted`, so removing the
 *             Player never closes the human's own terminal.
 *   ignore    Don't offer running Players; "Add" always starts a new one.
 *
 * Only a human changes this. Coach never infers it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type RunningPlayersPreference = 'ask' | 'auto-add' | 'ignore';

export interface CoachPreferences {
  readonly runningPlayers: RunningPlayersPreference;
  /** Advanced observability/configuration only; never changes Play execution semantics. */
  readonly devMode: boolean;
  /**
   * Live Player Console — a Dev-Mode-gated, independently optional presentation
   * setting. Dev Mode is only the visibility gate; this flag alone does nothing
   * unless Dev Mode is also on (the browser enforces the AND). Presentation only:
   * it never touches routing, execution, or Player identity.
   */
  readonly livePlayerConsole: boolean;
  /**
   * Advanced Player Discovery — a Dev-Mode-gated presentation setting that reveals
   * raw adoptable developer terminals (powershell, node, bash, …) in Player
   * recruitment. Visibility is `devMode && advancedPlayerDiscovery`; underlying
   * discovery is never stopped or mutated, and adoption itself is never gated.
   */
  readonly advancedPlayerDiscovery: boolean;
  /**
   * Terminal Success Retention — how long SUCCESSFUL completed Terminal evidence stays
   * available after the command finishes. Failed / unknown evidence is never timed.
   * Presentation only: the browser owns the evidence record and applies this value;
   * it never touches Terminal execution, output transport, routing or reports.
   */
  readonly terminalRetention: TerminalRetention;
  /**
   * Time Format — user-selectable 12-hour (8:57 PM) vs 24-hour (20:57) clock
   * format for human-facing Sideline presentation. Defaults to '12h'.
   */
  readonly timeFormat: TimeFormatPreference;
}

export type TerminalRetention = '30s' | '5m' | '30m' | 'until-dismissed';
export const TERMINAL_RETENTION_VALUES: readonly TerminalRetention[] = ['30s', '5m', '30m', 'until-dismissed'];
export const DEFAULT_TERMINAL_RETENTION: TerminalRetention = '5m';

export function isTerminalRetention(value: unknown): value is TerminalRetention {
  return typeof value === 'string' && (TERMINAL_RETENTION_VALUES as readonly string[]).includes(value);
}

export type TimeFormatPreference = '12h' | '24h';
export const TIME_FORMAT_VALUES: readonly TimeFormatPreference[] = ['12h', '24h'];
export const DEFAULT_TIME_FORMAT: TimeFormatPreference = '12h';

export function isTimeFormatPreference(value: unknown): value is TimeFormatPreference {
  return value === '12h' || value === '24h';
}

export const DEFAULT_PREFERENCES: CoachPreferences = {
  runningPlayers: 'ask', devMode: false, livePlayerConsole: false, advancedPlayerDiscovery: false, terminalRetention: DEFAULT_TERMINAL_RETENTION, timeFormat: DEFAULT_TIME_FORMAT
};

export function isRunningPlayersPreference(value: unknown): value is RunningPlayersPreference {
  return value === 'ask' || value === 'auto-add' || value === 'ignore';
}

export const RUNNING_PLAYERS_SAVED: Readonly<Record<RunningPlayersPreference, string>> = {
  'ask': 'Coach will ask before adding a Player that is already running.',
  'auto-add': 'Coach will add running Players to your Roster automatically. It will never close them.',
  'ignore': 'Coach will ignore Players that are already running.'
};

/** Missing, unreadable or malformed preferences fall back to the safe default. */
export function loadPreferences(filePath: string): CoachPreferences {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<CoachPreferences>;
    return {
      runningPlayers: isRunningPlayersPreference(parsed?.runningPlayers) ? parsed.runningPlayers : DEFAULT_PREFERENCES.runningPlayers,
      devMode: parsed?.devMode === true,
      livePlayerConsole: parsed?.livePlayerConsole === true,
      advancedPlayerDiscovery: parsed?.advancedPlayerDiscovery === true,
      terminalRetention: isTerminalRetention(parsed?.terminalRetention) ? parsed.terminalRetention : DEFAULT_TERMINAL_RETENTION,
      timeFormat: isTimeFormatPreference(parsed?.timeFormat) ? parsed.timeFormat : DEFAULT_TIME_FORMAT
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Atomic write: a crash mid-save can never leave a half-written preferences file. */
export function savePreferences(filePath: string, preferences: CoachPreferences): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(preferences, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, filePath);
}

/** Effective Advanced Player Discovery visibility: Dev Mode is the gate; the stored flag alone does nothing. */
export function advancedPlayerDiscoveryVisible(preferences: Pick<CoachPreferences, 'devMode' | 'advancedPlayerDiscovery'>): boolean {
  return preferences.devMode === true && preferences.advancedPlayerDiscovery === true;
}

/**
 * Browser projection of cached discovery under the human's preferences.
 * `ignore` hides running Players from the view only; unless Advanced Player
 * Discovery is effectively on, raw adoptable developer terminals are hidden too.
 * The cache keeps the truth so switching either back needs no rescan.
 */
export function projectDiscovery<T extends { externalCandidates?: unknown[]; runningElsewhere?: unknown[]; adoptableTerminals?: unknown[] }>(
  discovery: T | undefined,
  preference: RunningPlayersPreference,
  advancedVisible = false
): T | null {
  if (!discovery) return null;
  const hideAdoptable = !advancedVisible && Array.isArray(discovery.adoptableTerminals) && discovery.adoptableTerminals.length > 0;
  if (preference !== 'ignore' && !hideAdoptable) return discovery;
  return {
    ...discovery,
    ...(preference === 'ignore' ? { externalCandidates: [], runningElsewhere: [] } : {}),
    ...(hideAdoptable ? { adoptableTerminals: [] } : {})
  };
}
