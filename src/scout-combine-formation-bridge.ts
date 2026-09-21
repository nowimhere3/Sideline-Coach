/**
 * Combine -> Formation bridge (V0.4).
 *
 * WAS: Scout Combine discovered prospects and maintained scorecards, while
 * Scout Formation had its own small built-in candidate registry. The
 * coaching staff knew who was READY, but normal Formations could not yet
 * field those receivers automatically.
 * IS: Scout Formation can consume READY Combine scorecards as dynamic
 * Formation candidates. Combine remains the tryout/evidence system;
 * Formation remains the real reconnaissance dispatcher. Eligibility is
 * re-read from the scorecard fresh at every Formation run, never cached —
 * a Player that stops being READY between a Combine run and a Formation
 * dispatch is excluded with no code change, and one that becomes READY
 * later is included the same way.
 * WHY: tryouts only create value if successful prospects can actually earn
 * snaps. The receiving corps should be maintained by machine-readable
 * evidence rather than hardcoded model lists or repeated human selection.
 *
 * Coach Refresh now maintains the same scorecards through Combine's bounded
 * tryout path. FUTURE: real-game scorecard ingestion (see scout-formation.ts's
 * own TRYOUT FILM vs REAL GAME FILM note), task-class depth charts,
 * CONSERVE-aware selection, Player-health integration, and performance-aware
 * routing remain future consumers of this seam.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createCombineExecutor, type CombineScorecard } from './scout-combine';
import type { CombineProspect, CombineProviderFamily } from './scout-combine-discovery';
import type { FormationCandidate, FormationContext, FormationEligibility } from './scout-formation';

function scorecardsDir(durableReportRoot: string): string {
  return path.join(path.resolve(durableReportRoot), 'Combine', 'Scorecards');
}

/** One unreadable/malformed scorecard is skipped, never breaks discovery of the others. */
function readScorecards(dir: string): CombineScorecard[] {
  let entries: string[];
  try { entries = fs.readdirSync(dir).filter((name) => name.endsWith('.json')); }
  catch { return []; }
  const cards: CombineScorecard[] = [];
  for (const entry of entries) {
    try { cards.push(JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as CombineScorecard); }
    catch { /* skip */ }
  }
  return cards;
}

function providerDisplay(provider: CombineProviderFamily): string {
  return provider === 'openrouter' ? 'OpenRouter' : 'OpenCode Zen';
}

/**
 * SCOUT EXECUTION / READINESS TRUTH
 *
 * WAS: Combine initially established candidate readiness through bounded
 * read-only tryouts.
 *
 * IS: A Player is only truly field-ready if the execution contract used to
 * certify it is representative of the contract used by real Formation
 * execution. Provider/auth/harness failures are infrastructure evidence, not
 * Player-quality evidence. Combine therefore owns catalog disappearance and
 * certification truth; this bridge only consumes the resulting scorecard.
 *
 * WHY: Sideline's future game film and adaptive depth chart become dangerous
 * if broken infrastructure silently teaches the Coach that capable Players
 * are bad.
 *
 * WILL BE: Scout readiness, Team game film, Player health/capacity, and future
 * AUTO/CONSERVE decisions should consume explicit execution-layer truth with
 * observation, inference, and policy kept separate.
 */

function eligibilityFor(card: CombineScorecard | undefined): FormationEligibility {
  if (!card) return { eligible: false, reason: 'Combine scorecard no longer exists.' };
  if (!card.model || !card.provider || !card.harness) {
    return { eligible: false, reason: 'UNKNOWN: the Combine scorecard is missing the provider/model/harness contract needed to reconstruct a safe executor route.' };
  }
  if (card.currentStatus !== 'READY') {
    return { eligible: false, reason: `Combine scorecard status is ${card.currentStatus}, not READY.` };
  }
  return { eligible: true, reason: `Combine scorecard is READY (last tryout ${card.lastTryoutAt ?? 'unknown'}).` };
}

/**
 * One FormationCandidate per Combine scorecard currently on disk. Never
 * hardcodes a candidate/model name: the set is exactly whatever
 * `REPORTS/Scout Only/Combine/Scorecards/*.json` currently contains, and a
 * candidate's eligibility is decided by re-reading its OWN scorecard at
 * selection time — the same "read the durable evidence fresh" pattern the
 * built-in AntiGravity candidate already uses for Player Verification.
 */
export function combineDerivedFormationCandidates(durableReportRoot: string): FormationCandidate[] {
  const dir = scorecardsDir(durableReportRoot);
  return readScorecards(dir).map((initial): FormationCandidate => ({
    id: initial.candidateId,
    player: initial.displayName,
    provider: providerDisplay(initial.provider),
    eligible(context: FormationContext): FormationEligibility {
      const fresh = readScorecards(scorecardsDir(context.durableReportRoot)).find((card) => card.candidateId === initial.candidateId);
      return eligibilityFor(fresh);
    },
    createExecutor(context?: FormationContext): ReturnType<FormationCandidate['createExecutor']> {
      const prospect: CombineProspect = {
        candidateId: initial.candidateId,
        provider: initial.provider,
        model: initial.model,
        displayName: initial.displayName,
        harness: initial.harness,
        discoveredAt: initial.firstSeen,
        advertisedFree: true,
        supportsTools: true,
        sourceEvidence: `Combine scorecard: ${initial.candidateId}`
      };
      // The same executor and credential environment used by Combine. The
      // environment is held only for this execution and is never scorecard data.
      return createCombineExecutor(prospect, 'Formation dispatch', { env: context?.env ?? process.env });
    }
  }));
}
