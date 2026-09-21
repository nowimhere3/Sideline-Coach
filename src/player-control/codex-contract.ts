/**
 * Pure Codex protocol contract: the exact methods / fields / enum values the Controlled Codex adapter
 * (codex-app-server.ts) reads or writes, and a checker that proves a generated protocol schema still carries them.
 *
 * No filesystem, process, VS Code, network or routing logic belongs here. The adapter generates the schema
 * (`codex app-server generate-json-schema`), loads the named files, and hands the parsed JSON to
 * `checkSchemaContract`. See BREADCRUMB: CODEX-COMPATIBILITY-CONTRACT in codex-app-server.ts.
 */

/** Parsed schema files keyed by their path relative to the generated schema directory (forward slashes). */
export type SchemaFiles = Readonly<Record<string, unknown>>;

export type ContractCheck = { ok: true } | { ok: false; missing: string[] };

export const SCHEMA_FILE = {
  aggregate: 'codex_app_server_protocol.schemas.json',
  v2: 'codex_app_server_protocol.v2.schemas.json',
  clientRequest: 'ClientRequest.json',
  serverNotification: 'ServerNotification.json',
  serverRequest: 'ServerRequest.json',
  initializeParams: 'v1/InitializeParams.json',
  initializeResponse: 'v1/InitializeResponse.json'
} as const;

/** The only schema files the adapter loads; loading is bounded by this list, never by a directory walk. */
export const SCHEMA_FILES_TO_LOAD: readonly string[] = Object.values(SCHEMA_FILE);

export interface TaggedVariantRequirement {
  /** Definition holding the tagged union (`oneOf` of variants discriminated by `properties.type`). */
  definition: string;
  /** Discriminator value identifying the variant. */
  tag: string;
  fields: readonly string[];
}

export interface EnumRequirement {
  definition: string;
  value: string;
}

export const REQUIRED_CONTRACT = {
  /** Client requests the adapter sends. REQUEST_ALLOWLIST in the adapter is derived from this list. */
  clientMethods: ['initialize', 'thread/start', 'turn/start', 'account/read', 'thread/read', 'thread/resume', 'thread/turns/list', 'model/list'],
  /** Server notifications the adapter consumes. */
  serverNotifications: ['turn/started', 'turn/completed', 'item/agentMessage/delta', 'item/started', 'item/completed'],
  /** Server-initiated requests the adapter answers (by declining). */
  serverRequests: ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'item/tool/requestUserInput', 'mcpServer/elicitation/request'],
  /** Definition name → property names the adapter reads or writes. */
  fields: {
    InitializeParams: ['clientInfo', 'capabilities'],
    InitializeResponse: ['userAgent'],
    ThreadStartParams: ['cwd', 'approvalPolicy', 'sandbox'],
    ThreadStartResponse: ['thread', 'cwd', 'approvalPolicy', 'sandbox', 'model', 'reasoningEffort'],
    ThreadResumeParams: ['threadId', 'cwd', 'approvalPolicy', 'sandbox', 'excludeTurns'],
    ThreadResumeResponse: ['thread', 'cwd', 'approvalPolicy', 'sandbox', 'model', 'reasoningEffort'],
    ThreadReadParams: ['threadId'],
    ThreadReadResponse: ['thread'],
    ThreadTurnsListParams: ['threadId', 'cursor', 'limit', 'sortDirection', 'itemsView'],
    ThreadTurnsListResponse: ['data', 'nextCursor'],
    TurnStartParams: ['threadId', 'input', 'clientUserMessageId', 'model', 'effort'],
    TurnStartResponse: ['turn'],
    GetAccountParams: ['refreshToken'],
    GetAccountResponse: ['account'],
    ModelListResponse: ['data'],
    Thread: ['id', 'cwd', 'status', 'ephemeral'],
    Turn: ['id', 'status', 'error', 'items'],
    Model: ['id', 'model', 'hidden', 'displayName', 'description', 'isDefault', 'supportedReasoningEfforts', 'defaultReasoningEffort'],
    TurnStartedNotification: ['threadId', 'turn'],
    TurnCompletedNotification: ['threadId', 'turn'],
    AgentMessageDeltaNotification: ['threadId', 'delta'],
    CommandExecutionRequestApprovalResponse: ['decision']
  } as Readonly<Record<string, readonly string[]>>,
  /** Enum / discriminator values the adapter sends or compares against. */
  enums: [
    { definition: 'SandboxMode', value: 'danger-full-access' },
    { definition: 'AskForApproval', value: 'never' },
    { definition: 'SandboxPolicy', value: 'dangerFullAccess' },
    { definition: 'SortDirection', value: 'desc' },
    { definition: 'TurnStatus', value: 'completed' },
    { definition: 'TurnStatus', value: 'failed' },
    { definition: 'TurnStatus', value: 'interrupted' },
    { definition: 'Account', value: 'chatgpt' },
    { definition: 'TurnItemsView', value: 'full' },
    { definition: 'UserInput', value: 'text' }
  ] as readonly EnumRequirement[],
  /** Tagged-union variants the adapter reads fields from. */
  variants: [
    { definition: 'UserInput', tag: 'text', fields: ['text', 'text_elements'] },
    { definition: 'ThreadItem', tag: 'userMessage', fields: ['clientId'] },
    { definition: 'ThreadItem', tag: 'commandExecution', fields: ['command'] }
  ] as readonly TaggedVariantRequirement[]
} as const;

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const COMBINATORS = ['allOf', 'anyOf', 'oneOf'] as const;

