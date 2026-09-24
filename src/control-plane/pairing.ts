import * as crypto from 'node:crypto';
import { timingSafeSecretEqual } from './request-security';

export const PAIRING_TTL_MS = 5 * 60 * 1000;
export const PAIRING_MAX_FAILED_ATTEMPTS = 5;
/** Crockford-style subset without ambiguous 0/O/1/I/L. */
export const PAIRING_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PAIRING_CODE_LENGTH = 8;

export interface CreatedPairing {
  pairingId: string;
  /** Raw QR secret. Returned only to the local creator; never stored. */
  secret: string;
  /** Raw fallback code, display-formatted (XXXX-XXXX). Never stored. */
  code: string;
  expiresAt: number;
}

export type PairingExchangeResult =
  | { ok: true; pairingId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'burned' };

interface PairingRecord {
  pairingId: string;
  secretHash: string;
  codeHash: string;
  expiresAt: number;
  failedAttempts: number;
}

const sha256Hex = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

export function normalizePairingCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateFallbackCode(): string {
  // Rejection sampling keeps every character uniformly distributed (240 = 30 * 8).
  const limit = 256 - (256 % PAIRING_CODE_ALPHABET.length);
  let out = '';
  while (out.length < PAIRING_CODE_LENGTH) {
    for (const byte of crypto.randomBytes(16)) {
      if (byte < limit && out.length < PAIRING_CODE_LENGTH) out += PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length];
    }
  }
  return out;
}

/**
 * Memory-only pairing records. Only SHA-256 hashes of the QR secret and fallback code are
 * retained; a daemon restart drops every pairing. At most one pairing is active: creating a
 * new one supersedes the previous. A wrong attempt cannot be attributed to a pairing (the
 * caller has only a secret/code), so failures count against the active pairing.
 */
export class PairingStore {
  private readonly records = new Map<string, PairingRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  createPairing(): CreatedPairing {
    this.records.clear();
    const pairingId = crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(16).toString('base64url');
    const rawCode = generateFallbackCode();
    const expiresAt = this.now() + PAIRING_TTL_MS;
    this.records.set(pairingId, {
      pairingId,
      secretHash: sha256Hex(secret),
      codeHash: sha256Hex(rawCode),
      expiresAt,
      failedAttempts: 0
    });
    return { pairingId, secret, code: `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`, expiresAt };
  }

  exchange(candidate: { secret?: unknown; code?: unknown }): PairingExchangeResult {
    const secret = typeof candidate.secret === 'string' ? candidate.secret : undefined;
    const code = typeof candidate.code === 'string' ? normalizePairingCode(candidate.code) : undefined;
    if (!secret && !code) return { ok: false, reason: 'invalid' };
    const candidateHash = sha256Hex(secret ?? code ?? '');

    if (this.records.size === 0) return { ok: false, reason: 'invalid' };
    let sawExpired = false;
    for (const record of [...this.records.values()]) {
      if (this.now() >= record.expiresAt) {
        this.records.delete(record.pairingId);
        sawExpired = true;
        continue;
      }
      const expected = secret ? record.secretHash : record.codeHash;
      if (timingSafeSecretEqual(candidateHash, expected)) {
        this.records.delete(record.pairingId);
        return { ok: true, pairingId: record.pairingId };
      }
      record.failedAttempts += 1;
      if (record.failedAttempts >= PAIRING_MAX_FAILED_ATTEMPTS) {
        this.records.delete(record.pairingId);
        return { ok: false, reason: 'burned' };
      }
    }
    return { ok: false, reason: sawExpired && this.records.size === 0 ? 'expired' : 'invalid' };
  }
}
