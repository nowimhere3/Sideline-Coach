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
  /**
   * AI Usage Refresh Frequency — how often the global Claude OAuth usage reader
   * re-acquires account health outside of Sideline Plays (Stadium push evidence
   * during a Play is unaffected and remains sub-second/near-live). The OAuth
   * endpoint is a slower reconciliation source, not a heartbeat: 3 minutes is the
   * floor (field-proven — a 10-second cadence triggered provider HTTP 429
   * throttling within ~10 seconds). There is no arbitrary custom value.
   */
  readonly aiUsageRefreshMinutes: AiUsageRefreshMinutes;
  /** Which viewport edge owns the persistent AI Usage Scoreboard card. Defaults to bottom. */
  readonly aiScoreboardPlacement: AiScoreboardPlacement;
  /** Initial Compact/Expanded state when the Scoreboard first builds each session. Defaults to collapsed. */
  readonly aiScoreboardDefaultExpanded: boolean;
  /** Compact row percentage treatment: left remaining, used, or both. Defaults to left (unchanged prior behavior). */
  readonly aiScoreboardPercentMode: AiScoreboardPercentMode;
  /** Compact row reset treatment: absolute time, countdown, or both. Defaults to absolute (unchanged prior behavior). */
  readonly aiScoreboardResetMode: AiScoreboardResetMode;
  /** Compact row spacing only — never typography. Defaults to standard. */
  readonly aiScoreboardDensity: AiScoreboardDensity;
  /** Compact row separator between percentage and reset: a plain dot or a reset icon. Defaults to separator. */
  readonly aiScoreboardResetMarker: AiScoreboardResetMarker;
  /** Keep the existing Scoreboard visible beside the fullscreen mobile Live Player Terminal. Defaults off. */
  readonly aiScoreboardShowOnMobileLiveTerminal: boolean;
  /** Dev-only remote presentation override. Hard file/credential boundaries are never affected. */
  readonly remoteSensitiveTerminalOutput: boolean;
  /** Remote Access v1 seam. Off unless explicitly enabled; UI arrives in a later stage. */
  readonly remoteAccess?: { enabled: boolean };
}

export type AiScoreboardPlacement = 'top' | 'bottom';
export const AI_SCOREBOARD_PLACEMENT_VALUES: readonly AiScoreboardPlacement[] = ['top', 'bottom'];
export const DEFAULT_AI_SCOREBOARD_PLACEMENT: AiScoreboardPlacement = 'bottom';
export function isAiScoreboardPlacement(value: unknown): value is AiScoreboardPlacement {
  return value === 'top' || value === 'bottom';
}

export type AiScoreboardPercentMode = 'left' | 'used' | 'both';
export const AI_SCOREBOARD_PERCENT_MODE_VALUES: readonly AiScoreboardPercentMode[] = ['left', 'used', 'both'];
export const DEFAULT_AI_SCOREBOARD_PERCENT_MODE: AiScoreboardPercentMode = 'left';
export function isAiScoreboardPercentMode(value: unknown): value is AiScoreboardPercentMode {
  return (AI_SCOREBOARD_PERCENT_MODE_VALUES as readonly unknown[]).includes(value);
}

export type AiScoreboardResetMode = 'absolute' | 'countdown' | 'both';
export const AI_SCOREBOARD_RESET_MODE_VALUES: readonly AiScoreboardResetMode[] = ['absolute', 'countdown', 'both'];
export const DEFAULT_AI_SCOREBOARD_RESET_MODE: AiScoreboardResetMode = 'absolute';
export function isAiScoreboardResetMode(value: unknown): value is AiScoreboardResetMode {
  return (AI_SCOREBOARD_RESET_MODE_VALUES as readonly unknown[]).includes(value);
}

export type AiScoreboardDensity = 'standard' | 'tight';
export const AI_SCOREBOARD_DENSITY_VALUES: readonly AiScoreboardDensity[] = ['standard', 'tight'];
export const DEFAULT_AI_SCOREBOARD_DENSITY: AiScoreboardDensity = 'standard';
export function isAiScoreboardDensity(value: unknown): value is AiScoreboardDensity {
  return value === 'standard' || value === 'tight';
}

