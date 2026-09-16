/**
 * S6 — GameFilesystemContract: what Sideline durably believes about ONE Game's
 * filesystem coordinates, and why.
 *
 * Game identity ("which Game is this?") stays in game-identity/.sideline/game.json.
 * This module answers a different question: "which Reports/SOP coordinates does
 * Sideline use for this Game, and what evidence supports that?"
 *
 * Pure decision logic only: no fs, no vscode, no Control Plane imports. The Stadium
 * supplies evidence; the Control Plane persists the result. Nothing here mutates a
 * Game — detection may adopt an existing folder into contract state, never create one.
 */

export const GAME_FILESYSTEM_SCHEMA_VERSION = 1;

/** Sideline's own canonical root name. Creation belongs to a later slice. */
export const CANONICAL_REPORTS_ROOT_NAME = 'Reports-SLC';

export const RECOGNIZED_REPORT_ROOT_NAMES = ['Reports-SLC', 'Reports', 'Docs REPORT'] as const;
export type RecognizedReportRootName = (typeof RECOGNIZED_REPORT_ROOT_NAMES)[number];

/**
 * Strong SOP names only. Coach Routine documentation heuristics (suggestSources)
 * may observe candidates, but they never confer canonical SOP authority.
 */
export const RECOGNIZED_SOP_ROOT_NAMES = ['Onboarding-SOP', 'Onboarding-Docs', 'Project SOP', 'SOP'] as const;
export type RecognizedSopRootName = (typeof RECOGNIZED_SOP_ROOT_NAMES)[number];

export type FolderProvenance = 'none' | 'adopted' | 'created' | 'detected' | 'human';

export type FolderState = 'unknown' | 'ready' | 'not-set' | 'needs-choice' | 'needs-attention';

export type AttentionCode =
  | 'missing'
  | 'not-a-folder'
  | 'blocked'
  | 'escapes-game'
  | 'inaccessible'
  | 'name-collision'
  | 'create-failed'
  | 'multiple-case-variants';

/** Deferred mutation S6 deliberately records instead of performing. */
export type PendingFilesystemAction = 'create-reports-slc';

export interface CanonicalFolder {
  /** Game-relative, '/'-separated, on-disk casing. Never '' or '.'. */
  path?: string;
  provenance: FolderProvenance;
  state: FolderState;
  /** Competing Game-relative candidates when the human must choose. */
  candidates?: string[];
  attention?: { code: AttentionCode; detail?: string };
  /** Set when path/provenance last changed. */
  decidedAt?: string;
  /** Set when Stadium evidence last confirmed the path. */
  verifiedAt?: string;
}

/** Lane records exist in the schema from S6; lane creation is later work. */
export interface ReportLaneRecord {
  key: string;
  folder: string;
  state: 'ready' | 'needs-attention';
  attention?: { code: AttentionCode };
  ensuredAt?: string;
}

export interface ReportsFolder extends CanonicalFolder {
  lanes: Record<string, ReportLaneRecord>;
}

export interface GameFilesystemContract {
  schemaVersion: typeof GAME_FILESYSTEM_SCHEMA_VERSION;
  gameId: string;
  /** Monotonic; ordered projection to Stadiums in later slices. */
  revision: number;
  reports: ReportsFolder;
  sop: CanonicalFolder;
  lastInspectedAt?: string;
  /** Mutation the algorithm reached but S6 does not perform. */
  pendingReportsAction?: PendingFilesystemAction;
}

export interface GameFilesystemStoreFile {
  schemaVersion: typeof GAME_FILESYSTEM_SCHEMA_VERSION;
  games: Record<string, GameFilesystemContract>;
}

// --- Evidence (produced by the exact Game's Stadium; see game-files.ts) ---

export type CandidateSafety = 'ok' | 'escapes-game' | 'blocked' | 'inaccessible';

export interface ReportRootCandidateEvidence {
  /** On-disk casing. */
  name: string;
  recognized: RecognizedReportRootName;
  kind: 'folder' | 'file' | 'other';
  safety: CandidateSafety;
  /** Bounded count of .md/.txt files; 0 when unreadable. */
  reportFiles: number;
  reportFilesTruncated: boolean;
}

export interface SopRootCandidateEvidence {
  name: string;
  recognized: RecognizedSopRootName;
  kind: 'folder' | 'file' | 'other';
  safety: CandidateSafety;
}

