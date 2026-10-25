import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import type http from 'node:http';
import { MAX_BATCH_SIZE, parseQueryParams, validateEvent, validatePayload } from './validation.js';
import { parseBody } from './server.js';

const valid = {
  correlationId: 'corr-1',
  integration: 'github',
  eventType: 'push',
  timestamp: 1_700_000_000_000,
};

test('accepts and preserves a valid event', () => {
  assert.deepEqual(validateEvent(valid), { ...valid, provider: undefined, metadata: undefined, traceId: undefined, spanId: undefined });
});

test('rejects empty and oversized batches', () => {
  assert.throws(() => validatePayload([]), /must not be empty/);
  assert.throws(() => validatePayload(Array(MAX_BATCH_SIZE + 1).fill(valid)), /exceeds 100/);
});

test('rejects unsafe identifiers', () => {
  assert.throws(() => validateEvent({ ...valid, correlationId: '' }), /correlationId/);
  assert.throws(() => validateEvent({ ...valid, integration: 'bad\nname' }), /integration/);
  assert.throws(() => validateEvent({ ...valid, eventType: 'x'.repeat(101) }), /eventType/);
});

test('rejects unsafe timestamps', () => {
  assert.throws(() => validateEvent({ ...valid, timestamp: Infinity }), /timestamp/);
  assert.throws(() => validateEvent({ ...valid, timestamp: 1.5 }), /timestamp/);
  assert.throws(() => validateEvent({ ...valid, timestamp: -1 }), /timestamp/);
});

test('bounds structured metadata', () => {
  assert.throws(() => validateEvent({ ...valid, metadata: [] }), /metadata/);
  assert.throws(() => validateEvent({ ...valid, metadata: { value: 'x'.repeat(17_000) } }), /metadata exceeds/);
});

function request(body: string, contentType = 'application/json'): http.IncomingMessage {
  return Object.assign(Readable.from([body]), { headers: { 'content-type': contentType } }) as unknown as http.IncomingMessage;
}

test('rejects invalid content types and JSON', async () => {
  await assert.rejects(parseBody(request('{}', 'text/plain')), /Content-Type/);
  await assert.rejects(parseBody(request('{')), /valid JSON/);
  await assert.rejects(parseBody(request('')), /must not be empty/);
});

test('rejects oversized request bodies', async () => {
  await assert.rejects(parseBody(request(JSON.stringify({ value: 'x'.repeat(70_000) }))), /exceeds 65536/);
});

test('parses bounded exact query values', () => {
  assert.deepEqual(parseQueryParams('/query?integration=github&from=10&to=20&limit=50&offset=0'), {
    integration: 'github', from: 10, to: 20, limit: 50, offset: 0,
  });
});

for (const [name, target] of [
  ['partial integer', '/query?limit=10junk'],
  ['negative offset', '/query?offset=-1'],
  ['excessive limit', '/query?limit=1001'],
  ['reversed range', '/query?from=20&to=10'],
  ['empty selector', '/query?integration='],
] as const) {
  test(`rejects ${name}`, () => assert.throws(() => parseQueryParams(target), HttpErrorPattern));
}

const HttpErrorPattern = /must|between/;
