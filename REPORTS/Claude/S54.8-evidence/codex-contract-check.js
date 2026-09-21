// Static contract check: does the generated Codex app-server schema still contain every
// method/field/enum value that src/player-control/codex-app-server.ts reads or writes?
// Read-only. Reads only the generated schema directory.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const v2 = JSON.parse(fs.readFileSync(path.join(dir, 'codex_app_server_protocol.v2.schemas.json'), 'utf8'));
const all = JSON.parse(fs.readFileSync(path.join(dir, 'codex_app_server_protocol.schemas.json'), 'utf8'));
const defs = { ...(all.definitions || {}), ...(v2.definitions || {}) };
const load = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const standalone = { InitializeResponse: load('v1/InitializeResponse.json'), InitializeParams: load('v1/InitializeParams.json') };
const getDef = (name) => defs[name] || standalone[name];
const deref = (node) => {
  const ref = node && node.$ref;
  if (!ref) return node;
  return getDef(ref.split('/').pop());
};
/** All property names reachable from a schema node (properties + allOf/anyOf/oneOf, following $ref). */
function props(node, seen = new Set()) {
  const out = new Map();
  const visit = (n) => {
    n = deref(n);
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    for (const [k, v] of Object.entries(n.properties || {})) if (!out.has(k)) out.set(k, v);
    for (const key of ['allOf', 'anyOf', 'oneOf']) for (const m of n[key] || []) visit(m);
  };
  visit(node);
  return out;
}
const enumValues = (node, seen = new Set()) => {
  const vals = new Set();
  const visit = (n) => {
    n = deref(n);
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    (n.enum || []).forEach((v) => vals.add(v));
    if (n.properties && n.properties.type) visit(n.properties.type); // tagged unions carry the discriminator here
    if (n.const !== undefined) vals.add(n.const);
    for (const key of ['allOf', 'anyOf', 'oneOf']) for (const m of n[key] || []) visit(m);
    if (n.items) visit(n.items);
  };
  visit(node);
  return vals;
};
const results = [];
const check = (label, ok, detail = '') => results.push({ label, ok: Boolean(ok), detail });
const need = (defName, fieldList) => {
  const def = getDef(defName);
  if (!def) { check(`${defName} exists`, false); return; }
  const p = props(def);
  for (const f of fieldList) check(`${defName}.${f}`, p.has(f));
};

// Methods
const methods = new Set();
JSON.stringify(load('ClientRequest.json'), (k, v) => { if (k === 'method' && v && v.enum) v.enum.forEach((m) => methods.add(m)); return v; });
for (const m of ['initialize', 'thread/start', 'thread/resume', 'thread/read', 'thread/turns/list', 'turn/start', 'account/read', 'model/list']) check(`client method ${m}`, methods.has(m));

// Requests / responses
need('InitializeParams', ['clientInfo', 'capabilities']);
need('InitializeResponse', ['userAgent']);
need('ThreadStartParams', ['cwd', 'approvalPolicy', 'sandbox']);
need('ThreadStartResponse', ['thread', 'cwd', 'approvalPolicy', 'sandbox', 'model', 'reasoningEffort']);
need('ThreadResumeParams', ['threadId', 'cwd', 'approvalPolicy', 'sandbox', 'excludeTurns']);
need('ThreadResumeResponse', ['thread', 'cwd', 'approvalPolicy', 'sandbox', 'model', 'reasoningEffort']);
need('ThreadReadParams', ['threadId']);
need('ThreadReadResponse', ['thread']);
need('ThreadTurnsListParams', ['threadId', 'cursor', 'limit', 'sortDirection', 'itemsView']);
need('ThreadTurnsListResponse', ['data', 'nextCursor']);
need('TurnStartParams', ['threadId', 'input', 'clientUserMessageId', 'model', 'effort']);
need('TurnStartResponse', ['turn']);
need('GetAccountParams', ['refreshToken']);
need('GetAccountResponse', ['account']);
need('ModelListResponse', ['data']);
need('Thread', ['id', 'cwd', 'status', 'ephemeral']);
need('Turn', ['id', 'status', 'error', 'items']);
need('Model', ['id', 'model', 'hidden', 'displayName', 'description', 'isDefault', 'supportedReasoningEfforts', 'defaultReasoningEffort']);

