/**
 * Scout receiver substitution — the "injured list" policy shared by every Scout execution path.
 *
 * WAS: Formation could lose a reconnaissance lane when one originally selected receiver
 * became unavailable. The human had to notice, then rerun by hand.
 *
 * IS: Infrastructure/availability failure may safely retire that receiver for the
 * current lane and select the next CURRENT eligible receiver, bounded by attempt
 * history and truthful eligibility. The lane is the Play's demand; the receiver is only
 * a Player. Every distinct currently-eligible receiver may be tried at most once per lane,
 * so recovery is automatic and the bound is the finite bench itself — there is no numeric
 * retry cap to tune and no way to loop. Nothing else triggers a substitution: a receiver
 * that produced a valid completed report (even a weak one), a deliberate human abort, an
 * explicit safety/policy refusal, or a failure that cannot be identified from runtime
 * evidence is never silently replaced. UNKNOWN is a legitimate, non-substitutable class.
 *
 * WHY: Formation demand belongs to the Play, not permanently to one receiver. Dad
 * should not manually replay surviving work because one Scout went down. The failed
 * attempt stays as game film; the surviving lanes are never touched.
 *
 * WILL BE: Future scorecards, capacity evidence, health freshness, and richer
 * depth-chart policy may improve substitution RANKING without changing this
 * contract: classify -> select from current evidence -> each receiver once per lane ->
 * preserve every attempt.
 *
 * No `vscode` import and no dependency on either execution engine, so the CLI runner
 * (scout-play-runner.ts) and the product Formation (scout-formation.ts) can share it
 * without an import cycle.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type ReceiverAttemptState = 'COMPLETE' | 'FAILED' | 'BLOCKED' | 'INTERRUPTED' | 'UNKNOWN';

/**
 * - availability: provider/auth/quota/route/model/upstream/transport unavailability, or the receiver could not start.
 * - contention:   the local environment (e.g. a shared OpenCode database) refused, not the receiver.
 * - execution:    the process ended abnormally (crash, killed by something that was not the human) or exited
 *                 cleanly with no valid completed report.
 * - substantive:  the receiver produced a valid completed report. Quality is never an infrastructure problem.
 * - human-abort:  the human cancelled. Never replaced behind their back.
 * - policy:       an intentional safety/policy refusal. Never routed around.
 * - unknown:      cannot be told apart from a genuine failure. Never auto-substituted.
 */
export type ReceiverFailureClass = 'availability' | 'contention' | 'execution' | 'substantive' | 'human-abort' | 'policy' | 'unknown';

export interface ReceiverVerdict {
  readonly failureClass: ReceiverFailureClass;
  readonly substitutable: boolean;
  /** Dad-readable, one line. */
  readonly reason: string;
  /** Terminal/report label: RATE LIMITED, QUOTA, AUTH ISSUE, MODEL UNAVAILABLE, PROVIDER UNAVAILABLE, TRANSPORT FAILURE, LOCKED, CRASHED, … */
  readonly label: string;
}

/**
 * The signature of a provider/auth/quota/route condition in receiver output. Moved verbatim from
 * the Combine executor so the product and the CLI runner cannot drift into two definitions. The
 * Combine still uses exactly this (its certification semantics must not change); the classifier
 * below layers finer labels and additional evidence on top of it.
 */
export const INFRASTRUCTURE_SIGNATURE = /sign.?in|unauthorized|forbidden|api[_ -]?key|credential|provider not found|provider.?model.?not.?found|model not found|not configured|not connected|free tier|unexpected server error|unknownerror|rate.?limit|quota|429|resource.?exhausted/i;

/** Local resource contention: the receiver never got a fair start. Field-observed: "database is locked"; reproduced: concurrent first-time migration ("Failed query: CREATE TABLE …"). */
export const CONTENTION_SIGNATURE = /database is locked|sqlite_busy|resource busy or locked|\bEBUSY\b|failed query/i;

export function looksLikeProviderIssue(text: string): boolean {
  return INFRASTRUCTURE_SIGNATURE.test(text);
}

const POLICY = /content[_ -]?polic|safety (?:filter|system|polic)|policy violation|guardrail|moderation|violates? (?:our|the) (?:usage )?polic|refus(?:ed|al) (?:to|due)/i;
const RATE_LIMIT = /rate.?limit|too many requests|\b429\b/i;
const QUOTA = /quota|resource.?exhausted|insufficient (?:credits|quota)|payment required|(?:http|status(?: code)?|error|code)\W{0,4}402\b|out of credits|capacity/i;
const MODEL_UNAVAILABLE = /provider.?model.?not.?found|model not found|no such model|unsupported model|model .{0,60}not available|no endpoints? found|free tier can only|route unavailable/i;
const AUTH = /sign.?in|unauthori[sz]ed|forbidden|api[_ -]?key|credential|entitle|authentication|provider not found|not configured|not connected|(?:http|status(?: code)?|error|code)\W{0,4}40[13]\b/i;
const UPSTREAM = /bad gateway|service unavailable|gateway time-?out|upstream|provider returned error|temporarily unavailable|internal server error|unexpected server error|unknownerror|overloaded|(?:http|status(?: code)?|error|code)\W{0,4}(?:500|502|503|504|529)\b/i;
const TRANSPORT = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|network (?:error|unreachable)|connection (?:reset|refused|closed|timed out)|getaddrinfo/i;
const CRASH_TEXT = /FATAL ERROR|out of memory|heap (?:out|limit)|segmentation fault|access violation|stack overflow|maximum call stack|panic:|unhandled(?: promise)? rejection/i;

