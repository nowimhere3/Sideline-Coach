/**
 * Scout Combine V0.3 — live prospect discovery.
 *
 * WAS: the OpenCode/OpenRouter Scout roster (SCOUT_ROSTER in scout-play-runner.ts)
 * was a hand-curated, hardcoded list of model strings that ages the moment free
 * routes change.
 * IS: prospects are discovered from CURRENT provider/tool truth at Combine time —
 * OpenRouter's own public model catalog, and the installed OpenCode CLI's own
 * zero-credential hosted free models — never from a fossilized name list.
 * WHY: free/low-cost model availability changes constantly. Sideline's coaching
 * staff should re-discover the current receiving corps, not trust yesterday's
 * roster.
 *
 * Two independent, individually-optional discovery sources feed one normalized
 * prospect shape. Either source failing (network unavailable, OpenCode CLI
 * missing or misbehaving) is a factual, isolated "source unavailable" result —
 * never a thrown error that aborts the whole Combine.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveOpenCodeExecutable } from './scout-play-runner';

export type CombineProviderFamily = 'openrouter' | 'opencode-hosted';

export interface CombineProspect {
  /** Stable, filename-safe identity derived from the provider's own model id. */
  readonly candidateId: string;
  readonly provider: CombineProviderFamily;
  /** Exact route string passed to the harness at invocation (e.g. "openrouter/poolside/laguna-s-2.1:free"). */
  readonly model: string;
  readonly displayName: string;
  readonly harness: 'opencode';
  readonly discoveredAt: string;
  readonly advertisedFree: boolean;
  readonly supportsTools: boolean;
  readonly contextLength?: number;
  /** Where this evidence came from, for future triage — never invented. */
  readonly sourceEvidence: string;
}

export interface DiscoverySourceResult {
  readonly id: CombineProviderFamily;
  readonly available: boolean;
  readonly count: number;
  readonly error?: string;
}

export interface CombineDiscoveryReport {
  readonly discoveredAt: string;
  readonly prospects: readonly CombineProspect[];
  readonly sources: readonly DiscoverySourceResult[];
}

const SAFE_ID_SEGMENT = /[^A-Za-z0-9._-]+/g;

