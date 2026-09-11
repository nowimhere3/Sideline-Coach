import { failingAssertions } from './assertions.mjs';
import { safeText } from './redaction.mjs';

const MAX_BYTES = 40 * 1024;
const fixedHeadings = ['HEADER', 'VERDICT', 'IDENTITY', 'LAUNCH', 'SERVER', 'WORKSPACE', 'PLAYERS', 'REPORTS', 'REFERENCES'];
const line = (label, value) => `- ${label}: ${safeText(value)}`;
const pathLine = (label, value) => `- ${label}: ${safeText(value, { path: true })}`;

function state(kind, value) {
  return `[${kind}] ${safeText(value)}`;
}

export function renderSnapshot(snapshot, { now = new Date() } = {}) {
  const ageMs = now.getTime() - new Date(snapshot.generatedAt).getTime();
  const freshness = ageMs > 10 * 60 * 1000 ? 'STALE' : 'FRESH';
  const failures = failingAssertions(snapshot);
  const i = snapshot.identity;
  const l = snapshot.launch;
  const s = snapshot.server;
  const r = snapshot.reports;
  const refs = snapshot.references;
  const lines = [
    'SIDELINE COACH DIAGNOSTICS (RM-1 · snapshot schema 1)',
    '', '## HEADER',
    line('generatedAt', `${snapshot.generatedAt} · ${freshness}`),
    line('collector', `${snapshot.collector} v${snapshot.collectorVersion}`),
    line('host', snapshot.host), line('OS', snapshot.os), line('VS Code', snapshot.vscodeVersion),
    line('redaction', 'allowlist + token-shape guard'),
    '', '## VERDICT'
  ];
  if (failures.length === 0) lines.push('No anomalies detected by automated assertions.');
  else failures.forEach((entry) => lines.push(`${entry.severity} ${entry.id} — ${safeText(entry.detail)}`));
  lines.push('', '## IDENTITY',
    pathLine('extensionDevelopmentPath (observed)', i.extensionDevelopmentPath),
    line('git (observed)', i.isGitRepo ? `${i.branch} @ ${i.shortHead}` : 'not a git repository'),
    line('packageVersion (observed)', i.packageVersion),
    line('sourceHash (observed; SHA-256 manifest over src/**/*.ts)', i.sourceHash),
    line('builtHash (observed; SHA-256 manifest over out/**/*.js)', i.builtHash),
    line('builtAt (observed)', i.builtAt), line('dependenciesInstalled (observed)', i.dependenciesInstalled),
    line('buildVerdict (derived)', i.buildVerdict),
    `- Sideline Coach copies (observed): ${safeText(i.copyCount)}; siblings: ${i.otherCopies.map((copy) => safeText(copy, { path: true })).join(', ') || 'none'}`,
    '', '## LAUNCH',
    line('launch configuration (observed)', l.launchConfigPresent ? l.configurationName : 'unknown (launch.json absent)'),
    pathLine('extensionDevelopmentPath intent (reported by launch.json)', l.extensionDevelopmentPathIntent),
    pathLine('host folder target (reported by launch.json)', l.hostFolderTarget),
    line('hostFolderExists (observed)', l.hostFolderExists), line('preLaunchTask (reported by launch.json)', l.preLaunchTask),
    line('preLaunchTaskDefinedInTasksJson (observed)', l.preLaunchTaskDefinedInTasksJson),
    line('npmScriptExists (observed)', l.npmScriptExists), line('compileFeasible (derived)', l.compileFeasible),
    line('VS Code activation evidence (reported; unscoped)', l.lastActivationSeen),
    line('VS Code task evidence (reported; unscoped)', l.lastPreLaunchTaskResult),
    '', '## SERVER',
    line('configuredPort (reported by configuration)', s.configuredPort), line('bindAddress (reported by manifest default)', s.bindAddress),
    line('autoStart (reported by configuration)', s.autoStart),
    line('coach.publicUrl (reported by configuration; host redacted)', `${s.publicUrl.state}; scheme ${s.publicUrl.scheme}`),
    line('Windows TCP ephemeral range (observed)', s.ephemeralRange),
    line('portInOsEphemeralRange (derived)', s.portInOsEphemeralRange),
    line('listenerPresent (observed)', s.listenerPresent), line('listener PID (observed)', s.listenerPid),
    line('listenerIsThisExtension (unknown)', 'unknown (requires activated extension)'),
    '', '## WORKSPACE',
    pathLine('intended host folder (derived from launch intent; not a live VS Code workspace observation)', l.hostFolderTarget),
    line('workspace file', 'unknown (requires activated extension)'),
    '', '## PLAYERS',
    line('terminalAllowlist (reported by configuration)', snapshot.players.terminalAllowlist.join(', ')),
    line('open allowlisted terminals', 'unknown (requires activated extension)'),
    line('duplicate-name detection', 'unknown (requires activated extension)'),
    '', '## REPORTS',
    line('reportGlobs (reported by configuration)', r.reportGlobs.join(', ')),
    line('matchedCount (observed)', r.matchedCount), `- newest report (observed): ${safeText(r.newestFile, { filename: true })}`,
    line('newest report mtime (observed)', r.newestMtime), line('newest report agent/source (derived)', r.newestAgent),
    '', '## REFERENCES',
    pathLine('launch.json', refs.launchJson), pathLine('tasks.json', refs.tasksJson), pathLine('settings.json', refs.settingsJson),
    pathLine('out', refs.outDir), pathLine('VS Code logs', refs.logRoot), pathLine('CURRENT.md', refs.current)
  );
  return enforceBudget(lines.join('\n') + '\n');
}

function enforceBudget(markdown) {
  if (Buffer.byteLength(markdown, 'utf8') <= MAX_BYTES) return markdown;
  const marker = '\n… truncated: output exceeded 40 KB; see Diagnostics/local/CURRENT.md for the bounded projection.\n';
  return Buffer.from(markdown, 'utf8').subarray(0, MAX_BYTES - Buffer.byteLength(marker)).toString('utf8') + marker;
}

export { fixedHeadings, MAX_BYTES };
