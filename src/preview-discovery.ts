/**
 * R12 Browser Preview V1 — find the Game's own running web app.
 *
 * Runs in the Stadium, i.e. in the same environment as the Game's dev server
 * (local, WSL/SSH remote host, or Codespace). Nothing here proxies traffic:
 * it only answers "which URL shows this Game's app?".
 *
 * Environment-neutral by design: the environmental bridge is the injected
 * `toClientUrl` mapping. VS Code supplies `asExternalUri`; a future adapter
 * (e.g. Google Cloud Shell: port + WEB_HOST → authenticated Web Preview URL,
 * `directTabOnly`) plugs in there without changing this model.
 *
 * Discovery order: `.sideline/game.json` declaration → detected candidates
 * from package.json scripts / framework defaults / vite.config literal port,
 * each probed on both loopback families and ownership-checked so one Game is
 * never handed another Game's server.
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as path from 'path';
import { execFile } from 'child_process';
import { discoverStaticPreview, StaticPreviewServer, type StaticPreviewPage } from './static-preview';

export type PreviewProtocol = 'http' | 'https';
export type PreviewSource = 'declared' | 'detected' | 'static';
/** 'declared' = named in game.json; 'verified' = listener proven under the Game root; 'unverified' = could not prove either way. */
export type PreviewOwnership = 'declared' | 'verified' | 'unverified';
export type PreviewUnavailableReason = 'not-running' | 'no-web-app' | 'invalid-declaration' | 'invalid-static-declaration' | 'static-choice-required';

export interface PreviewPage extends StaticPreviewPage {
  readonly clientUrl: string;
}

export interface PreviewEndpoint {
  readonly previewId: string;
  readonly gameId: string;
  readonly stadiumId: string;
  /** URL in the Stadium's own environment (e.g. http://localhost:5173/). */
  readonly localUrl: string;
  /** URL valid for the machine running the VS Code client. Never valid for a paired phone. */
  readonly clientUrl: string;
  readonly port?: number;
  readonly protocol: PreviewProtocol;
  readonly source: PreviewSource;
  readonly ownership: PreviewOwnership;
  /** Friendly framework name, e.g. "Vite". */
  readonly label?: string;
  readonly primary: boolean;
  /** Presentation hint: this URL must be opened as its own tab, never framed. */
  readonly directTabOnly?: boolean;
  /** The listener answered on 127.0.0.1 and clientUrl is unforwarded, so either loopback spelling works. */
  readonly loopbackIpv4?: boolean;
  readonly observedAt: number;
  /** Static multi-page navigation. The primary item remains the canonical Game home. */
  readonly pages?: PreviewPage[];
}

export interface PreviewResolution {
  available: boolean;
  endpoints: PreviewEndpoint[];
  reason?: PreviewUnavailableReason;
  /** Detected framework label, used for Dad-facing hints when nothing is running. */
  framework?: string;
  /** package.json script that starts the app, e.g. "dev" → "npm run dev". */
  devScript?: string;
  /** Safe page names for the ambiguity chooser; URLs appear only after a server is started. */
  staticPages?: StaticPreviewPage[];
}

export interface ClientUrlMapping {
  url: string;
  directTabOnly?: boolean;
}

export interface LoopbackProbeResult {
  ipv4: boolean;
  ipv6: boolean;
  protocol?: PreviewProtocol;
}

export interface ListenerInfo {
  pid?: number;
  commandLine?: string;
  cwd?: string;
}

export interface PreviewResolveOptions {
  gameId: string;
  stadiumId: string;
  rootFsPath: string;
  toClientUrl?: (localUrl: string) => Promise<ClientUrlMapping>;
  probe?: (port: number) => Promise<LoopbackProbeResult>;
  inspectListener?: (port: number) => Promise<ListenerInfo | undefined>;
  now?: () => number;
  staticServer?: StaticPreviewServer;
  rememberedStaticEntrypoint?: string;
  selectedStaticEntrypoint?: string;
  activeHtmlPath?: string;
}

export interface PreviewCandidate {
  port: number;
  label?: string;
}

