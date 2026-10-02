import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

export const STATIC_PREVIEW_INSTANCE_HEADER = 'X-Sideline-Preview-Instance';

export interface StaticPreviewPage {
  path: string;
  label: string;
  primary: boolean;
}

export interface StaticPreviewDiscovery {
  pages: StaticPreviewPage[];
  canonical?: string;
  needsChoice: boolean;
  invalidDeclaration?: boolean;
}

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules', '.git', '.sideline', '.vscode', 'test', 'tests', '__tests__',
  'fixture', 'fixtures', 'coverage', 'vendor', 'vendors', 'third-party', 'third_party',
  'reports', 'report', 'snapshots', '__snapshots__', 'architecture-lab', 'secret', 'secrets', 'credentials', 'dist', 'build'
]);
const SECRET_PATH_SEGMENTS = new Set(['secret', 'secrets', 'credentials']);
const MAX_DISCOVERED_FILES = 5_000;
const MAX_HTML_PAGES = 128;
const MAX_SCAN_DEPTH = 6;

function normalizedRelativeHtml(rootFsPath: string, value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.length > 500 || value.includes('\0')) return undefined;
  const slashed = value.trim().replace(/\\/g, '/');
  if (path.posix.isAbsolute(slashed) || /^[a-zA-Z]:/.test(slashed)) return undefined;
  const normalized = path.posix.normalize(slashed).replace(/^\.\//, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || !/\.html?$/i.test(normalized)) return undefined;
  const absolute = path.resolve(rootFsPath, ...normalized.split('/'));
  const relative = path.relative(path.resolve(rootFsPath), absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  try {
    if (!fs.statSync(absolute).isFile()) return undefined;
    const rootReal = fs.realpathSync(rootFsPath);
    const fileReal = fs.realpathSync(absolute);
    const realRelative = path.relative(rootReal, fileReal);
    if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) return undefined;
  } catch { return undefined; }
  return normalized;
}

function htmlTitle(filePath: string, fallback: string): string {
  try {
    const handle = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(64 * 1024);
      const count = fs.readSync(handle, buffer, 0, buffer.length, 0);
      const match = buffer.subarray(0, count).toString('utf8').match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
      const title = match?.[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (title && title.length <= 160) return title;
    } finally { fs.closeSync(handle); }
  } catch { /* filename fallback */ }
  return fallback;
}

function readStaticDeclaration(rootFsPath: string): { path?: string; invalid?: true } | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(rootFsPath, '.sideline', 'game.json'), 'utf8')) as Record<string, unknown>;
    if (parsed.staticEntrypoint === undefined) return undefined;
    const declared = normalizedRelativeHtml(rootFsPath, parsed.staticEntrypoint);
    return declared ? { path: declared } : { invalid: true };
  } catch { return undefined; }
}

function packageHtmlEvidence(rootFsPath: string): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootFsPath, 'package.json'), 'utf8')) as Record<string, unknown>;
    for (const field of ['browser', 'main']) {
      const candidate = normalizedRelativeHtml(rootFsPath, pkg[field]);
      if (candidate) return candidate;
    }
  } catch { /* optional evidence */ }
  return undefined;
}

