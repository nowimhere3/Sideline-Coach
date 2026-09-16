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

/**
 * Environment for the development host's `Code.exe`.
 *
 * The caller is a VS Code extension host, and an extension host runs with
 * `ELECTRON_RUN_AS_NODE=1` plus VS Code's own `VSCODE_*` process wiring. A
 * child `Code.exe` that inherits `ELECTRON_RUN_AS_NODE` boots as plain Node,
 * rejects `--user-data-dir` as a bad option and exits in milliseconds — no
 * window, no extension host, no Stadium, and (with stdio ignored) no visible
 * error. Field evidence: Add Game created empty dev-host profiles and every
 * new Game stayed Opening. `tools/dev/launch-games.mjs` never hit this only
 * because it runs from an ordinary terminal.
 *
 * The child must start as a fresh VS Code instance, so every variable VS Code
 * sets for its own internal processes is removed. Everything else (PATH,
 * SIDELINE_*, user variables) is preserved.
 */
export function buildDevelopmentInstanceEnv(parentEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(parentEnv)) {
    if (isInheritedVSCodeProcessVariable(key)) continue;
    env[key] = value;
  }
  return env;
}

function isInheritedVSCodeProcessVariable(key: string): boolean {
  const upper = key.toUpperCase();
  return (
    upper === 'ELECTRON_RUN_AS_NODE' ||
    upper === 'ELECTRON_NO_ATTACH_CONSOLE' ||
    upper === 'CHROME_CRASHPAD_PIPE_NAME' ||
    upper.startsWith('VSCODE_')
  );
}

export type DevelopmentLaunchOutcome =
  | { readonly kind: 'started' }                       // still running after the confirmation window
  | { readonly kind: 'handed-off' }                    // exited 0 quickly: an instance for this profile already runs and took the folder
  | { readonly kind: 'failed'; readonly message: string };

/** Structural subset of `child_process.spawn` so the launch contract is testable with real child processes. */
export type SpawnLike = (
  command: string,
  args: readonly string[],
  options: { detached: boolean; stdio: 'ignore'; env: NodeJS.ProcessEnv }
) => {
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
  unref(): void;
};

/** Long enough to catch a boot failure (observed: 35 ms), short enough to stay inside the 5 s `game.open` RPC. */
export const DEVELOPMENT_LAUNCH_CONFIRM_MS = 2_500;

/**
 * Launch a development host and report what actually happened.
 *
 * `spawn()` returning is not evidence that VS Code started. This waits a short
 * bounded window for an asynchronous spawn error or an immediate non-zero exit,
 * so a launch that cannot possibly produce a Stadium fails truthfully instead of
 * leaving the Game Opening until its timeout. Starting is still not Connected:
 * only a Stadium hello makes the Game Connected.
 */
export function launchDevelopmentInstance(options: {
  spawn: SpawnLike;
  executable: string;
  plan: DevelopmentInstancePlan;
  parentEnv: NodeJS.ProcessEnv;
  confirmMs?: number;
}): Promise<DevelopmentLaunchOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: DevelopmentLaunchOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    let child: ReturnType<SpawnLike>;
    try {
      child = options.spawn(options.executable, options.plan.args, {
        detached: true,
        stdio: 'ignore',
        env: buildDevelopmentInstanceEnv(options.parentEnv)
      });
    } catch (error) {
      resolve({ kind: 'failed', message: describeOpenFailure('unknown', error instanceof Error ? error.message : String(error)) });
      return;
    }

    const timer = setTimeout(() => settle({ kind: 'started' }), options.confirmMs ?? DEVELOPMENT_LAUNCH_CONFIRM_MS);
    child.once('error', (error) => settle({ kind: 'failed', message: describeOpenFailure('unknown', error.message) }));
    child.once('exit', (code, signal) => {
      if (code === 0) settle({ kind: 'handed-off' });
      else settle({
        kind: 'failed',
        message: describeOpenFailure('unknown', `The development host exited immediately (${code !== null ? `code ${code}` : `signal ${signal}`}).`)
      });
    });
    child.unref();
  });
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
