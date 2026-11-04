---
name: sellat
description: Create independently verifiable proof that an exact file or record existed at a given time and has not changed since (proof of existence, timestamping, tamper-evident audit trail). Hashes locally with SHA-256 and sends only the hash; anchors it on Polygon and Bitcoin, with an optional eIDAS qualified timestamp. Use when the user wants to timestamp, notarize, seal or protect a file, contract, photo, dataset, release or log; when an agent must leave evidence of its own outputs, decisions or execution logs; or when checking a file against an existing Sellat proof. Works with a Sellat API key or, without an account, paying per call over x402 (USDC on Base).
license: MIT
compatibility: Requires Node.js 18.11+ and network access to sellat.app. The pay-per-call route also needs npm packages @x402/fetch, @x402/evm and viem, and a wallet with USDC on Base set up by the user.
metadata:
  author: sellat
  homepage: https://sellat.app/developers
  version: "1.0.0"
---

# Sellat: proof that exact data existed at a time

Sellat turns the SHA-256 of a file or record into a proof that anyone can
verify without trusting Sellat: the hash goes into a Merkle batch anchored on
Polygon within minutes and attested on Bitcoin (OpenTimestamps) hours later.
An optional qualified eIDAS timestamp (RFC 3161) can be added to a proof.

## What a proof shows, and what it does not

Say this accurately to the user; never overstate it.

- It shows that **these exact bytes existed no later than the anchored time**
  and **have not changed since**: one different byte and verification fails.
- It does **not** show who wrote the file, that an action described in a log
  really happened, that a record is complete, or that its content is true.
- It is not a notary act and does not by itself make anyone "compliant".
  With the qualified timestamp, EU law presumes the accuracy of the date and
  the integrity of the data (eIDAS art. 41.2); say no more than that.

## Ground rules

1. **The file stays local.** Only the 64-hex SHA-256 travels. Never upload the
   file unless the user explicitly asks for custody (`--store`).
2. **The qualified timestamp costs money.** Add it only when the user asks for
   it, or when the date must hold up before a third party and the user agrees.
3. **Never create, fund or move a wallet yourself.** The pay-per-call route
   uses a wallet the user set up for this purpose, with a spend cap.
4. Same bytes twice return the existing proof; it is not charged again.

## Route A: with a Sellat account (API key)

The user creates a key at https://sellat.app/keys and exports it as
`SELLAT_API_TOKEN`. Free accounts get a daily allowance of proofs; qualified
timestamps are bought on the account.

```bash
npx -y sellat-cli stamp ./contract.pdf --wait          # proof; prints the proof.json URL when anchored
npx -y sellat-cli stamp --hash <sha256> --name run-42  # hash computed elsewhere
npx -y sellat-cli status <id>                          # state, anchors, seal, URLs
npx -y sellat-cli seal <id>                            # qualified eIDAS timestamp (paid)
npx -y sellat-cli download <id> evidence --out ./      # ZIP: certificate, proof.json, .ots, how to verify
npx -y sellat-cli account                              # today's allowance, timestamps left
```

Add `--json` to any command for machine-readable output.

## Route B: no account, pay per call (x402)

For an agent with its own wallet: each call is paid in USDC on Base with the
x402 protocol. No sign-up, no API key. Current prices, networks and the terms
that a payment accepts are always at `GET https://sellat.app/api/v2/x402`;
read them there, do not assume them.

```bash
npm install --prefix scripts                 # once: @x402/fetch, @x402/evm, viem
export SELLAT_WALLET_KEY=0x…                  # set by the user, never printed or logged
node scripts/x402-stamp.mjs proof ./agent-run.jsonl --dry-run   # shows the offer, pays nothing
node scripts/x402-stamp.mjs proof ./agent-run.jsonl             # pays one proof
node scripts/x402-stamp.mjs seal <proof-id>                      # pays one qualified timestamp
```

The script hashes locally, reads the live price, refuses to pay above
`--max-usd` (defaults: 0.05 for a proof, 1.00 for a timestamp), and prints
the API's answer. The **first proof of a wallet returns a read-only API key
once**: keep it, then use Route A's read commands with it
(`SELLAT_API_TOKEN=<that key> npx -y sellat-cli status <id>`). A failed call
is not charged: the payment settles only after the work is done.

## Sealing an agent's own records

To leave evidence of what an agent produced or decided, seal the hash of the
record, not each step:

1. Write the run's log as you normally would (JSONL is fine), each entry
   carrying the SHA-256 of the previous one.
2. At the end of the task, or every N minutes, seal the hash of the last entry.
3. Keep the log and the proof together. Anyone can later recompute the chain
   and check the proof; altering, removing or reordering an earlier entry
   breaks it.

The log stays on your side; Sellat only sees the hash.

## Verifying a proof

Verification needs neither Sellat nor an account. See
[references/VERIFY.md](references/VERIFY.md) for the commands (browser,
`sellat-verify`, OpenSSL for the qualified timestamp, OpenTimestamps for
Bitcoin).

## Links

- Developers: https://sellat.app/developers
- API reference: https://sellat.app/en/developers/docs
- OpenAPI: https://sellat.app/developers/openapi.json
- Pay per call (x402) price list: https://sellat.app/api/v2/x402
- Verifier: https://github.com/skanthemore/sellat-verify
