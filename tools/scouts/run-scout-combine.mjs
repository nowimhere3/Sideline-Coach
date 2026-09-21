#!/usr/bin/env node
import path from 'node:path';
import { runScoutCombine } from '../../out/scout-combine.js';
import { resolveDevelopmentScoutIntelligenceRoot } from '../../out/scout-intelligence-root.js';

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const gameRoot = path.resolve(value('--game-root') ?? process.cwd());
const durableReportRoot = resolveDevelopmentScoutIntelligenceRoot();
const routeArg = value('--route');
const route = routeArg && ['A', 'B', 'C'].includes(routeArg.toUpperCase()) ? routeArg.toUpperCase() : undefined;
const maxTryoutsArg = value('--max-tryouts');
const maxConcurrencyArg = value('--max-concurrency');

try {
  const completion = await runScoutCombine({
    gameRoot,
    durableReportRoot,
    route,
    budget: {
      ...(maxTryoutsArg ? { maxTryouts: Number(maxTryoutsArg) } : {}),
      ...(maxConcurrencyArg ? { maxConcurrency: Number(maxConcurrencyArg) } : {})
    }
  });
  console.error(`SCOUT COMBINE RESULT\n\nCombine: ${completion.combineId}\n\nProspects discovered: ${completion.prospectsDiscovered}\nSelected for tryout: ${completion.prospectsSelected}\nCompleted: ${completion.tryoutsCompleted}\nFailed: ${completion.tryoutsFailed}\nBlocked: ${completion.tryoutsBlocked}\n\nResult: ${completion.resultPath}\nScorecards: ${completion.scorecardsPath}`);
  console.log(JSON.stringify(completion, null, 2));
  process.exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}
