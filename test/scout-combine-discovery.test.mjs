/**
 * Scout Combine V0.3 — live prospect discovery.
 *
 * No real network or process calls: fetch and the OpenCode CLI are both
 * injected fakes, so these tests prove the NORMALIZATION and FAILURE-ISOLATION
 * contract, not any provider's current catalog (which changes constantly —
 * that is the entire point of this module).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  discoverCombineProspects,
  discoverOpenCodeHostedProspects,
  discoverOpenRouterFreeProspects,
  parseOpenCodeVerboseModels
} from '../out/scout-combine-discovery.js';

function fakeOpenRouterResponse(models) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => ({ data: models }) };
}

test('Combine-Discovery-1. OpenRouter: only :free-suffixed, zero-priced, tool-capable, text-output models become prospects', async () => {
  const models = [
    { id: 'poolside/laguna-s-2.1:free', name: 'Poolside: Laguna S 2.1 (free)', context_length: 262144, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools', 'temperature'], architecture: { output_modalities: ['text'] } },
    { id: 'some/paid-model', name: 'Paid', pricing: { prompt: '0.002', completion: '0.002' }, supported_parameters: ['tools'], architecture: { output_modalities: ['text'] } },
    { id: 'some/no-tools:free', name: 'No Tools', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'], architecture: { output_modalities: ['text'] } },
    { id: 'some/image-only:free', name: 'Image Only', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], architecture: { output_modalities: ['image'] } },
    { id: 'openrouter/free', name: 'Free Models Router', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], architecture: { output_modalities: ['text'] } }
  ];
  const fetchImpl = async () => fakeOpenRouterResponse(models);
  const result = await discoverOpenRouterFreeProspects({ fetchImpl });
  assert.equal(result.available, true);
  assert.equal(result.prospects.length, 1, 'only the :free, priced-zero, tool-capable, text-output model qualifies');
  const prospect = result.prospects[0];
  assert.equal(prospect.model, 'openrouter/poolside/laguna-s-2.1:free');
  assert.equal(prospect.provider, 'openrouter');
  assert.equal(prospect.advertisedFree, true);
  assert.match(prospect.candidateId, /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/, 'candidateId is filename-safe');
  assert.equal(prospect.contextLength, 262144);
});

test('Combine-Discovery-2. OpenRouter source unavailability (network failure) is factual, not a thrown error, and never blocks discovery', async () => {
  const fetchImpl = async () => { throw new Error('getaddrinfo ENOTFOUND openrouter.ai'); };
  const result = await discoverOpenRouterFreeProspects({ fetchImpl });
  assert.equal(result.available, false);
  assert.equal(result.prospects.length, 0);
  assert.match(result.error, /ENOTFOUND/);
});

test('Combine-Discovery-3. OpenRouter non-200 response is reported, not thrown', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) });
  const result = await discoverOpenRouterFreeProspects({ fetchImpl });
  assert.equal(result.available, false);
  assert.match(result.error, /503/);
});

test('Combine-Discovery-4. OpenCode verbose model-block parser: header + JSON blocks, malformed block never poisons the rest', () => {
  const stdout = [
    'opencode/big-pickle',
    '{',
    '  "id": "big-pickle",',
    '  "providerID": "opencode",',
    '  "name": "Big Pickle",',
    '  "cost": { "input": 0, "output": 0 },',
    '  "limit": { "context": 200000 },',
    '  "capabilities": { "toolcall": true, "output": { "text": true } }',
    '}',
    'opencode/broken',
    '{ not valid json',
    'opencode/paid-model',
    '{',
    '  "id": "paid-model",',
    '  "providerID": "opencode",',
    '  "name": "Paid Model",',
    '  "cost": { "input": 0.5, "output": 0.5 },',
    '  "limit": { "context": 8000 },',
    '  "capabilities": { "toolcall": true, "output": { "text": true } }',
    '}'
  ].join('\n');
  const parsed = parseOpenCodeVerboseModels(stdout);
  assert.equal(parsed.length, 2, 'the malformed block is skipped, not fatal');
  assert.equal(parsed[0].id, 'big-pickle');
  assert.equal(parsed[1].id, 'paid-model');
});

test('Combine-Discovery-5. OpenCode hosted source: only zero-cost, tool-capable, text-output models become prospects', async () => {
  const stdout = [
    'opencode/big-pickle',
    '{ "id": "big-pickle", "providerID": "opencode", "name": "Big Pickle", "cost": { "input": 0, "output": 0 }, "limit": { "context": 200000 }, "capabilities": { "toolcall": true, "output": { "text": true } } }',
    'opencode/paid-model',
    '{ "id": "paid-model", "providerID": "opencode", "name": "Paid", "cost": { "input": 1, "output": 1 }, "limit": { "context": 8000 }, "capabilities": { "toolcall": true, "output": { "text": true } } }',
    'opencode/no-tools-free',
    '{ "id": "no-tools-free", "providerID": "opencode", "name": "No Tools", "cost": { "input": 0, "output": 0 }, "limit": { "context": 8000 }, "capabilities": { "toolcall": false, "output": { "text": true } } }'
  ].join('\n');
  const run = async () => ({ code: 0, stdout, stderr: '' });
  const result = await discoverOpenCodeHostedProspects({ run });
  assert.equal(result.available, true);
  assert.equal(result.prospects.length, 1);
  assert.equal(result.prospects[0].model, 'opencode/big-pickle');
  assert.equal(result.prospects[0].provider, 'opencode-hosted');
});

test('Combine-Discovery-6. OpenCode CLI unavailability (non-zero exit, missing executable) is factual, not thrown', async () => {
  const run = async () => ({ code: 1, stdout: '', stderr: 'Error: Unexpected error\nDatabase is not empty and has no session table\n' });
  const result = await discoverOpenCodeHostedProspects({ run });
  assert.equal(result.available, false);
  assert.equal(result.prospects.length, 0);
  assert.match(result.error, /Unexpected error/);
});

test('Combine-Discovery-7. Merged discovery: one source failing never blocks the other, and results are deduped by candidateId', async () => {
  const openRouterModels = [
    { id: 'poolside/laguna-s-2.1:free', name: 'Laguna', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], architecture: { output_modalities: ['text'] } }
  ];
  const report = await discoverCombineProspects({
    openRouter: { fetchImpl: async () => fakeOpenRouterResponse(openRouterModels) },
    openCode: { run: async () => ({ code: 1, stdout: '', stderr: 'Database is not empty and has no session table' }) }
  });
  const sourceById = Object.fromEntries(report.sources.map((source) => [source.id, source]));
  assert.equal(sourceById.openrouter.available, true);
  assert.equal(sourceById.openrouter.count, 1);
  assert.equal(sourceById['opencode-hosted'].available, false);
  assert.equal(report.prospects.length, 1, 'the unavailable source contributes zero prospects, not a crash');
});

test('Combine-Discovery-8. Discovery reflects whatever the source returns right now — no hardcoded roster fallback', async () => {
  const exotic = [{ id: 'brand-new-vendor/exotic-model-v9:free', name: 'Exotic', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], architecture: { output_modalities: ['text'] } }];
  const result = await discoverOpenRouterFreeProspects({ fetchImpl: async () => fakeOpenRouterResponse(exotic) });
  assert.equal(result.prospects.length, 1);
  assert.equal(result.prospects[0].model, 'openrouter/brand-new-vendor/exotic-model-v9:free', 'a prospect never seen in any prior roster is still discovered and normalized');
});
