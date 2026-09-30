import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, isAnchored, SellatApiError } from '../src/api.mjs';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

test('requires a token up front', () => {
  assert.throws(() => createClient({}), SellatApiError);
});

test('create posts the hash to v2 with the bearer token and returns the proof', async () => {
  const calls = [];
  const client = createClient({
    token: 'sellat_test-token',
    baseUrl: 'https://api.example/',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: 'abc', created: true, state: 'queued', hash: 'f'.repeat(64) }, { status: 201 });
    },
  });

  const proof = await client.create({ hash: 'f'.repeat(64), name: 'a.txt', qualified: true, idempotencyKey: 'job-1' });
  assert.equal(proof.id, 'abc');
  assert.equal(calls[0].url, 'https://api.example/api/v2/proofs');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sellat_test-token');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'job-1');
  assert.deepEqual(JSON.parse(calls[0].options.body), { hash: 'f'.repeat(64), name: 'a.txt', qualified: true });
});

test('the file never travels: create sends JSON only, and put original is the explicit exception', async () => {
  const calls = [];
  const client = createClient({
    token: 't',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: 'abc', original: { stored: true } }, { status: 201 });
    },
  });
  await client.create({ hash: 'f'.repeat(64) });
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  await client.putOriginal('abc', Buffer.from('bytes'), { contentType: 'text/plain' });
  assert.equal(calls[1].url, 'https://sellat.app/api/v2/proofs/abc/original');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers['Content-Type'], 'text/plain');
});

test('401 becomes a clear invalid-token error', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: async () => jsonResponse({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 }),
  });
  await assert.rejects(client.get('x'), /Invalid or revoked/);
});

test('402 says how many seals are left and where to buy', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: async () =>
      jsonResponse(
        { error: { code: 'payment_required', message: 'No qualified seals left.', seals_remaining: 0, buy_url: 'https://sellat.app/precios' } },
        { status: 402 }
      ),
  });
  await assert.rejects(client.seal('abc'), (error) => {
    assert.equal(error.code, 'payment_required');
    assert.match(error.message, /seals remaining: 0/);
    assert.match(error.message, /sellat\.app\/precios/);
    return true;
  });
});

test('429 surfaces the retry-after value', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: async () =>
      jsonResponse({ error: { code: 'quota_exceeded', message: 'Daily limit reached' } }, { status: 429, headers: { 'Retry-After': '42' } }),
  });
  await assert.rejects(client.create({ hash: 'f'.repeat(64) }), (error) => {
    assert.equal(error.retryAfterSeconds, 42);
    assert.equal(error.code, 'quota_exceeded');
    return true;
  });
});

test('validation errors pass their message and code through', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: async () =>
      jsonResponse({ error: { code: 'invalid_request', message: 'hash must be the SHA-256 of the file' } }, { status: 400 }),
  });
  await assert.rejects(client.create({ hash: 'nope' }), (error) => {
    assert.equal(error.code, 'invalid_request');
    assert.match(error.message, /SHA-256/);
    return true;
  });
});

test('binary downloads return bytes and the server file name', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: async () =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="certificado-abc.pdf"' },
      }),
  });
  const result = await client.certificate('abc', { lang: 'es' });
  assert.equal(result.contentType, 'application/pdf');
  assert.equal(result.fileName, 'certificado-abc.pdf');
  assert.equal(result.bytes.length, 4);
});

test('isAnchored reads the lifecycle', () => {
  assert.equal(isAnchored({ state: 'queued' }), false);
  assert.equal(isAnchored({ state: 'anchored' }), true);
  assert.equal(isAnchored({ state: 'confirmed' }), true);
});
