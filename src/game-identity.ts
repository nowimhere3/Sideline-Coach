import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type GameFingerprintSource = 'marker' | 'git-remote' | 'git-root' | 'registry' | 'unknown';

export interface GameIdentity {
  readonly gameId: string;
  readonly displayName: string;
  readonly fingerprintSource: GameFingerprintSource;
  readonly repoUri?: string;
}

export type StadiumType = 'vscode-desktop' | 'vscode-web' | 'standalone';

export interface StadiumIdentity {
  readonly stadiumId: string;
  readonly name: string;
  readonly platform: 'win32' | 'darwin' | 'linux';
  readonly stadiumType: StadiumType;
}

export interface GameStadiumBinding {
  readonly gameId: string;
  readonly stadiumId: string;
  readonly rootFsPath: string;
  readonly boundAt: number;
  readonly isPrimary: boolean;
  readonly status: 'bound' | 'unbound' | 'conflicted';
}

export interface ResolvedGameContext {
  readonly game: GameIdentity;
  readonly stadium: StadiumIdentity;
  readonly binding: GameStadiumBinding;
}

export interface WorkspaceFolderLike {
  readonly uri: { readonly fsPath: string };
  readonly name: string;
}

export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): unknown;
}

export interface GameResolverOptions {
  workspaceFolder?: WorkspaceFolderLike;
  memento?: MementoLike;
  execGit?: (args: string[], cwd: string) => Promise<string>;
}

export const PROJECT_REGISTRY_KEY = 'sidelineCoach.projectRegistry.v1';

/**
 * Normalizes git remote URLs into a canonical representation so that
 * SSH, HTTPS, git://, and port-qualified forms produce the identical fingerprint.
 * No remote servers are contacted.
 */
export function normalizeGitUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return '';
  url = url.replace(/\\/g, '/');
  url = url.replace(/\.git\/?$/i, '').replace(/\/+$/, '');
  url = url.replace(/^(https?|git|ssh|file):\/\//i, '');
  url = url.replace(/^[^@]+@/, '');
  url = url.replace(/^([^/:]+):\d+(\/|$)/, '$1/');
  url = url.replace(/^([^/:]+):/, '$1/');
  url = url.replace(/^\/+/, '');
  return url.toLowerCase();
}

/**
 * Derives a deterministic stadium identity for the current execution host.
 */
export function getStadiumIdentity(): StadiumIdentity {
  const platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const osLabel = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux';
  const host = os.hostname() || 'localhost';
  const hostHash = crypto.createHash('sha256').update(host).digest('hex').slice(0, 6);
  return {
    stadiumId: `stadium_${platform}_${hostHash}`,
    name: osLabel,
    platform,
    stadiumType: 'vscode-desktop'
  };
}

/**
 * Reads local .git/config directly from disk without spawning child processes.
 */
