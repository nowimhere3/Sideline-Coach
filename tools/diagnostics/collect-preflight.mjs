import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeText, publicUrlClassification } from './redaction.mjs';

const exists = (file) => { try { fs.accessSync(file); return true; } catch { return false; } };
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; } };
const iso = (time) => time ? new Date(time).toISOString() : 'unknown';

function walk(root, predicate, max = 5000) {
  const found = [];
  const visit = (dir) => {
    if (found.length >= max) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length >= max) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full); else if (entry.isFile() && predicate(full)) found.push(full);
    }
  };
  if (exists(root)) visit(root);
  return found;
}

function manifestHash(root, extension) {
  const files = walk(root, (file) => file.toLowerCase().endsWith(extension)).sort();
  if (files.length === 0) return { hash: `unknown (${path.basename(root)}/ absent)`, newest: 0 };
  const digest = createHash('sha256'); let newest = 0;
  for (const file of files) {
    const stat = fs.statSync(file); newest = Math.max(newest, stat.mtimeMs);
    digest.update(path.relative(root, file)); digest.update('\0'); digest.update(fs.readFileSync(file)); digest.update('\0');
  }
  return { hash: digest.digest('hex').slice(0, 8), newest };
}

function git(root, args) { try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return undefined; } }
function command(command, args) { try { return execFileSync(command, args, { encoding: 'utf8', windowsHide: true }); } catch { return ''; } }

function resolveConfig(manifest, root) {
  const properties = manifest.contributes?.configuration?.properties ?? {};
  const config = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, value.default]));
  const candidates = [path.join(process.env.APPDATA ?? '', 'Code', 'User', 'settings.json'), path.join(root, '.vscode', 'settings.json')];
  for (const file of candidates) {
    const data = readJson(file);
    if (!data) continue;
    for (const key of Object.keys(config)) if (Object.hasOwn(data, key)) config[key] = data[key];
  }
  return config;
}

function parseLaunch(root, packageScripts) {
  const launchFile = path.join(root, '.vscode', 'launch.json');
  const tasksFile = path.join(root, '.vscode', 'tasks.json');
  const launch = readJson(launchFile); const tasks = readJson(tasksFile);
  const config = launch?.configurations?.find((item) => item.type === 'extensionHost') ?? launch?.configurations?.[0];
  if (!config) return { launchConfigPresent: false, configurationName: 'unknown', extensionDevelopmentPathIntent: 'unknown', hostFolderTarget: 'unknown', hostFolderExists: 'unknown', preLaunchTask: 'unknown', preLaunchTaskDefinedInTasksJson: 'unknown', npmScriptExists: 'unknown', compileFeasible: 'unknown', launchFile, tasksFile };
  const args = config.args ?? [];
  const development = args.find((value) => typeof value === 'string' && value.startsWith('--extensionDevelopmentPath='));
  const host = args.find((value) => typeof value === 'string' && !value.startsWith('--'));
  const task = config.preLaunchTask;
  const taskDefined = Array.isArray(tasks?.tasks) && tasks.tasks.some((item) => item.label === task || `${item.type ?? ''}: ${item.script ?? ''}` === task);
  const scriptName = typeof task === 'string' && task.startsWith('npm: ') ? task.slice(5) : undefined;
  const scriptExists = scriptName ? Object.hasOwn(packageScripts, scriptName) : false;
  return { launchConfigPresent: true, configurationName: config.name ?? 'unknown', extensionDevelopmentPathIntent: development?.slice('--extensionDevelopmentPath='.length) ?? 'unknown', hostFolderTarget: host ?? 'unknown', hostFolderExists: host ? exists(host) : 'unknown', preLaunchTask: task ?? 'unknown', preLaunchTaskDefinedInTasksJson: taskDefined, npmScriptExists: scriptExists, compileFeasible: scriptExists && exists(path.join(root, 'node_modules', '.bin', 'tsc')), launchFile, tasksFile };
}

function tcpState(port) {
  const output = command('netstat', ['-ano', '-p', 'tcp']);
  const match = output.split(/\r?\n/).find((line) => new RegExp(`[:.]${port}\\s+.*LISTENING`, 'i').test(line));
  if (!match) return { listenerPresent: false, listenerPid: 'unknown' };
  const parts = match.trim().split(/\s+/); return { listenerPresent: true, listenerPid: parts.at(-1) ?? 'unknown' };
}

function ephemeralRange() {
  const output = command('netsh', ['int', 'ipv4', 'show', 'dynamicport', 'tcp']);
  const start = Number(output.match(/Start Port\s*:\s*(\d+)/i)?.[1]);
  const count = Number(output.match(/Number of Ports\s*:\s*(\d+)/i)?.[1]);
  return Number.isFinite(start) && Number.isFinite(count) ? { start, end: start + count - 1, text: `${start}-${start + count - 1}` } : { start: undefined, end: undefined, text: 'unknown' };
}

function logEvidence(logRoot) {
  const candidates = walk(logRoot, (file) => /(?:exthost|tasks)\.log$/i.test(file), 200).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  let activation = 'unknown (no safely scoped VS Code log evidence)';
  let task = 'unknown (no safely scoped VS Code task evidence)';
  for (const file of candidates) {
    let content; try { content = fs.readFileSync(file, 'utf8').slice(-2_000_000); } catch { continue; }
    if (/exthost\.log$/i.test(file) && /sideline[- ]coach|local\.sideline-coach/i.test(content)) activation = `activation record found in ${path.basename(file)}; workspace mapping unknown`;
    if (/tasks\.log$/i.test(file) && /npm:\s*compile/i.test(content)) task = `npm: compile evidence found in ${path.basename(file)}; outcome/workspace mapping unknown`;
  }
  return { activation, task };
}

