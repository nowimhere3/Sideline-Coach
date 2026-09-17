/**
 * Neutral, Stadium-owned Game filesystem discovery.
 *
 * Metadata only. Every operation is confined to one authoritative Game root and
 * shares the same visibility policy. This module deliberately has no vscode or
 * Control Plane dependency so the filesystem contract is unit-testable.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PLUMBING_SLC_ROOT_PATH,
  recognizeReportRootName,
  recognizeSopRootName,
  type AttentionCode,
  type CandidateSafety,
  type GameFilesystemEvidence,
  type NestedReportRootEvidence,
  type ReportRootCandidateEvidence,
  type SopRootCandidateEvidence
} from './game-filesystem-contract';

export interface GameFileEntry {
  name: string;
  path: string;
  kind: 'file' | 'folder';
}

export type GamePathState = 'file' | 'folder' | 'missing' | 'blocked' | 'unknown';

export interface BrowseGameDirectoryResult {
  dir: string;
  entries: GameFileEntry[];
  truncated: boolean;
}

export type GameFileSearchLimitReason = 'entries' | 'directories' | 'depth' | 'time';

export interface SearchGameFilesOptions {
  limit?: number;
  maxEntries?: number;
  maxDirectories?: number;
  maxDepth?: number;
  deadlineMs?: number;
  yieldEvery?: number;
  /** Test seam for deterministic deadline proof. */
  now?: () => number;
  /** A one-character query is only valid for a future explicit Enter submission. */
  allowSingleCharacter?: boolean;
}

export interface SearchGameFilesResult {
  query: string;
  results: GameFileEntry[];
  truncated: boolean;
  limitReason?: GameFileSearchLimitReason;
  moreMatches: boolean;
  superseded?: boolean;
}

export type AbsoluteGamePathUnavailableReason = 'missing' | 'blocked' | 'unknown' | 'virtual-workspace';

export interface AbsoluteGamePathEnvironment {
  workspaceScheme?: string;
  remoteName?: string;
  platform?: NodeJS.Platform;
}

export type ResolveAbsoluteGamePathResult =
  | {
      path: string;
      available: true;
      absolutePath: string;
      pathStyle: 'windows' | 'posix';
      environment: 'local' | 'remote';
      remoteLabel?: 'WSL' | 'SSH' | 'Dev Container' | 'Remote';
    }
  | { path: string; available: false; reason: AbsoluteGamePathUnavailableReason };

export const MAX_GAME_PATH_CHECKS = 20;
const MAX_BROWSE_SCAN_ENTRIES = 1_000;
const MAX_BROWSE_RESULT_ENTRIES = 200;
export const DEFAULT_GAME_FILE_SEARCH_LIMIT = 50;
export const MAX_GAME_FILE_SEARCH_LIMIT = 100;
export const MAX_GAME_FILE_SEARCH_ENTRIES = 20_000;
export const MAX_GAME_FILE_SEARCH_DIRECTORIES = 2_000;
export const MAX_GAME_FILE_SEARCH_DEPTH = 8;
export const GAME_FILE_SEARCH_DEADLINE_MS = 1_500;
const GAME_FILE_SEARCH_YIELD_EVERY = 250;
const MAX_GAME_FILE_SEARCH_QUERY = 120;

export function isBlockedSegment(segment: string): boolean {
  const lower = segment.toLowerCase().trim();
  if (lower === '.git' || lower === 'node_modules' || lower === '.sideline' || lower === 'secrets') return true;
  if (lower.startsWith('credentials')) return true;
  return false;
}

export function isBlockedFile(filename: string): boolean {
  const lower = filename.toLowerCase().trim();
  if (lower === '.env' || lower.startsWith('.env.') || lower.startsWith('.env_') || lower.startsWith('.env-')) return true;
  if (/\.(?:pem|key|pfx)$/i.test(lower)) return true;
  if (lower.startsWith('id_rsa')) return true;
  if (lower === 'token' || lower === '.token') return true;
  return false;
}

export function isBlockedRelativePath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  for (const segment of segments) {
    if (isBlockedSegment(segment)) return true;
  }
  const basename = segments[segments.length - 1];
  return Boolean(basename && isBlockedFile(basename));
}

export function validateRelativeGamePath(relPath: string): { valid: boolean; normalized: string; reason?: string } {
  if (typeof relPath !== 'string') return { valid: false, normalized: '', reason: 'Path must be a string.' };
  const trimmed = relPath.trim();
  if (!trimmed) return { valid: false, normalized: '', reason: 'Path cannot be empty.' };
  if (trimmed.length > 240) return { valid: false, normalized: '', reason: 'Path exceeds maximum length.' };
  if (/[\u0000-\u001f]/.test(trimmed)) return { valid: false, normalized: '', reason: 'Path contains invalid control characters.' };
  if (/^[a-zA-Z]:/i.test(trimmed)) return { valid: false, normalized: '', reason: 'Absolute Windows drive paths are not allowed.' };
  if (/^[/\\]{1,2}/.test(trimmed)) return { valid: false, normalized: '', reason: 'Absolute and UNC paths are not allowed.' };

  const normalized = trimmed.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return { valid: false, normalized: '', reason: 'Path traversal is not allowed.' };
  }
  return { valid: true, normalized };
}