/** A recognized report root below the Game root, proven by already-discovered reports. */
export interface NestedReportRootEvidence {
  path: string;
  reportFiles: number;
}

export type GamePathEvidenceState = 'file' | 'folder' | 'missing' | 'blocked' | 'unknown';

export interface GameFilesystemEvidence {
  gameId: string;
  rootResolvable: boolean;
  reportRootEntries: ReportRootCandidateEvidence[];
  nestedReportRoots: NestedReportRootEvidence[];
  sopRootEntries: SopRootCandidateEvidence[];
  /** States for paths the Control Plane asked about (current contract values). */
  checks: Array<{ path: string; state: GamePathEvidenceState }>;
  observedAt: string;
  truncated: boolean;
}

const CANDIDATE_SAFETIES: readonly CandidateSafety[] = ['ok', 'escapes-game', 'blocked', 'inaccessible'];
const EVIDENCE_PATH_STATES: readonly GamePathEvidenceState[] = ['file', 'folder', 'missing', 'blocked', 'unknown'];

function boundedCount(value: unknown): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.min(Math.floor(value as number), 1_000_000) : 0;
}

/**
 * Evidence crosses a process boundary, so the Control Plane never trusts its shape.
 * A malformed field degrades to "no evidence" for that item rather than a guess.
 */
export function sanitizeGameFilesystemEvidence(gameId: string, raw: unknown): GameFilesystemEvidence | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as Partial<GameFilesystemEvidence>;
  if (candidate.gameId !== gameId) return undefined;
  const observedAt = typeof candidate.observedAt === 'string' ? candidate.observedAt : new Date().toISOString();

  const reportRootEntries = (Array.isArray(candidate.reportRootEntries) ? candidate.reportRootEntries : []).flatMap((entry) => {
    if (!entry || typeof entry.name !== 'string') return [];
    const recognized = recognizeReportRootName(entry.recognized ?? entry.name);
    if (!recognized) return [];
    const kind = entry.kind === 'folder' || entry.kind === 'file' ? entry.kind : 'other';
    const safety = CANDIDATE_SAFETIES.includes(entry.safety as CandidateSafety) ? (entry.safety as CandidateSafety) : 'inaccessible';
    return [{
      name: entry.name,
      recognized,
      kind,
      safety,
      reportFiles: boundedCount(entry.reportFiles),
      reportFilesTruncated: entry.reportFilesTruncated === true
    } satisfies ReportRootCandidateEvidence];
  }).slice(0, 16);

  const sopRootEntries = (Array.isArray(candidate.sopRootEntries) ? candidate.sopRootEntries : []).flatMap((entry) => {
    if (!entry || typeof entry.name !== 'string') return [];
    const recognized = recognizeSopRootName(entry.recognized ?? entry.name);
    if (!recognized) return [];
    const kind = entry.kind === 'folder' || entry.kind === 'file' ? entry.kind : 'other';
    const safety = CANDIDATE_SAFETIES.includes(entry.safety as CandidateSafety) ? (entry.safety as CandidateSafety) : 'inaccessible';
    return [{ name: entry.name, recognized, kind, safety } satisfies SopRootCandidateEvidence];
  }).slice(0, 16);

  const nestedReportRoots = (Array.isArray(candidate.nestedReportRoots) ? candidate.nestedReportRoots : []).flatMap((entry) =>
    entry && typeof entry.path === 'string' && entry.path.includes('/')
      ? [{ path: entry.path, reportFiles: boundedCount(entry.reportFiles) } satisfies NestedReportRootEvidence]
      : []
  ).slice(0, 8);

  const checks = (Array.isArray(candidate.checks) ? candidate.checks : []).flatMap((entry) =>
    entry && typeof entry.path === 'string' && EVIDENCE_PATH_STATES.includes(entry.state as GamePathEvidenceState)
      ? [{ path: entry.path, state: entry.state as GamePathEvidenceState }]
      : []
  ).slice(0, 20);

  return {
    gameId,
    rootResolvable: candidate.rootResolvable === true,
    reportRootEntries,
    nestedReportRoots,
    sopRootEntries,
    checks,
    observedAt,
    truncated: candidate.truncated === true
  };
}

export interface FolderDecision<T extends CanonicalFolder = CanonicalFolder> {
  folder: T;
  pendingAction?: PendingFilesystemAction;
}

const MAX_CANDIDATES = 8;

