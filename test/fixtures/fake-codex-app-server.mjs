import { appendFileSync } from 'node:fs';

const mode = process.env.FAKE_MODE || 'normal';
const logPath = process.env.FAKE_LOG_PATH;
const threadId = process.env.FAKE_THREAD_ID || `thread-${process.pid}`;
const completionDelay = Number(process.env.FAKE_COMPLETION_DELAY_MS || 5);
let buffer = '';
let turnRequests = 0;
let turnNumber = 0;
let resumeRequests = 0;

const log = (message) => {
  if (logPath) appendFileSync(logPath, `${JSON.stringify(message)}\n`, 'utf8');
};
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
log({ fakeEvent: 'environment', pid: process.pid, hasCodexApiKey: Boolean(process.env.CODEX_API_KEY) });

/**
 * `generate-json-schema --out <dir>` emulation (the adapter's compatibility probe). The schema is synthesised from the
 * adapter's own REQUIRED_CONTRACT in the real generated layout (tagged unions, standalone v1 files, method enums).
 * FAKE_SCHEMA_DROP: comma-separated contract item labels (as reported in `missing`) to omit.
 * FAKE_SCHEMA_MODE: ok | fail | hang | garbage | empty | not-object.
 */
async function generateSchema() {
  const schemaMode = process.env.FAKE_SCHEMA_MODE || 'ok';
  const outIndex = process.argv.indexOf('--out');
  const outDir = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  log({ fakeEvent: 'schema-probe', schemaMode, out: outDir, cwd: process.cwd(), hasCodexApiKey: Boolean(process.env.CODEX_API_KEY) });
  if (schemaMode === 'fail') process.exit(3);
  if (schemaMode === 'hang') { setInterval(() => {}, 1000); return; }
  if (!outDir) process.exit(2);
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const write = (name, value) => {
    const file = join(outDir, ...name.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  };
  if (schemaMode === 'empty') process.exit(0);
  if (schemaMode === 'garbage') { write('codex_app_server_protocol.v2.schemas.json', '{not json at all'); write('ClientRequest.json', '<<<'); process.exit(0); }
  if (schemaMode === 'not-object') { write('codex_app_server_protocol.v2.schemas.json', '"just a string"'); write('ClientRequest.json', '[]'); process.exit(0); }
  const contractUrl = pathToFileURL(process.env.FAKE_CONTRACT_PATH || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'out', 'player-control', 'codex-contract.js')).href;
  const { REQUIRED_CONTRACT: C } = await import(contractUrl);
  const drop = new Set((process.env.FAKE_SCHEMA_DROP || '').split(',').map((entry) => entry.trim()).filter(Boolean));
  const keep = (label) => !drop.has(label);
  const definitions = {};
  const standalone = {};
  for (const [name, fields] of Object.entries(C.fields)) {
    const target = name === 'InitializeParams' || name === 'InitializeResponse' ? (standalone[name] = { title: name, type: 'object', properties: {} }) : (definitions[name] = { type: 'object', properties: {} });
    for (const field of fields) if (keep(`${name}.${field}`)) target.properties[field] = { type: 'string' };
  }
  const tagged = new Set(C.variants.map((variant) => variant.definition).concat(['SandboxPolicy', 'Account']));
  // Definitions always exist, so a dropped value is reported as that value rather than as a missing definition.
  for (const { definition } of C.enums) definitions[definition] ??= tagged.has(definition) ? { oneOf: [] } : { type: 'string', enum: [] };
  for (const { definition } of C.variants) definitions[definition] ??= { oneOf: [] };
  for (const { definition, value } of C.enums) {
    if (!keep(`${definition} value '${value}'`)) continue;
    if (C.variants.some((variant) => variant.definition === definition && variant.tag === value)) continue; // the variant carries it
    if (tagged.has(definition)) {
      (definitions[definition] ??= { oneOf: [] }).oneOf.push({ type: 'object', required: ['type'], properties: { type: { enum: [value], type: 'string' } } });
    } else {
      (definitions[definition] ??= { type: 'string', enum: [] }).enum.push(value);
    }
  }
  for (const { definition, tag, fields } of C.variants) {
    if (!keep(`${definition} variant '${tag}'`) || !keep(`${definition} value '${tag}'`)) continue;
    const union = (definitions[definition] ??= { oneOf: [] });
    const properties = { type: { enum: [tag], type: 'string' } };
    for (const field of fields) if (keep(`${definition}(${tag}).${field}`)) properties[field] = { type: 'string' };
    // A variant already declared by an enum entry is replaced by the fuller one.
    union.oneOf = union.oneOf.filter((member) => !(member.properties?.type?.enum || []).includes(tag));
    union.oneOf.push({ type: 'object', required: ['type'], properties });
  }
  const methodUnion = (methods, prefix) => ({ oneOf: methods.filter((method) => keep(`${prefix} ${method}`)).map((method) => ({ type: 'object', properties: { method: { enum: [method], type: 'string' }, params: { type: 'object' } } })) });
  write('codex_app_server_protocol.schemas.json', { title: 'Aggregate', type: 'object', definitions: {} });
  write('codex_app_server_protocol.v2.schemas.json', { title: 'V2', type: 'object', definitions });
  write('ClientRequest.json', methodUnion(C.clientMethods, 'client method'));
  write('ServerNotification.json', methodUnion(C.serverNotifications, 'server notification'));
  write('ServerRequest.json', methodUnion(C.serverRequests, 'server request'));
  write('v1/InitializeParams.json', standalone.InitializeParams);
  write('v1/InitializeResponse.json', standalone.InitializeResponse);
  process.exit(0);
}
if (process.argv.includes('generate-json-schema')) {
  await generateSchema();
  // Only reached in 'hang' mode; keep the process alive without touching stdin.
  await new Promise(() => {});
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); }
    catch {
      log({ raw: line });
      continue;
    }
    log(message);
    handle(message);
  }
});

