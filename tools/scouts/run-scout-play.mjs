#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScoutPlay } from '../../out/scout-play-runner.js';

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const manifestArg = value('--manifest');
if (!manifestArg) {
  console.error('Usage: npm run scout:play -- --manifest <play.json> [--workspace-root <path>] [--reports-root <path>] [--opencode <executable>]');
  process.exitCode = 2;
} else {
  const toolDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(toolDir, '..', '..');
  const manifestPath = path.resolve(manifestArg);
  const play = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const completion = await runScoutPlay(play, {
      workspaceRoot: value('--workspace-root'),
      durableReportRoot: path.resolve(value('--reports-root') ?? path.join(repoRoot, 'REPORTS', 'Scout Only')),
      opencodeExecutable: value('--opencode'),
      signal: controller.signal,
      onStateChange: (scout) => console.error(`[${scout.state}] ${scout.id} (${scout.agent})`)
    });
    console.log(JSON.stringify(completion, null, 2));
    process.exitCode = completion.outcome === 'COMPLETE' ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
