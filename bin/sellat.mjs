#!/usr/bin/env node
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { createClient, SellatApiError } from '../src/api.mjs';
import { labelFromFilename, sha256File } from '../src/hash.mjs';

const HELP = `sellat — proof of existence from your terminal (https://sellat.app)

Usage:
  sellat stamp <file> [--label <label>] [--meta key=value]...
  sellat stamp --hash <sha256> --label <label> [--meta key=value]...
  sellat status <id>
  sellat watch <id> [--interval <seconds>]

The file is hashed locally; only its SHA-256 leaves your machine.

Configuration:
  SELLAT_API_TOKEN   API bearer token (or --token). Get one: sellat.app/developers
  SELLAT_API_URL     API base URL (default: https://sellat.app)
`;

const { values, positionals } = parseArgs({
  options: {
    label: { type: 'string' },
    hash: { type: 'string' },
    meta: { type: 'string', multiple: true },
    token: { type: 'string' },
    interval: { type: 'string' },
    help: { type: 'boolean' },
  },
  allowPositionals: true,
});

const [command, target] = positionals;

if (values.help || !command) {
  console.log(HELP);
  process.exit(command ? 0 : 2);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function makeClient() {
  try {
    return createClient({
      token: values.token ?? process.env.SELLAT_API_TOKEN,
      baseUrl: process.env.SELLAT_API_URL ?? 'https://sellat.app',
    });
  } catch (error) {
    fail(error.message);
  }
}

function parseMetadata(entries = []) {
  const metadata = {};
  for (const entry of entries) {
    const eq = entry.indexOf('=');
    if (eq < 1) {
      fail(`--meta expects key=value, got "${entry}"`);
    }
    metadata[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return metadata;
}

function printStamp(stamp) {
  console.log(`id      ${stamp.id}`);
  console.log(`status  ${stamp.status}`);
  console.log(`hash    ${stamp.hash}`);
  if (stamp.chainHash) {
    console.log(`chain   ${stamp.chainHash}`);
  }
  if (stamp.blockchain?.txHash) {
    console.log(`tx      ${stamp.blockchain.txHash} (${stamp.blockchain.network})`);
    if (stamp.blockchain.explorerUrl) {
      console.log(`explorer ${stamp.blockchain.explorerUrl}`);
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  if (command === 'stamp') {
    let hash = values.hash?.toLowerCase();
    let label = values.label;

    if (!hash) {
      if (!target) {
        fail('stamp needs a <file> or --hash <sha256>. See: sellat --help');
      }
      hash = await sha256File(target);
      label ??= labelFromFilename(basename(target));
      console.log(`sha256  ${hash}  (computed locally — the file was not uploaded)`);
    } else if (!label) {
      fail('--label is required when stamping a raw --hash.');
    }

    const stamp = await makeClient().stamp({ hash, label, metadata: parseMetadata(values.meta) });
    printStamp(stamp);
    console.log(`\nAccepted. Track it with: sellat watch ${stamp.id}`);
  } else if (command === 'status') {
    if (!target) fail('status needs a stamp id.');
    printStamp(await makeClient().status(target));
  } else if (command === 'watch') {
    if (!target) fail('watch needs a stamp id.');
    const client = makeClient();
    const intervalMs = Math.max(5, Number(values.interval ?? 20)) * 1000;
    for (;;) {
      const stamp = await client.status(target);
      if (stamp.status !== 'pending' && stamp.status !== 'processing') {
        printStamp(stamp);
        process.exit(stamp.status === 'registered' ? 0 : 1);
      }
      console.log(`status  ${stamp.status} — waiting…`);
      await sleep(intervalMs);
    }
  } else {
    fail(`unknown command "${command}". See: sellat --help`);
  }
} catch (error) {
  if (error instanceof SellatApiError) {
    fail(error.message);
  }
  throw error;
}