function handle(message) {
  if (message.method === 'initialize') {
    const version = process.env.FAKE_VERSION || (mode === 'version-other' ? '9.9.9' : '0.154.0');
    send({ id: message.id, result: { userAgent: process.env.FAKE_USER_AGENT || `sideline_coach/${version} (fake)`, codexHome: 'fake', platformFamily: process.platform === 'win32' ? 'windows' : 'unix', platformOs: process.platform } });
    if (mode === 'malformed') process.stdout.write('not-json\n');
    return;
  }
  if (message.method === 'initialized') return;
  if (message.method === 'account/read') {
    const account = mode === 'account-none' ? null : mode === 'account-apikey' ? { type: 'apiKey' } : { type: 'chatgpt', email: 'fake@example.test', planType: 'plus' };
    send({ id: message.id, result: { account, requiresOpenaiAuth: true } });
    return;
  }
  if (message.method === 'account/rateLimits/read') {
    const rateLimits = mode === 'health-unbounded'
      ? { primary: { usedPercent: 17 }, planType: 'x'.repeat(501) }
      : { primary: { usedPercent: 17, resetsAt: 777, windowDurationMins: 300 }, secondary: { usedPercent: 4, resetsAt: 888, windowDurationMins: 10080 }, planType: 'pro', rateLimitReachedType: null };
    send({ id: message.id, result: { rateLimits } });
    return;
  }
  if (message.method === 'thread/start') {
    const cwd = mode === 'wrong-cwd' ? `${message.params.cwd}-wrong` : message.params.cwd;
    send({ id: message.id, result: {
      thread: { id: threadId, status: { type: 'idle' }, turns: [], ephemeral: false, cwd },
      cwd,
      approvalPolicy: 'never',
      approvalsReviewer: 'user',
      sandbox: { type: 'dangerFullAccess' },
      model: 'gpt-5.6-terra',
      modelProvider: 'openai',
      reasoningEffort: 'medium'
    } });
    send({ method: 'thread/started', params: { thread: { id: threadId } } });
    if (mode === 'approval') {
      send({ id: 900, method: 'item/commandExecution/requestApproval', params: { threadId, turnId: 'pending', itemId: 'command-1', command: 'echo proof', cwd: message.params.cwd } });
    }
    return;
  }
  if (message.method === 'thread/read') {
    // Codex app-server 0.154.0: a fresh process answers "thread not loaded" for any thread.
    if (mode === 'resume-not-loaded' || mode === 'resume-not-loaded-missing') {
      send({ id: message.id, error: { code: -32600, message: `thread not loaded: ${message.params.threadId}` } });
      return;
    }
    if (mode === 'resume-missing') {
      send({ id: message.id, error: { code: -32600, message: `no rollout found for thread id ${message.params.threadId}` } });
      return;
    }
    const cwd = mode === 'resume-wrong-cwd' ? `${process.cwd()}-wrong` : process.cwd();
    send({ id: message.id, result: { thread: { id: message.params.threadId, status: { type: 'idle' }, turns: [], ephemeral: false, cwd } } });
    return;
  }
  if (message.method === 'thread/resume') {
    if (mode === 'resume-not-loaded-missing') {
      send({ id: message.id, error: { code: -32600, message: `no rollout found for thread id ${message.params.threadId}` } });
      return;
    }
    resumeRequests += 1;
    const busyCount = Number(process.env.FAKE_WRITER_BUSY_COUNT || (mode.startsWith('resume-writer-busy-') ? mode.slice('resume-writer-busy-'.length) : 0));
    if (resumeRequests <= busyCount) {
      send({ id: message.id, error: { code: -32600, message: 'thread already has an active writer' } });
      return;
    }
    const defaultAuthority = mode === 'resume-authority-default';
    const response = { id: message.id, result: {
      thread: { id: message.params.threadId, status: { type: 'idle' }, turns: [], ephemeral: false, cwd: message.params.cwd },
      cwd: message.params.cwd,
      approvalPolicy: defaultAuthority ? 'on-request' : 'never',
      approvalsReviewer: 'user',
      sandbox: { type: defaultAuthority ? 'readOnly' : 'dangerFullAccess' },
      model: 'gpt-5.6-terra',
      modelProvider: 'openai',
      reasoningEffort: 'medium'
    } };
    const resumeDelay = Number(process.env.FAKE_RESUME_DELAY_MS || 0);
    if (resumeDelay > 0) setTimeout(() => send(response), resumeDelay);
    else send(response);
    return;
  }
  if (message.method === 'thread/turns/list') {
    const turnId = process.env.FAKE_HISTORY_TURN_REF || 'history-turn-1';
    const clientId = process.env.FAKE_HISTORY_CLIENT_REF || 'history-client-1';
    const status = mode === 'history-completed' ? 'completed'
      : mode === 'history-failed' ? 'failed'
      : 'interrupted';
    const items = mode === 'history-interrupted-no-items' ? [] : [{ type: 'userMessage', id: 'user-1', clientId, content: [] }];
    const data = mode.startsWith('history-') ? [{ id: turnId, status, items, itemsView: 'full', error: status === 'failed' ? { message: 'fake failure' } : null }] : [];
    send({ id: message.id, result: { data, nextCursor: null, backwardsCursor: data.length ? turnId : null } });
    return;
  }
  if (message.method === 'model/list') {
    const models = [
      {
        id: 'gpt-5.6-sol',
        model: 'gpt-5.6-sol',
        name: 'GPT-5.6-Sol',
        description: 'Workhorse coding model',
        isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'medium' }, { reasoningEffort: 'high' }],
        defaultReasoningEffort: 'medium'
      },
      {
        id: 'gpt-6-astra',
        model: 'gpt-6-astra',
        name: 'GPT-6-Astra',
        description: 'Advanced reasoning model',
        isDefault: false,
        supportedReasoningEfforts: [{ reasoningEffort: 'high' }, { reasoningEffort: 'ultra' }],
        defaultReasoningEffort: 'ultra'
      },
      {
        id: 'gpt-5-luna',
        model: 'gpt-5-luna',
        name: 'GPT-5-Luna',
        description: 'Fast responsive model',
        isDefault: false,
        supportedReasoningEfforts: [{ reasoningEffort: 'low' }],
        defaultReasoningEffort: 'low'
      }
    ];
    send({ id: message.id, result: { data: models } });
    return;
  }
  if (message.method === 'turn/start') {
    turnRequests += 1;
    if (mode === 'ack-loss') {
      setImmediate(() => process.exit(19));
      return;
    }
    if (mode === 'ingress-once' && turnRequests === 1) {
      send({ id: message.id, error: { code: -32001, message: 'server overloaded before ingress' } });
      return;
    }
    if (mode === 'rpc-error') {
      send({ id: message.id, error: { code: -32600, message: 'turn rejected' } });
      return;
    }
    turnNumber += 1;
    const turnId = `turn-${turnNumber}`;
    log({ fakeEvent: 'turn-started', turnId, threadId, model: message.params?.model, effort: message.params?.effort });
    const turn = { id: turnId, status: 'inProgress', items: [], error: null };
    if (mode === 'ack-no-turn-id') {
      send({ id: message.id, result: { turn: { status: 'inProgress', items: [], error: null } } });
      return;
    }
    send({ id: message.id, result: { turn } });
    send({ method: 'turn/started', params: { threadId, turn } });
    send({ method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: `message-${turnNumber}`, delta: `answer ${turnNumber}` } });
    if (mode === 'health') send({ method: 'account/rateLimits/updated', params: { uuid: 'must-not-cross', raw_stdout: 'must-not-cross', rateLimits: { primary: { usedPercent: 23 }, rateLimitReachedType: 'primary' } } });
    if (mode === 'health-unbounded') send({ method: 'account/rateLimits/updated', params: { rateLimits: { planType: 'x'.repeat(501) } } });
    if (mode === 'mid-turn') {
      setTimeout(() => process.exit(23), 10);
      return;
    }
    if (mode !== 'hold') {
      const finalTurn = { ...turn, status: mode === 'complete-bad-status' ? 'teleported' : 'completed' };
      setTimeout(() => send({ method: 'turn/completed', params: { threadId, turn: finalTurn } }), completionDelay);
    }
    return;
  }
}
