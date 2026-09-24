import * as crypto from 'node:crypto';

export type Principal =
  | { kind: 'local-admin'; authenticatedBy: 'bearer' | 'cookie' }
  | { kind: 'remote-device'; deviceId: string; authenticatedBy: 'in-process'; expectedOrigin?: string };

export function timingSafeSecretEqual(candidate: unknown, expected: unknown): boolean {
  if (typeof candidate !== 'string' || typeof expected !== 'string' || !candidate || !expected) return false;
  const left = Buffer.from(candidate, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length) {
    crypto.timingSafeEqual(crypto.createHash('sha256').update(left).digest(), crypto.createHash('sha256').update(right).digest());
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function parseCookies(header: string | undefined): ReadonlyMap<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

export function requestOriginMatchesHost(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host;
  } catch {
    return false;
  }
}

export function requestOriginMatchesExpected(origin: string | undefined, expectedOrigin: string | undefined): boolean {
  if (!origin || !expectedOrigin) return false;
  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}
