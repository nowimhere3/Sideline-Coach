#!/usr/bin/env node
/**
 * Fake OpenCode CLI for Scout Combine tests (V0.3). No network, no real model
 * calls. Mirrors just enough of `opencode run --agent X --model Y --format
 * default --dir Z <prompt>` to exercise createCombineExecutor's real spawn,
 * agent-contract-validation, and outcome-classification path.
 *
 *   FAKE_OPENCODE_MODE   complete | not-structurally-usable | auth-blocked | rate-limited | opaque-provider-fail | hard-fail
 *   FAKE_OPENCODE_LOG    optional JSONL invocation log
 */
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const mode = process.env.FAKE_OPENCODE_MODE || 'complete';
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (process.env.FAKE_OPENCODE_LOG) appendFileSync(process.env.FAKE_OPENCODE_LOG, `${JSON.stringify({
  args,
  model: flag('--model'),
  openRouterCredentialPresent: Boolean(process.env.OPENROUTER_API_KEY)
})}\n`);

if (mode === 'auth-blocked') {
  process.stderr.write('Error: Provider not found: openrouter\n');
  process.exit(1);
}
if (mode === 'rate-limited') {
  process.stderr.write('Error: rate limit exceeded for this model (429)\n');
  process.exit(1);
}
if (mode === 'opaque-provider-fail') {
  process.stderr.write('Error: {\n  "name": "UnknownError",\n  "data": {\n    "message": "Unexpected server error. Check server logs for details.",\n    "ref": "err_fixture123"\n  }\n}\n');
  process.exit(1);
}
if (mode === 'hard-fail') {
  process.stderr.write('Error: the model returned an invalid response\n');
  process.exit(1);
}

const report = mode === 'not-structurally-usable'
  ? 'I looked around but did not finish.\n'
  : [
      'This report is reconnaissance, not final architectural authority.',
      '',
      '### Executive answer',
      'This Game declares itself in package.json.',
      '',
      '### FACTS',
      '- package.json exists at the Game root.',
      '',
      '### INFERENCES',
      '- None required.',
      '',
      '### UNKNOWNS',
      '- None.',
      '',
      '### CONTRADICTIONS',
      'None.',
      '',
      '### Relevant files / symbols',
      '- package.json',
      '',
      '### Recommended next step',
      'None.',
      '',
      '### Provenance',
      'package.json'
    ].join('\n');
process.stdout.write(`${report}\n`);
process.exit(0);
