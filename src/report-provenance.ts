/**
 * Explicit report provenance (Q2.10D).
 *
 * A report may say who wrote it with ONE invisible line near its top:
 *
 *   <!-- sideline-provenance: {"gameId":"game_git_…","clientRef":"ref_…","playerInstanceId":"claude-1a2b3c4d","playerType":"claude","provider":"claude","model":"opus","effort":"high","at":"2026-09-13T08:00:00Z"} -->
 *
 * An HTML comment renders as nothing in Markdown, so a human-readable report stays
 * exactly as readable. Absent, malformed or partial provenance is simply Unknown —
 * the Ledger then falls back to its conservative timing attribution.
 *
 * No `vscode` import: parsed by the Stadium, trusted by the Control Plane only for
 * instances of the same Game.
 */

export interface ReportProvenance {
  readonly gameId?: string;
  readonly clientRef?: string;
  readonly playerInstanceId?: string;
  readonly playerType?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly at?: string;
}

/**
 * Facts the Control Plane knows before a Controlled Play crosses to its Stadium.
 * The parser stays permissive for older/partial reports; source-side stamping uses
 * this stronger shape so identity and execution dimensions are never conflated.
 */
export interface ControlledExecutionProvenance {
  readonly gameId: string;
  readonly clientRef: string;
  readonly playerInstanceId: string;
  readonly playerType: string;
  readonly provider: string;
  /** Provider-native model id, or `provider-default` when Coach did not select one. */
  readonly model: string;
  /** Omitted when the provider did not expose or Sideline did not select an effort. */
  readonly effort?: string;
  readonly at: string;
}

const MARKER = /<!--\s*sideline-provenance:\s*(\{[\s\S]*?\})\s*-->/;
const INSTANCE_ID = /^[a-z]+-[0-9a-f]{8}$/;
const HEAD_BYTES = 4_096;

/** Read provenance from the head of a report. Never throws; unknown fields are dropped. */
export function parseReportProvenance(content: string | undefined): ReportProvenance | undefined {
  if (!content) return undefined;
  const match = MARKER.exec(content.slice(0, HEAD_BYTES));
  if (!match) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(match[1]); } catch { return undefined; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const text = (key: string, max = 200): string | undefined =>
    typeof record[key] === 'string' && (record[key] as string).length > 0 && (record[key] as string).length <= max ? record[key] as string : undefined;
  const playerInstanceId = text('playerInstanceId');
  const provenance: ReportProvenance = {
    gameId: text('gameId'),
    clientRef: text('clientRef'),
    playerInstanceId: playerInstanceId && INSTANCE_ID.test(playerInstanceId) ? playerInstanceId : undefined,
    playerType: text('playerType', 40),
    provider: text('provider', 40),
    model: text('model', 120),
    effort: text('effort', 40),
    at: text('at', 40)
  };
  return Object.values(provenance).some((value) => value !== undefined) ? provenance : undefined;
}

/** The exact line a Controlled Player can place at the top of a report. */
export function formatReportProvenance(provenance: ReportProvenance): string {
  const clean = Object.fromEntries(Object.entries(provenance).filter(([, value]) => value !== undefined));
  return `<!-- sideline-provenance: ${JSON.stringify(clean)} -->`;
}

function explicitSetting(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized !== 'default' && normalized !== 'auto' ? normalized : undefined;
}

/** Build the exact, truthful payload Sideline supplies to a Controlled Player. */
export function createControlledExecutionProvenance(input: {
  gameId: string;
  clientRef: string;
  playerInstanceId: string;
  playerType: string;
  provider: string;
  model?: string;
  effort?: string;
  at: number | string | Date;
}): ControlledExecutionProvenance {
  const at = input.at instanceof Date ? input.at : new Date(input.at);
  return {
    gameId: input.gameId,
    clientRef: input.clientRef,
    playerInstanceId: input.playerInstanceId,
    playerType: input.playerType,
    provider: input.provider,
    model: explicitSetting(input.model) ?? 'provider-default',
    effort: explicitSetting(input.effort),
    at: at.toISOString()
  };
}

/**
 * Provider-neutral prompt footer. The Player receives an already-complete marker
 * and only has to copy it into reports created or updated for this Play; it is
 * never asked to invent Game, instance, provider, model, effort, or Play identity.
 */
export function buildReportProvenanceInstruction(provenance: ControlledExecutionProvenance): string {
  return [
    '[Sideline Coach report provenance]',
    'If this Play creates or updates a Markdown report, place the following exact HTML comment near the top of that report:',
    formatReportProvenance(provenance),
    'If that report already has a sideline-provenance HTML comment, replace the old comment with this exact line; never retain or add a second marker.',
    'Copy that line exactly. Do not rewrite its values or expose them elsewhere in the human-readable report.'
  ].join('\n');
}

/**
 * S9.0 — the canonical, Game-relative report destination a Controlled Play is
 * told to write into. `destination` is a machine-resolved, trusted coordinate
 * (the same GameFilesystemContract path/lane S7 already watches); it is never
 * derived from, or overridable by, human Play text. Kept as a separate
 * human-readable instruction block — never folded into the machine-only
 * `sideline-provenance` marker, which stays about WHO wrote a report, not
 * WHERE it lives.
 */
export function buildReportDestinationInstruction(destination: string): string {
  return [
    'SIDELINE CONTROLLED REPORT DESTINATION',
    '',
    'Canonical Game-relative report folder:',
    destination,
    '',
    'Write the formal report for this Play inside that folder.',
    'Do not create or choose a different Reports root.',
    'Preserve the Sideline report provenance marker exactly as instructed.'
  ].join('\n');
}
