/**
 * DEVELOPMENT SCOUT REPORT HANDOFF — the master Formation report.
 *
 * WAS: A successful runner left multiple filesystem paths (workspace, durable folder, per-receiver
 * report and durable report) and Dad had to hunt through hidden folders to read the result.
 *
 * IS: One canonical Formation result — `FORMATION-RESULT.md`, the same name and header contract the
 * product Formation parent already uses — is written for every terminal outcome that left any evidence,
 * and its absolute path is the single Dad-facing artifact (printed last, clickable in VS Code as
 * `<path>:1`). It states who ACTUALLY played (agent, provider, exact model, reasoning effort), the full
 * attempt history and substitution chain, total and per-attempt elapsed time, each surviving Player's
 * discoveries with attribution, failed attempts as preserved game film, contradictions left unadjudicated,
 * and any lane that never completed as explicit UNKNOWN territory. Receiver reports remain subordinate
 * evidence: preserved, referenced, and (bounded) embedded so Dad normally opens only this file.
 *
 * WHY: Report retrieval is machine work. A PARTIAL Formation with one useful receiver must still produce
 * an inspectable, truthful parent; intelligence is never hidden because a lane failed, and evidence is
 * never credited to a Player that did not produce it.
 *
 * WILL BE: The same logical handoff projected consistently across CLI, Dev Mode, browser and future
 * Scout orchestration surfaces. Synthesis here is deliberately mechanical (an index, never a verdict, and
 * no extra LLM call): cross-Scout judgement remains for a human or an Architect.
 *
 * No `vscode` import; depends on nothing but types.
 */

export interface MasterAttempt {
  readonly n: number;
  /** Agent alias that actually took the field for this attempt. */
  readonly receiver: string;
  readonly displayName?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly role?: string;
  readonly state: string;
  readonly failureClass?: string;
  readonly failureLabel?: string;
  readonly reason?: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly durationMs?: number;
  /** Alias of the receiver this attempt took over from. */
  readonly substituteFor?: string;
  /** Alias of the receiver that took over after this attempt. */
  readonly replacedBy?: string;
  readonly stdoutPath?: string;
  readonly stderrPath?: string;
  readonly reportPath?: string;
}

export interface MasterLane {
  readonly id: string;
  readonly objective: string;
  readonly objectiveHash?: string;
  readonly finalState: string;
  readonly finalReceiver: string;
  readonly model?: string;
  /** Durable path of the completed receiver report, when one exists. */
  readonly reportPath?: string;
  /** Contents of that report (read by the caller), extracted and embedded below. */
  readonly reportText?: string;
  readonly attempts: readonly MasterAttempt[];
}

