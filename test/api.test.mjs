import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, SellatApiError } from '../src/api.mjs';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

test('requires a token up front', () => {
  assert.throws(() => createClient({}), SellatApiError);
});

test('stamp posts the hash with the bearer token and returns the payload', async () => {
  const calls = [];
  const client = createClient({
    token: 'sellat_test-token',
    baseUrl: 'https://api.example/',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(
        { success: true, id: 'abc', status: 'pending', hash: 'f'.repeat(64), chainHash: 'c'.repeat(64) },
        { status: 202 }
      );
    },
  });

  const stamp = await client.stamp({ hash: 'f'.repeat(64), label: 'test' });
  assert.equal(stamp.id, 'abc');
  assert.equal(calls[0].url, 'https://api.example/api/v1/stamp');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sellat_test-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    hash: 'f'.repeat(64),
    label: 'test',
  });
});

test('401 becomes a clear invalid-token error', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: async () => jsonResponse({ success: false }, { status: 401 }),
  });
  await assert.rejects(client.status('x'), /Invalid or revoked/);
});

test('429 surfaces the retry-after value', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: async () =>
      jsonResponse({ success: false }, { status: 429, headers: { 'Retry-After': '42' } }),
  });
  await assert.rejects(client.stamp({ hash: 'f'.repeat(64), label: 'x' }), (error) => {
    assert.equal(error.retryAfterSeconds, 42);
    return true;
  });
});

test('API validation errors pass their message through', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: async () =>
      jsonResponse({ success: false, error: 'label is required' }, { status: 400 }),
  });
  await assert.rejects(client.stamp({ hash: 'f'.repeat(64) }), /label is required/);
});