/** Windows NTSTATUS-style crash exit codes (0xC0000000+) — abnormal termination, not a reported error. */
const isCrashExitCode = (code: number | null | undefined): boolean => typeof code === 'number' && (code >= 0xC0000000 || code < 0) ;

/**
 * Classify one finished attempt. Conservative by construction: only a state/evidence pair that
 * positively identifies an infrastructure or abnormal-execution condition is substitutable.
 */
export function classifyReceiverFailure(input: {
  readonly state: ReceiverAttemptState;
  /** Whatever failure evidence exists (stderr, provider error, failure boundary). */
  readonly text: string;
  /** The receiver process could not even be started. */
  readonly couldNotStart?: boolean;
  /** The human (or the harness on the human's behalf) cancelled the run. */
  readonly humanAbort?: boolean;
  /** The process was terminated by a signal that was NOT requested by the runner/human. */
  readonly killedBySignal?: string | null;
  readonly exitCode?: number | null;
  /** The process exited 0 but produced no valid completed report. */
  readonly emptyReport?: boolean;
}): ReceiverVerdict {
  const text = input.text ?? '';
  if (input.state === 'COMPLETE') return { failureClass: 'substantive', substitutable: false, label: 'COMPLETE', reason: 'The Scout produced a valid completed report; a weak answer is not an infrastructure failure.' };
  if (input.humanAbort) return { failureClass: 'human-abort', substitutable: false, label: 'INTERRUPTED', reason: 'Cancelled by the human; never auto-replaced.' };
  if (input.state === 'INTERRUPTED') return { failureClass: 'unknown', substitutable: false, label: 'INTERRUPTED', reason: 'Interrupted (timeout or abort); not auto-replaced.' };
  if (POLICY.test(text) && input.state !== 'BLOCKED') return { failureClass: 'policy', substitutable: false, label: 'POLICY BLOCK', reason: 'An explicit safety/policy refusal; never routed around.' };

  const availability = (label: string, reason: string): ReceiverVerdict => ({ failureClass: 'availability', substitutable: true, label, reason });
  const specific = ((): ReceiverVerdict | undefined => {
    if (RATE_LIMIT.test(text)) return availability('RATE LIMITED', 'The provider rate-limited this Scout.');
    if (QUOTA.test(text)) return availability('QUOTA', 'Provider quota or capacity was exhausted for this Scout.');
    if (MODEL_UNAVAILABLE.test(text)) return availability('MODEL UNAVAILABLE', 'The requested model or route was unavailable.');
    if (AUTH.test(text)) return availability('AUTH ISSUE', 'Authentication or entitlement for this provider failed.');
    if (TRANSPORT.test(text)) return availability('TRANSPORT FAILURE', 'The network/transport to the provider failed.');
    if (UPSTREAM.test(text) || INFRASTRUCTURE_SIGNATURE.test(text)) return availability('PROVIDER UNAVAILABLE', 'The upstream provider or service failed.');
    return undefined;
  })();

  if (input.state === 'BLOCKED') return specific ?? availability('BLOCKED', 'The Player/provider reported it could not take the assignment.');
  if (input.couldNotStart) return availability('COULD NOT START', 'The Scout process could not be started.');
  if (input.state === 'FAILED' || input.state === 'UNKNOWN') {
    if (CONTENTION_SIGNATURE.test(text)) return { failureClass: 'contention', substitutable: true, label: 'LOCKED', reason: 'A shared local resource was locked; the Scout never got a fair start.' };
    if (specific) return specific;
    if (input.killedBySignal) return { failureClass: 'execution', substitutable: true, label: 'CRASHED', reason: `The process was terminated abnormally (${input.killedBySignal}) without a human request.` };
    if (isCrashExitCode(input.exitCode) || CRASH_TEXT.test(text)) return { failureClass: 'execution', substitutable: true, label: 'CRASHED', reason: 'The process crashed before a valid completed report existed.' };
    if (input.emptyReport) return { failureClass: 'execution', substitutable: true, label: 'NO REPORT', reason: 'The process exited without producing a valid completed report.' };
    return { failureClass: 'unknown', substitutable: false, label: input.state === 'FAILED' ? 'FAILED' : 'UNKNOWN', reason: 'Ended without a completed report for a reason that cannot be identified from runtime evidence; not auto-replaced.' };
  }
  return { failureClass: 'unknown', substitutable: false, label: 'UNKNOWN', reason: 'Outcome unknown; not auto-replaced.' };
}

