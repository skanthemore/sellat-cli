#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { createClient, isAnchored, isFailed, SellatApiError } from '../src/api.mjs';
import { fileSize, mimeTypeFor, nameFromFilename, sha256File } from '../src/hash.mjs';

const HELP = `sellat — proof of existence from your terminal (https://sellat.app)

Usage:
  sellat stamp <file> [--name <name>] [--meta key=value]... [--qualified] [--store] [--wait]
  sellat stamp --hash <sha256> [--name <name>] [--meta key=value]... [--qualified]
  sellat status <id>                      the proof as it stands now
  sellat watch <id> [--interval <s>]      poll until the batch is anchored
  sellat seal <id>                        add the FNMT-RCM qualified seal (eIDAS)
  sellat list [--limit <n>] [--cursor <c>]
  sellat account                          seals left, custody, today's budget
  sellat download <id> <certificate|evidence|tsr|original> [--out <path>] [--lang <es|en|de|fr>]
  sellat original put <id> <file>         keep the original in custody (sends the bytes)
  sellat original delete <id>             end custody; the proof is untouched

The file is hashed locally; only its SHA-256 leaves your machine. The one
exception is "--store" / "original put", which you ask for explicitly.

Add --json to any command to get the API's answer as is.

Configuration:
  SELLAT_API_TOKEN   API key (or --token). Create one: https://sellat.app/dashboard#api-keys
  SELLAT_API_URL     API base URL (default: https://sellat.app)
`;

const { values, positionals } = parseArgs({
  options: {
    name: { type: 'string' },
    label: { type: 'string' }, // 0.1.x spelling of --name
    hash: { type: 'string' },
    meta: { type: 'string', multiple: true },
    token: { type: 'string' },
    interval: { type: 'string' },
    limit: { type: 'string' },
    cursor: { type: 'string' },
    out: { type: 'string' },
    lang: { type: 'string' },
    qualified: { type: 'boolean' },
    store: { type: 'boolean' },
    wait: { type: 'boolean' },
    help: { type: 'boolean' },
    json: { type: 'boolean' },
  },
  allowPositionals: true,
});

const [command, ...args] = positionals;

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

const short = (hash) => (hash ? `${hash.slice(0, 10)}…` : '');