class SchemaIndex {
  private readonly definitions = new Map<string, Json>();
  private readonly standalone = new Map<string, Json>();

  constructor(files: SchemaFiles) {
    // Later sources win, matching how the generated v2 surface refines the aggregate one.
    for (const key of [SCHEMA_FILE.aggregate, SCHEMA_FILE.v2]) {
      const defs = asObject(asObject(files[key])?.definitions);
      if (defs) for (const [name, def] of Object.entries(defs)) { const node = asObject(def); if (node) this.definitions.set(name, node); }
    }
    const initParams = asObject(files[SCHEMA_FILE.initializeParams]);
    const initResponse = asObject(files[SCHEMA_FILE.initializeResponse]);
    if (initParams) this.standalone.set('InitializeParams', initParams);
    if (initResponse) this.standalone.set('InitializeResponse', initResponse);
  }

  get hasDefinitions(): boolean { return this.definitions.size > 0; }
  definition(name: string): Json | undefined { return this.definitions.get(name) ?? this.standalone.get(name); }

  private deref(node: unknown): Json | undefined {
    const object = asObject(node);
    const ref = typeof object?.$ref === 'string' ? object.$ref : undefined;
    return ref ? this.definition(ref.split('/').pop() ?? '') : object;
  }

  /** Every property name reachable from a node (properties plus allOf/anyOf/oneOf, following $ref). */
  properties(node: unknown): Set<string> {
    const names = new Set<string>();
    const seen = new Set<Json>();
    const visit = (candidate: unknown): void => {
      const resolved = this.deref(candidate);
      if (!resolved || seen.has(resolved)) return;
      seen.add(resolved);
      for (const key of Object.keys(asObject(resolved.properties) ?? {})) names.add(key);
      for (const combinator of COMBINATORS) for (const member of asArray(resolved[combinator])) visit(member);
    };
    visit(node);
    return names;
  }

  /** Every enum / const value reachable from a node; tagged unions carry their discriminator under properties.type. */
  enumValues(node: unknown): Set<unknown> {
    const values = new Set<unknown>();
    const seen = new Set<Json>();
    const visit = (candidate: unknown): void => {
      const resolved = this.deref(candidate);
      if (!resolved || seen.has(resolved)) return;
      seen.add(resolved);
      for (const value of asArray(resolved.enum)) values.add(value);
      if (resolved.const !== undefined) values.add(resolved.const);
      const typeProperty = asObject(resolved.properties)?.type;
      if (typeProperty) visit(typeProperty);
      for (const combinator of COMBINATORS) for (const member of asArray(resolved[combinator])) visit(member);
      if (resolved.items) visit(resolved.items);
    };
    visit(node);
    return values;
  }

