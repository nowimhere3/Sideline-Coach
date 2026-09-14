/**
 * Coach Routines V0 Slice C — Authoritative, Game-bounded canonical source discovery and verification.
 *
 * This module runs in the Stadium / Extension Host where Game files actually exist.
 * It provides metadata and existence checks only; it NEVER reads file contents or passes
 * file contents to the Control Plane.
 *
 * All operations are strictly confined within the Game's root filesystem path.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RoutineSourceState } from './control-plane/coach-routines';

export interface SuggestSourceEntry {
  path: string;
  kind: 'file' | 'folder';
  reason: string;
}

export interface BrowseSourceEntry {
  name: string;
  path: string;
  kind: 'file' | 'folder';
}

export interface BrowseSourcesResult {
  dir: string;
  entries: BrowseSourceEntry[];
}

export const MAX_ROUTINE_SOURCE_CHECKS = 20;
const MAX_SUGGEST_SCAN_ENTRIES = 1_000;
const MAX_SUGGEST_SCAN_DIRECTORIES = 100;
const MAX_BROWSE_SCAN_ENTRIES = 1_000;

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
  if (basename && isBlockedFile(basename)) return true;
  return false;
}

export function validateRelativeSourcePath(relPath: string): { valid: boolean; normalized: string; reason?: string } {
  if (typeof relPath !== 'string') return { valid: false, normalized: '', reason: 'Path must be a string.' };
  const trimmed = relPath.trim();
  if (!trimmed) return { valid: false, normalized: '', reason: 'Path cannot be empty.' };
  if (trimmed.length > 240) return { valid: false, normalized: '', reason: 'Path exceeds maximum length.' };
  if (/^[a-zA-Z]:/i.test(trimmed)) return { valid: false, normalized: '', reason: 'Absolute Windows drive paths are not allowed.' };
  if (/^[/\\]{1,2}/.test(trimmed)) return { valid: false, normalized: '', reason: 'Absolute and UNC paths are not allowed.' };

  const normalized = trimmed.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
  const segments = normalized.split('/');
  if (segments.some((s) => !s || s === '.' || s === '..')) {
    return { valid: false, normalized: '', reason: 'Path traversal is not allowed.' };
  }
  return { valid: true, normalized };
}

export function isPathInsideRoot(rootFsPath: string, candidateFsPath: string): boolean {
  const root = path.resolve(rootFsPath);
  const candidate = path.resolve(candidateFsPath);
  if (process.platform === 'win32') {
    const rLower = root.toLowerCase();
    const cLower = candidate.toLowerCase();
    return cLower === rLower || cLower.startsWith(rLower.endsWith(path.sep) ? rLower : rLower + path.sep);
  }
  const rel = path.relative(root, candidate);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function checkAncestorSymlinkEscape(rootFsPath: string, realRoot: string, targetFsPath: string): Promise<boolean> {
  let curr = path.dirname(targetFsPath);
  while (isPathInsideRoot(rootFsPath, curr)) {
    try {
      const realCurr = await fs.promises.realpath(curr);
      if (!isPathInsideRoot(realRoot, realCurr)) {
        return true;
      }
      return false;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        const parent = path.dirname(curr);
        if (parent === curr) break;
        curr = parent;
      } else {
        return false;
      }
    }
  }
  return false;
}

export async function checkSources(
  rootFsPath: string,
  paths: readonly string[]
): Promise<Array<{ path: string; state: RoutineSourceState }>> {
  if (paths.length > MAX_ROUTINE_SOURCE_CHECKS) throw new Error(`At most ${MAX_ROUTINE_SOURCE_CHECKS} sources can be checked at once.`);
  if (!rootFsPath) {
    return paths.map((p) => ({ path: String(p ?? ''), state: 'unknown' }));
  }
  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(rootFsPath);
  } catch {
    return paths.map((p) => ({ path: String(p ?? ''), state: 'unknown' }));
  }

  const results: Array<{ path: string; state: RoutineSourceState }> = [];
  for (const raw of paths) {
    const validation = validateRelativeSourcePath(raw);
    if (!validation.valid) {
      results.push({ path: String(raw ?? ''), state: 'blocked' });
      continue;
    }
    const relPath = validation.normalized;
    if (isBlockedRelativePath(relPath)) {
      results.push({ path: raw, state: 'blocked' });
      continue;
    }
    const targetFsPath = path.resolve(rootFsPath, relPath);
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
      if (stat.isFile()) {
        results.push({ path: raw, state: 'file' });
      } else if (stat.isDirectory()) {
        results.push({ path: raw, state: 'folder' });
      } else {
        results.push({ path: raw, state: 'blocked' });
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        const ancestorEscaped = await checkAncestorSymlinkEscape(rootFsPath, realRoot, targetFsPath);
        if (ancestorEscaped) {
          results.push({ path: raw, state: 'blocked' });
        } else {
          results.push({ path: raw, state: 'missing' });
        }
      } else if (code === 'EACCES' || code === 'EPERM') {
        results.push({ path: raw, state: 'blocked' });
      } else {
        results.push({ path: raw, state: 'unknown' });
      }
    }
  }
  return results;
}

export async function browseSources(
  rootFsPath: string,
  rawDir = '',
  maxEntries = 200
): Promise<BrowseSourcesResult> {
  if (!rootFsPath) {
    throw new Error('Game root is not configured.');
  }
  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(rootFsPath);
  } catch (err) {
    throw new Error(`Game root could not be resolved: ${err instanceof Error ? err.message : String(err)}`);
  }

  let relDir = '';
  let targetDir = rootFsPath;

  const trimmedDir = String(rawDir ?? '').trim();
  if (trimmedDir && trimmedDir !== '.') {
    const validation = validateRelativeSourcePath(trimmedDir);
    if (!validation.valid) {
      throw new Error(`Invalid directory path: ${validation.reason}`);
    }
    relDir = validation.normalized;
    if (isBlockedRelativePath(relDir)) {
      throw new Error(`Directory is blocked: ${relDir}`);
    }
    targetDir = path.resolve(rootFsPath, relDir);
    if (!isPathInsideRoot(rootFsPath, targetDir)) {
      throw new Error('Directory cannot leave Game root.');
    }
    let realTarget: string;
    try {
      realTarget = await fs.promises.realpath(targetDir);
    } catch {
      throw new Error(`Directory not found: ${relDir}`);
    }
    if (!isPathInsideRoot(realRoot, realTarget)) {
      throw new Error('Directory escapes Game root via symlink.');
    }
  }

  let directory: fs.Dir;
  try {
    directory = await fs.promises.opendir(targetDir);
  } catch (err) {
    throw new Error(`Could not read directory: ${err instanceof Error ? err.message : String(err)}`);
  }

  const entries: BrowseSourceEntry[] = [];
  let scannedEntries = 0;
  for await (const dirent of directory) {
    scannedEntries += 1;
    if (scannedEntries > MAX_BROWSE_SCAN_ENTRIES) break;
    const name = dirent.name;
    if (isBlockedSegment(name) || isBlockedFile(name)) {
      continue;
    }
    const entryRelPath = relDir ? `${relDir}/${name}` : name;
    const entryFullPath = path.resolve(targetDir, name);
    if (!isPathInsideRoot(rootFsPath, entryFullPath)) {
      continue;
    }

    try {
      const realEntry = await fs.promises.realpath(entryFullPath);
      if (!isPathInsideRoot(realRoot, realEntry)) {
        continue;
      }
      const stat = await fs.promises.stat(entryFullPath);
      if (stat.isDirectory()) {
        entries.push({ name, path: entryRelPath, kind: 'folder' });
      } else if (stat.isFile()) {
        entries.push({ name, path: entryRelPath, kind: 'file' });
      }
    } catch {
      continue;
    }
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return {
    dir: relDir,
    entries: entries.slice(0, Math.min(maxEntries, 200))
  };
}

interface HeuristicPattern {
  name: string;
  regex: RegExp;
  reason: string;
  priority: number;
  kind?: 'file' | 'folder' | 'both';
}

const HEURISTICS: HeuristicPattern[] = [
  { name: 'Docs ANCHOR', regex: /^docs[\s_-]*anchor$/i, reason: 'Canonical docs folder', priority: 1, kind: 'folder' },
  { name: 'North Star', regex: /north[\s_-]*star/i, reason: 'North Star rules', priority: 2, kind: 'both' },
  { name: 'Architecture', regex: /architecture/i, reason: 'Architecture rules', priority: 3, kind: 'both' },
  { name: 'Breadcrumbs', regex: /breadcrumb/i, reason: 'Architecture breadcrumbs', priority: 4, kind: 'both' },
  { name: 'SOP', regex: /\bsop\b|^project[\s_-]*sop$|sop[\s_-]/i, reason: 'Standard operating procedures', priority: 5, kind: 'both' },
  { name: 'Roadmap', regex: /roadmap/i, reason: 'Project roadmap', priority: 6, kind: 'both' },
  { name: 'AGENTS.md', regex: /^agents(?:\.[a-z0-9]+)?$/i, reason: 'Agent operating guide', priority: 7, kind: 'file' },
  { name: 'CLAUDE.md', regex: /^claude(?:\.[a-z0-9]+)?$/i, reason: 'Claude instructions', priority: 8, kind: 'file' },
  { name: 'Operating Manual', regex: /operating[\s_-]*manual/i, reason: 'Operating manual', priority: 9, kind: 'both' },
  { name: 'Playbook', regex: /playbook/i, reason: 'Playbook', priority: 10, kind: 'both' },
  { name: 'README.md', regex: /^readme(?:\.[a-z0-9]+)?$/i, reason: 'Project README', priority: 11, kind: 'file' }
];

export async function suggestSources(
  rootFsPath: string,
  maxSuggestions = 10
): Promise<SuggestSourceEntry[]> {
  if (!rootFsPath) return [];
  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(rootFsPath);
  } catch {
    return [];
  }

  interface Candidate {
    path: string;
    kind: 'file' | 'folder';
    reason: string;
    priority: number;
    depth: number;
  }

  const candidates: Candidate[] = [];
  const candidateKeys = new Set<string>();
  const visitedRealDirs = new Set<string>([realRoot]);

  interface QueueItem {
    dirFsPath: string;
    relDir: string;
    depth: number;
  }

  const queue: QueueItem[] = [{ dirFsPath: rootFsPath, relDir: '', depth: 0 }];
  let scannedEntries = 0;
  let scannedDirectories = 0;

  while (queue.length > 0 && scannedEntries < MAX_SUGGEST_SCAN_ENTRIES && scannedDirectories < MAX_SUGGEST_SCAN_DIRECTORIES) {
    const current = queue.shift()!;
    scannedDirectories += 1;
    let directory: fs.Dir;
    try {
      directory = await fs.promises.opendir(current.dirFsPath);
    } catch {
      continue;
    }

    for await (const dirent of directory) {
      scannedEntries += 1;
      if (scannedEntries > MAX_SUGGEST_SCAN_ENTRIES) break;
      const name = dirent.name;
      if (isBlockedSegment(name) || isBlockedFile(name)) {
        continue;
      }
      const entryRelPath = current.relDir ? `${current.relDir}/${name}` : name;
      const entryFullPath = path.resolve(current.dirFsPath, name);
      if (!isPathInsideRoot(rootFsPath, entryFullPath)) {
        continue;
      }

      let realEntry: string;
      let stat: fs.Stats;
      try {
        realEntry = await fs.promises.realpath(entryFullPath);
        if (!isPathInsideRoot(realRoot, realEntry)) {
          continue;
        }
        stat = await fs.promises.stat(entryFullPath);
      } catch {
        continue;
      }

      const isDir = stat.isDirectory();
      const isFile = stat.isFile();
      if (!isDir && !isFile) continue;

      const kind: 'file' | 'folder' = isDir ? 'folder' : 'file';

      for (const h of HEURISTICS) {
        if (h.kind && h.kind !== 'both' && h.kind !== kind) continue;
        if (h.regex.test(name)) {
          const key = entryRelPath.toLowerCase();
          if (!candidateKeys.has(key)) {
            candidateKeys.add(key);
            candidates.push({
              path: entryRelPath,
              kind,
              reason: h.reason,
              priority: h.priority,
              depth: current.depth
            });
          }
          break;
        }
      }

      if (isDir && current.depth < 3) {
        if (!visitedRealDirs.has(realEntry)) {
          visitedRealDirs.add(realEntry);
          queue.push({
            dirFsPath: entryFullPath,
            relDir: entryRelPath,
            depth: current.depth + 1
          });
        }
      }
    }
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
  });

  return candidates.slice(0, Math.min(maxSuggestions, 10)).map(({ path, kind, reason }) => ({
    path,
    kind,
    reason
  }));
}