export interface DetectedPreviewProject {
  framework?: string;
  devScript?: string;
  candidates: PreviewCandidate[];
}

export const MAX_PREVIEW_CANDIDATES = 8;
const PROBE_TIMEOUT_MS = 600;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// --- Declaration -------------------------------------------------------------

/** Only plain http(s) URLs without credentials may ever reach an iframe or openExternal. */
export function parsePreviewUrl(raw: unknown): URL | undefined {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048) return undefined;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return undefined; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username || url.password || !url.hostname) return undefined;
  return url;
}

export function isLoopbackUrl(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
}

function validPort(value: unknown): number | undefined {
  const port = typeof value === 'string' && /^\d{1,5}$/.test(value.trim()) ? Number(value.trim()) : value;
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined;
}

/** `.sideline/game.json` → `previewUrl` (http/https) or `previewPort`. `invalid` means a declaration exists but is refused. */
export function readPreviewDeclaration(rootFsPath: string): { url?: URL; invalid?: true } | undefined {
  let parsed: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(path.join(rootFsPath, '.sideline', 'game.json'), 'utf8');
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object') return undefined;
    parsed = value as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (parsed.previewUrl !== undefined) {
    const url = parsePreviewUrl(parsed.previewUrl);
    return url ? { url } : { invalid: true };
  }
  if (parsed.previewPort !== undefined) {
    const port = validPort(parsed.previewPort);
    return port ? { url: new URL(`http://localhost:${port}/`) } : { invalid: true };
  }
  return undefined;
}

// --- Detection ---------------------------------------------------------------

interface FrameworkRule {
  label: string;
  bin: string;
  /** Sub-command required after the binary; undefined = none required. */
  subcommands?: string[];
  /** Sub-commands that mean "not a dev server". */
  excluded?: string[];
  port: number;
  autoIncrement: boolean;
}

const FRAMEWORKS: FrameworkRule[] = [
  { label: 'Vite', bin: 'vite', excluded: ['build', 'preview', 'optimize'], port: 5173, autoIncrement: true },
  // A bare `next` also starts the dev server.
  { label: 'Next.js', bin: 'next', subcommands: ['dev', ''], port: 3000, autoIncrement: true },
  { label: 'Create React App', bin: 'react-scripts', subcommands: ['start'], port: 3000, autoIncrement: true },
  { label: 'Astro', bin: 'astro', subcommands: ['dev'], port: 4321, autoIncrement: true },
  { label: 'Nuxt', bin: 'nuxt', subcommands: ['dev'], port: 3000, autoIncrement: true },
  { label: 'Nuxt', bin: 'nuxi', subcommands: ['dev'], port: 3000, autoIncrement: true },
  { label: 'Angular', bin: 'ng', subcommands: ['serve'], port: 4200, autoIncrement: false },
  { label: 'Vue CLI', bin: 'vue-cli-service', subcommands: ['serve'], port: 8080, autoIncrement: true },
  { label: 'Remix', bin: 'remix', subcommands: ['dev'], port: 3000, autoIncrement: false },
  { label: 'Gatsby', bin: 'gatsby', subcommands: ['develop'], port: 8000, autoIncrement: false },
  { label: 'webpack', bin: 'webpack', subcommands: ['serve'], port: 8080, autoIncrement: true },
  { label: 'webpack', bin: 'webpack-dev-server', port: 8080, autoIncrement: true },
  { label: 'Parcel', bin: 'parcel', excluded: ['build'], port: 1234, autoIncrement: true },
  { label: 'Static server', bin: 'http-server', port: 8080, autoIncrement: true },
  { label: 'Static server', bin: 'live-server', port: 8080, autoIncrement: false },
  { label: 'Static server', bin: 'serve', port: 3000, autoIncrement: true }
];

const DEV_SCRIPT_NAMES = ['dev', 'start', 'serve', 'develop'];