export function readGitRemoteOriginFromConfig(rootFsPath: string): string | undefined {
  try {
    const gitPath = path.join(rootFsPath, '.git');
    if (!fs.existsSync(gitPath)) return undefined;

    let configPath = path.join(gitPath, 'config');
    const stat = fs.statSync(gitPath);
    if (stat.isFile()) {
      // Worktree or submodule: gitdir: <path>
      const content = fs.readFileSync(gitPath, 'utf8');
      const match = content.match(/^gitdir:\s*(.+)$/m);
      if (match) {
        const resolvedGitDir = path.resolve(rootFsPath, match[1].trim());
        configPath = path.join(resolvedGitDir, 'config');
      }
    }

    if (!fs.existsSync(configPath)) return undefined;
    const configContent = fs.readFileSync(configPath, 'utf8');
    const remoteMatch = configContent.match(/\[remote\s+"origin"\][^\[]*\burl\s*=\s*([^\r\n]+)/i);
    return remoteMatch ? remoteMatch[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads optional project marker `.sideline/game.json` if present.
 * Does not create or mutate anything.
 */
export function readGameMarker(rootFsPath: string): { gameId?: string; displayName?: string } | undefined {
  try {
    const markerPath = path.join(rootFsPath, '.sideline', 'game.json');
    if (!fs.existsSync(markerPath)) return undefined;
    const content = fs.readFileSync(markerPath, 'utf8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed !== 'object' || !parsed) return undefined;
    const gameId = typeof parsed.gameId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(parsed.gameId.trim())
      ? parsed.gameId.trim()
      : undefined;
    const displayName = typeof parsed.displayName === 'string' && parsed.displayName.trim()
      ? parsed.displayName.trim()
      : undefined;
    return gameId ? { gameId, displayName } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves Game context synchronously where disk cache/files are available.
 */
export function resolveGameContextSync(options: GameResolverOptions): ResolvedGameContext {
  const stadium = getStadiumIdentity();
  const folder = options.workspaceFolder;

  if (!folder || !folder.uri.fsPath) {
    return {
      game: { gameId: 'unknown', displayName: 'Unknown', fingerprintSource: 'unknown' },
      stadium,
      binding: { gameId: 'unknown', stadiumId: stadium.stadiumId, rootFsPath: '', boundAt: Date.now(), isPrimary: false, status: 'unbound' }
    };
  }

  const rootFsPath = folder.uri.fsPath;

  // Tier 1 — Explicit marker
  const marker = readGameMarker(rootFsPath);
  if (marker?.gameId) {
    const canonicalGameId = marker.gameId.startsWith('game_') ? marker.gameId : `game_marker_${marker.gameId}`;
    return {
      game: {
        gameId: canonicalGameId,
        displayName: marker.displayName || folder.name,
        fingerprintSource: 'marker'
      },
      stadium,
      binding: {
        gameId: canonicalGameId,
        stadiumId: stadium.stadiumId,
        rootFsPath,
        boundAt: Date.now(),
        isPrimary: true,
        status: 'bound'
      }
    };
  }

  // Tier 2 — Git remote origin from .git/config
  const remoteOrigin = readGitRemoteOriginFromConfig(rootFsPath);
  if (remoteOrigin) {
    const normalized = normalizeGitUrl(remoteOrigin);
    if (normalized) {
      const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 8);
      const gameId = `game_git_${hash}`;
      return {
        game: {
          gameId,
          displayName: folder.name,
          fingerprintSource: 'git-remote',
          repoUri: normalized
        },
        stadium,
        binding: {
          gameId,
          stadiumId: stadium.stadiumId,
          rootFsPath,
          boundAt: Date.now(),
          isPrimary: true,
          status: 'bound'
        }
      };
    }
  }

  // Tier 3 — Local registry for non-git workspaces
  const isGit = fs.existsSync(path.join(rootFsPath, '.git'));
  if (!isGit && options.memento) {
    const registry = options.memento.get<Record<string, string>>(PROJECT_REGISTRY_KEY) || {};
    let regGameId = registry[rootFsPath];
    if (!regGameId) {
      regGameId = `game_reg_${crypto.randomBytes(4).toString('hex')}`;
      const updated = { ...registry, [rootFsPath]: regGameId };
      void options.memento.update(PROJECT_REGISTRY_KEY, updated);
    }
    return {
      game: {
        gameId: regGameId,
        displayName: folder.name,
        fingerprintSource: 'registry'
      },
      stadium,
      binding: {
        gameId: regGameId,
        stadiumId: stadium.stadiumId,
        rootFsPath,
        boundAt: Date.now(),
        isPrimary: true,
        status: 'bound'
      }
    };
  }

  // Fallback to unknown or git without remote
  return {
    game: { gameId: 'unknown', displayName: folder.name || 'Unknown', fingerprintSource: 'unknown' },
    stadium,
    binding: { gameId: 'unknown', stadiumId: stadium.stadiumId, rootFsPath, boundAt: Date.now(), isPrimary: false, status: 'unbound' }
  };
}

/**
 * Resolves Game context asynchronously with full Git root-commit fallback support.
 */
export async function resolveGameContext(options: GameResolverOptions): Promise<ResolvedGameContext> {
  const syncResult = resolveGameContextSync(options);
  if (syncResult.game.fingerprintSource === 'marker' || syncResult.game.fingerprintSource === 'git-remote') {
    return syncResult;
  }

  const folder = options.workspaceFolder;
  if (!folder || !folder.uri.fsPath) {
    return syncResult;
  }

  const rootFsPath = folder.uri.fsPath;
  const isGit = fs.existsSync(path.join(rootFsPath, '.git'));

  // Tier 2 Fallback: Git repository without remote origin -> Root commit SHA fallback
  if (isGit) {
    try {
      let rootCommit: string;
      if (options.execGit) {
        rootCommit = await options.execGit(['rev-list', '--max-parents=0', 'HEAD'], rootFsPath);
      } else {
        const { stdout } = await execFileAsync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
          cwd: rootFsPath,
          timeout: 3000,
          windowsHide: true
        });
        rootCommit = stdout;
      }

      const cleanSha = rootCommit.trim().split(/\s+/)[0];
      if (cleanSha && /^[0-9a-f]{40}$/i.test(cleanSha)) {
        const hash = crypto.createHash('sha256').update(`root:${cleanSha.toLowerCase()}`).digest('hex').slice(0, 8);
        const gameId = `game_git_${hash}`;
        return {
          game: {
            gameId,
            displayName: folder.name,
            fingerprintSource: 'git-root'
          },
          stadium: syncResult.stadium,
          binding: {
            gameId,
            stadiumId: syncResult.stadium.stadiumId,
            rootFsPath,
            boundAt: Date.now(),
            isPrimary: true,
            status: 'bound'
          }
        };
      }
    } catch {
      // Git command failed or empty repo with no commits yet
    }
  }

  // Tier 3: Non-git local registry
  if (options.memento) {
    const registry = options.memento.get<Record<string, string>>(PROJECT_REGISTRY_KEY) || {};
    let regGameId = registry[rootFsPath];
    if (!regGameId) {
      regGameId = `game_reg_${crypto.randomBytes(4).toString('hex')}`;
      const updated = { ...registry, [rootFsPath]: regGameId };
      await options.memento.update(PROJECT_REGISTRY_KEY, updated);
    }
    return {
      game: {
        gameId: regGameId,
        displayName: folder.name,
        fingerprintSource: 'registry'
      },
      stadium: syncResult.stadium,
      binding: {
        gameId: regGameId,
        stadiumId: syncResult.stadium.stadiumId,
        rootFsPath,
        boundAt: Date.now(),
        isPrimary: true,
        status: 'bound'
      }
    };
  }

  return syncResult;
}