  /** Variants of a tagged union whose discriminator equals `tag`. */
  variants(definition: string, tag: string): Json[] {
    const root = this.definition(definition);
    if (!root) return [];
    const found: Json[] = [];
    const seen = new Set<Json>();
    const visit = (candidate: unknown): void => {
      const resolved = this.deref(candidate);
      if (!resolved || seen.has(resolved)) return;
      seen.add(resolved);
      if (resolved !== root && this.enumValues(asObject(resolved.properties)?.type).has(tag)) found.push(resolved);
      for (const combinator of COMBINATORS) for (const member of asArray(resolved[combinator])) visit(member);
    };
    visit(root);
    return found;
  }
}

/** All `method` discriminator values declared anywhere inside a request/notification union document. */
function declaredMethods(document: unknown): Set<string> {
  const methods = new Set<string>();
  const seen = new Set<object>();
  let budget = 200_000;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node) || budget-- <= 0) return;
    seen.add(node);
    if (Array.isArray(node)) { for (const child of node) walk(child); return; }
    for (const [key, child] of Object.entries(node as Json)) {
      if (key === 'method') {
        const declaration = asObject(child);
        for (const value of asArray(declaration?.enum)) if (typeof value === 'string') methods.add(value);
        if (typeof declaration?.const === 'string') methods.add(declaration.const);
      }
      walk(child);
    }
  };
  walk(document);
  return methods;
}

/**
 * Proves the generated schema still contains everything REQUIRED_CONTRACT names. Never throws: input that is
 * not a recognisable schema simply reports what is missing.
 */
export function checkSchemaContract(files: SchemaFiles): ContractCheck {
  const index = new SchemaIndex(files);
  if (!index.hasDefinitions) return { ok: false, missing: ['schema definitions (no protocol definitions found)'] };
  const missing: string[] = [];

  const clientMethods = declaredMethods(files[SCHEMA_FILE.clientRequest]);
  for (const method of REQUIRED_CONTRACT.clientMethods) if (!clientMethods.has(method)) missing.push(`client method ${method}`);
  const notifications = declaredMethods(files[SCHEMA_FILE.serverNotification]);
  for (const method of REQUIRED_CONTRACT.serverNotifications) if (!notifications.has(method)) missing.push(`server notification ${method}`);
  const serverRequests = declaredMethods(files[SCHEMA_FILE.serverRequest]);
  for (const method of REQUIRED_CONTRACT.serverRequests) if (!serverRequests.has(method)) missing.push(`server request ${method}`);

  for (const [definition, fields] of Object.entries(REQUIRED_CONTRACT.fields)) {
    const node = index.definition(definition);
    if (!node) { missing.push(`definition ${definition}`); continue; }
    const present = index.properties(node);
    for (const field of fields) if (!present.has(field)) missing.push(`${definition}.${field}`);
  }

  for (const { definition, value } of REQUIRED_CONTRACT.enums) {
    const node = index.definition(definition);
    if (!node) { missing.push(`definition ${definition}`); continue; }
    if (!index.enumValues(node).has(value)) missing.push(`${definition} value '${value}'`);
  }

  for (const { definition, tag, fields } of REQUIRED_CONTRACT.variants) {
    const variants = index.variants(definition, tag);
    if (!variants.length) { missing.push(`${definition} variant '${tag}'`); continue; }
    const present = new Set(variants.flatMap((variant) => [...index.properties(variant)]));
    for (const field of fields) if (!present.has(field)) missing.push(`${definition}(${tag}).${field}`);
  }

  return missing.length ? { ok: false, missing: [...new Set(missing)] } : { ok: true };
}
