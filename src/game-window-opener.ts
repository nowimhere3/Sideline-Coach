/**
 * How Coach opens a VS Code window for a Game.
 *
 * PRODUCT PATH (the real one): Sideline Coach is installed as a normal
 * extension, so `vscode.openFolder` opens another window in the human's own
 * VS Code instance, with their profile and their extensions, and Coach
 * activates there like any other extension. No CLI, no PATH, no ports.
 *
 * DEVELOPMENT PATH (quarantined): under an Extension Development Host the
 * extension is loaded from `--extensionDevelopmentPath` and is NOT installed,
 * so a window opened by `vscode.openFolder` would contain no Coach at all and
 * the Game could never connect. Q2.8G established that a second Extension
 * Development Host for the same extension source requires a separate VS Code
 * instance, keyed by `--user-data-dir`. This module reuses that proven shape so
 * the Add Game lifecycle is testable before the extension is packaged.
 *
 * The two paths must not be confused. The development path exists only so the
 * human can field-test Add Game today; it is never what a customer runs.
 */

import * as path from 'node:path';

export type GameOpenStrategy = 'vscode-open-folder' | 'development-instance';

/**
 * `extensionMode` mirrors `vscode.ExtensionMode`: 1 Production, 2 Development, 3 Test.
 * Only a real installed extension can use the product path.
 */
export function chooseOpenStrategy(extensionMode: number): GameOpenStrategy {
  return extensionMode === 2 ? 'development-instance' : 'vscode-open-folder';
}

export interface DevelopmentInstancePlan {
  readonly userDataDir: string;
  readonly extensionsDir: string;
  readonly args: string[];
}

/**
 * Arguments for a development-mode Extension Development Host on `folderPath`.
 *
 * The profile directory is derived from the Game id so reopening the same Game
 * reuses its window rather than stacking up new instances, and so two different
 * Games can never collide on one `--user-data-dir` (which is precisely the
 * collision that made two live Games impossible before Q2.8G).
 */
export function buildDevelopmentInstancePlan(options: {
  extensionSourcePath: string;
  folderPath: string;
  gameId: string;
  devHostsDir: string;
}): DevelopmentInstancePlan {
  const profileRoot = path.join(options.devHostsDir, sanitiseProfileName(options.gameId));
  const userDataDir = path.join(profileRoot, 'user-data');
  const extensionsDir = path.join(profileRoot, 'extensions');

  return {
    userDataDir,
    extensionsDir,
    args: [
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      '--disable-workspace-trust',
      `--extensionDevelopmentPath=${options.extensionSourcePath}`,
      options.folderPath
    ]
  };
}

/** Keep a gameId usable as a directory name without ever escaping the profile root. */
export function sanitiseProfileName(gameId: string): string {
  const cleaned = gameId.replace(/[^A-Za-z0-9_-]/g, '_');
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'game';
}

/**
 * Plain-language explanation when an open cannot be attempted at all.
 * The human should never be shown a stack trace as the primary message.
 */
export function describeOpenFailure(reason: 'no-vscode' | 'no-folder' | 'unknown', detail?: string): string {
  switch (reason) {
    case 'no-vscode':
      return 'Coach could not find VS Code to open this Game. Set SIDELINE_DEV_VSCODE to your VS Code executable and try again.';
    case 'no-folder':
      return 'That folder is no longer available. Choose the repository again.';
    default:
      return detail ? `Coach could not open this Game. ${detail}` : 'Coach could not open this Game.';
  }
}