function scriptTokens(command: string): string[] {
  return command.split(/[\s&|;]+/).filter(Boolean).map((token) => token.replace(/^["']|["']$/g, ''));
}

function matchFramework(command: string): FrameworkRule | undefined {
  const tokens = scriptTokens(command);
  for (let index = 0; index < tokens.length; index += 1) {
    const bin = path.posix.basename(tokens[index].replace(/\\/g, '/')).replace(/\.(cmd|js)$/i, '');
    for (const rule of FRAMEWORKS) {
      if (bin !== rule.bin) continue;
      const next = tokens[index + 1];
      if (rule.subcommands && !rule.subcommands.includes(next ?? '')) continue;
      if (rule.excluded && next && rule.excluded.includes(next)) continue;
      return rule;
    }
  }
  return undefined;
}

/** Explicit ports written into a script: `--port 4000`, `--port=4000`, `-p 4000`, `PORT=4000`. */
export function explicitScriptPorts(command: string): number[] {
  const ports: number[] = [];
  for (const match of command.matchAll(/(?:--port[=\s]+|(?:^|\s)-p\s+|\bPORT=)(\d{1,5})\b/g)) {
    const port = validPort(Number(match[1]));
    if (port) ports.push(port);
  }
  return ports;
}

function viteConfigPort(rootFsPath: string): number | undefined {
  for (const name of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts', 'vite.config.cjs']) {
    try {
      const source = fs.readFileSync(path.join(rootFsPath, name), 'utf8');
      const match = source.match(/\bport\s*:\s*(\d{2,5})\b/);
      return match ? validPort(Number(match[1])) : undefined;
    } catch { /* try the next config name */ }
  }
  return undefined;
}

export function detectPreviewCandidates(rootFsPath: string): DetectedPreviewProject {
  let scripts: Record<string, unknown> = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootFsPath, 'package.json'), 'utf8')) as { scripts?: unknown };
    if (pkg.scripts && typeof pkg.scripts === 'object') scripts = pkg.scripts as Record<string, unknown>;
  } catch {
    return { candidates: [] };
  }

  let chosen: { name: string; command: string; rule?: FrameworkRule } | undefined;
  for (const name of DEV_SCRIPT_NAMES) {
    const command = scripts[name];
    if (typeof command !== 'string') continue;
    const rule = matchFramework(command);
    if (rule) { chosen = { name, command, rule }; break; }
    if (!chosen && explicitScriptPorts(command).length) chosen = { name, command };
  }
  if (!chosen) return { candidates: [] };

  const ports: number[] = [...explicitScriptPorts(chosen.command)];
  if (chosen.rule?.label === 'Vite') {
    const configured = viteConfigPort(rootFsPath);
    if (configured) ports.push(configured);
  }
  if (chosen.rule && ports.length === 0) {
    ports.push(chosen.rule.port);
    if (chosen.rule.autoIncrement) ports.push(chosen.rule.port + 1, chosen.rule.port + 2, chosen.rule.port + 3);
  }
  const unique = [...new Set(ports)].slice(0, MAX_PREVIEW_CANDIDATES);
  return {
    framework: chosen.rule?.label,
    devScript: chosen.name,
    candidates: unique.map((port) => ({ port, label: chosen?.rule?.label }))
  };
}

// --- Probing -----------------------------------------------------------------

function tcpReachable(host: string, port: number, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (value: boolean) => { socket.destroy(); resolve(value); };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function speaks(protocol: PreviewProtocol, host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const client = protocol === 'https' ? https : http;
    const req = client.request({
      host, port, path: '/', method: 'GET', timeout: PROBE_TIMEOUT_MS * 2,
      headers: { Host: `localhost:${port}` },
      ...(protocol === 'https' ? { rejectUnauthorized: false } : {})
    }, (res) => { res.destroy(); resolve(true); });
    req.once('timeout', () => { req.destroy(); resolve(false); });
    req.once('error', () => resolve(false));
    req.end();
  });
}

/** Both loopback families: Node 17+ dev servers often listen on ::1 only. */
export async function probeLoopback(port: number): Promise<LoopbackProbeResult> {
  const [ipv4, ipv6] = await Promise.all([tcpReachable('127.0.0.1', port), tcpReachable('::1', port)]);
  if (!ipv4 && !ipv6) return { ipv4, ipv6 };
  const host = ipv4 ? '127.0.0.1' : '::1';
  if (await speaks('http', host, port)) return { ipv4, ipv6, protocol: 'http' };
  if (await speaks('https', host, port)) return { ipv4, ipv6, protocol: 'https' };
  return { ipv4, ipv6 };
}

