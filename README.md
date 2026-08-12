# sellat-cli

[![tests](https://github.com/skanthemore/sellat-cli/actions/workflows/tests.yml/badge.svg)](https://github.com/skanthemore/sellat-cli/actions/workflows/tests.yml)

Proof of existence from your terminal. **Zero dependencies.**

```console
$ sellat stamp contract.pdf
sha256  9f3c2a…  (computed locally — the file was not uploaded)
id      209c1757-8358-421a-9443-0020e891339c
status  pending
hash    9f3c2a…
chain   872c1c…

Accepted. Track it with: sellat watch 209c1757-8358-421a-9443-0020e891339c
```

`sellat-cli` talks to the [SELLAT](https://sellat.app) proof API, which is
**hash-only by design**: your file is hashed locally with SHA-256 and only
that fingerprint is submitted. The bytes never leave your machine.

Once anchored, the proof is independently verifiable against the public
blockchain — without trusting SELLAT — using
[`sellat-verify`](https://github.com/skanthemore/sellat-verify).

## Install

```console
$ npm install -g sellat-cli
$ export SELLAT_API_TOKEN=...   # get one at https://sellat.app/developers
```

Requires Node 18.11+. No other dependencies — the whole client is `fetch`
and `node:crypto`.

## Commands

```console
$ sellat stamp <file> [--label <label>] [--meta key=value]...
$ sellat stamp --hash <sha256> --label <label>     # hash computed elsewhere
$ sellat status <id>
$ sellat watch <id> [--interval <seconds>]         # poll until anchored
```

- `--label` defaults to the file name. Labels group stamps (`log/access.2026-08-10`).
- `--meta` attaches small key=value metadata (4 KB limit, stored with the stamp).
- `SELLAT_API_URL` overrides the API base URL (useful for staging).

## Chained stamps

Every stamp is linked to your previous stamp through a chained hash:

```
chainHash = SHA-256(chain-domain : client : label : hash : previousChainHash)
```

A sequence of stamps therefore forms an append-only chain — if one archived
file in a stamped series is later altered or quietly removed, the chain no
longer adds up. This is what makes periodic sealing (logs, backups, exports)
stronger than isolated timestamps.

## Sealing logs (the dogfood example)

[`examples/seal-log.sh`](examples/seal-log.sh) rotates a log file and stamps
each archived copy — the exact pattern sellat.app runs against its own web
server logs every hour, in production, since May 2026.

```console
# hourly cron
SELLAT_API_TOKEN=... ./seal-log.sh /var/log/nginx/access.log /var/log/nginx/archive
```

The same pattern fits CI artifacts, database exports, invoices, or anything
else you produce on a schedule and may need to prove later.

## What a stamp claims

A stamp proves that **these exact bytes existed no later than a moment in
time** — existence and integrity, not authorship or truth. For the full
claim semantics and the portable proof format, see
[`sellat-verify`](https://github.com/skanthemore/sellat-verify).

## About

Built by [SELLAT](https://sellat.app) — proof of existence for one file or a
million, on the same engine. MIT licensed. Issues and PRs welcome.