/** Correlation normalization only. Stadium validation remains authoritative. */
export function normalizeGamePathForCorrelation(rawPath: unknown): string {
  const trimmed = String(rawPath ?? '').trim();
  if (trimmed === '.') return '.';
  return trimmed.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
}

/** Compatibility name retained for Coach Routines and existing callers. */
export const validateRelativeSourcePath = validateRelativeGamePath;

export function isPathInsideRoot(rootFsPath: string, candidateFsPath: string): boolean {
  const root = path.resolve(rootFsPath);
  const candidate = path.resolve(candidateFsPath);
  if (process.platform === 'win32') {
    const rootLower = root.toLowerCase();
    const candidateLower = candidate.toLowerCase();
    return candidateLower === rootLower || candidateLower.startsWith(rootLower.endsWith(path.sep) ? rootLower : rootLower + path.sep);
  }
  const relative = path.relative(root, candidate);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function checkAncestorSymlinkEscape(rootFsPath: string, realRoot: string, targetFsPath: string): Promise<boolean> {
  let current = path.dirname(targetFsPath);
  while (isPathInsideRoot(rootFsPath, current)) {
    try {
      const realCurrent = await fs.promises.realpath(current);
      return !isPathInsideRoot(realRoot, realCurrent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      } else {
        return false;
      }
    }
  }
  return false;
}

export async function checkGamePaths(
  rootFsPath: string,
  paths: readonly string[]
): Promise<Array<{ path: string; state: GamePathState }>> {
  if (paths.length > MAX_GAME_PATH_CHECKS) throw new Error(`At most ${MAX_GAME_PATH_CHECKS} paths can be checked at once.`);
  if (!rootFsPath) return paths.map((candidate) => ({ path: String(candidate ?? ''), state: 'unknown' }));

  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(rootFsPath);
  } catch {
    return paths.map((candidate) => ({ path: String(candidate ?? ''), state: 'unknown' }));
  }

  const results: Array<{ path: string; state: GamePathState }> = [];
  for (const raw of paths) {
    const validation = validateRelativeGamePath(raw);
    if (!validation.valid || isBlockedRelativePath(validation.normalized)) {
      results.push({ path: String(raw ?? ''), state: 'blocked' });
      continue;
    }
    const targetFsPath = path.resolve(rootFsPath, validation.normalized);
    if (!isPathInsideRoot(rootFsPath, targetFsPath)) {
      results.push({ path: raw, state: 'blocked' });
      continue;
    }

    try {
      const realTarget = await fs.promises.realpath(targetFsPath);
      if (!isPathInsideRoot(realRoot, realTarget)) {
        results.push({ path: raw, state: 'blocked' });
        continue;
      }
      const stat = await fs.promises.stat(targetFsPath);
      results.push({
        path: raw,
        state: stat.isFile() ? 'file' : stat.isDirectory() ? 'folder' : 'blocked'
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        results.push({ path: raw, state: await checkAncestorSymlinkEscape(rootFsPath, realRoot, targetFsPath) ? 'blocked' : 'missing' });
      } else if (code === 'EACCES' || code === 'EPERM') {
        results.push({ path: raw, state: 'blocked' });
      } else {
        results.push({ path: raw, state: 'unknown' });
      }
    }
  }
  return results;
}

// --- S8.0: narrow, verified Game-relative directory creation. ---
//
// Ensure means "create missing required structure", never "reconcile the whole
// filesystem to match a roster". Every call is one exact directory, one exact
// Game, contained, non-destructive, and idempotent.

const MAX_ENSURE_LANES = 16;

export interface EnsureGameDirectoryOutcome {
  state: 'ready' | 'needs-attention';
  created: boolean;
  attention?: { code: AttentionCode; detail?: string };
}

/**
 * Creates exactly one Game-relative directory if (and only if) nothing is
 * already there. An existing directory is idempotent success. An existing
 * file, an escaping symlink, or a containment violation is a truthful
 * `needs-attention` outcome — never an overwrite, delete, or rename.
 */
export async function ensureGameDirectory(rootFsPath: string, relPath: string): Promise<EnsureGameDirectoryOutcome> {
  const validation = validateRelativeGamePath(relPath);
  if (!validation.valid || isBlockedRelativePath(validation.normalized)) {
    return { state: 'needs-attention', created: false, attention: { code: 'blocked', detail: relPath } };
  }

  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(rootFsPath);
  } catch {
    return { state: 'needs-attention', created: false, attention: { code: 'blocked', detail: 'Game root is not resolvable.' } };
  }

  const targetFsPath = path.resolve(rootFsPath, validation.normalized);
  if (!isPathInsideRoot(rootFsPath, targetFsPath)) {
    return { state: 'needs-attention', created: false, attention: { code: 'escapes-game', detail: relPath } };
  }

  try {
    const existing = await fs.promises.lstat(targetFsPath);
    if (existing.isSymbolicLink()) {
      let realTarget: string;
      try {
        realTarget = await fs.promises.realpath(targetFsPath);
      } catch {
        return { state: 'needs-attention', created: false, attention: { code: 'escapes-game', detail: relPath } };
      }
      if (!isPathInsideRoot(realRoot, realTarget)) {
        return { state: 'needs-attention', created: false, attention: { code: 'escapes-game', detail: relPath } };
      }
      const followed = await fs.promises.stat(targetFsPath);
      return followed.isDirectory()
        ? { state: 'ready', created: false }
        : { state: 'needs-attention', created: false, attention: { code: 'name-collision', detail: relPath } };
    }
    if (existing.isDirectory()) {
      return { state: 'ready', created: false };
    }
    return { state: 'needs-attention', created: false, attention: { code: 'name-collision', detail: relPath } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      return { state: 'needs-attention', created: false, attention: { code: 'blocked', detail: relPath } };
    }
  }

  if (await checkAncestorSymlinkEscape(rootFsPath, realRoot, targetFsPath)) {
    return { state: 'needs-attention', created: false, attention: { code: 'escapes-game', detail: relPath } };
  }

  try {
    await fs.promises.mkdir(targetFsPath, { recursive: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') {
      return {
        state: 'needs-attention',
        created: false,
        attention: { code: 'create-failed', detail: error instanceof Error ? error.message : String(error) }
      };
    }
    // EEXIST here means a concurrent creator won the race; verify below.
  }

  try {
    const verified = await fs.promises.stat(targetFsPath);
    if (!verified.isDirectory()) {
      return { state: 'needs-attention', created: false, attention: { code: 'name-collision', detail: relPath } };
    }
  } catch (error) {
    return {
      state: 'needs-attention',
      created: false,
      attention: { code: 'create-failed', detail: error instanceof Error ? error.message : String(error) }
    };
  }

  return { state: 'ready', created: true };
}

export interface EnsureGameFilesystemRequest {
  /** Create this exact Game-root-relative folder name. Omit to skip root creation. */
  root?: { name: string };
  /** Game-relative folder under which lanes are ensured (the ready or just-created canonical root). */
  lanesRoot?: string;
  /** Canonical provider lane folder names to ensure under `lanesRoot`. */
  lanes?: string[];
}

export interface EnsureGameFilesystemFolderResult extends EnsureGameDirectoryOutcome {
  folder: string;
}

export interface EnsureGameFilesystemResult {
  root?: EnsureGameFilesystemFolderResult & { name: string };
  lanes: Record<string, EnsureGameFilesystemFolderResult>;
}

/**
 * The one Stadium-side mutation surface for S8.0: at most one root creation,
 * then lanes under whichever root is actually ready. Lanes are never created
 * under a root that failed, and never created when no root name is supplied
 * at all (S6 detection/adoption still owns choosing an existing root).
 */
export async function ensureGameFilesystemStructure(
  rootFsPath: string,
  request: EnsureGameFilesystemRequest
): Promise<EnsureGameFilesystemResult> {
  let root: (EnsureGameFilesystemFolderResult & { name: string }) | undefined;
  let laneBase = request.lanesRoot;

  if (request.root?.name) {
    const outcome = await ensureGameDirectory(rootFsPath, request.root.name);
    root = { name: request.root.name, folder: request.root.name, ...outcome };
    laneBase = outcome.state === 'ready' ? request.root.name : undefined;
  }

  const lanes: Record<string, EnsureGameFilesystemFolderResult> = {};
  const laneNames = (request.lanes ?? []).filter((name): name is string => typeof name === 'string' && name.trim().length > 0).slice(0, MAX_ENSURE_LANES);
  if (laneBase) {
    for (const laneName of laneNames) {
      const outcome = await ensureGameDirectory(rootFsPath, `${laneBase}/${laneName}`);
      lanes[laneName] = { folder: laneName, ...outcome };
    }
  }

  return { root, lanes };
}

function friendlyRemoteName(remoteName: string | undefined): 'WSL' | 'SSH' | 'Dev Container' | 'Remote' | undefined {
  if (!remoteName) return undefined;
  const normalized = remoteName.toLowerCase();
  if (normalized.includes('wsl')) return 'WSL';
  if (normalized.includes('ssh')) return 'SSH';
  if (normalized.includes('container')) return 'Dev Container';
  return 'Remote';
}

/**
 * Resolve one already-visible Game path to the lexical, platform-native path a
 * human sees in the authoritative Stadium's editor/terminal. Realpath is used
 * only to prove containment; escaped targets are never disclosed.
 */
export async function resolveAbsoluteGamePath(
  rootFsPath: string,
  rawPath: string,
  environment: AbsoluteGamePathEnvironment = {}
): Promise<ResolveAbsoluteGamePathResult> {
  const normalizedPath = normalizeGamePathForCorrelation(rawPath);
  const isRoot = normalizedPath === '.';
  if (!isRoot) {
    const validation = validateRelativeGamePath(rawPath);
    if (!validation.valid || isBlockedRelativePath(validation.normalized)) {
      return { path: normalizedPath, available: false, reason: 'blocked' };
    }
    if (validation.normalized !== normalizedPath) {
      return { path: validation.normalized, available: false, reason: 'blocked' };
    }
  }
  if ((environment.workspaceScheme ?? 'file') !== 'file') {
    return { path: normalizedPath, available: false, reason: 'virtual-workspace' };
  }
  if (!rootFsPath) return { path: normalizedPath, available: false, reason: 'unknown' };

  if (!isRoot) {
    const [check] = await checkGamePaths(rootFsPath, [normalizedPath]);
    if (check.state !== 'file' && check.state !== 'folder') {
      return { path: normalizedPath, available: false, reason: check.state };
    }
  } else {
    try {
      await fs.promises.realpath(rootFsPath);
      const stat = await fs.promises.stat(rootFsPath);
      if (!stat.isDirectory()) {
        return { path: '.', available: false, reason: 'blocked' };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      return { path: '.', available: false, reason: code === 'ENOENT' ? 'missing' : code === 'EACCES' || code === 'EPERM' ? 'blocked' : 'unknown' };
    }
  }

  const absolutePath = isRoot ? path.resolve(rootFsPath) : path.resolve(rootFsPath, ...normalizedPath.split('/'));
  if (!isPathInsideRoot(rootFsPath, absolutePath)) {
    return { path: normalizedPath, available: false, reason: 'blocked' };
  }
  const remoteLabel = friendlyRemoteName(environment.remoteName);
  return {
    path: normalizedPath,
    available: true,
    absolutePath,
    pathStyle: (environment.platform ?? process.platform) === 'win32' ? 'windows' : 'posix',
    environment: remoteLabel ? 'remote' : 'local',
    ...(remoteLabel ? { remoteLabel } : {})
  };
}

export async function browseGameDirectory(
  rootFsPath: string,
  rawDir = '',
  options: { maxEntries?: number } = {}
): Promise<BrowseGameDirectoryResult> {
  if (!rootFsPath) throw new Error('Game root is not configured.');

  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(rootFsPath);
  } catch (error) {
    throw new Error(`Game root could not be resolved: ${error instanceof Error ? error.message : String(error)}`);
  }

  let relDir = '';
  let targetDir = rootFsPath;
  const trimmedDir = String(rawDir ?? '').trim();
  if (trimmedDir && trimmedDir !== '.') {
    const validation = validateRelativeGamePath(trimmedDir);
    if (!validation.valid) throw new Error(`Invalid directory path: ${validation.reason}`);
    relDir = validation.normalized;
    if (isBlockedRelativePath(relDir)) throw new Error(`Directory is blocked: ${relDir}`);
    targetDir = path.resolve(rootFsPath, relDir);
    if (!isPathInsideRoot(rootFsPath, targetDir)) throw new Error('Directory cannot leave Game root.');
    try {
      const realTarget = await fs.promises.realpath(targetDir);
      if (!isPathInsideRoot(realRoot, realTarget)) throw new Error('Directory escapes Game root via symlink.');
    } catch (error) {
      if (error instanceof Error && error.message === 'Directory escapes Game root via symlink.') throw error;
      throw new Error(`Directory not found: ${relDir}`);
    }
  }

  let directory: fs.Dir;
  try {
    directory = await fs.promises.opendir(targetDir);
  } catch (error) {
    throw new Error(`Could not read directory: ${error instanceof Error ? error.message : String(error)}`);
  }

  const entries: GameFileEntry[] = [];
  let scannedEntries = 0;
  let scanTruncated = false;
  for await (const dirent of directory) {
    scannedEntries += 1;
    if (scannedEntries > MAX_BROWSE_SCAN_ENTRIES) {
      scanTruncated = true;
      break;
    }
    const name = dirent.name;
    if (isBlockedSegment(name) || isBlockedFile(name)) continue;
    const entryRelPath = relDir ? `${relDir}/${name}` : name;
    const entryFullPath = path.resolve(targetDir, name);
    if (!isPathInsideRoot(rootFsPath, entryFullPath)) continue;

    try {
      const realEntry = await fs.promises.realpath(entryFullPath);
      if (!isPathInsideRoot(realRoot, realEntry)) continue;
      const stat = await fs.promises.stat(entryFullPath);
      if (stat.isDirectory()) entries.push({ name, path: entryRelPath, kind: 'folder' });
      else if (stat.isFile()) entries.push({ name, path: entryRelPath, kind: 'file' });
    } catch {
      // A stale, inaccessible or escaped entry is not disclosed.
    }
  }

  entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
  const maxEntries = Math.max(0, Math.min(options.maxEntries ?? MAX_BROWSE_RESULT_ENTRIES, MAX_BROWSE_RESULT_ENTRIES));
  return {
    dir: relDir,
    entries: entries.slice(0, maxEntries),
    truncated: scanTruncated || entries.length > maxEntries
  };
}

// --- S6: read-only filesystem evidence for the GameFilesystemContract ---

export const MAX_REPORT_FILE_COUNT_ENTRIES = 500;
export const MAX_REPORT_FILE_COUNT_DEPTH = 3;
const MAX_ROOT_SCAN_ENTRIES = 1_000;
const MAX_EVIDENCE_CANDIDATES = 16;
const MAX_NESTED_REPORT_ROOTS = 8;
const REPORT_FILE_EXTENSIONS = new Set(['.md', '.txt']);

/**
 * Bounded count of report-shaped files under one already-contained folder.
 * Emptiness is evidence: an empty recognized folder never competes with a
 * populated one. A truncated count means "at least this many", never "empty".
 */
export async function countReportFiles(
  rootFsPath: string,
  relDir: string,
  options: { maxEntries?: number; maxDepth?: number } = {}
): Promise<{ files: number; truncated: boolean }> {
  const maxEntries = Math.max(1, Math.min(options.maxEntries ?? MAX_REPORT_FILE_COUNT_ENTRIES, MAX_REPORT_FILE_COUNT_ENTRIES));
  const maxDepth = Math.max(0, Math.min(options.maxDepth ?? MAX_REPORT_FILE_COUNT_DEPTH, MAX_REPORT_FILE_COUNT_DEPTH));
  const startFsPath = path.resolve(rootFsPath, ...relDir.split('/'));

  let files = 0;
  let scanned = 0;
  let truncated = false;
  const queue: Array<{ dirFsPath: string; depth: number }> = [{ dirFsPath: startFsPath, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    let directory: fs.Dir;
    try {
      directory = await fs.promises.opendir(current.dirFsPath);
    } catch {
      continue;
    }
    for await (const dirent of directory) {
      scanned += 1;
      if (scanned > maxEntries) {
        truncated = true;
        break;
      }
      const name = dirent.name;
      if (isBlockedSegment(name) || isBlockedFile(name)) continue;
      const entryFullPath = path.resolve(current.dirFsPath, name);
      if (!isPathInsideRoot(rootFsPath, entryFullPath)) continue;
      if (dirent.isFile() && REPORT_FILE_EXTENSIONS.has(path.extname(name).toLowerCase())) {
        files += 1;
      } else if (dirent.isDirectory() && current.depth < maxDepth) {
        queue.push({ dirFsPath: entryFullPath, depth: current.depth + 1 });
      }
    }
    if (truncated) break;
  }
  return { files, truncated };
}

async function classifyRootCandidate(
  rootFsPath: string,
  realRoot: string,
  dirent: fs.Dirent
): Promise<{ kind: 'folder' | 'file' | 'other'; safety: CandidateSafety }> {
  const name = dirent.name;
  if (isBlockedSegment(name) || isBlockedFile(name)) {
    return { kind: dirent.isDirectory() ? 'folder' : dirent.isFile() ? 'file' : 'other', safety: 'blocked' };
  }
  const entryFullPath = path.resolve(rootFsPath, name);
  if (!isPathInsideRoot(rootFsPath, entryFullPath)) return { kind: 'other', safety: 'escapes-game' };

  try {
    const realEntry = await fs.promises.realpath(entryFullPath);
    if (!isPathInsideRoot(realRoot, realEntry)) {
      // A junction/symlink leaving the Game is never a valid canonical root.
      return { kind: dirent.isDirectory() ? 'folder' : 'other', safety: 'escapes-game' };
    }
    const stat = await fs.promises.stat(entryFullPath);
    return { kind: stat.isDirectory() ? 'folder' : stat.isFile() ? 'file' : 'other', safety: 'ok' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { kind: 'other', safety: 'inaccessible' };
    return { kind: dirent.isDirectory() ? 'folder' : dirent.isFile() ? 'file' : 'other', safety: 'inaccessible' };
  }
}

/**
 * Report roots proven by reports Sideline already discovered, so a Game whose
 * working reports live below the Game root (for example `docs/Reports/`) is not
 * mistaken for a Game with no reporting system at all.
 */
export function deriveNestedReportRoots(reportPaths: readonly string[]): NestedReportRootEvidence[] {
  const counts = new Map<string, number>();
  for (const raw of reportPaths) {
    const normalized = normalizeGamePathForCorrelation(raw);
    if (!normalized || normalized === '.') continue;
    const segments = normalized.split('/').filter(Boolean);
    const index = segments.findIndex((segment) => recognizeReportRootName(segment));
    if (index < 1 || index >= segments.length - 1) continue; // root-level or not a containing folder
    const prefix = segments.slice(0, index + 1).join('/');
    if (isBlockedRelativePath(prefix)) continue;
    if (!validateRelativeGamePath(prefix).valid) continue;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([candidatePath, files]) => ({ path: candidatePath, reportFiles: files }))
    .sort((left, right) => right.reportFiles - left.reportFiles || left.path.localeCompare(right.path))
    .slice(0, MAX_NESTED_REPORT_ROOTS);
}

/**
 * Read-only Game filesystem evidence for exactly one Game root.
 * Creates nothing, renames nothing, reads no file contents.
 */
export async function inspectGameFilesystemEvidence(
  gameId: string,
  rootFsPath: string,
  options: { checkPaths?: readonly string[]; reportPaths?: readonly string[] } = {}
): Promise<GameFilesystemEvidence> {
  const observedAt = new Date().toISOString();
  const base: GameFilesystemEvidence = {
    gameId,
    rootResolvable: false,
    reportRootEntries: [],
    nestedReportRoots: [],
    sopRootEntries: [],
    checks: [],
    observedAt,
    truncated: false
  };
  if (!rootFsPath) return base;

  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(rootFsPath);
  } catch {
    return base;
  }

  const reportRootEntries: ReportRootCandidateEvidence[] = [];
  const sopRootEntries: SopRootCandidateEvidence[] = [];
  const plumbingParents: Array<{ name: string; kind: 'folder' | 'file' | 'other'; safety: CandidateSafety }> = [];
  let truncated = false;

  let directory: fs.Dir | undefined;
  try {
    directory = await fs.promises.opendir(rootFsPath);
  } catch {
    return base;
  }

  let scanned = 0;
  for await (const dirent of directory) {
    scanned += 1;
    if (scanned > MAX_ROOT_SCAN_ENTRIES) {
      truncated = true;
      break;
    }
    const recognizedReport = recognizeReportRootName(dirent.name);
    const recognizedSop = recognizeSopRootName(dirent.name);
    const recognizedPlumbing = dirent.name.localeCompare(PLUMBING_SLC_ROOT_PATH, undefined, { sensitivity: 'base' }) === 0;
    if (!recognizedReport && !recognizedSop && !recognizedPlumbing) continue;
    const classified = await classifyRootCandidate(rootFsPath, realRoot, dirent);

    if (recognizedPlumbing) plumbingParents.push({ name: dirent.name, ...classified });

    if (recognizedReport && reportRootEntries.length < MAX_EVIDENCE_CANDIDATES) {
      const counted = classified.kind === 'folder' && classified.safety === 'ok'
        ? await countReportFiles(rootFsPath, dirent.name)
        : { files: 0, truncated: false };
      reportRootEntries.push({
        name: dirent.name,
        recognized: recognizedReport,
        kind: classified.kind,
        safety: classified.safety,
        reportFiles: counted.files,
        reportFilesTruncated: counted.truncated
      });
    }
    if (recognizedSop && sopRootEntries.length < MAX_EVIDENCE_CANDIDATES) {
      sopRootEntries.push({
        name: dirent.name,
        recognized: recognizedSop,
        kind: classified.kind,
        safety: classified.safety
      });
    }
  }

  // S11.1: always inspect the reserved topology, including empty children. The
  // existing `checks` shape carries type/containment truth; no contract schema or
  // broad filesystem scan is introduced. Actual casing is preserved.
  const reservedPaths: string[] = [];
  if (plumbingParents.length === 0) {
    reservedPaths.push(PLUMBING_SLC_ROOT_PATH, `${PLUMBING_SLC_ROOT_PATH}/Reports`, `${PLUMBING_SLC_ROOT_PATH}/SOP`);
  } else {
    for (const parent of plumbingParents.slice(0, 6)) {
      reservedPaths.push(parent.name);
      if (parent.kind !== 'folder' || parent.safety !== 'ok') continue;
      const childNames: { reports: string[]; sop: string[] } = { reports: [], sop: [] };
      try {
        const children = await fs.promises.opendir(path.resolve(rootFsPath, parent.name));
        for await (const child of children) {
          if (child.name.localeCompare('Reports', undefined, { sensitivity: 'base' }) === 0) childNames.reports.push(child.name);
          if (child.name.localeCompare('SOP', undefined, { sensitivity: 'base' }) === 0) childNames.sop.push(child.name);
        }
      } catch {
        // The parent check below records inaccessible/unknown truth. Never guess.
      }
      const reports = childNames.reports.length ? childNames.reports : ['Reports'];
      const sop = childNames.sop.length ? childNames.sop : ['SOP'];
      reservedPaths.push(...reports.map((name) => `${parent.name}/${name}`));
      reservedPaths.push(...sop.map((name) => `${parent.name}/${name}`));
    }
  }

  // Prefer actual on-disk casing from the reserved scan over a case-insensitive
  // duplicate requested for an already-configured path.
  const actualReservedKeys = new Set(reservedPaths.map((value) => value.toLowerCase()));
  const requestedPaths = (options.checkPaths ?? []).filter((value) => !actualReservedKeys.has(String(value).toLowerCase()));
  const checkPaths = [...reservedPaths, ...requestedPaths]
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, MAX_GAME_PATH_CHECKS);
  const checks = checkPaths.length > 0 ? await checkGamePaths(rootFsPath, checkPaths) : [];

  const reservedNestedReportRoots: NestedReportRootEvidence[] = [];
  for (const check of checks) {
    const segments = check.path.replace(/\\/g, '/').split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0].localeCompare(PLUMBING_SLC_ROOT_PATH, undefined, { sensitivity: 'base' }) !== 0) continue;
    if (segments[1].localeCompare('Reports', undefined, { sensitivity: 'base' }) === 0 && check.state === 'folder') {
      if (!reservedNestedReportRoots.some((entry) => entry.path.toLowerCase() === check.path.toLowerCase())) {
        const counted = await countReportFiles(rootFsPath, check.path);
        reservedNestedReportRoots.push({ path: check.path, reportFiles: counted.files });
      }
    }
    if (segments[1].localeCompare('SOP', undefined, { sensitivity: 'base' }) === 0 && check.state === 'folder') {
      if (!sopRootEntries.some((entry) => entry.name.toLowerCase() === check.path.toLowerCase())) {
        sopRootEntries.push({ name: check.path, recognized: 'SOP', kind: 'folder', safety: 'ok' });
      }
    }
  }

  // Reserved Plumbing evidence must survive the bounded nested-root list. It is
  // the only evidence that can authorize or block the default bootstrap, so a
  // long legacy discovery list may not crowd it out.
  const reservedKeys = new Set(reservedNestedReportRoots.map((entry) => entry.path.toLowerCase()));
  const nestedReportRoots = [
    ...reservedNestedReportRoots,
    ...deriveNestedReportRoots(options.reportPaths ?? []).filter((entry) => !reservedKeys.has(entry.path.toLowerCase()))
  ].slice(0, MAX_NESTED_REPORT_ROOTS);

  return {
    gameId,
    rootResolvable: true,
    reportRootEntries,
    nestedReportRoots,
    sopRootEntries,
    checks,
    observedAt,
    truncated
  };
}

