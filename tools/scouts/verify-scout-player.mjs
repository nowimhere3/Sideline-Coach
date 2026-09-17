import path from 'node:path';
import process from 'node:process';
import { verifyScoutPlayer } from '../../out/scout-player-verification.js';

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const player = valueAfter('--player');
if (!player) throw new Error('Use --player antigravity.');

const root = path.resolve(import.meta.dirname, '..', '..');
const verification = await verifyScoutPlayer({
  player,
  gameRoot: 'C:\\Users\\dmcal\\Documents\\GitHub\\Trend and Tap Assist',
  durableReportRoot: path.join(root, 'REPORTS', 'Scout Only')
});

const value = (text) => text ?? 'UNKNOWN';
process.stdout.write(`PLAYER: ${verification.player}\n`);
process.stdout.write(`STATE: ${verification.state}\n`);
process.stdout.write(`MODEL: ${value(verification.model)}\n`);
process.stdout.write(`EFFORT: ${value(verification.effort)}\n`);
process.stdout.write(`SCOUT AUTHORITY: ${verification.scoutAuthority}\n`);
process.stdout.write(`REAL GAME READ: ${verification.realGameRead}\n`);
process.stdout.write(`LAST RECEPTION: ${verification.lastReception}\n`);
if (verification.reason) process.stdout.write(`REASON: ${verification.reason}\n`);
if (verification.nextAction) process.stdout.write(`NEXT ACTION: ${verification.nextAction}\n`);
process.stdout.write(`EVIDENCE: ${verification.evidencePath}\n`);
process.exitCode = verification.state === 'READY' ? 0 : verification.state === 'NEEDS ATTENTION' ? 1 : 2;
