import * as path from 'node:path';

const METADATA_LABELS = new Set([
  'agent', 'player', 'worker', 'implementation agent', 'target player', 'target agent',
  'assigned agent', 'executor', 'route to', 'send to', 'model', 'target model',
  'model to use', 'effort', 'reasoning', 'reasoning effort', 'thinking',
  'thinking effort', 'thinking / effort', 'thinking / reasoning effort',
  'reasoning level', 'thinking level', 'role', 'task difficulty', 'thread',
  'repository', 'branch', 'environment', 'routing', 'routing / context', 'context'
]);

const CONTAINER_HEADINGS = new Set([
  'agent assignment', 'assignment', 'routing', 'routing / context', 'context',
  'repository', 'branch', 'environment', 'thread', 'play', 'task', 'mission',
  'implementation', 'implement', 'your task', 'the play'
]);

const VALUE_HEADINGS = new Set(['repository', 'branch', 'environment', 'thread']);

const undecorate = (value: string): string => value
  .replace(/^#{1,6}\s*/, '')
  .replace(/^(?:[-+*]|\d+[.)])\s+/, '')
  .replace(/[*_`~]/g, '')
  .trim();

const shorten = (value: string): string => value.length > 80 ? `${value.slice(0, 79)}…` : value;

/**
 * A compact, human-facing reminder for one Play.
 *
 * Exact report context is authoritative and wins. Otherwise the first useful task
 * line is selected after deterministic removal of Sideline routing/front matter.
 * This is intentionally not a semantic or model-powered summarizer.
 */
export function summarizePlayContext(prompt: string, knownArtifactPath?: string): string {
  const artifact = knownArtifactPath?.trim();
  if (artifact) {
    const filename = path.win32.basename(artifact.replace(/\//g, '\\')).trim();
    if (filename) return shorten(filename);
  }

  let skipNextValue = false;
  let inFence = false;
  for (const rawLine of String(prompt || '').split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (/^```|^~~~/.test(trimmed)) { inFence = !inFence; continue; }
    if (inFence || !trimmed) continue;
    if (skipNextValue) { skipNextValue = false; continue; }

    const line = undecorate(trimmed);
    if (!line) continue;
    const field = line.match(/^([^:]{1,48})\s*:\s*(.*)$/);
    if (field) {
      const label = field[1].replace(/\s+/g, ' ').trim().toLowerCase();
      if (METADATA_LABELS.has(label)) {
        if (!field[2].trim() && VALUE_HEADINGS.has(label)) skipNextValue = true;
        continue;
      }
      if (/^(?:implement|implementation|play|task|mission)$/.test(label) && !field[2].trim()) continue;
    }

    const heading = line.replace(/[:.]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (CONTAINER_HEADINGS.has(heading)) {
      if (VALUE_HEADINGS.has(heading)) skipNextValue = true;
      continue;
    }
    return shorten(line);
  }
  return '';
}
