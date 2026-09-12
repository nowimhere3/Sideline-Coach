import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as child_process from 'node:child_process';
import type { ControlPlaneDiscoveryRecord } from './protocol';

export type { ControlPlaneDiscoveryRecord };

export interface LauncherOptions {
  dir?: string;
  daemonScriptPath?: string;
  requestedPort?: number;
  timeoutMs?: number;
  idleTimeoutMs?: number;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function checkHealth(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: timeoutMs }, (res) => {
      if (res.statusCode === 200) {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { status?: string };
            resolve(parsed.status === 'ok');
          } catch {
            resolve(false);
          }
        });
      } else {
        resolve(false);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });
  });
}

export async function ensureControlPlaneRunning(options: LauncherOptions = {}): Promise<ControlPlaneDiscoveryRecord> {
  const dir = options.dir ?? process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const discoveryPath = path.join(dir, 'control-plane.json');
  const lockPath = path.join(dir, 'control-plane.lock');
  const timeoutMs = options.timeoutMs ?? 6000;
  const startTime = Date.now();

  // 1. Check existing discovery record
  if (fs.existsSync(discoveryPath)) {
    try {
      const content = fs.readFileSync(discoveryPath, 'utf8');
      const record = JSON.parse(content) as ControlPlaneDiscoveryRecord;
      if (record && record.pid && record.port) {
        if (isProcessAlive(record.pid) && (await checkHealth(record.port))) {
          return record;
        }
      }
      // Dead PID or failed health -> stale record
      fs.unlinkSync(discoveryPath);
    } catch {
      // Malformed record
      try {
        fs.unlinkSync(discoveryPath);
      } catch {}
    }
  }

  // 2. Acquire lock to spawn
  while (Date.now() - startTime < timeoutMs) {
    let lockFd: number | undefined;
    try {
      lockFd = fs.openSync(lockPath, 'wx');
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'EEXIST') {
        // Check if lock is stale (> 8 seconds old)
        try {
          const stats = fs.statSync(lockPath);
          if (Date.now() - stats.mtimeMs > 8000) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch {}

        // Wait for winner to start daemon
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (fs.existsSync(discoveryPath)) {
          try {
            const content = fs.readFileSync(discoveryPath, 'utf8');
            const record = JSON.parse(content) as ControlPlaneDiscoveryRecord;
            if (record && record.port && (await checkHealth(record.port))) {
              return record;
            }
          } catch {}
        }
        continue;
      }
      throw err;
    }

    // Lock acquired
    try {
      // Re-verify in case another process just finished writing discovery record
      if (fs.existsSync(discoveryPath)) {
        try {
          const record = JSON.parse(fs.readFileSync(discoveryPath, 'utf8')) as ControlPlaneDiscoveryRecord;
          if (record && record.port && (await checkHealth(record.port))) {
            return record;
          }
        } catch {}
      }

      // Spawn daemon
      const daemonScript =
        options.daemonScriptPath ??
        path.resolve(__dirname, 'daemon.js');

      const logDir = path.join(dir, 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, 'control-plane.log');
      const logFd = fs.openSync(logFile, 'a');

      const spawnArgs = [daemonScript];
      if (options.requestedPort) {
        spawnArgs.push('--port', String(options.requestedPort));
      }
      if (options.dir) {
        spawnArgs.push('--dir', options.dir);
      }
      if (options.idleTimeoutMs) {
        spawnArgs.push('--idle-timeout-ms', String(options.idleTimeoutMs));
      }

      const child = child_process.spawn(process.execPath, spawnArgs, {
        detached: true,
        windowsHide: true,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1'
        }
      });

      fs.closeSync(logFd);
      child.unref();

      // Wait for discovery record and health check
      const spawnWaitStart = Date.now();
      while (Date.now() - spawnWaitStart < 5000) {
        if (fs.existsSync(discoveryPath)) {
          try {
            const content = fs.readFileSync(discoveryPath, 'utf8');
            const record = JSON.parse(content) as ControlPlaneDiscoveryRecord;
            if (record && record.port && (await checkHealth(record.port))) {
              return record;
            }
          } catch {}
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      throw new Error('Spawned Control Plane daemon did not write a valid discovery record in time.');
    } finally {
      if (lockFd !== undefined) {
        try {
          fs.closeSync(lockFd);
        } catch {}
      }
      try {
        fs.unlinkSync(lockPath);
      } catch {}
    }
  }

  throw new Error(`Timed out waiting for Control Plane daemon to start after ${timeoutMs}ms.`);
}