// --- Ownership ---------------------------------------------------------------

function normalizePathish(value: string, caseInsensitive: boolean): string {
  const slashed = value.replace(/\\/g, '/').replace(/\/+$/, '');
  return caseInsensitive ? slashed.toLowerCase() : slashed;
}

function isWithin(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/**
 * Does the listening process belong to this Game? Pure: all process facts are passed in.
 * 'foreign' is returned only on positive evidence of another project.
 */
export function classifyListenerOwnership(
  rootFsPath: string,
  info: ListenerInfo | undefined,
  exists: (p: string) => boolean = fs.existsSync
): 'verified' | 'foreign' | 'unknown' {
  if (!info || (!info.commandLine && !info.cwd)) return 'unknown';
  const caseInsensitive = /^[a-zA-Z]:[\\/]/.test(rootFsPath);
  const root = normalizePathish(rootFsPath, caseInsensitive);
  const otherProject = (dir: string) =>
    !isWithin(root, dir) && !isWithin(dir, root) && exists(path.join(dir, 'package.json'));

  if (info.cwd) {
    const cwd = normalizePathish(info.cwd, caseInsensitive);
    if (isWithin(cwd, root)) return 'verified';
  }
  if (info.commandLine) {
    const command = normalizePathish(info.commandLine, caseInsensitive);
    if (command.includes(`${root}/`)) return 'verified';
    const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    for (const raw of tokens) {
      const token = raw.replace(/^["']|["']$/g, '');
      const marker = token.indexOf('/node_modules/');
      if (marker > 0 && otherProject(token.slice(0, marker))) return 'foreign';
    }
  }
  if (info.cwd) {
    const cwd = normalizePathish(info.cwd, caseInsensitive);
    if (otherProject(cwd)) return 'foreign';
  }
  return 'unknown';
}

function run(command: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      resolve(error ? '' : String(stdout));
    });
  });
}

async function linuxListenerInodes(port: number): Promise<Set<string>> {
  const inodes = new Set<string>();
  const hexPort = port.toString(16).toUpperCase().padStart(4, '0');
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text = '';
    try { text = await fsp.readFile(table, 'utf8'); } catch { continue; }
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) continue;
      if (cols[1].split(':')[1] === hexPort && cols[3] === '0A') inodes.add(cols[9]);
    }
  }
  return inodes;
}

async function inspectLinuxListener(port: number): Promise<ListenerInfo | undefined> {
  const inodes = await linuxListenerInodes(port);
  if (inodes.size === 0) return undefined;
  let pids: string[] = [];
  try { pids = (await fsp.readdir('/proc')).filter((entry) => /^\d+$/.test(entry)); } catch { return undefined; }
  for (const pid of pids) {
    let fds: string[] = [];
    try { fds = await fsp.readdir(`/proc/${pid}/fd`); } catch { continue; }
    for (const fd of fds) {
      let target = '';
      try { target = await fsp.readlink(`/proc/${pid}/fd/${fd}`); } catch { continue; }
      const inode = target.match(/^socket:\[(\d+)\]$/)?.[1];
      if (!inode || !inodes.has(inode)) continue;
      const info: ListenerInfo = { pid: Number(pid) };
      try { info.commandLine = (await fsp.readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean).join(' '); } catch { /* optional */ }
      try { info.cwd = await fsp.readlink(`/proc/${pid}/cwd`); } catch { /* optional */ }
      return info;
    }
  }
  return undefined;
}

async function inspectWindowsListener(port: number): Promise<ListenerInfo | undefined> {
  const netstat = await run('netstat', ['-ano', '-p', 'TCP']) + await run('netstat', ['-ano', '-p', 'TCPv6']);
  let pid: number | undefined;
  for (const line of netstat.split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (match && Number(match[2]) === port) { pid = Number(match[3]); break; }
  }
  if (!pid) return undefined;
  const commandLine = (await run('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`
  ])).trim();
  return { pid, ...(commandLine ? { commandLine } : {}) };
}

