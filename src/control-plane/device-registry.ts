import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { timingSafeSecretEqual } from './request-security';

export const DEVICE_IDLE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LABEL_LENGTH = 60;

export interface DeviceRecord {
  deviceId: string;
  tokenHash: string;
  label: string;
  createdAt: number;
  lastSeenAt: number;
}

export type DeviceSummary = Omit<DeviceRecord, 'tokenHash'>;

const sha256Hex = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

export function sanitizeDeviceLabel(label: unknown, fallback = 'Phone'): string {
  const cleaned = typeof label === 'string' ? label.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_LABEL_LENGTH) : '';
  return cleaned || fallback;
}

/**
 * Paired-device credentials. Only the SHA-256 of each 256-bit device token is persisted;
 * the raw token is returned once from createDevice() so the caller can set the cookie.
 * A missing or unreadable devices.json yields an empty registry (fail-safe: no credential
 * is honoured), and the next persisted change replaces it.
 */
export class DeviceRegistry {
  private devices: DeviceRecord[] = [];

  constructor(private readonly file: string, private readonly now: () => number = Date.now) {
    this.devices = this.load();
  }

  createDevice(label?: string): { deviceId: string; rawToken: string } {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const at = this.now();
    const record: DeviceRecord = {
      deviceId: crypto.randomBytes(16).toString('hex'),
      tokenHash: sha256Hex(rawToken),
      label: sanitizeDeviceLabel(label),
      createdAt: at,
      lastSeenAt: at
    };
    this.devices.push(record);
    this.persist();
    return { deviceId: record.deviceId, rawToken };
  }

  /** Returns the device on success and slides lastSeenAt; expired devices are removed. */
  authenticate(rawToken: unknown): DeviceSummary | undefined {
    if (typeof rawToken !== 'string' || !rawToken) return undefined;
    const candidateHash = sha256Hex(rawToken);
    let match: DeviceRecord | undefined;
    for (const record of this.devices) {
      if (timingSafeSecretEqual(candidateHash, record.tokenHash)) match = record;
    }
    if (!match) return undefined;
    const at = this.now();
    if (at - match.lastSeenAt > DEVICE_IDLE_EXPIRY_MS) {
      this.devices = this.devices.filter((record) => record !== match);
      this.persist();
      return undefined;
    }
    match.lastSeenAt = at;
    this.persist();
    return this.summary(match);
  }

  list(): DeviceSummary[] {
    return this.devices.map((record) => this.summary(record));
  }

  rename(deviceId: string, label: unknown): DeviceSummary | undefined {
    const record = this.devices.find((candidate) => candidate.deviceId === deviceId);
    if (!record) return undefined;
    record.label = sanitizeDeviceLabel(label, record.label);
    this.persist();
    return this.summary(record);
  }

  revoke(deviceId: string): boolean {
    const before = this.devices.length;
    this.devices = this.devices.filter((record) => record.deviceId !== deviceId);
    if (this.devices.length === before) return false;
    this.persist();
    return true;
  }

  revokeAll(): number {
    const count = this.devices.length;
    this.devices = [];
    this.persist();
    return count;
  }

  private summary(record: DeviceRecord): DeviceSummary {
    return { deviceId: record.deviceId, label: record.label, createdAt: record.createdAt, lastSeenAt: record.lastSeenAt };
  }

  private load(): DeviceRecord[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { devices?: unknown };
      if (!Array.isArray(parsed.devices)) return [];
      return parsed.devices.flatMap((entry): DeviceRecord[] => {
        const item = entry as Partial<DeviceRecord>;
        if (typeof item?.deviceId === 'string' && typeof item.tokenHash === 'string' && typeof item.label === 'string'
          && typeof item.createdAt === 'number' && typeof item.lastSeenAt === 'number') {
          return [{ deviceId: item.deviceId, tokenHash: item.tokenHash, label: item.label, createdAt: item.createdAt, lastSeenAt: item.lastSeenAt }];
        }
        return [];
      });
    } catch {
      return [];
    }
  }

  /** Temp file + rename (replaces atomically on POSIX and Windows); 0o600 is best-effort on Windows. */
  private persist(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, devices: this.devices }, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(tmp, this.file);
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* renamed or already gone */ }
    }
  }
}
