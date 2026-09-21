/**
 * Scout Intelligence report source (S31 Slice 2).
 *
 * BREADCRUMB — Scout report source.
 *
 * WAS: a Scout Formation parent lives under the canonical Scout Intelligence
 * root, which is outside every Game's report root. Nothing that scans a Game
 * could ever find it, so it reached Incoming only through transient explicit
 * registration held in the Stadium's memory (capped, lost on restart).
 *
 * IS: the canonical Scout Intelligence root is a durable report source for the
 * Dad-facing Formation parents. It discovers exactly
 * `Formations/<id>/FORMATION-RESULT.md`, trusts only what the file's own
 * `sideline-provenance` marker says, and projects the existing CoachReportItem.
 * Explicit post-Formation registration remains, but only as the fast path.
 *
 * WHY: restart must not erase intelligence that still exists on disk, and one
 * source of truth (the artifact) is safer than an index that can disagree with
 * it.
 *
 * WILL BE: further Sideline-owned, non-Game artifacts may earn their own source
 * only when real evidence requires one. This is deliberately one implementation
 * of a small contract, not a registry or framework.
 *
 * No `vscode` import: pure filesystem, unit-testable without an Extension Host.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseReportProvenance, type ReportProvenance } from './report-provenance';
import { SCOUT_PLAYER_INSTANCE_ID, SCOUT_PLAYER_TYPE } from './scout-player-contract';
import type { CoachReportItem } from './stadium-client';

/** One place Sideline-owned (non-Game) report artifacts come from. */
export interface ReportSource {
  readonly id: string;
  /** The Incoming badge for artifacts from this source. */
  readonly agentLabel: string;
  /** Absolute folders this source owns and may be watched. Never a Game root. */
  roots(): readonly string[];
  /** Glob, relative to each root, matching PARENT artifacts only. The watch contract. */
  readonly parentGlob: string;
  /** Parent artifacts attributed to `gameId`, newest first. Never children. */
  list(gameId: string, context?: ReportSourceListContext): Promise<CoachReportItem[]>;
}

export interface ReportSourceListContext {
  /** Human label for the Game (Incoming's `project`). Falls back to the gameId. */
  readonly project?: string;
  readonly limit?: number;
}

export const SCOUT_FORMATIONS_DIRNAME = 'Formations';
export const SCOUT_FORMATION_PARENT_FILENAME = 'FORMATION-RESULT.md';
/** Matches Formation's own id contract (`scout-formation.ts`); rejects traversal and odd names. */
const FORMATION_FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
/** How many Scout parents one Game shows at once — the same bound the in-memory fast path uses. */
export const DEFAULT_SCOUT_PARENT_LIMIT = 10;
/** Upper bound on files inspected per listing, so a long history can never make a snapshot slow. */
const MAX_PARENTS_SCANNED = 200;
/** Mirrors `coach.maxReportBytes`' default; an oversized parent is skipped, not truncated. */
const MAX_PARENT_BYTES = 2_097_152;

/**
 * A parent is trusted for a Game only if its OWN marker says so: this Game, the
 * logical Scout Player, a Scout Formation, and the Play it answers. Anything
 * less is skipped — location, timestamps and folder names are never authority.
 */
export function isTrustedScoutParentFor(provenance: ReportProvenance | undefined, gameId: string): provenance is ReportProvenance {
  return Boolean(provenance)
    && provenance!.gameId === gameId
    && provenance!.playerInstanceId === SCOUT_PLAYER_INSTANCE_ID
    && provenance!.playerType === SCOUT_PLAYER_TYPE
    && provenance!.provider === 'scout-formation'
    && typeof provenance!.clientRef === 'string' && provenance!.clientRef.length > 0;
}

/** Stable identity for "the same file" across separators and, on Windows, case. */
export function reportPathKey(reportPath: string): string {
  const resolved = path.resolve(reportPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Combine the durable listing with the fast-path registrations. The same path is
 * ONE report: the on-disk artifact wins, and a registration only contributes a
 * path the disk listing did not return. Newest first, deterministic, bounded.
 */
export function mergeSidelineOwnedParents(
  durable: readonly CoachReportItem[],
  registered: readonly CoachReportItem[],
  limit = DEFAULT_SCOUT_PARENT_LIMIT
): CoachReportItem[] {
  const byPath = new Map<string, CoachReportItem>();
  for (const item of registered) byPath.set(reportPathKey(item.path), item);
  for (const item of durable) byPath.set(reportPathKey(item.path), item);
  return [...byPath.values()]
    .sort((a, b) => (b.mtime - a.mtime) || (a.path < b.path ? 1 : a.path > b.path ? -1 : 0))
    .slice(0, Math.max(0, limit));
}

export class ScoutIntelligenceReportSource implements ReportSource {
  readonly id = 'scout-intelligence';
  readonly agentLabel = 'Scout';
  readonly parentGlob = `**/${SCOUT_FORMATION_PARENT_FILENAME}`;
  private readonly formationsRoot: string;

  constructor(options: { readonly scoutIntelligenceRoot: string }) {
    if (!path.isAbsolute(options.scoutIntelligenceRoot)) throw new Error('scoutIntelligenceRoot must be absolute.');
    this.formationsRoot = path.join(path.resolve(options.scoutIntelligenceRoot), SCOUT_FORMATIONS_DIRNAME);
  }

  roots(): readonly string[] {
    return [this.formationsRoot];
  }

  async list(gameId: string, context: ReportSourceListContext = {}): Promise<CoachReportItem[]> {
    if (!gameId || gameId === 'unknown') return [];
    const limit = Math.max(1, Math.min(context.limit ?? DEFAULT_SCOUT_PARENT_LIMIT, DEFAULT_SCOUT_PARENT_LIMIT));

    let folders: fs.Dirent[];
    try { folders = await fs.promises.readdir(this.formationsRoot, { withFileTypes: true }); }
    catch { return []; } // No Formations yet (or an unreadable root) is simply no reports.

    const candidates: Array<{ file: string; mtime: number }> = [];
    for (const folder of folders) {
      // isDirectory() is false for a symlink, so a link can never redirect the scan out of the root.
      if (!folder.isDirectory() || !FORMATION_FOLDER.test(folder.name)) continue;
      const file = path.join(this.formationsRoot, folder.name, SCOUT_FORMATION_PARENT_FILENAME);
      try {
        const stat = await fs.promises.lstat(file);
        if (!stat.isFile() || stat.size > MAX_PARENT_BYTES) continue;
        candidates.push({ file, mtime: stat.mtimeMs });
      } catch { /* a Formation with no parent yet is not a report */ }
    }
    candidates.sort((a, b) => (b.mtime - a.mtime) || (a.file < b.file ? 1 : a.file > b.file ? -1 : 0));

    const reports: CoachReportItem[] = [];
    for (const candidate of candidates.slice(0, MAX_PARENTS_SCANNED)) {
      let content: string;
      try { content = await fs.promises.readFile(candidate.file, 'utf8'); }
      catch { continue; } // vanished or unreadable between listing and reading
      const provenance = parseReportProvenance(content);
      // Unattributed (older) or other-Game parents are skipped rather than guessed at.
      if (!isTrustedScoutParentFor(provenance, gameId)) continue;
      reports.push({
        gameId,
        project: context.project || gameId,
        agent: this.agentLabel,
        filename: SCOUT_FORMATION_PARENT_FILENAME,
        path: candidate.file,
        mtime: candidate.mtime,
        content,
        provenance
      });
      if (reports.length >= limit) break;
    }
    return reports;
  }
}