/** Conservative source-page catalog. Generated output and non-product trees are not inferred. */
export function discoverStaticPreview(
  rootFsPath: string,
  options: { remembered?: string; activeHtmlPath?: string; selected?: string } = {}
): StaticPreviewDiscovery {
  const declaration = readStaticDeclaration(rootFsPath);
  if (declaration?.invalid) return { pages: [], needsChoice: false, invalidDeclaration: true };

  const found = new Set<string>();
  let visited = 0;
  const scan = (relativeDir: string, depth: number): void => {
    if (depth > MAX_SCAN_DEPTH || visited >= MAX_DISCOVERED_FILES || found.size >= MAX_HTML_PAGES) return;
    const absoluteDir = path.join(rootFsPath, ...relativeDir.split('/').filter(Boolean));
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(absoluteDir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++visited > MAX_DISCOVERED_FILES) return;
      const lower = entry.name.toLowerCase();
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(lower)) continue;
        scan(relative, depth + 1);
      } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
        const valid = normalizedRelativeHtml(rootFsPath, relative);
        if (valid) found.add(valid);
      }
    }
  };
  scan('', 0);

  // Explicit generated entrypoints are allowed even though generated trees are not inferred.
  if (declaration?.path) found.add(declaration.path);
  const packageEvidence = packageHtmlEvidence(rootFsPath);
  if (packageEvidence) found.add(packageEvidence);
  const selected = normalizedRelativeHtml(rootFsPath, options.selected);
  const remembered = normalizedRelativeHtml(rootFsPath, options.remembered);
  const active = normalizedRelativeHtml(rootFsPath, options.activeHtmlPath);
  const strong = found.has('index.html') ? 'index.html' : found.has('public/index.html') ? 'public/index.html' : undefined;
  const canonical = declaration?.path ?? strong ?? packageEvidence ?? (selected && found.has(selected) ? selected : undefined)
    ?? (remembered && found.has(remembered) ? remembered : undefined)
    ?? (found.size === 1 ? [...found][0] : undefined);
  const paths = [...found].sort((a, b) => {
    // Editor focus is only a chooser hint; it never silently becomes the Game's home.
    if (!canonical && active && found.has(active)) {
      if (a === active) return -1;
      if (b === active) return 1;
    }
    return a.localeCompare(b);
  });
  const pages = paths.map((relativePath) => ({
    path: relativePath,
    label: htmlTitle(path.join(rootFsPath, ...relativePath.split('/')), path.posix.basename(relativePath)),
    primary: relativePath === canonical
  }));
  return { pages, ...(canonical ? { canonical } : {}), needsChoice: !canonical && pages.length > 1 };
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.wasm': 'application/wasm'
};

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export class StaticPreviewServer {
  private server: http.Server | undefined;
  private gameId = '';
  private rootFsPath = '';
  private rootRealPath = '';
  private port: number | undefined;
  private instanceId: string | undefined;
  private startPromise: Promise<void> | undefined;

  get activeGameId(): string | undefined { return this.gameId || undefined; }
  get activePort(): number | undefined { return this.port; }
  get activeInstanceId(): string | undefined { return this.instanceId; }

  /** Switching Games closes the old listener even when the new Game never needs static preview. */
  async prepare(gameId: string, rootFsPath: string): Promise<void> {
    const resolvedRoot = path.resolve(rootFsPath);
    if (this.gameId === gameId && this.rootFsPath === resolvedRoot) return;
    await this.dispose();
    this.gameId = gameId;
    this.rootFsPath = resolvedRoot;
    this.rootRealPath = await fsp.realpath(resolvedRoot);
  }

  async urlFor(gameId: string, rootFsPath: string, relativePath: string): Promise<URL> {
    await this.prepare(gameId, rootFsPath);
    if (!this.server) {
      this.startPromise ??= this.start().finally(() => { this.startPromise = undefined; });
      await this.startPromise;
    }
    const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
    return new URL(`http://127.0.0.1:${this.port}/${encoded}`);
  }

  private async start(): Promise<void> {
    const instanceId = randomBytes(16).toString('base64url');
    this.instanceId = instanceId;
    const server = http.createServer((req, res) => { void this.serve(req, res); });
    server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
    try { await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
      const onListening = () => { server.off('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(0, '127.0.0.1');
    }); } catch (error) {
      if (this.instanceId === instanceId) this.instanceId = undefined;
      throw error;
    }
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      if (this.instanceId === instanceId) this.instanceId = undefined;
      throw new Error('Static preview did not receive a loopback port.');
    }
    this.server = server;
    this.port = address.port;
  }

  private reject(res: http.ServerResponse, status: number, message: string, allow?: string): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (allow) res.setHeader('Allow', allow);
    res.end(message);
  }

  private async serve(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const instanceId = this.instanceId;
    if (!instanceId) return this.reject(res, 503, 'Service Unavailable');
    res.setHeader(STATIC_PREVIEW_INSTANCE_HEADER, instanceId);
    const expectedInstance = req.headers[STATIC_PREVIEW_INSTANCE_HEADER.toLowerCase()];
    if (expectedInstance !== undefined && expectedInstance !== instanceId) return this.reject(res, 409, 'Preview Instance Changed');
    if (req.method !== 'GET' && req.method !== 'HEAD') return this.reject(res, 405, 'Method Not Allowed', 'GET, HEAD');
    const rawPath = (req.url ?? '/').split(/[?#]/, 1)[0];
    if (/%00/i.test(rawPath)) return this.reject(res, 400, 'Bad Request');
    let decoded: string;
    try { decoded = decodeURIComponent(rawPath); } catch { return this.reject(res, 400, 'Bad Request'); }
    if (decoded.includes('\0')) return this.reject(res, 400, 'Bad Request');
    decoded = decoded.replace(/\\/g, '/');
    const segments = decoded.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.') || SECRET_PATH_SEGMENTS.has(segment.toLowerCase()))) {
      return this.reject(res, 403, 'Forbidden');
    }
    const normalized = path.posix.normalize(`/${segments.join('/')}`).replace(/^\/+/, '');
    const candidate = path.resolve(this.rootFsPath, ...normalized.split('/').filter(Boolean));
    if (!isInside(candidate, this.rootFsPath)) return this.reject(res, 403, 'Forbidden');
    let real: string;
    let stat: fs.Stats;
    try {
      real = await fsp.realpath(candidate);
      if (!isInside(real, this.rootRealPath)) return this.reject(res, 403, 'Forbidden');
      stat = await fsp.stat(real);
    } catch { return this.reject(res, 404, 'Not Found'); }
    if (!stat.isFile()) return this.reject(res, 404, 'Not Found');
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[path.extname(real).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(real);
    stream.once('error', () => { if (!res.headersSent) this.reject(res, 500, 'Internal Server Error'); else res.destroy(); });
    stream.pipe(res);
  }

  async dispose(): Promise<void> {
    if (this.startPromise) {
      try { await this.startPromise; } catch { /* startup already failed */ }
    }
    const server = this.server;
    const instanceId = this.instanceId;
    this.server = undefined;
    this.port = undefined;
    this.gameId = '';
    this.rootFsPath = '';
    this.rootRealPath = '';
    if (!server) {
      if (this.instanceId === instanceId) this.instanceId = undefined;
      return;
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    if (this.instanceId === instanceId) this.instanceId = undefined;
  }
}