async function inspectDarwinListener(port: number): Promise<ListenerInfo | undefined> {
  const pid = Number((await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])).split(/\s+/)[0]);
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  const commandLine = (await run('ps', ['-o', 'command=', '-p', String(pid)])).trim();
  const cwd = (await run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])).split('\n').find((line) => line.startsWith('n'))?.slice(1);
  return { pid, ...(commandLine ? { commandLine } : {}), ...(cwd ? { cwd } : {}) };
}

/** Best effort. Any failure is "unknown", never an error. */
export async function inspectLoopbackListener(port: number): Promise<ListenerInfo | undefined> {
  try {
    if (process.platform === 'linux') return await inspectLinuxListener(port);
    if (process.platform === 'win32') return await inspectWindowsListener(port);
    if (process.platform === 'darwin') return await inspectDarwinListener(port);
  } catch { /* unknown */ }
  return undefined;
}

// --- Resolution --------------------------------------------------------------

async function mapClientUrl(localUrl: string, toClientUrl: PreviewResolveOptions['toClientUrl']): Promise<ClientUrlMapping> {
  if (!toClientUrl) return { url: localUrl };
  try {
    const mapped = await toClientUrl(localUrl);
    const parsed = parsePreviewUrl(mapped?.url);
    if (!parsed) return { url: localUrl };
    return { url: parsed.href, ...(mapped.directTabOnly === true ? { directTabOnly: true } : {}) };
  } catch {
    return { url: localUrl };
  }
}

async function buildEndpoint(
  options: PreviewResolveOptions,
  local: URL,
  fields: { source: PreviewSource; ownership: PreviewOwnership; protocol: PreviewProtocol; label?: string; ipv4?: boolean; pages?: PreviewPage[] }
): Promise<PreviewEndpoint> {
  const localUrl = local.href;
  const mapped = await mapClientUrl(localUrl, options.toClientUrl);
  const port = local.port ? Number(local.port) : undefined;
  return {
    previewId: `${options.gameId}:${options.stadiumId}:${port ?? local.host}`,
    gameId: options.gameId,
    stadiumId: options.stadiumId,
    localUrl,
    clientUrl: mapped.url,
    ...(port ? { port } : {}),
    protocol: fields.protocol,
    source: fields.source,
    ownership: fields.ownership,
    ...(fields.label ? { label: fields.label } : {}),
    primary: true,
    ...(mapped.directTabOnly ? { directTabOnly: true } : {}),
    ...(fields.ipv4 && mapped.url === localUrl ? { loopbackIpv4: true } : {}),
    observedAt: (options.now ?? Date.now)(),
    ...(fields.pages?.length ? { pages: fields.pages } : {})
  };
}

const fallbackStaticServer = new StaticPreviewServer();

async function resolveStaticPreview(options: PreviewResolveOptions, hints: Pick<PreviewResolution, 'framework' | 'devScript'>): Promise<PreviewResolution> {
  const discovered = discoverStaticPreview(options.rootFsPath, {
    remembered: options.rememberedStaticEntrypoint,
    selected: options.selectedStaticEntrypoint,
    activeHtmlPath: options.activeHtmlPath
  });
  if (discovered.invalidDeclaration) return { available: false, endpoints: [], reason: 'invalid-static-declaration', ...hints };
  if (!discovered.canonical) {
    if (discovered.needsChoice) return { available: false, endpoints: [], reason: 'static-choice-required', staticPages: discovered.pages, ...hints };
    return { available: false, endpoints: [], reason: hints.devScript ? 'not-running' : 'no-web-app', ...hints };
  }
  const server = options.staticServer ?? fallbackStaticServer;
  const pageMappings: PreviewPage[] = [];
  for (const page of discovered.pages) {
    const local = await server.urlFor(options.gameId, options.rootFsPath, page.path);
    const mapped = await mapClientUrl(local.href, options.toClientUrl);
    pageMappings.push({ ...page, clientUrl: mapped.url });
  }
  const canonical = pageMappings.find((page) => page.path === discovered.canonical);
  if (!canonical) return { available: false, endpoints: [], reason: 'no-web-app', ...hints };
  const local = await server.urlFor(options.gameId, options.rootFsPath, canonical.path);
  return {
    available: true,
    endpoints: [await buildEndpoint(options, local, {
      source: 'static', ownership: 'verified', protocol: 'http', label: canonical.label, ipv4: true, pages: pageMappings
    })],
    ...hints
  };
}

