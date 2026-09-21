#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runScoutPlay, formatScoutPlayHandoff, parseScoutManifest } from '../../out/scout-play-runner.js';
import { createProcessScoutTerminalView } from '../../out/scout-terminal.js';
import { resolveDevelopmentScoutIntelligenceRoot } from '../../out/scout-intelligence-root.js';

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
// Expected refusals (existing playId, unreadable manifest) are plain messages; stacks only for debugging.
const fail = (error) => (process.env.SCOUT_DEBUG && error instanceof Error ? error.stack ?? error.message : error instanceof Error ? error.message : String(error));
const manifestArg = value('--manifest');
if (!manifestArg) {
  console.error('Usage: npm run scout:play -- --manifest <play.json> [--workspace-root <path>] [--reports-root <path>] [--opencode <executable>] [--fresh] [--shared-db] [--json]');
  process.exitCode = 2;
} else {
  const manifestPath = path.resolve(manifestArg);
  // The manifest is only ever READ (BOM-tolerant). --fresh derives a new playId in the runner; the file is never modified.
  let play;
  try { play = parseScoutManifest(fs.readFileSync(manifestPath, 'utf8'), manifestPath); }
  catch (error) { console.error(fail(error)); process.exit(1); }
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  // Live view (clock + events) goes to stderr; the handoff goes to stdout AFTER the view has stopped.
  const view = createProcessScoutTerminalView(process.stderr);
  try {
    const completion = await runScoutPlay(play, {
      workspaceRoot: value('--workspace-root'),
      durableReportRoot: path.resolve(value('--reports-root') ?? resolveDevelopmentScoutIntelligenceRoot()),
      opencodeExecutable: value('--opencode'),
      dbIsolation: args.includes('--shared-db') ? 'inherit' : 'per-attempt',
      fresh: args.includes('--fresh'),
      signal: controller.signal,
      onNote: (message) => { if (message.startsWith('FRESH RUN')) console.error(message); },
      onEvent: (event) => view.handle(event)
    });
    view.stop();
    // Machine output is opt-in. Dad's ending is a headline and ONE clickable path, always last.
    if (args.includes('--json')) console.log(JSON.stringify(completion, null, 2));
    console.log('');
    for (const line of formatScoutPlayHandoff(completion)) console.log(line);
    process.exitCode = completion.outcome === 'COMPLETE' ? 0 : 1;
  } catch (error) {
    view.stop();
    console.error(fail(error));
    process.exitCode = 1;
  } finally {
    view.stop();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
