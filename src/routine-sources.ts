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
import {
  browseGameDirectory,
  checkGamePaths,
  isBlockedFile,
  isBlockedSegment,
  isPathInsideRoot,
  type GameFileEntry
} from './game-files';

export {
  isBlockedFile,
  isBlockedRelativePath,
  isBlockedSegment,
  isPathInsideRoot,
  validateRelativeSourcePath
} from './game-files';

export interface SuggestSourceEntry {
  path: string;
  kind: 'file' | 'folder';
  reason: string;
}

export type BrowseSourceEntry = GameFileEntry;

export interface BrowseSourcesResult {
  dir: string;
  entries: BrowseSourceEntry[];
}

export const MAX_ROUTINE_SOURCE_CHECKS = 20;
const MAX_SUGGEST_SCAN_ENTRIES = 1_000;
const MAX_SUGGEST_SCAN_DIRECTORIES = 100;

export async function checkSources(
  rootFsPath: string,
  paths: readonly string[]
): ReturnType<typeof checkGamePaths> {
  return checkGamePaths(rootFsPath, paths);
}

export async function browseSources(
  rootFsPath: string,
  rawDir = '',
  maxEntries = 200
): Promise<BrowseSourcesResult> {
  const result = await browseGameDirectory(rootFsPath, rawDir, { maxEntries });
  return { dir: result.dir, entries: result.entries };
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