export interface MasterSubstitution {
  readonly lane: string;
  readonly failedReceiver: string;
  readonly failureClass: string;
  readonly failureLabel?: string;
  readonly failureReason: string;
  readonly replacement: string | null;
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

export interface MasterReportInput {
  readonly playId: string;
  /** The manifest playId this fresh run was derived from, when it was. */
  readonly rerunOf?: string;
  readonly gameRoot: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly elapsedMs: number;
  readonly outcome: string;
  readonly lanes: readonly MasterLane[];
  readonly substitutions: readonly MasterSubstitution[];
  readonly durablePath: string;
  readonly workspacePath: string;
  /** Optional first line (e.g. the sideline-provenance marker). Only when the caller truly knows it. */
  readonly provenanceLine?: string;
}

const EMBED_LIMIT = 60_000;
const FIELD_LIMIT = 1_500;
const UNKNOWN = 'UNKNOWN';

/** hh:mm:ss from milliseconds. Negative/invalid input renders as 00:00:00. */
export function formatElapsed(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function masterReportHeadline(input: { outcome: string; completed: number; requested: number; substitutions: number; elapsedMs: number }): string {
  return `FORMATION ${input.outcome} · ${input.completed}/${input.requested} lane${input.requested === 1 ? '' : 's'} completed · ${input.substitutions} substitution${input.substitutions === 1 ? '' : 's'} · elapsed ${formatElapsed(input.elapsedMs)}`;
}

// ---------------------------------------------------------------- deterministic extraction

export interface ExtractedFindings {
  readonly result: string;
  readonly discoveries: string;
  readonly facts: string;
  readonly inferences: string;
  readonly unknowns: string;
  readonly contradictions: string;
  readonly files: string;
  /** True when at least one recognised section was found. */
  readonly structured: boolean;
}

const SECTION_PATTERNS: readonly (readonly [keyof Omit<ExtractedFindings, 'structured'>, RegExp])[] = [
  ['result', /^(?:executive answer|result|summary|bottom line|answer)\b/i],
  ['discoveries', /^(?:key (?:discoveries|findings)|discoveries|findings)\b/i],
  ['facts', /^facts?\b/i],
  ['inferences', /^inferences?\b/i],
  ['unknowns', /^unknowns?\b/i],
  ['contradictions', /^contradictions?\b/i],
  ['files', /^(?:important|relevant|exact|key) (?:files|paths|symbols)|^files? ?(?:\/|and) ?(?:symbols|paths)/i]
];

/**
 * Defensive, mechanical section extraction. Recognises markdown headings and bold-only heading lines;
 * a missing field is UNKNOWN, never invented. No model is consulted.
 */
export function extractReportSections(text: string): ExtractedFindings {
  const lines = String(text ?? '').split(/\r?\n/);
  const headingOf = (line: string): string | undefined => {
    const md = line.match(/^\s{0,3}#{1,4}\s+(.*?)\s*#*\s*$/);
    if (md) return md[1].replace(/\*+/g, '').replace(/^\d+[.)]\s*/, '').replace(/:$/, '').trim();
    const bold = line.match(/^\s{0,3}\*\*([^*]+)\*\*:?\s*$/);
    if (bold) return bold[1].replace(/^\d+[.)]\s*/, '').replace(/:$/, '').trim();
    return undefined;
  };
  const bodies = new Map<string, string>();
  let current: string | undefined;
  let buffer: string[] = [];
  const flush = () => {
    if (current !== undefined) for (const [key, pattern] of SECTION_PATTERNS) if (pattern.test(current) && !bodies.has(key)) bodies.set(key, buffer.join('\n').trim());
    buffer = [];
  };
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading !== undefined) { flush(); current = heading; } else buffer.push(line);
  }
  flush();
  const pick = (key: keyof Omit<ExtractedFindings, 'structured'>): string => {
    const body = bodies.get(key);
    return body ? body.slice(0, FIELD_LIMIT) : UNKNOWN;
  };
  return {
    result: pick('result'), discoveries: pick('discoveries'), facts: pick('facts'), inferences: pick('inferences'),
    unknowns: pick('unknowns'), contradictions: pick('contradictions'), files: pick('files'), structured: bodies.size > 0
  };
}

const emptyContradiction = (text: string): boolean => !text || text === UNKNOWN || /^(none|n\/a|no contradictions?)\.?$/i.test(text.trim());
const label = (attempt: Pick<MasterAttempt, 'displayName' | 'receiver'>): string => attempt.displayName ? `${attempt.displayName} (${attempt.receiver})` : attempt.receiver;
const cell = (value: unknown): string => String(value ?? UNKNOWN).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// ---------------------------------------------------------------- render