function normalizeSearchQuery(rawQuery: string): string {
  return String(rawQuery ?? '').trim().replace(/\\/g, '/').replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_GAME_FILE_SEARCH_QUERY);
}

function withoutExtension(name: string): string {
  const extension = path.extname(name);
  return extension ? name.slice(0, -extension.length) : name;
}

interface RankedGameFileEntry extends GameFileEntry {
  rank: number;
  depth: number;
}

function compareSearchResults(left: RankedGameFileEntry, right: RankedGameFileEntry): number {
  if (left.rank !== right.rank) return left.rank - right.rank;
  if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1;
  if (left.depth !== right.depth) return left.depth - right.depth;
  return left.path.localeCompare(right.path, undefined, { sensitivity: 'base' });
}

function rankSearchEntry(entry: GameFileEntry, query: string, tokens: readonly string[]): number | undefined {
  const name = entry.name.toLowerCase();
  const relativePath = entry.path.toLowerCase();
  if (!tokens.every((token) => name.includes(token) || relativePath.includes(token))) return undefined;
  if (name === query || withoutExtension(name) === query) return 0;
  if (name.startsWith(tokens[0]) && tokens.every((token) => name.includes(token))) return 1;
  if (tokens.every((token) => name.includes(token))) return 2;
  return 3;
}

