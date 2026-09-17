/**
 * S7.1 — legacy `coach.reportGlobs` compatibility hardening.
 *
 * This governs ONLY the pre-S7 glob-based discovery path (`getReportGlobs()` in
 * server.ts), which stays live as compatibility plumbing beside the S7 canonical
 * anchored root (`CoachServer.reportPatterns()` prepends that separately from a
 * `StadiumFilesystemContractCache` and is untouched by this module).
 *
 * Field-proven root cause (`REPORTS/Claude/Opus-Multi-Game-Report-Discovery-
 * Regression-Root-Cause.md`): a single configured `coach.reportGlobs` entry
 * replaced the recognized-root defaults for every Game on the machine, and VS
 * Code's own glob include matching is case-sensitive even on Windows, so an
 * on-disk `REPORTS/` or `Reports and Docs/` could go undiscovered even by the
 * correct-looking `**\/Reports/**` pattern.
 *
 * No vscode import: unit-testable without an Extension Host.
 */

import { RECOGNIZED_REPORT_ROOT_NAMES } from './game-filesystem-contract';

const REPORT_FILE_GLOB_SUFFIX = '**/*.{md,txt}';

function reportRootGlob(name: string): string {
  return `**/${name}/${REPORT_FILE_GLOB_SUFFIX}`;
}

/**
 * R3: one glob per recognized report-root name. On a case-insensitive host
 * filesystem (win32/darwin) the underlying filesystem does not care about
 * case, but VS Code's glob include matching still does — proven directly with
 * VS Code's own bundled ripgrep: `-g '**\/Reports/**'` finds nothing under an
 * on-disk `REPORTS/`, `-g '**\/REPORTS/**'` finds it. Emitting the exact,
 * upper, and lower case spelling of each recognized name closes that gap for
 * the recognized vocabulary only — it never invents a canonical name for an
 * arbitrary custom folder.
 */
export function recognizedReportRootGlobPatterns(platform: NodeJS.Platform = process.platform): string[] {
  const caseVariantsMatter = platform === 'win32' || platform === 'darwin';
  const patterns: string[] = [];
  const seen = new Set<string>();
  for (const name of RECOGNIZED_REPORT_ROOT_NAMES) {
    const variants = caseVariantsMatter ? [name, name.toUpperCase(), name.toLowerCase()] : [name];
    for (const variant of variants) {
      const pattern = reportRootGlob(variant);
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      patterns.push(pattern);
    }
  }
  return patterns;
}

/**
 * R2: a configured `coach.reportGlobs` (user, remote, or workspace scope)
 * EXTENDS the recognized-root defaults; it must never again replace them,
 * because a single Game's custom spelling silently silenced discovery for
 * every other Game on the machine. Deterministic order: recognized defaults
 * first (in `RECOGNIZED_REPORT_ROOT_NAMES` order, then case variant), then
 * any configured pattern not already covered, in the order supplied.
 * Duplicates — including the manifest's own contributed default reaching
 * this function as `configured` when nothing is explicitly overridden — are
 * silently deduplicated rather than repeated.
 */
export function buildReportGlobs(configured: readonly string[], platform: NodeJS.Platform = process.platform): string[] {
  const patterns = recognizedReportRootGlobPatterns(platform);
  const seen = new Set(patterns);
  for (const raw of configured ?? []) {
    const pattern = String(raw ?? '').trim();
    if (!pattern || seen.has(pattern)) continue;
    seen.add(pattern);
    patterns.push(pattern);
  }
  return patterns;
}
