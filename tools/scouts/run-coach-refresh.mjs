#!/usr/bin/env node
import path from 'node:path';
import { runCoachRefresh } from '../../out/scout-coach-refresh.js';
import { resolveDevelopmentScoutIntelligenceRoot } from '../../out/scout-intelligence-root.js';

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const gameRoot = path.resolve(value('--game-root') ?? process.cwd());
const durableReportRoot = resolveDevelopmentScoutIntelligenceRoot();
const maxTryoutsArg = value('--max-tryouts');
const maxConcurrencyArg = value('--max-concurrency');

try {
  const completion = await runCoachRefresh({
    gameRoot,
    durableReportRoot,
    budget: {
      ...(maxTryoutsArg ? { maxTryouts: Number(maxTryoutsArg) } : {}),
      ...(maxConcurrencyArg ? { maxConcurrency: Number(maxConcurrencyArg) } : {})
    }
  });
  console.error(`COACH REFRESH RESULT\n\nRefresh needed: ${completion.prospectsDue > 0 ? 'yes' : 'no'}\nDue: ${completion.prospectsDue}\nRetried: ${completion.prospectsSelected}\nCompleted: ${completion.tryoutsCompleted}\nFailed: ${completion.tryoutsFailed}\nBlocked: ${completion.tryoutsBlocked}\nREADY depth chart changed: ${completion.readyDepthChartChanged ? 'yes' : 'no'}\n\nCombine evidence: ${completion.resultPath}\nScorecards: ${completion.scorecardsPath}`);
  console.log(JSON.stringify(completion, null, 2));
  process.exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}
