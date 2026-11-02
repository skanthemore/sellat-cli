# sellat-cli

[![tests](https://github.com/skanthemore/sellat-cli/actions/workflows/tests.yml/badge.svg)](https://github.com/skanthemore/sellat-cli/actions/workflows/tests.yml)

Proof of existence from your terminal. **Zero dependencies.**

```console
$ sellat stamp contract.pdf --qualified
sha256    9f3c2a…  (computed locally — the file was not uploaded)
id        6f2c9b1e-0d1a-4b9f-8e7c-2a4d5b6c7d8e
name      contract.pdf
state     queued
hash      9f3c2a…
bitcoin   pending
qualified issued · FNMT-RCM · 2026-09-15T10:12:05.000Z
cert      https://sellat.app/certificate/3b1d…

Accepted. Anchored in minutes — track it with: sellat watch 6f2c9b1e-0d1a-4b9f-8e7c-2a4d5b6c7d8e
```

`sellat-cli` talks to the [SELLAT](https://sellat.app) API v2, which is
**hash-only by design**: your file is hashed locally with SHA-256 and only
that fingerprint is submitted. The bytes never leave your machine — unless
you explicitly ask for custody with `--store`.

What you get for one hash:

- **Polygon** — the hash joins a Merkle batch anchored on Polygon within
  minutes. A thousand hashes share one transaction, so this costs nothing.
- **Bitcoin** — every batch root is attested through OpenTimestamps too.
- **A qualified eIDAS seal** (`--qualified`, or `sellat seal <id>`) — an
  RFC 3161 timestamp signed by **FNMT-RCM**, a qualified trust service
  provider on the EU trusted list. Under eIDAS art. 41.2 it carries the
  presumption of the accuracy of its date. This is the paid part: it spends
  a seal from your account (one welcome seal, then packs from
  [sellat.app/precios](https://sellat.app/precios)).
- **`proof.json`**, the certificate PDF and an evidence ZIP — all verifiable
  without SELLAT using [`sellat-verify`](https://github.com/skanthemore/sellat-verify).

The commands call the endpoints of the SELLAT API v2. Full reference:
<https://sellat.app/en/developers/docs> · OpenAPI 3.1:
<https://sellat.app/developers/openapi.json>

## Install

```console
$ npm install -g sellat-cli
$ export SELLAT_API_TOKEN=sellat_…   # create a key at https://sellat.app/dashboard#api-keys
```

Requires Node 18.11+. No other dependencies — the whole client is `fetch`
and `node:crypto`.

## Commands

```console
$ sellat stamp <file> [--name <name>] [--meta key=value]... [--qualified] [--store] [--wait]
$ sellat stamp --hash <sha256> [--name <name>] [--qualified]   # hash computed elsewhere
$ sellat status <id>                                         # state, anchors, seal, URLs
$ sellat watch <id> [--interval <seconds>]                   # poll until anchored
$ sellat seal <id>                                           # the FNMT-RCM qualified seal
$ sellat list [--limit <n>] [--cursor <c>]
$ sellat account                                             # seals left, custody, today's budget
$ sellat download <id> certificate|evidence|tsr|original [--out <path>] [--lang es|en|de|fr]
$ sellat original put <id> <file>                            # custody (this one sends the bytes)
$ sellat original delete <id>                                # end custody; the proof is untouched
```

- `--name` defaults to the file name; it is what the certificate and your
  dashboard show.
- `--meta` attaches small key=value metadata (4 KB, stored with the proof,
  never published).
- `--wait` keeps polling until the batch is anchored and then prints the
  `proof.json` URL.
- `--json` prints the API's answer as is, for scripts.
- `SELLAT_API_URL` overrides the API base URL (useful for staging).

Submitting the same file twice returns the proof that already exists. A
retry with the same `Idempotency-Key` (see the library) never creates a
second proof or spends a second seal.

## As an agent skill

`skills/sellat/` is an [Agent Skill](https://agentskills.io): it teaches an AI
agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot and other clients of
the open standard) when and how to create and verify Sellat proofs, with this
CLI or, without an account, paying per call over x402.

```console
$ npx skills add skanthemore/sellat-cli --skill sellat
```

## As a library

```js
import { createClient } from 'sellat-cli';

const sellat = createClient({ token: process.env.SELLAT_API_TOKEN });
const proof = await sellat.create({ hash, name: 'contract.pdf', qualified: true });
// later
const now = await sellat.get(proof.id);      // state, anchors, bitcoin, qualified, urls
const pdf = await sellat.certificate(proof.id, { lang: 'en' });   // { bytes, fileName }
```

## Sealing logs (the dogfood example)

[`examples/seal-log.sh`](examples/seal-log.sh) rotates a log file and stamps
each archived copy — the pattern sellat.app runs against its own web server
logs every hour, in production, since May 2026.

```console
# hourly cron
SELLAT_API_TOKEN=... ./seal-log.sh /var/log/nginx/access.log /var/log/nginx/archive
```

Each archived hour gets its own proof, and every batch root is anchored on
Polygon and attested on Bitcoin: altering or quietly removing one archived
file later leaves a hash that no longer matches any proof. The same pattern
fits CI artifacts, database exports, invoices, or anything else you produce
on a schedule and may need to prove later.

## What a stamp claims

A stamp proves that **these exact bytes existed no later than a moment in
time** — existence and integrity, not authorship or truth. The qualified
seal adds an EU-recognised attestation of that time. For the full claim
semantics and the portable proof format, see
[`sellat-verify`](https://github.com/skanthemore/sellat-verify).

## Upgrading from 0.1.x

0.1.x spoke the v1 endpoint (`/api/v1/stamp`), which is closed to keys
created from an account. 0.2 speaks v2: `--label` still works as an alias of
`--name`, `status` prints `state` instead of `status`, and the per-client
chain hash is gone — Merkle batching plus the Bitcoin attestation replace
it. Create a key from your dashboard; the old hand-made tokens do not work
on v2.

## About

Built by [SELLAT](https://sellat.app) — proof of existence for one file or a
million, on the same engine. MIT licensed. Issues and PRs welcome.