export function recognizeReportRootName(name: string): RecognizedReportRootName | undefined {
  const lower = String(name ?? '').trim().toLowerCase();
  return RECOGNIZED_REPORT_ROOT_NAMES.find((candidate) => candidate.toLowerCase() === lower);
}

/** SOP names vary by separator in the field: `Onboarding-SOP`, `Onboarding SOP`, `onboarding_sop`. */
export function recognizeSopRootName(name: string): RecognizedSopRootName | undefined {
  const normalized = String(name ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '-');
  return RECOGNIZED_SOP_ROOT_NAMES.find((candidate) => candidate.toLowerCase().replace(/[\s_-]+/g, '-') === normalized);
}

export function emptyReportsFolder(): ReportsFolder {
  return { provenance: 'none', state: 'not-set', lanes: {} };
}

export function emptySopFolder(): CanonicalFolder {
  return { provenance: 'none', state: 'not-set' };
}

export function createEmptyContract(gameId: string): GameFilesystemContract {
  return {
    schemaVersion: GAME_FILESYSTEM_SCHEMA_VERSION,
    gameId,
    revision: 0,
    reports: emptyReportsFolder(),
    sop: emptySopFolder()
  };
}

function attentionForState(state: GamePathEvidenceState): { code: AttentionCode } | undefined {
  if (state === 'missing') return { code: 'missing' };
  if (state === 'file') return { code: 'not-a-folder' };
  if (state === 'blocked') return { code: 'blocked' };
  return undefined;
}

interface ValidCandidate {
  path: string;
  recognized?: RecognizedReportRootName;
  reportFiles: number;
  /** Truncated counting means "at least this many" — never treated as empty. */
  nonEmpty: boolean;
}

function reportCandidates(evidence: GameFilesystemEvidence): ValidCandidate[] {
  const candidates: ValidCandidate[] = [];
  for (const entry of evidence.reportRootEntries) {
    if (entry.kind !== 'folder' || entry.safety !== 'ok') continue;
    candidates.push({
      path: entry.name,
      recognized: entry.recognized,
      reportFiles: entry.reportFiles,
      nonEmpty: entry.reportFiles > 0 || entry.reportFilesTruncated
    });
  }
  for (const nested of evidence.nestedReportRoots) {
    if (!nested.path || !nested.path.includes('/')) continue; // root-level is already covered
    if (candidates.some((candidate) => candidate.path.toLowerCase() === nested.path.toLowerCase())) continue;
    // A nested root only becomes evidence because reports were already discovered inside it.
    candidates.push({ path: nested.path, reportFiles: nested.reportFiles, nonEmpty: nested.reportFiles > 0 });
  }
  return candidates;
}

function sortCandidatePaths(paths: readonly string[]): string[] {
  return [...paths].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })).slice(0, MAX_CANDIDATES);
}

function verifyExistingChoice(
  current: CanonicalFolder,
  evidence: GameFilesystemEvidence,
  now: string
): CanonicalFolder | undefined {
  if (!current.path) return undefined;
  const check = evidence.checks.find((candidate) => candidate.path === current.path);
  // No evidence for this path (Game offline / not inspected): keep the last decision.
  if (!check || check.state === 'unknown') return { ...current };
  if (check.state === 'folder') {
    const verified: CanonicalFolder = { ...current, state: 'ready', verifiedAt: now };
    delete verified.attention;
    delete verified.candidates;
    return verified;
  }
  const attention = attentionForState(check.state) ?? { code: 'blocked' as AttentionCode };
  // A configured root that disappears NEVER silently re-roots to another candidate.
  return { ...current, state: 'needs-attention', attention };
}

/**
 * Reports-root decision (architecture §7.3).
 *
 * Precedence: explicit human choice > one unambiguous existing root > (later) create
 * Reports-SLC. Ambiguity is surfaced, never guessed away.
 */