function slug(prefix: string, raw: string): string {
  const cleaned = raw.replace(SAFE_ID_SEGMENT, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return `${prefix}-${cleaned}`.slice(0, 120);
}

// --- Source A: OpenRouter's public model catalog ----------------------------

interface OpenRouterModel {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly context_length?: unknown;
  readonly pricing?: { readonly prompt?: unknown; readonly completion?: unknown };
  readonly supported_parameters?: unknown;
  readonly architecture?: { readonly output_modalities?: unknown; readonly input_modalities?: unknown };
}

export interface OpenRouterDiscoveryOptions {
  /** Test/production seam. Defaults to the global fetch (Node 18+). */
  readonly fetchImpl?: typeof fetch;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}

function isFreeOpenRouterModel(model: OpenRouterModel): boolean {
  if (typeof model.id !== 'string' || !model.id.endsWith(':free')) return false;
  const pricing = model.pricing;
  if (!pricing || Number(pricing.prompt) !== 0 || Number(pricing.completion) !== 0) return false;
  return true;
}

function supportsTools(model: OpenRouterModel): boolean {
  return Array.isArray(model.supported_parameters) && model.supported_parameters.includes('tools');
}

function outputsText(model: OpenRouterModel): boolean {
  const modalities = model.architecture?.output_modalities;
  return !Array.isArray(modalities) || modalities.includes('text');
}

/**
 * Discovers OpenRouter's currently-free, tool-capable model routes from
 * OpenRouter's own public (unauthenticated) model catalog. A network or parse
 * failure returns an empty, explicitly unavailable result — never a throw.
 */
export async function discoverOpenRouterFreeProspects(options: OpenRouterDiscoveryOptions = {}): Promise<{ prospects: CombineProspect[]; available: boolean; error?: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? 'https://openrouter.ai/api/v1/models';
  const now = options.now ?? (() => new Date());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetchImpl(endpoint, { signal: controller.signal });
    if (!response.ok) return { prospects: [], available: false, error: `OpenRouter catalog responded ${response.status} ${response.statusText}.` };
    const body: unknown = await response.json();
    const list = body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: OpenRouterModel[] }).data
      : undefined;
    if (!list) return { prospects: [], available: false, error: 'OpenRouter catalog response did not contain a data array.' };
    const discoveredAt = now().toISOString();
    const prospects: CombineProspect[] = [];
    for (const model of list) {
      if (typeof model.id !== 'string' || !isFreeOpenRouterModel(model) || !supportsTools(model) || !outputsText(model)) continue;
      prospects.push({
        candidateId: slug('openrouter', model.id),
        provider: 'openrouter',
        model: `openrouter/${model.id}`,
        displayName: typeof model.name === 'string' && model.name ? model.name : model.id,
        harness: 'opencode',
        discoveredAt,
        advertisedFree: true,
        supportsTools: true,
        contextLength: typeof model.context_length === 'number' ? model.context_length : undefined,
        sourceEvidence: `${endpoint}#${model.id}`
      });
    }
    return { prospects, available: true };
  } catch (error) {
    return { prospects: [], available: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

// --- Source B: the installed OpenCode CLI's own hosted free models ----------

export interface OpenCodeDiscoveryOptions {
  readonly opencodeExecutable?: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  /** Test seam replacing the real child process. */
  readonly run?: (args: readonly string[], env: NodeJS.ProcessEnv) => Promise<{ code: number | null; stdout: string; stderr: string }>;
}

interface OpenCodeVerboseModel {
  readonly id?: unknown;
  readonly providerID?: unknown;
  readonly name?: unknown;
  readonly cost?: { readonly input?: unknown; readonly output?: unknown };
  readonly limit?: { readonly context?: unknown };
  readonly capabilities?: { readonly toolcall?: unknown; readonly output?: { readonly text?: unknown } };
}

/**
 * `opencode models --verbose` prints "<provider>/<id>" headers each followed by
 * one JSON object (single- or multi-line) — not a JSON array. Brace-depth
 * counting assumes no unescaped `{`/`}` inside string values, which holds for
 * this CLI's own structured output; a block that fails to parse is skipped and
 * never poisons discovery of the blocks around it.
 */
export function parseOpenCodeVerboseModels(stdout: string): OpenCodeVerboseModel[] {
  const models: OpenCodeVerboseModel[] = [];
  const header = /^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/gm;
  let match: RegExpExecArray | null;
  while ((match = header.exec(stdout))) {
    const braceStart = stdout.indexOf('{', match.index + match[0].length);
    if (braceStart < 0) continue;
    let depth = 0;
    let end = -1;
    for (let pos = braceStart; pos < stdout.length; pos += 1) {
      if (stdout[pos] === '{') depth += 1;
      else if (stdout[pos] === '}') { depth -= 1; if (depth === 0) { end = pos; break; } }
    }
    if (end < 0) continue;
    try { models.push(JSON.parse(stdout.slice(braceStart, end + 1)) as OpenCodeVerboseModel); } catch { /* one malformed block never poisons the rest */ }
    header.lastIndex = end + 1;
  }
  return models;
}

function isFreeOpenCodeModel(model: OpenCodeVerboseModel): boolean {
  return Number(model.cost?.input) === 0 && Number(model.cost?.output) === 0;
}

/**
 * Runs the installed OpenCode CLI's own `models --verbose` against a fresh,
 * isolated data directory (XDG_DATA_HOME scoped to a scratch folder) rather
 * than the user's real OpenCode home. This is a bounded seam-level safety
 * choice, not a repair of any OpenCode defect: it means a Combine discovery
 * run never touches, depends on, or can be corrupted by the human's real
 * OpenCode session history, regardless of that installation's own health.
 */
export async function discoverOpenCodeHostedProspects(options: OpenCodeDiscoveryOptions = {}): Promise<{ prospects: CombineProspect[]; available: boolean; error?: string }> {
  const now = options.now ?? (() => new Date());
  const run = options.run ?? defaultOpenCodeRun(options);
  let scratchDataDir: string | undefined;
  try {
    const result = await run(['models', '--verbose'], {});
    if (result.code !== 0) return { prospects: [], available: false, error: firstLine(result.stderr) || `opencode models exited with code ${result.code}.` };
    const discoveredAt = now().toISOString();
    const parsed = parseOpenCodeVerboseModels(result.stdout);
    const prospects: CombineProspect[] = [];
    for (const model of parsed) {
      if (typeof model.id !== 'string' || typeof model.providerID !== 'string') continue;
      if (!isFreeOpenCodeModel(model) || model.capabilities?.toolcall !== true || model.capabilities?.output?.text !== true) continue;
      const route = `${model.providerID}/${model.id}`;
      prospects.push({
        candidateId: slug('opencode-hosted', route),
        provider: 'opencode-hosted',
        model: route,
        displayName: typeof model.name === 'string' && model.name ? model.name : route,
        harness: 'opencode',
        discoveredAt,
        advertisedFree: true,
        supportsTools: true,
        contextLength: typeof model.limit?.context === 'number' ? model.limit.context : undefined,
        sourceEvidence: 'opencode models --verbose'
      });
    }
    return { prospects, available: true };
  } catch (error) {
    return { prospects: [], available: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (scratchDataDir) fs.rmSync(scratchDataDir, { recursive: true, force: true });
  }

  function defaultOpenCodeRun(opts: OpenCodeDiscoveryOptions) {
    return async (args: readonly string[]): Promise<{ code: number | null; stdout: string; stderr: string }> => {
      scratchDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-combine-discovery-'));
      const executable = opts.opencodeExecutable ?? resolveOpenCodeExecutable();
      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let child;
        try {
          child = spawn(executable, [...args], {
            cwd: os.tmpdir(),
            env: { ...process.env, XDG_DATA_HOME: scratchDataDir! },
            windowsHide: true,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe']
          });
        } catch (error) {
          resolve({ code: null, stdout: '', stderr: error instanceof Error ? error.message : String(error) });
          return;
        }
        const timer = setTimeout(() => { try { child.kill(); } catch { /* already gone */ } }, opts.timeoutMs ?? 20_000);
        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
        child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
        child.once('error', (error) => { stderr += `${error.message}\n`; });
        child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
      });
    };
  }
}

function firstLine(text: string): string { return text.trim().split(/\r?\n/, 1)[0]?.replace(/\x1b\[[0-9;]*m/g, '') ?? ''; }

// --- Merge -------------------------------------------------------------------

export interface CombineDiscoveryOptions {
  readonly openRouter?: OpenRouterDiscoveryOptions;
  readonly openCode?: OpenCodeDiscoveryOptions;
  readonly now?: () => Date;
}

/** Runs both discovery sources independently and merges into one deduped report. One source failing never blocks the other. */
export async function discoverCombineProspects(options: CombineDiscoveryOptions = {}): Promise<CombineDiscoveryReport> {
  const now = options.now ?? (() => new Date());
  const [openRouter, openCode] = await Promise.all([
    discoverOpenRouterFreeProspects({ ...options.openRouter, now }),
    discoverOpenCodeHostedProspects({ ...options.openCode, now })
  ]);
  const byId = new Map<string, CombineProspect>();
  for (const prospect of [...openRouter.prospects, ...openCode.prospects]) byId.set(prospect.candidateId, prospect);
  return {
    discoveredAt: now().toISOString(),
    prospects: [...byId.values()],
    sources: [
      { id: 'openrouter', available: openRouter.available, count: openRouter.prospects.length, error: openRouter.error },
      { id: 'opencode-hosted', available: openCode.available, count: openCode.prospects.length, error: openCode.error }
    ]
  };
}
