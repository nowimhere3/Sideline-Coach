#!/usr/bin/env node
/**
 * DEVELOPMENT HARNESS ONLY — not product UX.
 *
 * Launches one VS Code Extension Development Host per configured Game, each in
 * its own VS Code instance, all running this repository's extension source, all
 * connecting outbound to the single detached Control Plane.
 *
 * See tools/dev/host-launch-plan.mjs for why separate instances are required.
 *
 * Usage:
 *   node tools/dev/launch-games.mjs                 # launch every configured host
 *   node tools/dev/launch-games.mjs --only=gs3      # launch one host
 *   node tools/dev/launch-games.mjs --dry-run       # print the plan, spawn nothing
 *   node tools/dev/launch-games.mjs --verify        # launch, then wait for both Games to connect
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildLaunchPlans, resolveVSCodeExecutable, DEV_HOSTS_DIRNAME } from './host-launch-plan.mjs';
import { waitForConnectedGames, describeGames } from './verify-multi-game.mjs';

const toolsDevDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolsDevDir, '..', '..');

function parseArgs(argv) {
  const options = { only: [], dryRun: false, verify: false, expect: undefined };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--verify') options.verify = true;
    else if (arg.startsWith('--only=')) options.only.push(...arg.slice('--only='.length).split(',').filter(Boolean));
    else if (arg.startsWith('--expect=')) options.expect = Number(arg.slice('--expect='.length));
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readConfig() {
  const configPath = path.join(toolsDevDir, 'dev-games.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing dev harness config: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(
      [
        'Sideline Coach multi-Game development harness',
        '',
        '  --only=<name[,name]>  launch only the named hosts',
        '  --dry-run             print the launch plan without spawning',
        '  --verify              after launching, wait for the Games to connect',
        '  --expect=<n>          number of connected Games --verify requires',
        ''
      ].join('\n')
    );
    return 0;
  }

  const sidelineDir = process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
  const devHostsDir = path.join(sidelineDir, DEV_HOSTS_DIRNAME);

  const plans = buildLaunchPlans(readConfig(), { repoRoot, devHostsDir, only: options.only });

  // Fail before spawning anything if a Game checkout is missing, so the human
  // never has to work out which of two windows silently failed to appear.
  const missing = plans.filter((plan) => !fs.existsSync(plan.workspacePath));
  if (missing.length > 0) {
    for (const plan of missing) {
      console.error(`  ✗ ${plan.label}: workspace not found at ${plan.workspacePath}`);
    }
    throw new Error('One or more Game workspaces are missing. Clone them or edit tools/dev/dev-games.json.');
  }

  const compiledEntry = path.join(repoRoot, 'out', 'extension.js');
  if (!fs.existsSync(compiledEntry)) {
    throw new Error(`Extension is not compiled (${compiledEntry} missing). Run: npm run compile`);
  }

  const { executable, source } = resolveVSCodeExecutable({
    env: process.env,
    platform: process.platform,
    existsSync: fs.existsSync
  });

  console.log(`Extension source : ${repoRoot}`);
  console.log(`VS Code          : ${executable} (${source})`);
  console.log(`Host profiles    : ${devHostsDir}`);
  console.log('');

  for (const plan of plans) {
    if (options.dryRun) {
      console.log(`[dry-run] ${plan.label}`);
      console.log(`          ${executable} ${plan.args.join(' ')}`);
      continue;
    }

    fs.mkdirSync(plan.userDataDir, { recursive: true });
    fs.mkdirSync(plan.extensionsDir, { recursive: true });

    const child = spawn(executable, plan.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      shell: false
    });
    child.unref();

    const debugNote = plan.inspectExtensionsPort ? ` · attach on :${plan.inspectExtensionsPort}` : '';
    console.log(`  → launched ${plan.label}  (${plan.workspacePath})${debugNote}`);
  }

  if (options.dryRun) {
    return 0;
  }

  if (!options.verify) {
    console.log('');
    console.log('Both Extension Development Hosts are starting. Open the Control Plane browser');
    console.log('and check the Game dropdown, or run: npm run dev:verify');
    return 0;
  }

  const expected = options.expect ?? plans.length;
  console.log('');
  console.log(`Waiting for ${expected} Game(s) to reach Connected on the Control Plane...`);

  const result = await waitForConnectedGames({ expected, timeoutMs: 90_000 });
  console.log(describeGames(result));
  return result.satisfied ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`\nDev harness failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