export function decideReportsRoot(
  current: ReportsFolder,
  evidence: GameFilesystemEvidence,
  now: string
): FolderDecision<ReportsFolder> {
  const lanes = current.lanes ?? {};
  const withLanes = (folder: CanonicalFolder): ReportsFolder => ({ ...folder, lanes });

  if (!evidence.rootResolvable) {
    // The Stadium could not resolve the Game root: evidence is unusable, not proof of absence.
    return { folder: withLanes({ ...current, state: current.path ? current.state : 'unknown' }) };
  }

  // A. / B. An existing decision is verified, never re-detected.
  if (current.provenance === 'human' || current.provenance === 'adopted' || current.provenance === 'created') {
    const verified = verifyExistingChoice(current, evidence, now);
    if (verified) {
      const vanished = verified.state === 'needs-attention' && verified.attention?.code === 'missing';
      if (current.provenance === 'created' && vanished) {
        // A Sideline-created root may be re-created, but only when nothing else competes.
        const competitors = reportCandidates(evidence).filter((candidate) => candidate.path !== current.path);
        if (competitors.length === 0) {
          return { folder: withLanes(verified), pendingAction: 'create-reports-slc' };
        }
        return {
          folder: withLanes({ ...verified, candidates: sortCandidatePaths(competitors.map((candidate) => candidate.path)) })
        };
      }
      return { folder: withLanes(verified) };
    }
  }

  // C. No decision yet.
  const candidates = reportCandidates(evidence);
  const nonEmpty = candidates.filter((candidate) => candidate.nonEmpty);

  const adopt = (candidate: ValidCandidate): FolderDecision<ReportsFolder> => ({
    folder: withLanes({ path: candidate.path, provenance: 'adopted', state: 'ready', decidedAt: now, verifiedAt: now })
  });
  const needsChoice = (options: ValidCandidate[]): FolderDecision<ReportsFolder> => ({
    folder: withLanes({
      provenance: 'none',
      state: 'needs-choice',
      candidates: sortCandidatePaths(options.map((candidate) => candidate.path)),
      decidedAt: now
    })
  });

  if (nonEmpty.length === 1) return adopt(nonEmpty[0]);
  if (nonEmpty.length > 1) return needsChoice(nonEmpty);

  const canonical = candidates.filter((candidate) => candidate.recognized === CANONICAL_REPORTS_ROOT_NAME);
  if (canonical.length === 1) return adopt(canonical[0]);
  if (canonical.length > 1) return needsChoice(canonical);
  if (candidates.length === 1) return adopt(candidates[0]);
  if (candidates.length > 1) return needsChoice(candidates);

  // Nothing adoptable. Creation is a later slice; S6 only records the intent.
  const blockedCanonical = evidence.reportRootEntries.find(
    (entry) => entry.recognized === CANONICAL_REPORTS_ROOT_NAME && (entry.kind !== 'folder' || entry.safety !== 'ok')
  );
  if (blockedCanonical) {
    return {
      folder: withLanes({
        provenance: 'none',
        state: 'needs-attention',
        attention: {
          code: blockedCanonical.safety === 'escapes-game'
            ? 'escapes-game'
            : blockedCanonical.safety === 'inaccessible'
              ? 'inaccessible'
              : blockedCanonical.kind === 'file'
                ? 'name-collision'
                : 'blocked',
          detail: blockedCanonical.name
        },
        decidedAt: now
      })
    };
  }
  return { folder: withLanes({ provenance: 'none', state: 'not-set', decidedAt: now }), pendingAction: 'create-reports-slc' };
}

/**
 * SOP-root decision (architecture §9). Never created, never copied, never renamed.
 * Zero candidates is a normal `not-set`, not an error.
 */
export function decideSopRoot(current: CanonicalFolder, evidence: GameFilesystemEvidence, now: string): FolderDecision {
  if (!evidence.rootResolvable) {
    return { folder: { ...current, state: current.path ? current.state : 'unknown' } };
  }

  if (current.provenance === 'human' || current.provenance === 'detected' || current.provenance === 'adopted') {
    const verified = verifyExistingChoice(current, evidence, now);
    if (verified) return { folder: verified };
  }

  const valid = evidence.sopRootEntries.filter((entry) => entry.kind === 'folder' && entry.safety === 'ok');
  if (valid.length === 1) {
    return { folder: { path: valid[0].name, provenance: 'detected', state: 'ready', decidedAt: now, verifiedAt: now } };
  }
  if (valid.length > 1) {
    return {
      folder: {
        provenance: 'none',
        state: 'needs-choice',
        candidates: sortCandidatePaths(valid.map((entry) => entry.name)),
        decidedAt: now
      }
    };
  }
  return { folder: { provenance: 'none', state: 'not-set', decidedAt: now } };
}

