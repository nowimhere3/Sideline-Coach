import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE32_LOWER = 'abcdefghijklmnopqrstuvwxyz234567';
const HOST_PUBLIC_ID_LENGTH = 20;
const HOST_KEY_FILE = 'host-key.json';

export interface StoredHostKey {
  version: 1;
  hostPublicId: string;
  publicKeyHex: string;
  privateKeyHex: string;
  createdAt: number;
}

export interface HostIdentity {
  hostPublicId: string;
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
  createdAt: number;
}

export function base32Lower(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_LOWER[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32_LOWER[(value << (5 - bits)) & 31];
  return out;
}

export function deriveHostPublicId(rawPublicKey: Uint8Array): string {
  return base32Lower(crypto.createHash('sha256').update(rawPublicKey).digest()).slice(0, HOST_PUBLIC_ID_LENGTH);
}

function b64urlToHex(value: string): string {
  return Buffer.from(value, 'base64url').toString('hex');
}

function hexToB64url(value: string): string {
  return Buffer.from(value, 'hex').toString('base64url');
}

function fail(file: string, why: string): never {
  throw new Error(`Refusing to overwrite existing host key at ${file}: ${why}`);
}

function loadIdentity(file: string): HostIdentity {
  let stored: Partial<StoredHostKey>;
  try {
    stored = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<StoredHostKey>;
  } catch (err) {
    return fail(file, `unreadable or unparseable (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!stored || stored.version !== 1
    || typeof stored.hostPublicId !== 'string' || typeof stored.publicKeyHex !== 'string'
    || typeof stored.privateKeyHex !== 'string' || typeof stored.createdAt !== 'number'
    || !/^[0-9a-f]{64}$/.test(stored.publicKeyHex) || !/^[0-9a-f]{64}$/.test(stored.privateKeyHex)) {
    return fail(file, 'unexpected schema');
  }
  let privateKey: crypto.KeyObject;
  let publicKey: crypto.KeyObject;
  try {
    privateKey = crypto.createPrivateKey({
      key: { kty: 'OKP', crv: 'Ed25519', d: hexToB64url(stored.privateKeyHex), x: hexToB64url(stored.publicKeyHex) },
      format: 'jwk'
    });
    publicKey = crypto.createPublicKey(privateKey);
  } catch (err) {
    return fail(file, `invalid key material (${err instanceof Error ? err.message : String(err)})`);
  }
  const derivedPublicHex = b64urlToHex(String(publicKey.export({ format: 'jwk' }).x));
  if (derivedPublicHex !== stored.publicKeyHex) return fail(file, 'public key does not match private key');
  if (deriveHostPublicId(Buffer.from(stored.publicKeyHex, 'hex')) !== stored.hostPublicId) return fail(file, 'hostPublicId does not match public key');
  return { hostPublicId: stored.hostPublicId, publicKey, privateKey, createdAt: stored.createdAt };
}

export class HostIdentityManager {
  /** Returns the durable host identity, generating it only when host-key.json does not exist. */
  ensureIdentity(remoteDir: string): HostIdentity {
    const file = path.join(remoteDir, HOST_KEY_FILE);
    if (fs.existsSync(file)) return loadIdentity(file);

    fs.mkdirSync(remoteDir, { recursive: true, mode: 0o700 });
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyHex = b64urlToHex(String(publicKey.export({ format: 'jwk' }).x));
    const privateKeyHex = b64urlToHex(String(privateKey.export({ format: 'jwk' }).d));
    const stored: StoredHostKey = {
      version: 1,
      hostPublicId: deriveHostPublicId(Buffer.from(publicKeyHex, 'hex')),
      publicKeyHex,
      privateKeyHex,
      createdAt: Date.now()
    };
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      // linkSync fails with EEXIST instead of replacing a key another process created first.
      fs.linkSync(tmp, file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return loadIdentity(file);
      throw err;
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* temp already gone */ }
    }
    return loadIdentity(file);
  }
}
