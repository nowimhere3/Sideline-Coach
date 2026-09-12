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
export const GAME_REGISTRY_KEY = 'sidelineCoach.gameRegistry.v1';
export const SELECTED_GAME_KEY = 'sidelineCoach.selectedGameId';

export interface GameRecord {
  readonly gameId: string;
  readonly displayName: string;
  readonly fingerprintSource: GameFingerprintSource;
  readonly repoUri?: string;
  readonly knownRootFsPaths: string[];
  readonly addedAt: number;
  lastSeenAt: number;
  isArchived?: boolean;
}

export interface GameRegistryState {
  readonly version: 1;
  readonly games: Record<string, GameRecord>;
  selectedGameId?: string;
}

export function loadGameRegistry(memento: MementoLike): GameRegistryState {
  const data = memento.get<GameRegistryState>(GAME_REGISTRY_KEY);
  if (data && typeof data === 'object' && data.version === 1 && typeof data.games === 'object') {
    return {
      version: 1,
      games: { ...data.games },
      selectedGameId: memento.get<string>(SELECTED_GAME_KEY) || data.selectedGameId
    };
  }
  return { version: 1, games: {}, selectedGameId: memento.get<string>(SELECTED_GAME_KEY) };
}

export function saveGameRegistry(memento: MementoLike, state: GameRegistryState): void {
  void memento.update(GAME_REGISTRY_KEY, state);
  if (state.selectedGameId) {
    void memento.update(SELECTED_GAME_KEY, state.selectedGameId);
  }
}

export function getSelectedGameId(memento: MementoLike): string | undefined {
  return memento.get<string>(SELECTED_GAME_KEY) || loadGameRegistry(memento).selectedGameId;
}

export function setSelectedGameId(memento: MementoLike, gameId: string): void {
  void memento.update(SELECTED_GAME_KEY, gameId);
  const registry = loadGameRegistry(memento);
  registry.selectedGameId = gameId;
  void memento.update(GAME_REGISTRY_KEY, registry);
}

export function registerGameInRegistry(
  memento: MementoLike,
  game: GameIdentity,
  rootFsPath?: string
): { registry: GameRegistryState; record: GameRecord; isNew: boolean } {
  const registry = loadGameRegistry(memento);
  const now = Date.now();
  const normalizedPath = rootFsPath ? path.resolve(rootFsPath) : undefined;

  let existing = registry.games[game.gameId];
  if (!existing && game.repoUri) {
    for (const rec of Object.values(registry.games)) {
      if (rec.repoUri && rec.repoUri === game.repoUri) {
        existing = rec;
        break;
      }
    }
  }

  if (existing) {
    existing.lastSeenAt = now;
    if (normalizedPath && !existing.knownRootFsPaths.includes(normalizedPath)) {
      existing.knownRootFsPaths.push(normalizedPath);
    }
    if (game.displayName && existing.displayName === 'Unknown') {
      (existing as { displayName: string }).displayName = game.displayName;
    }
    saveGameRegistry(memento, registry);
    return { registry, record: existing, isNew: false };
  }

  const newRecord: GameRecord = {
    gameId: game.gameId,
    displayName: game.displayName,
    fingerprintSource: game.fingerprintSource,
    repoUri: game.repoUri,
    knownRootFsPaths: normalizedPath ? [normalizedPath] : [],
    addedAt: now,
    lastSeenAt: now,
    isArchived: false
  };

  registry.games[game.gameId] = newRecord;
  saveGameRegistry(memento, registry);
  return { registry, record: newRecord, isNew: true };
}

export function archiveGameInRegistry(
  memento: MementoLike,
  gameId: string,
  archive = true
): GameRecord | undefined {
  const registry = loadGameRegistry(memento);
  const record = registry.games[gameId];
  if (!record) return undefined;
  record.isArchived = archive;
  saveGameRegistry(memento, registry);
  return record;
}

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
 * Resolves or creates a durable Stadium ID stored at ~/.sideline/stadium-id.
 * Starts with 'stadium_' and survives restarts and window closures.
 */
export function getDurableStadiumId(dir?: string): string {
  const targetDir = dir ?? path.join(os.homedir(), '.sideline');
  const filePath = path.join(targetDir, 'stadium-id');
  try {
    if (fs.existsSync(filePath)) {
      const id = fs.readFileSync(filePath, 'utf8').trim();
      if (id && id.startsWith('stadium_')) return id;
    }
  } catch {
    // Ignore filesystem read errors and fall back.
  }
  if (process.env.CODESPACE_NAME) {
    return `stadium_codespace_${process.env.CODESPACE_NAME}`;
  }
  const platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const id = `stadium_${platform}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(filePath, id, 'utf8');
  } catch {
    // Ignore write failure in restricted environments.
  }
  return id;
}

let sessionCounter = 0;

/**
 * Creates a unique per-window session instance ID.
 */
export function createSessionInstanceId(stadiumId: string): string {
  return `inst_${stadiumId}_p${process.pid}_${Date.now()}_${++sessionCounter}`;
}

/**
 * Derives a deterministic stadium identity for the current execution host.
 */
export function getStadiumIdentity(dir?: string): StadiumIdentity {
  const platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const osLabel = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux';
  const stadiumId = getDurableStadiumId(dir);
  return {
    stadiumId,
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