export function applyEvidenceToContract(
  current: GameFilesystemContract,
  evidence: GameFilesystemEvidence,
  now: string
): GameFilesystemContract {
  const reports = decideReportsRoot(current.reports, evidence, now);
  const sop = decideSopRoot(current.sop, evidence, now);
  const next: GameFilesystemContract = {
    ...current,
    schemaVersion: GAME_FILESYSTEM_SCHEMA_VERSION,
    reports: reports.folder,
    sop: sop.folder,
    lastInspectedAt: evidence.observedAt
  };
  if (reports.pendingAction) next.pendingReportsAction = reports.pendingAction;
  else delete next.pendingReportsAction;
  return next;
}

/** Paths the Control Plane must ask the Stadium to verify for this contract. */
export function pathsToVerify(contract: GameFilesystemContract): string[] {
  const paths = new Set<string>();
  if (contract.reports.path) paths.add(contract.reports.path);
  if (contract.sop.path) paths.add(contract.sop.path);
  return [...paths];
}

/** Contract equality ignoring bookkeeping that must not burn a revision. */
export function contractDecisionEquals(left: GameFilesystemContract, right: GameFilesystemContract): boolean {
  const strip = (contract: GameFilesystemContract) =>
    JSON.stringify({
      reports: contract.reports,
      sop: contract.sop,
      pendingReportsAction: contract.pendingReportsAction ?? null
    });
  return strip(left) === strip(right);
}

// --- Dad-facing projection ---

export type ProvenanceLabel =
  | 'Chosen by you'
  | 'Using existing folder'
  | 'Created by Sideline'
  | 'Automatically selected'
  | 'Not set';

export interface CanonicalFolderView {
  path?: string;
  label: string;
  provenance: ProvenanceLabel;
  state: FolderState;
  attention?: string;
  candidates?: string[];
}

export interface GameSetupView {
  reports: CanonicalFolderView & { lanes: Array<{ key: string; folder: string; ready: boolean }> };
  sop: CanonicalFolderView;
  canChange: boolean;
}

function provenanceLabel(folder: CanonicalFolder, kind: 'reports' | 'sop'): ProvenanceLabel {
  if (!folder.path) return 'Not set';
  switch (folder.provenance) {
    case 'human':
      return 'Chosen by you';
    case 'created':
      return 'Created by Sideline';
    case 'detected':
      return 'Automatically selected';
    case 'adopted':
      return kind === 'reports' ? 'Using existing folder' : 'Automatically selected';
    default:
      return 'Not set';
  }
}

/** One human sentence per attention code. Never plumbing, IDs, or absolute paths. */
export function attentionSentence(folder: CanonicalFolder, kind: 'reports' | 'sop'): string | undefined {
  const noun = kind === 'reports' ? 'Reports folder' : 'SOP folder';
  const name = folder.path ?? (kind === 'reports' ? CANONICAL_REPORTS_ROOT_NAME : 'that folder');
  switch (folder.attention?.code) {
    case 'missing':
      return `${name} is missing — it may have been moved or deleted.`;
    case 'not-a-folder':
    case 'name-collision':
      return `Something that isn't a folder is named ${folder.attention.detail ?? name}.`;
    case 'escapes-game':
      return `${folder.attention.detail ?? name} points outside this Game.`;
    case 'inaccessible':
      return `Sideline can't read ${folder.attention.detail ?? name}.`;
    case 'blocked':
      return `Sideline can't use ${folder.attention.detail ?? name} as a ${noun}.`;
    case 'create-failed':
      return `Sideline couldn't create ${name}.`;
    case 'multiple-case-variants':
      return `More than one folder is named like ${name}.`;
    default:
      return undefined;
  }
}

function folderView(folder: CanonicalFolder, kind: 'reports' | 'sop'): CanonicalFolderView {
  const attention = attentionSentence(folder, kind);
  return {
    ...(folder.path ? { path: folder.path } : {}),
    label: folder.path ?? 'Not set',
    provenance: provenanceLabel(folder, kind),
    state: folder.state,
    ...(attention ? { attention } : {}),
    ...(folder.candidates?.length ? { candidates: folder.candidates } : {})
  };
}

export function projectGameSetup(contract: GameFilesystemContract | undefined, canChange: boolean): GameSetupView {
  const effective = contract ?? createEmptyContract('unknown');
  return {
    reports: {
      ...folderView(effective.reports, 'reports'),
      lanes: Object.values(effective.reports.lanes ?? {}).map((lane) => ({
        key: lane.key,
        folder: lane.folder,
        ready: lane.state === 'ready'
      }))
    },
    sop: folderView(effective.sop, 'sop'),
    canChange
  };
}
