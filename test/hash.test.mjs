import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { labelFromFilename, sha256File } from '../src/hash.mjs';

test('sha256File matches node:crypto over the same bytes', async () => {
  const file = path.join(tmpdir(), `sellat-cli-test-${process.pid}.bin`);
  const bytes = Buffer.from('some file contents\n');
  writeFileSync(file, bytes);
  try {
    assert.equal(await sha256File(file), createHash('sha256').update(bytes).digest('hex'));
  } finally {
    rmSync(file, { force: true });
  }
});

test('labelFromFilename produces API-safe labels', () => {
  assert.equal(labelFromFilename('access.log'), 'access.log');
  assert.equal(labelFromFilename('informe (final) €.pdf'), 'informe -final- -.pdf');
  assert.match(labelFromFilename('ñandú.txt'), /^[a-zA-Z0-9]/);
  assert.ok(labelFromFilename('x'.repeat(300)).length <= 200);
});