export function renderMasterReport(input: MasterReportInput): string {
  const lanes = input.lanes;
  const count = (state: string) => lanes.filter((lane) => lane.finalState === state).length;
  const completed = count('COMPLETE');
  const allAttempts = lanes.flatMap((lane) => lane.attempts.map((attempt) => ({ lane, attempt })));
  const replacements = input.substitutions.filter((item) => item.replacement).length;
  const lines: string[] = [];
  if (input.provenanceLine) lines.push(input.provenanceLine);

  lines.push('# FORMATION RESULT', '', 'SCOUT FORMATION RESULT', '', masterReportHeadline({ outcome: input.outcome, completed, requested: lanes.length, substitutions: replacements, elapsedMs: input.elapsedMs }), '');
  lines.push(`Play: ${input.playId}`, ...(input.rerunOf ? [`Rerun of: ${input.rerunOf} (earlier evidence untouched)`] : []), `Game: ${input.gameRoot}`, `Started: ${input.startedAt}`, `Finished: ${input.endedAt}`, `TOTAL ELAPSED TIME: ${formatElapsed(input.elapsedMs)}`, '');
  lines.push(`Scouts requested: ${lanes.length}`, `Completed: ${completed}`, `Failed: ${count('FAILED')}`, `Blocked: ${count('BLOCKED')}`, `Interrupted: ${count('INTERRUPTED')}`, `Unknown: ${count('UNKNOWN')}`, `Failed / unfilled lanes: ${lanes.length - completed}`, `Total receiver attempts: ${allAttempts.length}`, `Substitutions: ${replacements}`, `Outcome: ${input.outcome}`, '');

  lines.push('## PLAYERS WHO TOOK THE FIELD', '');
  lines.push('| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const { lane, attempt } of allAttempts) {
    const relation = [attempt.substituteFor ? `substituted for ${attempt.substituteFor}` : '', attempt.replacedBy ? `replaced by ${attempt.replacedBy}` : ''].filter(Boolean).join('; ') || '—';
    lines.push(`| ${cell(lane.id)} | ${attempt.n} | ${cell(label(attempt))} | ${cell(attempt.provider)} | ${cell(attempt.model)} | ${cell(attempt.reasoningEffort)} | ${cell(attempt.startedAt)} | ${cell(attempt.endedAt)} | ${attempt.durationMs === undefined ? UNKNOWN : formatElapsed(attempt.durationMs)} | ${cell(attempt.state)} | ${cell(attempt.failureLabel ? `${attempt.failureLabel} [${attempt.failureClass}]` : attempt.failureClass ?? '—')} | ${cell(relation)} | ${cell(attempt.reportPath ?? 'none')} |`);
  }
  lines.push('');

  lines.push('## SUBSTITUTION CHAIN', '');
  for (const lane of lanes) {
    const hops = lane.attempts.map((attempt) => label(attempt));
    const end = lane.finalState === 'COMPLETE' ? 'COMPLETE' : input.substitutions.some((item) => item.lane === lane.id && !item.replacement) ? 'NO ELIGIBLE SUBSTITUTE REMAINED' : lane.finalState;
    lines.push(`- Lane ${lane.id}: ${[...hops, end].join(' → ')}`);
    for (const attempt of lane.attempts.filter((item) => item.state !== 'COMPLETE')) {
      lines.push(`    - ${label(attempt)} benched: ${attempt.failureLabel ?? attempt.state}${attempt.reason ? ` — ${attempt.reason}` : ''}`);
    }
  }
  const unfilled = input.substitutions.filter((item) => !item.replacement);
  for (const item of unfilled) {
    lines.push(`- Lane ${item.lane}: no eligible substitute remained after ${item.failedReceiver} (${item.failureLabel ?? item.failureClass}).`);
    for (const skip of item.skipped) lines.push(`    - not used: ${skip.id} — ${skip.reason}`);
  }
  lines.push('');

  const done = lanes.filter((lane) => lane.finalState === 'COMPLETE' && lane.reportText);
  lines.push('## DISCOVERIES BY PLAYER', '');
  if (!done.length) lines.push('No Scout completed, so there are no discoveries to attribute.', '');
  for (const lane of done) {
    const winner = lane.attempts.filter((attempt) => attempt.state === 'COMPLETE').at(-1);
    const found = extractReportSections(lane.reportText ?? '');
    lines.push(`### ${winner ? label(winner) : lane.finalReceiver}`, '', `- Lane: ${lane.id}${lane.objectiveHash ? ` (objective ${lane.objectiveHash})` : ''}`, `- Objective: ${lane.objective}`, `- Model: ${winner?.model ?? lane.model ?? UNKNOWN} · Provider: ${winner?.provider ?? UNKNOWN} · Reasoning effort: ${winner?.reasoningEffort ?? UNKNOWN}`, `- Source report: ${lane.reportPath ?? UNKNOWN}`);
    if (found.structured) {
      lines.push('', `**Key discoveries:** ${found.discoveries !== UNKNOWN ? found.discoveries : found.result}`, '', `**FACT:** ${found.facts}`, '', `**INFERENCE:** ${found.inferences}`, '', `**UNKNOWN:** ${found.unknowns}`, '', `**CONTRADICTION:** ${found.contradictions}`, '', `**Important files:** ${found.files}`, '');
    } else {
      lines.push('', 'No structured sections were recognised in this report; the full text is under CHILD REPORTS below.', '');
    }
  }

  lines.push('## COMBINED FORMATION FINDINGS', '', `${completed} of ${lanes.length} lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.`, '');
  for (const lane of done) {
    const winner = lane.attempts.filter((attempt) => attempt.state === 'COMPLETE').at(-1);
    const found = extractReportSections(lane.reportText ?? '');
    const headline = found.result !== UNKNOWN ? found.result : found.discoveries !== UNKNOWN ? found.discoveries : 'No headline section recognised — see the Player report.';
    lines.push(`- **${winner ? label(winner) : lane.finalReceiver}** · lane ${lane.id}: ${headline.replace(/\s*\r?\n\s*/g, ' ').slice(0, 400)}`);
  }
  if (done.length) lines.push('');

  const failedAttempts = allAttempts.filter(({ attempt }) => attempt.state !== 'COMPLETE');
  lines.push('## FAILED / BLOCKED ATTEMPTS', '');
  if (!failedAttempts.length) lines.push('None.', '');
  for (const { lane, attempt } of failedAttempts) {
    lines.push(`- Lane ${lane.id} · attempt ${attempt.n} · ${label(attempt)}${attempt.model ? ` · ${attempt.model}` : ''}: ${attempt.state}${attempt.failureLabel ? ` [${attempt.failureLabel}]` : ''} · elapsed ${attempt.durationMs === undefined ? UNKNOWN : formatElapsed(attempt.durationMs)}${attempt.reason ? ` — ${attempt.reason}` : ''}`);
    if (attempt.stderrPath) lines.push(`    - stderr: ${attempt.stderrPath}`);
    if (attempt.stdoutPath) lines.push(`    - stdout / partial output: ${attempt.stdoutPath}`);
  }
  if (failedAttempts.length) lines.push('');

  lines.push('## CONTRADICTIONS', '');
  const contradictions = done
    .map((lane) => ({ lane, winner: lane.attempts.filter((attempt) => attempt.state === 'COMPLETE').at(-1), text: extractReportSections(lane.reportText ?? '').contradictions }))
    .filter((item) => !emptyContradiction(item.text));
  if (!contradictions.length) lines.push('None reported by the surviving Scouts. (Absence of a reported contradiction is not proof there is none.)', '');
  for (const item of contradictions) lines.push(`- ${item.winner ? label(item.winner) : item.lane.finalReceiver} · lane ${item.lane.id}: ${item.text.replace(/\s*\r?\n\s*/g, ' ')}`);
  if (contradictions.length) lines.push('', 'These are self-reported and are not adjudicated here.', '');

  const unknownLanes = lanes.filter((lane) => lane.finalState !== 'COMPLETE');
  lines.push('## UNKNOWN / UNFILLED TERRITORY', '');
  if (!unknownLanes.length) lines.push('Every requested lane returned a completed report.', '');
  else lines.push('These lanes returned no completed report. Absence is not success, and nothing in this report speaks for them:', '');
  for (const lane of unknownLanes) lines.push(`- ${lane.id}: ${lane.finalState}. Objective: ${lane.objective}`);
  if (unknownLanes.length) lines.push('');

  lines.push('## CHILD REPORTS', '');
  const children = allAttempts.filter(({ attempt }) => attempt.reportPath);
  if (!children.length) lines.push('No child report exists.', '');
  for (const { lane, attempt } of children) lines.push(`- Lane ${lane.id} · ${label(attempt)}: ${attempt.reportPath}`);
  if (children.length) lines.push('');
  for (const lane of done) {
    const text = lane.reportText ?? '';
    lines.push(`### Full report — lane ${lane.id} (${lane.finalReceiver})`, '', text.length > EMBED_LIMIT ? `${text.slice(0, EMBED_LIMIT)}\n\n[truncated at ${EMBED_LIMIT} characters — full report: ${lane.reportPath ?? 'see evidence folder'}]` : text.trim(), '');
  }

  lines.push('## Recommended next step', '', completed > 0
    ? (unknownLanes.length ? 'Review the surviving Scout reports above; decide whether the unfilled lanes justify a new Scout Play before forwarding to an Architect.' : 'Review the Scout reports above; forward to an Architect if a repair decision is warranted.')
    : 'No Scout completed. Investigate the failure evidence above before retrying; every attempt is preserved.', '');
  lines.push('## Evidence', '', `Durable evidence folder: ${input.durablePath}`, `Working folder: ${input.workspacePath}`, '');
  return `${lines.join('\n')}\n`;
}
