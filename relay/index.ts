/**
 * Production entrypoint for the Sideline relay. A thin, provider-neutral wrapper around the shared
 * ReferenceRelay engine: it validates environment configuration, wires structured metadata-only
 * logging, and drains gracefully on SIGTERM/SIGINT. No protocol behaviour lives here.
 */
import { DEFAULT_RATE_LIMITS, ReferenceRelay, type RateLimits, type RelayEvent, type RelayLogEntry } from './reference-relay';

export interface RelayConfig {
  port: number;
  bindHost: string;
  relayDomain: string;
  enrollmentKey?: string;
  rateLimits: RateLimits;
  trustProxy: boolean;
  clientIpSource: 'socket' | 'fly';
  drainMs: number;
}

/** Thrown for invalid configuration. Messages name the variable, never its value. */
export class RelayConfigError extends Error {}

const DOMAIN_PATTERN = /^(localhost|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)$/;

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new RelayConfigError(`${name} must be a positive integer`);
  const value = Number(raw);
  if (value < 1 || value > max) throw new RelayConfigError(`${name} must be between 1 and ${max}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv): RelayConfig {
  const rawPort = env.PORT;
  if (rawPort === undefined || !/^\d+$/.test(rawPort) || Number(rawPort) > 65535) throw new RelayConfigError('PORT is required and must be an integer from 0 to 65535');
  const relayDomain = (env.RELAY_DOMAIN ?? '').toLowerCase();
  if (!DOMAIN_PATTERN.test(relayDomain)) throw new RelayConfigError('RELAY_DOMAIN is required and must be a bare lowercase domain such as relay.example.com');
  const enrollmentKey = env.ENROLLMENT_KEY || undefined;
  if (enrollmentKey === undefined && env.ALLOW_OPEN_ENROLLMENT !== 'true') {
    throw new RelayConfigError('ENROLLMENT_KEY is required (set ALLOW_OPEN_ENROLLMENT=true only for local testing)');
  }
  if (enrollmentKey !== undefined && enrollmentKey.length < 16) throw new RelayConfigError('ENROLLMENT_KEY must be at least 16 characters');
  const trust = env.TRUST_PROXY ?? 'false';
  if (trust !== 'true' && trust !== 'false') throw new RelayConfigError('TRUST_PROXY must be true or false');
  const source = env.CLIENT_IP_SOURCE ?? 'socket';
  if (source !== 'socket' && source !== 'fly') throw new RelayConfigError('CLIENT_IP_SOURCE must be socket or fly');
  if (source === 'fly' && trust === 'true') throw new RelayConfigError('CLIENT_IP_SOURCE=fly cannot be combined with TRUST_PROXY=true');
  return {
    port: Number(rawPort),
    bindHost: env.BIND_HOST || '0.0.0.0',
    relayDomain,
    ...(enrollmentKey !== undefined ? { enrollmentKey } : {}),
    rateLimits: {
      windowMs: DEFAULT_RATE_LIMITS.windowMs,
      handshakePerWindow: positiveInt(env, 'RATE_HANDSHAKE_PER_MIN', DEFAULT_RATE_LIMITS.handshakePerWindow),
      invalidBeforeBan: positiveInt(env, 'RATE_INVALID_BEFORE_BAN', DEFAULT_RATE_LIMITS.invalidBeforeBan),
      banMs: positiveInt(env, 'BAN_MINUTES', DEFAULT_RATE_LIMITS.banMs / 60_000) * 60_000,
      httpPerWindow: positiveInt(env, 'RATE_HTTP_PER_MIN', DEFAULT_RATE_LIMITS.httpPerWindow),
      pairingPerWindow: positiveInt(env, 'RATE_PAIRING_PER_MIN', DEFAULT_RATE_LIMITS.pairingPerWindow)
    },
    trustProxy: trust === 'true',
    clientIpSource: source,
    drainMs: positiveInt(env, 'DRAIN_MS', 5000, 5000)
  };
}

export interface RunningRelay {
  relay: ReferenceRelay;
  port: number;
  config: RelayConfig;
  shutdown: () => Promise<void>;
}

/** Starts the relay from validated config. `write` receives one JSON object per line. */
export async function startRelay(config: RelayConfig, write: (line: string) => void = (line) => process.stdout.write(line)): Promise<RunningRelay> {
  const emit = (fields: Record<string, unknown>): void => write(`${JSON.stringify(fields)}\n`);
  const relay = new ReferenceRelay({
    relayDomain: config.relayDomain,
    ...(config.enrollmentKey ? { enrollmentKey: config.enrollmentKey } : {}),
    rateLimits: config.rateLimits,
    trustProxy: config.trustProxy,
    clientIpSource: config.clientIpSource,
    // Fields are copied explicitly so nothing outside the metadata schema can ever reach the log.
    log: (e: RelayLogEntry) => emit({ ts: e.ts, event: 'req', hostPublicId: e.hostPublicId, method: e.method, path: e.path, status: e.status, bytes: e.bytes, durationMs: e.durationMs }),
    onEvent: (e: RelayEvent) => emit({ ts: e.ts, event: e.event, hostPublicId: e.hostPublicId, scope: e.scope, client: e.client, code: e.code, phase: e.phase })
  });
  const port = await relay.listen(config.port, config.bindHost);
  emit({ ts: Date.now(), event: 'listening', port, relayDomain: config.relayDomain, enrollment: config.enrollmentKey ? 'required' : 'open', trustProxy: config.trustProxy, clientIpSource: config.clientIpSource });
  let stopping: Promise<void> | undefined;
  return { relay, port, config, shutdown: () => (stopping ??= relay.shutdown(config.drainMs)) };
}

async function main(): Promise<void> {
  let config: RelayConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ts: Date.now(), event: 'config_error', message: error instanceof RelayConfigError ? error.message : 'invalid configuration' })}\n`);
    process.exit(1);
  }
  const running = await startRelay(config);
  const stop = (signal: string): void => {
    process.stdout.write(`${JSON.stringify({ ts: Date.now(), event: 'signal', signal })}\n`);
    running.shutdown().then(() => process.exit(0), () => process.exit(1));
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
}

if (require.main === module) {
  void main();
}