/**
 * The absolute bound on attempts for one lane: one for the original receiver plus each distinct
 * bench receiver at most once. Derived from the finite candidate set — never a tuned constant.
 */
export function laneAttemptCeiling(benchSize: number): number {
  return Math.max(1, benchSize) + 1;
}

export interface SubstituteChoice<T> {
  readonly pick?: T;
  /** Why each considered-and-skipped receiver was skipped, for the truthful record. */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * Choose the next receiver for a lane from `bench` (in depth-chart order). A receiver is skipped if it
 * was already used (`attempted`) or is fielded elsewhere in this Formation (`claimed`) — nobody is
 * selected twice for the same lane, and a working receiver is never doubled up — or if its CURRENT
 * eligibility says no. Historical success is not current readiness: `isEligible` is asked now, on every call.
 */
export function selectSubstitute<T extends { readonly id: string }>(input: {
  readonly bench: readonly T[];
  readonly attempted: ReadonlySet<string>;
  readonly claimed: ReadonlySet<string>;
  readonly isEligible: (candidate: T) => { readonly eligible: boolean; readonly reason: string };
}): SubstituteChoice<T> {
  const skipped: { id: string; reason: string }[] = [];
  for (const candidate of input.bench) {
    if (input.attempted.has(candidate.id)) { skipped.push({ id: candidate.id, reason: 'Already attempted for this lane.' }); continue; }
    if (input.claimed.has(candidate.id)) { skipped.push({ id: candidate.id, reason: 'Already fielded on another lane in this Formation.' }); continue; }
    let verdict: { eligible: boolean; reason: string };
    try { verdict = input.isEligible(candidate); }
    catch (error) { verdict = { eligible: false, reason: `Eligibility could not be established: ${error instanceof Error ? error.message : String(error)}` }; }
    if (!verdict.eligible) { skipped.push({ id: candidate.id, reason: verdict.reason }); continue; }
    return { pick: candidate, skipped };
  }
  return { skipped };
}

/** One recorded substitution decision. `replacement` is null when the lane needed one and none was eligible. */
export interface SubstitutionRecord {
  readonly lane: string;
  readonly failedReceiver: string;
  readonly failureClass: ReceiverFailureClass;
  /** Terminal/report label for the failure (RATE LIMITED, LOCKED, …). */
  readonly failureLabel?: string;
  readonly failureReason: string;
  readonly replacement: string | null;
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
  readonly at: string;
}

interface ScorecardView { readonly model?: unknown; readonly currentStatus?: unknown; readonly lastTryoutAt?: unknown; readonly displayName?: unknown }

function readScorecardFor(scoutIntelligenceRoot: string, model: string): ScorecardView | undefined | 'no-chart' {
  const dir = path.join(path.resolve(scoutIntelligenceRoot), 'Combine', 'Scorecards');
  let entries: string[];
  try { entries = fs.readdirSync(dir).filter((name) => name.endsWith('.json')); }
  catch { return 'no-chart'; }
  for (const entry of entries) {
    let card: ScorecardView;
    try { card = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')); } catch { continue; }
    if (card.model === model) return card;
  }
  return undefined;
}

/**
 * Current readiness of a model from the Combine depth chart (`Combine/Scorecards/*.json`), read fresh
 * on every call. This is the SAME durable evidence the product Formation's bridge consumes; it is read
 * here directly only because the CLI runner cannot import the Combine without an import cycle.
 * No scorecard means readiness is UNKNOWN, and UNKNOWN is not eligible — readiness is never invented.
 */
export function combineReadinessForModel(scoutIntelligenceRoot: string, model: string): { readonly eligible: boolean; readonly reason: string } {
  const card = readScorecardFor(scoutIntelligenceRoot, model);
  if (card === 'no-chart') return { eligible: false, reason: 'No Combine depth chart is available, so readiness is unknown.' };
  if (!card) return { eligible: false, reason: 'No Combine scorecard for this model, so readiness is unknown.' };
  return card.currentStatus === 'READY'
    ? { eligible: true, reason: `Combine scorecard is READY (last tryout ${typeof card.lastTryoutAt === 'string' ? card.lastTryoutAt : 'unknown'}).` }
    : { eligible: false, reason: `Combine scorecard status is ${String(card.currentStatus)}, not READY.` };
}

/** The human name the depth chart knows this model by, when a scorecard exists. */
export function combineDisplayNameForModel(scoutIntelligenceRoot: string, model: string): string | undefined {
  const card = readScorecardFor(scoutIntelligenceRoot, model);
  return card && card !== 'no-chart' && typeof card.displayName === 'string' && card.displayName ? card.displayName : undefined;
}
