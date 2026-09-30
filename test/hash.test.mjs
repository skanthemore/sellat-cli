import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileSize, labelFromFilename, mimeTypeFor, nameFromFilename, sha256File } from '../src/hash.mjs';

test('sha256File matches node:crypto over the same bytes', async () => {
  const file = path.join(tmpdir(), `sellat-cli-test-${process.pid}.bin`);
  const bytes = Buffer.from('some file contents\n');
  writeFileSync(file, bytes);
  try {
    assert.equal(await sha256File(file), createHash('sha256').update(bytes).digest('hex'));
    assert.equal(fileSize(file), bytes.length);
  } finally {
    rmSync(file, { force: true });
  }
});

test('nameFromFilename keeps the name people gave the file', () => {
  assert.equal(nameFromFilename('informe (final) €.pdf'), 'informe (final) €.pdf');
  assert.equal(nameFromFilename('ñandú.txt'), 'ñandú.txt');
  assert.equal(nameFromFilename(`bad${String.fromCharCode(0)}name`), 'badname');
  assert.ok(nameFromFilename('x'.repeat(300)).length <= 200);
  assert.equal(nameFromFilename('   '), 'file');
});

test('mimeTypeFor is a best effort from the extension', () => {
  assert.equal(mimeTypeFor('/tmp/a.PDF'), 'application/pdf');
  assert.equal(mimeTypeFor('archive.tar.gz'), 'application/gzip');
  assert.equal(mimeTypeFor('noext'), 'application/octet-stream');
});

test('labelFromFilename (0.1.x) still produces v1-safe labels', () => {
  assert.equal(labelFromFilename('access.log'), 'access.log');
  assert.match(labelFromFilename('ñandú.txt'), /^[a-zA-Z0-9]/);
});