export async function resolveGamePreview(options: PreviewResolveOptions): Promise<PreviewResolution> {
  const probe = options.probe ?? probeLoopback;
  const inspect = options.inspectListener ?? inspectLoopbackListener;

  // This is also the lifecycle boundary: changing Games retires the prior Game's static listener.
  await (options.staticServer ?? fallbackStaticServer).prepare(options.gameId, options.rootFsPath);

  const declaration = readPreviewDeclaration(options.rootFsPath);
  if (declaration?.invalid) return { available: false, endpoints: [], reason: 'invalid-declaration' };
  if (declaration?.url) {
    const url = declaration.url;
    const protocol: PreviewProtocol = url.protocol === 'https:' ? 'https' : 'http';
    if (!isLoopbackUrl(url)) {
      return { available: true, endpoints: [await buildEndpoint(options, url, { source: 'declared', ownership: 'declared', protocol })] };
    }
    const port = Number(url.port || (protocol === 'https' ? 443 : 80));
    const result = await probe(port);
    if (!result.ipv4 && !result.ipv6) return { available: false, endpoints: [], reason: 'not-running' };
    const local = new URL(url.href);
    local.hostname = 'localhost';
    return { available: true, endpoints: [await buildEndpoint(options, local, { source: 'declared', ownership: 'declared', protocol, ipv4: result.ipv4 })] };
  }

  const detected = detectPreviewCandidates(options.rootFsPath);
  const hints = {
    ...(detected.framework ? { framework: detected.framework } : {}),
    ...(detected.devScript ? { devScript: detected.devScript } : {})
  };
  let fallback: { candidate: PreviewCandidate; result: LoopbackProbeResult } | undefined;
  for (const candidate of detected.candidates) {
    const result = await probe(candidate.port);
    if ((!result.ipv4 && !result.ipv6) || !result.protocol) continue;
    const ownership = classifyListenerOwnership(options.rootFsPath, await inspect(candidate.port));
    if (ownership === 'foreign') continue;
    if (ownership === 'verified') {
      return { available: true, endpoints: [await endpointFor(options, candidate, result, 'verified')], ...hints };
    }
    fallback ??= { candidate, result };
  }
  if (fallback) {
    return { available: true, endpoints: [await endpointFor(options, fallback.candidate, fallback.result, 'unverified')], ...hints };
  }
  return resolveStaticPreview(options, hints);
}

// --- Browser projection (Control Plane) ----------------------------------------

const PREVIEW_REASONS: readonly string[] = ['not-running', 'no-web-app', 'invalid-declaration', 'invalid-static-declaration', 'static-choice-required'];
const MAX_PROJECTED_ENDPOINTS = 4;

function shortString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
}

