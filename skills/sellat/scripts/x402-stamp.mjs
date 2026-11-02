#!/usr/bin/env node
/**
 * Pay Sellat per call with x402 (USDC on Base): no account, no API key.
 *
 *   node x402-stamp.mjs proof <file> [--name <name>] [--max-usd <n>] [--dry-run]
 *   node x402-stamp.mjs proof --hash <sha256> [--name <name>] [--max-usd <n>] [--dry-run]
 *   node x402-stamp.mjs seal <proof-id> [--max-usd <n>] [--dry-run]
 *
 * SELLAT_WALLET_KEY  private key (0x…) of a wallet the user funded for this
 *                    purpose. Read from the environment, never printed.
 * SELLAT_API_URL     another Sellat environment (default https://sellat.app).
 *
 * The file is hashed here; only its SHA-256 is sent. The live price comes
 * from GET /api/v2/x402 and the script refuses to pay above --max-usd.
 * --dry-run builds and signs nothing that is sent: it stops at the offer.
 * Paying accepts Sellat's terms, whose URL and version are in the offer.
 */
import { createHash, webcrypto } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';

// Node 18 has Web Crypto but does not expose it globally; the x402 client needs it.
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const API = (process.env.SELLAT_API_URL ?? 'https://sellat.app').replace(/\/+$/, '');
const DEFAULT_MAX = { proof: 0.05, seal: 1.0 };

function fail(message) {
  console.error(`x402-stamp: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { positional: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--name') options.name = rest[++i];
    else if (arg === '--hash') options.hash = rest[++i];
    else if (arg === '--max-usd') options.maxUsd = Number(rest[++i]);
    else options.positional.push(arg);
  }
  return { command, options };
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('end', resolve).on('error', reject);
  });
  return hash.digest('hex');
}

async function livePrice(url) {
  const res = await fetch(`${API}/api/v2/x402`);
  if (!res.ok) fail(`could not read the price list (${res.status}).`);
  const list = await res.json();
  if (!list.open) fail('pay-per-call is closed on this Sellat environment.');
  const resource = list.resources.find((r) => r.method === 'POST' && r.url === url);
  if (!resource) fail(`no price listed for ${url}.`);
  return { usd: Number(resource.price_usd), terms: list.terms_acceptance };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  let url;
  let body;
  if (command === 'proof') {
    const file = options.positional[0];
    const hash = options.hash ?? (file ? await sha256File(file) : null);
    if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) fail('give a file or --hash <64 hex characters>.');
    url = `${API}/api/v2/proofs`;
    body = { hash: hash.toLowerCase(), ...(options.name || file ? { name: options.name ?? basename(file) } : {}) };
  } else if (command === 'seal') {
    const id = options.positional[0];
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) fail('give the proof id (a UUID).');
    url = `${API}/api/v2/proofs/${id}/qualified`;
  } else {
    fail('usage: x402-stamp.mjs proof <file>|--hash <sha256> [--name n] | seal <proof-id>   [--max-usd n] [--dry-run]');
  }

  const listedUrl = command === 'seal' ? `${API}/api/v2/proofs/{id}/qualified` : url;
  const price = await livePrice(listedUrl);
  const max = Number.isFinite(options.maxUsd) ? options.maxUsd : DEFAULT_MAX[command];
  if (price.usd > max) fail(`the live price is ${price.usd} USD, above --max-usd ${max}. Nothing paid.`);

  const key = process.env.SELLAT_WALLET_KEY;
  if (!options.dryRun && !/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) {
    fail('SELLAT_WALLET_KEY is missing or malformed (0x + 64 hex). Nothing paid.');
  }

  const { x402Client, wrapFetchWithPayment } = await import('@x402/fetch').catch(() =>
    fail('install the dependencies first: npm install --prefix <this scripts folder>')
  );
  const { ExactEvmScheme } = await import('@x402/evm/exact/client');
  const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts');

  // A dry run signs with a throwaway key and stops before anything is sent.
  const account = privateKeyToAccount(options.dryRun ? generatePrivateKey() : key);
  let offer = null;
  const guardedFetch = async (input, init = {}) => {
    const request = new Request(input, init);
    const signature = request.headers.get('PAYMENT-SIGNATURE') ?? request.headers.get('X-PAYMENT');
    if (signature && options.dryRun) {
      offer = JSON.parse(Buffer.from(signature, 'base64').toString('utf8'));
      return new Response(null, { status: 299 });
    }
    return fetch(request);
  };

  const client = new x402Client();
  client.setSpendControls({ maxAmountPerPayment: `$${max}` });
  client.register('eip155:8453', new ExactEvmScheme(account));
  const pay = wrapFetchWithPayment(guardedFetch, client);

  const res = await pay(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (options.dryRun) {
    if (!offer) fail(`no payment offer came back (HTTP ${res.status}).`);
    console.log(JSON.stringify({
      dry_run: true,
      would_pay_usd: price.usd,
      network: offer.accepted?.network,
      pay_to: offer.accepted?.payTo,
      amount_atomic: offer.accepted?.amount,
      terms: price.terms,
      request: { url, body: body ?? null },
    }, null, 2));
    return;
  }

  const text = await res.text();
  let answer;
  try { answer = JSON.parse(text); } catch { answer = { raw: text }; }
  if (!res.ok) {
    console.error(JSON.stringify({ status: res.status, ...answer }, null, 2));
    process.exit(1);
  }
  if (answer.api_key) {
    console.error('Keep the api_key below: it is shown once and reads this wallet\'s proofs for free.');
  }
  console.log(JSON.stringify(answer, null, 2));
}

main().catch((error) => fail(error?.message ?? String(error)));