export type AiScoreboardResetMarker = 'separator' | 'icon';
export const AI_SCOREBOARD_RESET_MARKER_VALUES: readonly AiScoreboardResetMarker[] = ['separator', 'icon'];
export const DEFAULT_AI_SCOREBOARD_RESET_MARKER: AiScoreboardResetMarker = 'separator';
export function isAiScoreboardResetMarker(value: unknown): value is AiScoreboardResetMarker {
  return value === 'separator' || value === 'icon';
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

export type AiUsageRefreshMinutes = 3 | 5 | 10 | 15;
export const AI_USAGE_REFRESH_MINUTES_VALUES: readonly AiUsageRefreshMinutes[] = [3, 5, 10, 15];
export const DEFAULT_AI_USAGE_REFRESH_MINUTES: AiUsageRefreshMinutes = 5;

export function isAiUsageRefreshMinutes(value: unknown): value is AiUsageRefreshMinutes {
  return (AI_USAGE_REFRESH_MINUTES_VALUES as readonly unknown[]).includes(value);
}

export const DEFAULT_PREFERENCES: CoachPreferences = {
  runningPlayers: 'ask', devMode: false, livePlayerConsole: false, advancedPlayerDiscovery: false, terminalRetention: DEFAULT_TERMINAL_RETENTION, timeFormat: DEFAULT_TIME_FORMAT,
  aiUsageRefreshMinutes: DEFAULT_AI_USAGE_REFRESH_MINUTES,
  aiScoreboardPlacement: DEFAULT_AI_SCOREBOARD_PLACEMENT,
  aiScoreboardDefaultExpanded: false,
  aiScoreboardPercentMode: DEFAULT_AI_SCOREBOARD_PERCENT_MODE,
  aiScoreboardResetMode: DEFAULT_AI_SCOREBOARD_RESET_MODE,
  aiScoreboardDensity: DEFAULT_AI_SCOREBOARD_DENSITY,
  aiScoreboardResetMarker: DEFAULT_AI_SCOREBOARD_RESET_MARKER,
  aiScoreboardShowOnMobileLiveTerminal: false,
  remoteSensitiveTerminalOutput: false,
  remoteAccess: { enabled: false }
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
      timeFormat: isTimeFormatPreference(parsed?.timeFormat) ? parsed.timeFormat : DEFAULT_TIME_FORMAT,
      // Deliberately reads only the new `aiUsageRefreshMinutes` key. A legacy
      // file's old `aiUsageRefreshSeconds` (10/15/20/25/30, seconds-era) is never
      // read or reinterpreted as minutes — it's silently orphaned, and this
      // falls straight through to the 5-minute default. That's the whole
      // migration: deterministic, no numeric reinterpretation, no surprises.
      aiUsageRefreshMinutes: isAiUsageRefreshMinutes(parsed?.aiUsageRefreshMinutes) ? parsed.aiUsageRefreshMinutes : DEFAULT_AI_USAGE_REFRESH_MINUTES,
      aiScoreboardPlacement: isAiScoreboardPlacement(parsed?.aiScoreboardPlacement) ? parsed.aiScoreboardPlacement : DEFAULT_AI_SCOREBOARD_PLACEMENT,
      aiScoreboardDefaultExpanded: parsed?.aiScoreboardDefaultExpanded === true,
      aiScoreboardPercentMode: isAiScoreboardPercentMode(parsed?.aiScoreboardPercentMode) ? parsed.aiScoreboardPercentMode : DEFAULT_AI_SCOREBOARD_PERCENT_MODE,
      aiScoreboardResetMode: isAiScoreboardResetMode(parsed?.aiScoreboardResetMode) ? parsed.aiScoreboardResetMode : DEFAULT_AI_SCOREBOARD_RESET_MODE,
      aiScoreboardDensity: isAiScoreboardDensity(parsed?.aiScoreboardDensity) ? parsed.aiScoreboardDensity : DEFAULT_AI_SCOREBOARD_DENSITY,
      aiScoreboardResetMarker: isAiScoreboardResetMarker(parsed?.aiScoreboardResetMarker) ? parsed.aiScoreboardResetMarker : DEFAULT_AI_SCOREBOARD_RESET_MARKER,
      aiScoreboardShowOnMobileLiveTerminal: parsed?.aiScoreboardShowOnMobileLiveTerminal === true,
      remoteSensitiveTerminalOutput: parsed?.remoteSensitiveTerminalOutput === true,
      remoteAccess: { enabled: parsed?.remoteAccess?.enabled === true }
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