/** Rebuild one endpoint from an allowlist. Anything malformed is dropped, never repaired. */
export function projectPreviewEndpoint(gameId: string, raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const clientUrl = parsePreviewUrl(e.clientUrl);
  const previewId = shortString(e.previewId, 300);
  if (e.gameId !== gameId || !clientUrl || !previewId) return undefined;
  if (!['http', 'https'].includes(String(e.protocol))) return undefined;
  if (!['declared', 'detected', 'static'].includes(String(e.source))) return undefined;
  if (!['declared', 'verified', 'unverified'].includes(String(e.ownership))) return undefined;
  const port = e.port === undefined ? undefined : validPort(e.port);
  if (e.port !== undefined && !port) return undefined;
  const label = shortString(e.label, 40);
  const pages = Array.isArray(e.pages)
    ? e.pages.slice(0, MAX_HTML_PAGES).map((raw) => projectPreviewPage(raw, true))
      .filter((page): page is Record<string, unknown> => Boolean(page))
    : [];
  if (e.source === 'static') {
    const primaryPages = pages.filter((page) => page.primary === true);
    if (primaryPages.length !== 1 || primaryPages[0].clientUrl !== clientUrl.href) return undefined;
  }
  return {
    previewId,
    gameId,
    clientUrl: clientUrl.href,
    ...(port ? { port } : {}),
    protocol: e.protocol,
    source: e.source,
    ownership: e.ownership,
    ...(label ? { label } : {}),
    primary: e.primary === true,
    ...(e.directTabOnly === true ? { directTabOnly: true } : {}),
    ...(e.loopbackIpv4 === true ? { loopbackIpv4: true } : {}),
    observedAt: typeof e.observedAt === 'number' && Number.isFinite(e.observedAt) ? e.observedAt : Date.now(),
    ...(pages.length ? { pages } : {})
  };
}

const MAX_HTML_PAGES = 128;

function projectPreviewPage(raw: unknown, requireClientUrl = false): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const page = raw as Record<string, unknown>;
  const pagePath = typeof page.path === 'string' && page.path.length <= 500 && /\.html?$/i.test(page.path)
    && !page.path.includes('\\') && page.path.split('/').every((segment) => Boolean(segment) && !segment.startsWith('.'))
    ? page.path : undefined;
  const label = shortString(page.label, 160);
  const clientUrl = page.clientUrl === undefined ? undefined : parsePreviewUrl(page.clientUrl);
  if (!pagePath || !label || (page.clientUrl !== undefined && !clientUrl) || (requireClientUrl && !clientUrl)) return undefined;
  return { path: pagePath, label, primary: page.primary === true, ...(clientUrl ? { clientUrl: clientUrl.href } : {}) };
}

/** Throws on a response that cannot be trusted; the caller turns that into a 502. */
export function projectPreviewResolution(gameId: string, raw: unknown): Record<string, unknown> {
  const result = (raw ?? {}) as Record<string, unknown>;
  if (result.success !== true) throw new Error(typeof result.message === 'string' ? result.message : 'Coach could not look for the running app.');
  const framework = shortString(result.framework, 40);
  const devScript = typeof result.devScript === 'string' && /^[\w:.-]{1,40}$/.test(result.devScript) ? result.devScript : undefined;
  const hints = { ...(framework ? { framework } : {}), ...(devScript ? { devScript } : {}) };
  if (result.available === true) {
    const endpoints = (Array.isArray(result.endpoints) ? result.endpoints : [])
      .slice(0, MAX_PROJECTED_ENDPOINTS)
      .map((endpoint) => projectPreviewEndpoint(gameId, endpoint))
      .filter((endpoint): endpoint is Record<string, unknown> => Boolean(endpoint));
    if (endpoints.length === 0) throw new Error('Stadium returned an invalid preview response.');
    return { success: true, gameId, available: true, endpoints, ...hints };
  }
  if (!PREVIEW_REASONS.includes(String(result.reason))) throw new Error('Stadium returned an invalid preview response.');
  const staticPages = Array.isArray(result.staticPages)
    ? result.staticPages.slice(0, MAX_HTML_PAGES).map((page) => projectPreviewPage(page)).filter(Boolean)
    : [];
  if (result.reason === 'static-choice-required' && staticPages.length < 2) throw new Error('Stadium returned an invalid static preview choice.');
  return { success: true, gameId, available: false, endpoints: [], reason: result.reason, ...(staticPages.length ? { staticPages } : {}), ...hints };
}

function endpointFor(options: PreviewResolveOptions, candidate: PreviewCandidate, result: LoopbackProbeResult, ownership: PreviewOwnership) {
  const protocol = result.protocol ?? 'http';
  return buildEndpoint(options, new URL(`${protocol}://localhost:${candidate.port}/`), {
    source: 'detected', ownership, protocol, label: candidate.label, ipv4: result.ipv4
  });
}
