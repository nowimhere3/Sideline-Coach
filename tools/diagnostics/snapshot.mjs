import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPreflight } from './collect-preflight.mjs';
import { renderSnapshot } from './render-snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshot = collectPreflight({ root });
const markdown = renderSnapshot(snapshot);
const output = path.join(root, 'Diagnostics', 'local', 'CURRENT.md');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, markdown, 'utf8');
process.stdout.write(markdown);