function printProof(proof) {
  if (values.json) {
    console.log(JSON.stringify(proof, null, 2));
    return;
  }
  console.log(`id        ${proof.id}`);
  if (proof.name) console.log(`name      ${proof.name}`);
  console.log(`state     ${proof.state}`);
  console.log(`hash      ${proof.hash}`);
  for (const a of proof.anchors ?? []) {
    console.log(`polygon   ${a.network} block ${a.block_number ?? '…'} · ${a.block_timestamp ?? ''}`);
    if (a.explorer_url) console.log(`          ${a.explorer_url}`);
  }
  if (proof.bitcoin) {
    console.log(
      `bitcoin   ${proof.bitcoin.state}${proof.bitcoin.block_height ? ` · block ${proof.bitcoin.block_height}` : ''}`
    );
  }
  if (proof.qualified) {
    const q = proof.qualified;
    console.log(`qualified ${q.state}${q.authority ? ` · ${q.authority} · ${q.time}` : ''}`);
  }
  if (proof.original) {
    console.log(`original  in custody (${proof.original.size_bytes} bytes)`);
  }
  if (proof.urls) {
    if (isAnchored(proof)) console.log(`proof     ${proof.urls.proof_json}`);
    if (proof.urls.certificate) console.log(`cert      ${proof.urls.certificate}`);
  }
  if (proof.limitations?.length) {
    console.log(`note      ${proof.limitations.join(', ')}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function watch(client, id) {
  const intervalMs = Math.max(5, Number(values.interval ?? 30)) * 1000;
  for (;;) {
    const proof = await client.get(id);
    if (isAnchored(proof) || isFailed(proof)) {
      printProof(proof);
      process.exit(isFailed(proof) ? 1 : 0);
    }
    console.log(`state     ${proof.state} — waiting…`);
    await sleep(intervalMs);
  }
}

function save(result, fallbackName) {
  const out = values.out ?? result.fileName ?? fallbackName;
  writeFileSync(out, result.bytes);
  console.log(`saved     ${out} (${result.bytes.length} bytes)`);
}

try {
  if (command === 'stamp') {
    const client = makeClient();
    const [target] = args;
    let hash = values.hash?.toLowerCase();
    let name = values.name ?? values.label;
    let size;
    let mimeType;

    if (!hash) {
      if (!target) {
        fail('stamp needs a <file> or --hash <sha256>. See: sellat --help');
      }
      hash = await sha256File(target);
      name ??= nameFromFilename(basename(target));
      size = fileSize(target);
      mimeType = mimeTypeFor(target);
      if (!values.json) console.log(`sha256    ${hash}  (computed locally — the file was not uploaded)`);
    } else if (values.store) {
      fail('--store needs the <file> itself, not --hash.');
    }

    const proof = await client.create({
      hash,
      name,
      size,
      mimeType,
      metadata: parseMetadata(values.meta),
      qualified: values.qualified,
    });
    printProof(proof);
    if (proof.created === false && !values.json) {
      console.log('\nAlready protected — this is the existing proof.');
    }

    if (values.store) {
      const stored = await client.putOriginal(proof.id, readFileSync(target), { contentType: mimeType });
      if (!values.json) console.log(`original  in custody (${stored.original?.size_bytes ?? size} bytes)`);
    }

    if (values.wait) {
      if (!values.json) console.log('');
      await watch(client, proof.id);
    } else if (!isAnchored(proof) && !values.json) {
      console.log(`\nAccepted. Anchored in minutes — track it with: sellat watch ${proof.id}`);
    }
  } else if (command === 'status' || command === 'get') {
    const [id] = args;
    if (!id) fail(`${command} needs a proof id.`);
    printProof(await makeClient().get(id));
  } else if (command === 'watch') {
    const [id] = args;
    if (!id) fail('watch needs a proof id.');
    await watch(makeClient(), id);
  } else if (command === 'seal') {
    const [id] = args;
    if (!id) fail('seal needs a proof id.');
    const result = await makeClient().seal(id);
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.qualified?.state === 'issued') {
      const q = result.qualified;
      console.log(`qualified issued · ${q.authority} · ${q.time}${result.created === false ? ' (already sealed)' : ''}`);
      console.log(`serial    ${q.serial_number}`);
      console.log(`tsr       ${q.tsr_url}`);
      console.log(`seals     ${result.seals_remaining} left on the account`);
    } else {
      console.log(`qualified ${result.qualified?.state ?? 'pending'} — ${result.message ?? 'run "sellat seal" again in a moment.'}`);
    }
  } else if (command === 'list') {
    const page = await makeClient().list({ limit: values.limit, cursor: values.cursor });
    if (values.json) {
      console.log(JSON.stringify(page, null, 2));
    } else {
      for (const p of page.data) {
        console.log(`${p.id}  ${p.state.padEnd(9)}  ${short(p.hash)}  ${p.qualified ? 'sealed  ' : '        '}${p.name ?? ''}`);
      }
      if (page.next_cursor) console.log(`\nmore: sellat list --cursor ${page.next_cursor}`);
    }
  } else if (command === 'account') {
    const a = await makeClient().account();
    if (values.json) {
      console.log(JSON.stringify(a, null, 2));
    } else {
      console.log(`plan      ${a.plan}`);
      console.log(`seals     ${a.seals.remaining} left (${a.seals.welcome_remaining} welcome + ${a.seals.pack_remaining} pack) · buy: ${a.seals.buy_url}`);
      console.log(`custody   ${a.custody.available ? `${a.custody.used_bytes} of ${a.custody.max_account_bytes} bytes used` : 'not available'}`);
      console.log(`proofs    ${a.proofs.used_today} of ${a.proofs.daily_limit} today`);
    }
  } else if (command === 'download') {
    const [id, what] = args;
    if (!id || !what) fail('download needs <id> and one of: certificate, evidence, tsr, original.');
    const client = makeClient();
    const lang = values.lang ?? 'en';
    if (what === 'certificate') save(await client.certificate(id, { lang }), `sellat-${id}.pdf`);
    else if (what === 'evidence') save(await client.evidence(id, { lang }), `sellat-${id}-evidence.zip`);
    else if (what === 'tsr') save(await client.tsr(id), `sellat-${id}.tsr`);
    else if (what === 'original') save(await client.getOriginal(id), `sellat-${id}-original`);
    else fail(`unknown download "${what}". Use: certificate, evidence, tsr, original.`);
  } else if (command === 'original') {
    const [action, id, file] = args;
    const client = makeClient();
    if (action === 'put') {
      if (!id || !file) fail('original put needs <id> and <file>.');
      printProof(await client.putOriginal(id, readFileSync(file), { contentType: mimeTypeFor(file) }));
    } else if (action === 'get') {
      if (!id) fail('original get needs <id>.');
      save(await client.getOriginal(id), `sellat-${id}-original`);
    } else if (action === 'delete') {
      if (!id) fail('original delete needs <id>.');
      const result = await client.deleteOriginal(id);
      console.log(`custody ended${result.purged ? '' : ' (deletion queued)'} — the proof is untouched.`);
    } else {
      fail('original needs: put <id> <file> | get <id> | delete <id>.');
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