/**
 * Bounded breadth-first metadata search inside one Game root.
 * No content is read, no caller root is accepted, and Browse visibility policy
 * is applied before a name can become a result or directory can be traversed.
 */
export async function searchGameFiles(
  rootFsPath: string,
  rawQuery: string,
  options: SearchGameFilesOptions = {},
  isSuperseded: () => boolean = () => false
): Promise<SearchGameFilesResult> {
  const query = normalizeSearchQuery(rawQuery);
  const minimumLength = options.allowSingleCharacter ? 1 : 2;
  if (query.length < minimumLength) return { query, results: [], truncated: false, moreMatches: false };
  if (!rootFsPath) throw new Error('Game root is not configured.');

  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(rootFsPath);
  } catch (error) {
    throw new Error(`Game root could not be resolved: ${error instanceof Error ? error.message : String(error)}`);
  }

  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_GAME_FILE_SEARCH_LIMIT, MAX_GAME_FILE_SEARCH_LIMIT));
  const maxEntries = Math.max(1, Math.min(options.maxEntries ?? MAX_GAME_FILE_SEARCH_ENTRIES, MAX_GAME_FILE_SEARCH_ENTRIES));
  const maxDirectories = Math.max(1, Math.min(options.maxDirectories ?? MAX_GAME_FILE_SEARCH_DIRECTORIES, MAX_GAME_FILE_SEARCH_DIRECTORIES));
  const maxDepth = Math.max(0, Math.min(options.maxDepth ?? MAX_GAME_FILE_SEARCH_DEPTH, MAX_GAME_FILE_SEARCH_DEPTH));
  const deadlineMs = Math.max(1, Math.min(options.deadlineMs ?? GAME_FILE_SEARCH_DEADLINE_MS, GAME_FILE_SEARCH_DEADLINE_MS));
  const yieldEvery = Math.max(1, options.yieldEvery ?? GAME_FILE_SEARCH_YIELD_EVERY);
  const now = options.now ?? Date.now;
  const startedAt = now();
  const tokens = query.split(' ').filter(Boolean);
  const retentionLimit = Math.min(limit * 4, 200);

  interface QueueItem { dirFsPath: string; relDir: string; depth: number }
  const queue: QueueItem[] = [{ dirFsPath: rootFsPath, relDir: '', depth: 0 }];
  const visitedRealDirectories = new Set<string>([realRoot]);
  const retained: RankedGameFileEntry[] = [];
  let totalMatches = 0;
  let scannedEntries = 0;
  let scannedDirectories = 0;
  let limitReason: GameFileSearchLimitReason | undefined;

  while (queue.length > 0) {
    if (now() - startedAt >= deadlineMs) { limitReason = 'time'; break; }
    if (scannedDirectories >= maxDirectories) { limitReason = 'directories'; break; }
    const current = queue.shift()!;
    scannedDirectories += 1;
    let directory: fs.Dir;
    try {
      directory = await fs.promises.opendir(current.dirFsPath);
    } catch {
      continue;
    }

    for await (const dirent of directory) {
      if (now() - startedAt >= deadlineMs) { limitReason = 'time'; break; }
      if (scannedEntries >= maxEntries) { limitReason = 'entries'; break; }
      scannedEntries += 1;
      const name = dirent.name;
      if (isBlockedSegment(name) || isBlockedFile(name)) continue;
      const entryRelPath = current.relDir ? `${current.relDir}/${name}` : name;
      const entryFullPath = path.resolve(current.dirFsPath, name);
      if (!isPathInsideRoot(rootFsPath, entryFullPath)) continue;

      let realEntry: string;
      let stat: fs.Stats;
      try {
        realEntry = await fs.promises.realpath(entryFullPath);
        if (!isPathInsideRoot(realRoot, realEntry)) continue;
        stat = await fs.promises.stat(entryFullPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory() && !stat.isFile()) continue;

      const entry: GameFileEntry = { name, path: entryRelPath, kind: stat.isDirectory() ? 'folder' : 'file' };
      const rank = rankSearchEntry(entry, query, tokens);
      if (rank !== undefined) {
        totalMatches += 1;
        retained.push({ ...entry, rank, depth: current.depth + 1 });
        if (retained.length > retentionLimit) {
          retained.sort(compareSearchResults);
          retained.length = retentionLimit;
        }
      }

      if (stat.isDirectory() && !visitedRealDirectories.has(realEntry)) {
        if (current.depth < maxDepth) {
          visitedRealDirectories.add(realEntry);
          queue.push({ dirFsPath: entryFullPath, relDir: entryRelPath, depth: current.depth + 1 });
        } else if (!limitReason) {
          limitReason = 'depth';
        }
      }

      if (scannedEntries % yieldEvery === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (isSuperseded()) {
          return { query, results: [], truncated: false, moreMatches: false, superseded: true };
        }
      }
    }
    if (limitReason === 'entries' || limitReason === 'time') break;
  }

  retained.sort(compareSearchResults);
  return {
    query,
    results: retained.slice(0, limit).map(({ name, path: relativePath, kind }) => ({ name, path: relativePath, kind })),
    truncated: limitReason !== undefined,
    ...(limitReason ? { limitReason } : {}),
    moreMatches: totalMatches > limit
  };
}
