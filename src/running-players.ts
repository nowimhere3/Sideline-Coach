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
}

export const DEFAULT_PREFERENCES: CoachPreferences = { runningPlayers: 'ask' };

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
    return { runningPlayers: isRunningPlayersPreference(parsed?.runningPlayers) ? parsed.runningPlayers : DEFAULT_PREFERENCES.runningPlayers };
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

/**
 * Browser projection of cached discovery under the human's preference.
 * `ignore` hides running Players from the view only; the cache keeps the truth
 * so switching the preference back needs no rescan.
 */
export function projectDiscovery<T extends { externalCandidates?: unknown[]; runningElsewhere?: unknown[] }>(
  discovery: T | undefined,
  preference: RunningPlayersPreference
): T | null {
  if (!discovery) return null;
  if (preference !== 'ignore') return discovery;
  return { ...discovery, externalCandidates: [], runningElsewhere: [] };
}
