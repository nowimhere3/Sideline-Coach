import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  createAntiGravityExecutor,
  createDirectGeminiExecutor,
  runInterchangeabilityProof
} from '../../out/scout-interchangeability-runner.js';
import { resolveDevelopmentScoutIntelligenceRoot } from '../../out/scout-intelligence-root.js';

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const root = path.resolve(import.meta.dirname, '..', '..');
const manifestPath = path.resolve(root, valueAfter('--manifest') ?? 'tools/scouts/a-team-interchangeability-play.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const durableReportRoot = resolveDevelopmentScoutIntelligenceRoot();
const configDir = path.join(root, 'tools', 'scouts', 'opencode-interchangeability');

const completion = await runInterchangeabilityProof(manifest, {
  durableReportRoot,
  executors: [
    createDirectGeminiExecutor({ configDir }),
    createAntiGravityExecutor({ model: 'gemini-3.8-flash', effort: 'medium' })
  ]
});

process.stdout.write(`${JSON.stringify(completion, null, 2)}\n`);
process.exitCode = completion.outcome === 'PASS' ? 0 : 1;
