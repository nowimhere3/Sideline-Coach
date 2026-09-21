#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScoutFormation } from '../../out/scout-formation.js';
import { resolveDevelopmentScoutIntelligenceRoot } from '../../out/scout-intelligence-root.js';

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const FLAGS_WITH_VALUES = new Set(['--objective', '--game-root', '--players', '--formation-size']);
let positional;
for (let i = 0; i < args.length; i += 1) {
  if (FLAGS_WITH_VALUES.has(args[i])) { i += 1; continue; }
  if (!args[i].startsWith('--')) { positional = args[i]; break; }
}

const objective = value('--objective') ?? positional;
if (!objective) {
  console.error('Usage: npm run scout:formation -- "<reconnaissance objective>" [--game-root <path>] [--players id,id] [--formation-size 1-3]');
  process.exitCode = 2;
} else {
  const toolDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(toolDir, '..', '..');
  const gameRoot = path.resolve(value('--game-root') ?? repoRoot);
  // durableReportRoot is the canonical Scout Intelligence root. runScoutFormation()
  // computes its OWN bounded Formations/<id> namespace internally (V0.4
  // correction — a V0.3 attempt to do this by pre-appending 'Formations'
  // here silently broke AntiGravity's and Combine-derived candidates'
  // sibling-evidence lookups, both of which read paths relative to this
  // SAME root: Player Verification/, Combine/Scorecards/).
  const durableReportRoot = resolveDevelopmentScoutIntelligenceRoot();
  // No workspaceRoot is passed on purpose: Formation defaults its working state
  // to <durableReportRoot>/Work, the same Sideline-owned lane the product uses,
  // and never to a folder inside --game-root.
  const players = value('--players')?.split(',').map((id) => id.trim()).filter(Boolean);
  const formationSizeArg = value('--formation-size');
  const formationSize = formationSizeArg ? Number(formationSizeArg) : undefined;

  try {
    const completion = await runScoutFormation({ objective, gameRoot, durableReportRoot, players, formationSize });
    console.error(`SCOUT FORMATION RESULT\n\nPlay: ${completion.formationId}\n\nScouts requested: ${completion.scoutsRequested}\nCompleted: ${completion.scoutsCompleted}\nFailed: ${completion.scoutsFailed}\nBlocked: ${completion.scoutsBlocked}\nOutcome: ${completion.outcome}\n\nResult: ${completion.resultPath}`);
    console.log(JSON.stringify(completion, null, 2));
    process.exitCode = completion.outcome === 'COMPLETE' || completion.outcome === 'PARTIAL' ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}