// Enum / literal values the adapter relies on
const sandboxModes = enumValues(getDef('SandboxMode'));
check('SandboxMode contains danger-full-access', sandboxModes.has('danger-full-access'), [...sandboxModes].join(','));
const approval = enumValues(getDef('AskForApproval'));
check('AskForApproval contains never', approval.has('never'), [...approval].join(','));
const sortDir = enumValues(getDef('SortDirection'));
check('SortDirection contains desc', sortDir.has('desc'), [...sortDir].join(','));
const sandboxPolicy = getDef('SandboxPolicy');
check('SandboxPolicy has type dangerFullAccess', sandboxPolicy && enumValues(sandboxPolicy).has('dangerFullAccess'), sandboxPolicy ? [...enumValues(sandboxPolicy)].join(',') : 'no def');
const turnStatus = enumValues(getDef('TurnStatus'));
for (const s of ['completed', 'failed', 'interrupted']) check(`TurnStatus contains ${s}`, turnStatus.has(s), [...turnStatus].join(','));
const acct = getDef('Account');
check('Account type chatgpt', acct && enumValues(acct).has('chatgpt'), acct ? [...enumValues(acct)].join(',') : 'no def');
const itemsView = enumValues(getDef('TurnItemsView'));
check('TurnItemsView contains full', itemsView.has('full') || itemsView.size === 0, [...itemsView].join(',') || '(def missing or not enum)');
const userInput = getDef('UserInput');
check('UserInput has type text', userInput && enumValues(userInput).has('text'), userInput ? [...enumValues(userInput)].join(',') : 'no def');
if (userInput) {
  const textVariant = (userInput.oneOf || []).map(deref).find((v) => enumValues(v).has('text'));
  check('UserInput(text) has text + text_elements', textVariant && props(textVariant).has('text') && props(textVariant).has('text_elements'), textVariant ? [...props(textVariant).keys()].join(',') : 'no text variant');
}
const threadItem = getDef('ThreadItem');
if (threadItem) {
  const user = (threadItem.oneOf || []).map(deref).find((v) => enumValues(v).has('userMessage'));
  check('ThreadItem(userMessage) present', Boolean(user));
  check('ThreadItem(userMessage).clientId', user && props(user).has('clientId'), user ? [...props(user).keys()].join(',') : '');
  const cmd = (threadItem.oneOf || []).map(deref).find((v) => enumValues(v).has('commandExecution'));
  check('ThreadItem(commandExecution).command', cmd && props(cmd).has('command'));
} else check('ThreadItem exists', false);

// Notifications the adapter consumes
const notifs = new Set();
JSON.stringify(load('ServerNotification.json'), (k, v) => { if (k === 'method' && v && v.enum) v.enum.forEach((m) => notifs.add(m)); return v; });
for (const n of ['turn/started', 'turn/completed', 'item/agentMessage/delta', 'item/started', 'item/completed']) check(`server notification ${n}`, notifs.has(n));
need('TurnStartedNotification', ['threadId', 'turn']);
need('TurnCompletedNotification', ['threadId', 'turn']);
need('AgentMessageDeltaNotification', ['threadId', 'delta']);

// Server requests the adapter answers (declines)
const serverReq = new Set();
JSON.stringify(load('ServerRequest.json'), (k, v) => { if (k === 'method' && v && v.enum) v.enum.forEach((m) => serverReq.add(m)); return v; });
for (const r of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'item/tool/requestUserInput', 'mcpServer/elicitation/request']) check(`server request ${r}`, serverReq.has(r));
need('CommandExecutionRequestApprovalResponse', ['decision']);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.detail && !r.ok ? '   [' + r.detail + ']' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} pass, ${failed.length} fail`);
process.exitCode = failed.length ? 1 : 0;
