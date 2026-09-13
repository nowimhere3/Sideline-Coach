#!/usr/bin/env node
/**
 * DEVELOPMENT GUARD — asks the live detached Control Plane whether the
 * multi-Game bridge is actually up, instead of inferring it from windows the
 * human can see.
 *
 * This is deliberately a live-runtime check, not a Node integration test. The
 * Node tests already prove the registry can hold two Stadium sessions; what
 * they cannot prove is that two real VS Code Extension Development Hosts exist
 * and connected. This closes exactly that gap and nothing more.
 *
 * Usage:
 *   node tools/dev/verify-multi-game.mjs            # require 2 connected Games
 *   node tools/dev/verify-multi-game.mjs --expect=1
 *   node tools/dev/verify-multi-game.mjs --timeout=90000
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

function sidelineDir() {
  return process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
}

/** Read the detached daemon's discovery record. Absent record => daemon not running. */
export function readDiscoveryRecord(dir = sidelineDir()) {
  const discoveryPath = path.join(dir, 'control-plane.json');
  if (!fs.existsSync(discoveryPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
  } catch {
    return undefined;
  }
}

export function readToken(dir = sidelineDir()) {
  const tokenPath = path.join(dir, 'token');
  try {
    return fs.readFileSync(tokenPath, 'utf8').trim();
  } catch {
    return '';
  }
}

function getJson(port, route, token, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${port}${route}`,
      { timeout: timeoutMs, headers: token ? { Authorization: `Bearer ${token}` } : {} },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(undefined);
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(undefined);
    });
    req.on('error', () => resolve(undefined));
  });
}

/**
 * Snapshot what the Control Plane currently believes.
 * `connectedGames` counts distinct gameIds, so two windows on the SAME Game
 * (which the registry correctly reports as `conflicted`) never masquerade as
 * a passing two-Game proof.
 */
export async function readMultiGameSnapshot() {
  const record = readDiscoveryRecord();
  if (!record?.port) {
    return { daemonRunning: false, sessions: [], games: [], connectedGames: [], conflictedGames: [] };
  }

  const token = readToken();
  const [diagnostics, gamesResponse] = await Promise.all([
    getJson(record.port, '/api/diagnostics', token),
    getJson(record.port, '/api/games', token)
  ]);

  const sessions = Array.isArray(diagnostics?.sessions) ? diagnostics.sessions : [];
  const games = Array.isArray(gamesResponse?.games) ? gamesResponse.games : [];

  return {
    daemonRunning: true,
    port: record.port,
    pid: record.pid,
    sessions,
    games,
    connectedGames: games.filter((g) => g.connectionStatus === 'connected'),
    conflictedGames: games.filter((g) => g.connectionStatus === 'conflicted')
  };
}

/** Poll until `expected` distinct Games are Connected, or the deadline passes. */
export async function waitForConnectedGames({ expected = 2, timeoutMs = 60_000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = await readMultiGameSnapshot();

  while (snapshot.connectedGames.length < expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    snapshot = await readMultiGameSnapshot();
  }

  return { ...snapshot, expected, satisfied: snapshot.connectedGames.length >= expected };
}

export function describeGames(snapshot) {
  if (!snapshot.daemonRunning) {
    return 'Control Plane daemon is not running (no ~/.sideline/control-plane.json).';
  }

  const lines = [
    `Control Plane :${snapshot.port} (pid ${snapshot.pid})`,
    `Stadium sessions: ${snapshot.sessions.length}`
  ];

  for (const session of snapshot.sessions) {
    lines.push(
      `  · ${session.instanceId}\n      game=${session.gameId ?? '(unbound)'} socketOpen=${session.socketOpen} rosterSynchronized=${session.rosterSynchronized}`
    );
  }

  lines.push(`Games: ${snapshot.games.length}`);
  for (const game of snapshot.games) {
    const marker = game.connectionStatus === 'connected' ? '✓' : game.connectionStatus === 'conflicted' ? '!' : '·';
    lines.push(`  ${marker} ${game.displayName} [${game.gameId}] ${game.connectionStatus}`);
  }

  if (snapshot.conflictedGames.length > 0) {
    lines.push('');
    lines.push('CONFLICTED: the same Game is open in more than one live Stadium window.');
    lines.push('Exact routing is intentionally blocked for those Games.');
  }

  if (snapshot.expected !== undefined) {
    lines.push('');
    lines.push(
      snapshot.satisfied
        ? `PASS: ${snapshot.connectedGames.length} Game(s) Connected (expected ${snapshot.expected}).`
        : `FAIL: ${snapshot.connectedGames.length} Game(s) Connected, expected ${snapshot.expected}.`
    );
  }

  return lines.join('\n');
}

async function main() {
  let expected = 2;
  let timeoutMs = 60_000;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--expect=')) expected = Number(arg.slice('--expect='.length));
    else if (arg.startsWith('--timeout=')) timeoutMs = Number(arg.slice('--timeout='.length));
  }

  const result = await waitForConnectedGames({ expected, timeoutMs });
  console.log(describeGames(result));
  process.exit(result.satisfied ? 0 : 1);
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  void main();
}
