import * as fs from 'node:fs';
import * as path from 'node:path';

export const PRODUCT_RELAY_URL = 'wss://relay.remote.mysidelinecoach.com/tunnel/v1';
export const PRODUCT_RELAY_DOMAIN = 'remote.mysidelinecoach.com';
export const MACHINE_ENROLLMENT_RELATIVE_PATH = path.join('remote', 'beta-enrollment.json');

export type MachineEnrollmentStatus = 'available' | 'missing' | 'invalid';

export interface ProductRemoteRelayBootstrap {
  relayUrl: string;
  relayDomain: string;
  enrollmentKey?: string;
  enrollmentStatus: MachineEnrollmentStatus;
  /** Symbolic only: safe to log because it never contains a path, file content, or credential. */
  problems: string[];
}

const validEnrollmentKey = (value: unknown): value is string => (
  typeof value === 'string' && /^[\x21-\x7e]{16,512}$/.test(value)
);

/**
 * Private-beta machine provisioning seam.
 *
 * A trusted provisioner places `{ "version": 1, "enrollmentKey": "..." }` at
 * `<sidelineDir>/remote/beta-enrollment.json`. The file is outside the extension/VSIX,
 * has no browser/API/settings writer, and is consumed only by the daemon at startup.
 */
export function productRemoteRelayBootstrap(sidelineDir: string): ProductRemoteRelayBootstrap {
  const remoteDir = path.join(sidelineDir, 'remote');
  const credentialFile = path.join(sidelineDir, MACHINE_ENROLLMENT_RELATIVE_PATH);
  try {
    fs.mkdirSync(remoteDir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(remoteDir, 0o700); } catch { /* best effort on Windows */ }
    if (!fs.existsSync(credentialFile)) {
      return {
        relayUrl: PRODUCT_RELAY_URL,
        relayDomain: PRODUCT_RELAY_DOMAIN,
        enrollmentStatus: 'missing',
        problems: []
      };
    }

    const stat = fs.lstatSync(credentialFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4_096) throw new Error('invalid credential file');
    try { fs.chmodSync(credentialFile, 0o600); } catch { /* best effort on Windows */ }
    const parsed = JSON.parse(fs.readFileSync(credentialFile, 'utf8')) as { version?: unknown; enrollmentKey?: unknown };
    if (parsed.version !== 1 || !validEnrollmentKey(parsed.enrollmentKey)) throw new Error('invalid credential format');
    return {
      relayUrl: PRODUCT_RELAY_URL,
      relayDomain: PRODUCT_RELAY_DOMAIN,
      enrollmentKey: parsed.enrollmentKey,
      enrollmentStatus: 'available',
      problems: []
    };
  } catch {
    return {
      relayUrl: PRODUCT_RELAY_URL,
      relayDomain: PRODUCT_RELAY_DOMAIN,
      enrollmentStatus: 'invalid',
      problems: ['MACHINE_ENROLLMENT_CREDENTIAL']
    };
  }
}
