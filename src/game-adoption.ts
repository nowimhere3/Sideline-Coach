/**
 * Add Game adoption — turning a folder the human deliberately chose into a Game.
 *
 * A Game does not need GitHub, and does not need Git. What it needs is an identity
 * that EVERY Stadium derives identically from the folder itself: the window that
 * showed the picker, the development host Coach launches for the Game (its own
 * `--user-data-dir`, so its own globalState), and any later window or machine.
 *
 * Identity ladder (unchanged resolver order in game-identity.ts):
 *   1. `.sideline/game.json` marker          — explicit, travels with the folder
 *   2. Git remote origin (normalized)          — shared by every clone
 *   3. otherwise: explicit Add Game ADOPTS the folder by writing (1)
 *
 * Why the marker and not the alternatives:
 * - The Stadium-local project registry mints a random id in VS Code globalState,
 *   which is per profile. The picking window and the launched host would mint
 *   DIFFERENT ids for the same folder, so the new Stadium could never bind.
 * - A root-commit hash needs a git binary, forks on history rewrite, and does not
 *   exist for a plain folder.
 * The marker outranks a remote, so a local Game that later gains a GitHub remote
 * keeps its Game id, and a moved or renamed folder keeps it too.
 *
 * Adoption never overwrites anything and never touches a folder that already has
 * strong identity. It writes only into the exact folder the human chose.
 *
 * BREADCRUMB — exact folder authority.
 *
 * WAS: Add Game refused an explicitly chosen folder when it was nested inside another
 * Git repository ("inside-repository"), telling the human to choose the parent's top
 * folder instead. Field evidence rejected that: a project folder under a larger
 * repository (for example a userscript project inside a shared TamperMonkey repo) is
 * a legitimate Game, and the human should not have to move it or run `git init`.
 *
 * IS: explicit human folder choice authorizes that exact folder to become a Game.
 * When it lacks strong identity of its own, Sideline gives it its own
 * `.sideline/game.json`, inside that folder only. The enclosing repository is never
 * consulted for identity and never written to: the resolver reads only
 * `<root>/.sideline/game.json` and `<root>/.git`, and never walks upward.
 *
 * WHY: repository structure is plumbing. Dad already chose the project boundary and
 * should not have to reorganize files or understand Git internals to use Sideline.
 *
 * WILL BE: V1 Game bootstrap can treat any deliberately selected writable project
 * folder as the Game boundary, independent of GitHub or the enclosing repository layout.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { normalizeGitUrl, readGameMarker, readGitRemoteOriginFromConfig } from './game-identity';

export const GAME_MARKER_DIR = '.sideline';
export const GAME_MARKER_FILE = 'game.json';

export type GameAdoptionOutcome =
  /** Strong identity already exists; nothing was written. */
  | { readonly kind: 'existing'; readonly source: 'marker' | 'git-remote' }
  /** Coach wrote a new marker; every Stadium now resolves this gameId. */
  | { readonly kind: 'adopted'; readonly gameId: string; readonly displayName: string; readonly markerPath: string }
  | { readonly kind: 'refused'; readonly reason: GameAdoptionRefusal; readonly message: string };

export type GameAdoptionRefusal =
  | 'not-a-folder'
  | 'filesystem-root'
  | 'home-folder'
  | 'marker-unreadable'
  | 'not-writable';

export interface GameAdoptionOptions {
  readonly homeDir?: string;
  readonly mintGameId?: () => string;
  readonly now?: () => Date;
}

export function mintLocalGameId(): string {
  return `game_local_${crypto.randomBytes(8).toString('hex')}`;
}

/** Establish (or confirm) a portable Game identity for a folder the human explicitly chose. */
export function adoptGameFolder(folderPath: string, options: GameAdoptionOptions = {}): GameAdoptionOutcome {
  const root = path.resolve(folderPath);
  const name = path.basename(root) || 'Game';

  let isDirectory = false;
  try { isDirectory = fs.statSync(root).isDirectory(); } catch { isDirectory = false; }
  if (!isDirectory) {
    return refused('not-a-folder', 'That folder is no longer available. Choose it again.');
  }
  if (path.parse(root).root === root) {
    return refused('filesystem-root', 'Coach can’t use a whole drive as a Game. Choose your project’s folder.');
  }
  if (samePath(root, options.homeDir ?? os.homedir())) {
    return refused('home-folder', 'Coach can’t use your whole home folder as a Game. Choose your project’s folder.');
  }

  const markerPath = path.join(root, GAME_MARKER_DIR, GAME_MARKER_FILE);
  if (fs.existsSync(markerPath)) {
    return readGameMarker(root)?.gameId
      ? { kind: 'existing', source: 'marker' }
      : refused('marker-unreadable', 'That folder already has a Sideline Game file Coach can’t read, so Coach left it untouched.');
  }

  const origin = readGitRemoteOriginFromConfig(root);
  if (origin && normalizeGitUrl(origin)) {
    return { kind: 'existing', source: 'git-remote' };
  }

  // No enclosing-repository check, deliberately (see the breadcrumb above). The folder the
  // human chose is the Game, wherever it sits in a Git tree.
  return writeMarker(root, name, markerPath, options);
}

function writeMarker(root: string, displayName: string, markerPath: string, options: GameAdoptionOptions): GameAdoptionOutcome {
  const markerDir = path.dirname(markerPath);
  const createdDir = !fs.existsSync(markerDir);
  const gameId = (options.mintGameId ?? mintLocalGameId)();
  const body = {
    version: 1,
    gameId,
    displayName,
    createdBy: 'Sideline Coach (Add Game)',
    createdAt: (options.now?.() ?? new Date()).toISOString()
  };

  try {
    fs.mkdirSync(markerDir, { recursive: true });
    // 'wx': exclusive create. A concurrent adoption, or a marker that appeared since
    // the check above, is never overwritten.
    fs.writeFileSync(markerPath, `${JSON.stringify(body, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST' && readGameMarker(root)?.gameId) {
      return { kind: 'existing', source: 'marker' };
    }
    if (createdDir) removeIfEmpty(markerDir);
    return refused('not-writable', 'Coach couldn’t save its Game file in that folder. Check that the folder isn’t read-only, then try again.');
  }

  if (readGameMarker(root)?.gameId !== gameId) {
    return refused('not-writable', 'Coach couldn’t confirm its Game file in that folder. Try again.');
  }
  return { kind: 'adopted', gameId, displayName, markerPath };
}

function removeIfEmpty(dir: string): void {
  try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch { /* best effort */ }
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function refused(reason: GameAdoptionRefusal, message: string): GameAdoptionOutcome {
  return { kind: 'refused', reason, message };
}
