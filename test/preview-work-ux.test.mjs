import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/public/index.html', import.meta.url), 'utf8');
const previewSource = source.slice(source.indexOf('// --- R12 Browser Preview'), source.indexOf("$('promptInput')?.addEventListener"));

test('S57.43B-1: Preview Work synchronously opens a separate Sideline viewer tab', () => {
  assert.match(previewSource, /const viewerUrl = new URL\(window\.location\.href\)/);
  assert.match(previewSource, /viewerUrl\.searchParams\.set\('previewWork', gameId\)/);
  assert.match(previewSource, /window\.open\(viewerUrl\.href, '_blank'\)/);
  assert.match(previewSource, /tab\.opener = null/);
  const openPreview = previewSource.slice(previewSource.indexOf('const openPreview ='), previewSource.indexOf('const syncPreview ='));
  assert.match(openPreview, /launchPreviewWork\(currentGameId\)/);
  assert.doesNotMatch(openPreview, /preview\.open|previewBackdrop|loadPreview/, 'Tab 1 does not open or cover itself with Preview');
});

test('S57.43B-2: Preview viewer embeds the Game; raw Game opens only through the explicit link', () => {
  assert.equal((previewSource.match(/window\.open\(/g) || []).length, 1, 'Preview Work creates only the Sideline viewer tab');
  assert.doesNotMatch(previewSource, /window\.open\([^\n]*endpoint\.clientUrl|location\.replace\(endpoint\.clientUrl\)/);
  assert.match(previewSource, /if \(previewViewerGameId\)[\s\S]*openEmbeddedPreview\(previewViewerGameId\)/);
  assert.match(previewSource, /\$\('previewFrame'\)\.src = remote \? endpoint\.remote\.frameUrl : previewFrameUrl\(endpoint\)/);
  assert.match(source, /id="previewOpenTab"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(previewSource, /openTab\.href = endpoint\.clientUrl/);
});

test('S57.43B-3: actual stage and iframe own the remaining viewer height', () => {
  const sheetRule = source.match(/\.preview-sheet\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.match(sheetRule, /height:\s*calc\(100dvh - 28px\)/);
  assert.match(sheetRule, /max-height:\s*calc\(100dvh - 28px\)/);
  assert.match(sheetRule, /display:\s*flex/);
  assert.match(sheetRule, /flex-direction:\s*column/);
  const stageRule = source.match(/\.preview-stage\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.match(stageRule, /flex:\s*1 1 0/);
  assert.match(stageRule, /height:\s*0/);
  assert.match(source, /\.preview-device\.fill\s*\{\s*width:\s*100%;\s*height:\s*100%/);
  assert.match(source, /\.preview-device iframe\s*\{[^}]*width:\s*100%;\s*height:\s*100%/);
  assert.match(previewSource, /stage\.clientHeight - 24/, 'responsive presets scale against the useful stage height');
});

test('S57.43B-4: responsive and multi-page inspection controls remain intact', () => {
  for (const preset of ['desktop', 'tablet', 'phone']) assert.match(source, new RegExp(`data-preview-preset="${preset}"`));
  assert.match(source, /id="previewRotateBtn"/);
  assert.match(source, /id="previewPageSelect"/);
  assert.match(source, /id="previewOpenTab"[^>]*target="_blank"/);
  assert.match(previewSource, /renderPreviewEndpoint\(\{ \.\.\.canonical, clientUrl: page\.clientUrl \}\)/);
});
