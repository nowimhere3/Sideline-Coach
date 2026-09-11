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
    const version = mode === 'version-other' ? '9.9.9' : '0.154.0';
    send({ id: message.id, result: { userAgent: `sideline_coach/${version} (fake)`, codexHome: 'fake', platformFamily: process.platform === 'win32' ? 'windows' : 'unix', platformOs: process.platform } });
    if (mode === 'malformed') process.stdout.write('not-json\n');
    return;
  }
  if (message.method === 'initialized') return;
  if (message.method === 'account/read') {
    const account = mode === 'account-none' ? null : mode === 'account-apikey' ? { type: 'apiKey' } : { type: 'chatgpt', email: 'fake@example.test', planType: 'plus' };
    send({ id: message.id, result: { account, requiresOpenaiAuth: true } });
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
    if (mode === 'resume-missing') {
      send({ id: message.id, error: { code: -32600, message: `no rollout found for thread id ${message.params.threadId}` } });
      return;
    }
    const cwd = mode === 'resume-wrong-cwd' ? `${process.cwd()}-wrong` : process.cwd();
    send({ id: message.id, result: { thread: { id: message.params.threadId, status: { type: 'idle' }, turns: [], ephemeral: false, cwd } } });
    return;
  }
  if (message.method === 'thread/resume') {
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
    log({ fakeEvent: 'turn-started', turnId, threadId });
    const turn = { id: turnId, status: 'inProgress', items: [], error: null };
    send({ id: message.id, result: { turn } });
    send({ method: 'turn/started', params: { threadId, turn } });
    send({ method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: `message-${turnNumber}`, delta: `answer ${turnNumber}` } });
    if (mode === 'mid-turn') {
      setTimeout(() => process.exit(23), 10);
      return;
    }
    if (mode !== 'hold') {
      setTimeout(() => send({ method: 'turn/completed', params: { threadId, turn: { ...turn, status: 'completed' } } }), completionDelay);
    }
    return;
  }
}