function reportFiles(host, globs) {
  if (!exists(host)) return [];
  const extensions = new Set();
  for (const glob of globs) for (const ext of glob.matchAll(/\{([^}]+)\}/g)) ext[1].split(',').forEach((value) => extensions.add(`.${value.replace(/^\./, '').toLowerCase()}`));
  if (extensions.size === 0) { extensions.add('.md'); extensions.add('.txt'); }
  return walk(host, (file) => extensions.has(path.extname(file).toLowerCase()) && /docs report/i.test(path.relative(host, file)), 5000);
}

function controlPlaneState(sidelineDir) {
  const base = { discoveryPresent: false, port: 'unknown', pid: 'unknown', protocolVersion: 'unknown', daemonAlive: 'unknown', live: null };
  const discoveryPath = path.join(sidelineDir, 'control-plane.json');
  const record = readJson(discoveryPath);
  if (!record) return base;
  let alive = 'unknown';
  if (Number.isSafeInteger(record.pid)) {
    try { process.kill(record.pid, 0); alive = true; } catch { alive = false; }
  }
  return {
    discoveryPresent: true,
    port: record.port ?? 'unknown',
    pid: record.pid ?? 'unknown',
    protocolVersion: record.protocolVersion ?? 'unknown',
    daemonAlive: alive,
    live: null
  };
}

export function collectPreflight({ root = process.cwd(), logRoot = path.join(process.env.APPDATA ?? '', 'Code', 'logs'), generatedAt = new Date().toISOString(), sidelineDir = process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline') } = {}) {
  const packageFile = path.join(root, 'package.json'); const manifest = readJson(packageFile) ?? {};
  const config = resolveConfig(manifest, root); const launch = parseLaunch(root, manifest.scripts ?? {});
  const source = manifestHash(path.join(root, 'src'), '.ts'); const built = manifestHash(path.join(root, 'out'), '.js');
  const dependenciesInstalled = exists(path.join(root, 'node_modules'));
  const buildVerdict = built.newest === 0 ? 'not-built' : built.newest >= source.newest ? 'built-current' : 'built-stale';
  const parent = path.dirname(root); let copies = [];
  try { copies = fs.readdirSync(parent, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(parent, entry.name)).filter((dir) => readJson(path.join(dir, 'package.json'))?.name === 'sideline-coach'); } catch { copies = []; }
  const port = Number(config['coach.port']); const ephemeral = ephemeralRange(); const listener = tcpState(port); const logs = logEvidence(logRoot);
  const reports = reportFiles(launch.hostFolderTarget, Array.isArray(config['coach.reportGlobs']) ? config['coach.reportGlobs'] : []);
  const newest = reports.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]; const newestStat = newest ? fs.statSync(newest) : undefined;
  const publicUrl = publicUrlClassification(config['coach.publicUrl']);
  return {
    schema: 1, collector: 'preflight', collectorVersion: '1', generatedAt, host: safeText(os.hostname()), os: safeText(`${os.type()} ${os.release()}`), vscodeVersion: 'unknown (not probed)',
    identity: { extensionDevelopmentPath: root, isGitRepo: Boolean(git(root, ['rev-parse', '--is-inside-work-tree'])), branch: git(root, ['branch', '--show-current']) ?? 'unknown', shortHead: git(root, ['rev-parse', '--short=8', 'HEAD']) ?? 'unknown', packageVersion: manifest.version ?? 'unknown', sourceHash: source.hash, builtHash: built.hash, builtAt: iso(built.newest), dependenciesInstalled, buildVerdict, copyCount: copies.length, otherCopies: copies.filter((copy) => path.resolve(copy) !== path.resolve(root)) },
    launch: { ...launch, lastActivationSeen: logs.activation, lastPreLaunchTaskResult: logs.task },
    server: { configuredPort: Number.isFinite(port) ? port : 'unknown', bindAddress: '127.0.0.1', autoStart: config['coach.autoStart'] ?? 'unknown', ephemeralRange: ephemeral.text, portInOsEphemeralRange: Number.isFinite(port) && Number.isFinite(ephemeral.start) ? port >= ephemeral.start && port <= ephemeral.end : 'unknown', ...listener, publicUrl },
    controlPlane: controlPlaneState(sidelineDir),
    players: { terminalAllowlist: Array.isArray(config['coach.terminalAllowlist']) ? config['coach.terminalAllowlist'] : [] },
    reports: { reportGlobs: Array.isArray(config['coach.reportGlobs']) ? config['coach.reportGlobs'] : [], matchedCount: reports.length, newestFile: newest ? path.basename(newest) : 'unknown (no matches)', newestMtime: newestStat ? iso(newestStat.mtimeMs) : 'unknown', newestAgent: newest ? (/codex/i.test(newest) ? 'Codex' : /claude/i.test(newest) ? 'Claude' : /antigravity/i.test(newest) ? 'AntiGravity' : 'unknown') : 'unknown' },
    references: { launchJson: launch.launchFile, tasksJson: launch.tasksFile, settingsJson: path.join(root, '.vscode', 'settings.json'), outDir: path.join(root, 'out'), logRoot, current: path.join(root, 'Diagnostics', 'local', 'CURRENT.md') }
  };
}
