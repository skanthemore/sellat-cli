# Verifying a Sellat proof without Sellat

A proof is checked by recomputing the hash, walking its Merkle path up to the
batch root, and finding that root in a public blockchain transaction. None of
it needs Sellat to be online.

## In the browser

https://sellat.app/verify checks a file against its proof locally; the file
is not uploaded.

## With the open-source verifier

```bash
curl -o proof.json https://sellat.app/api/v2/proof/<proof-id>.json   # public, no key
npx -y sellat-verify ./the-file proof.json
```

`sellat-verify` recomputes the SHA-256, the Merkle path and the root, and
reads the Polygon transaction from a public node.

## The qualified eIDAS timestamp

The evidence ZIP (`sellat-cli download <id> evidence`) contains the `.tsr`
token and the certificate of the authority that signed it:

```bash
openssl ts -verify -in <token>.tsr -data ./the-file -CAfile <authority>.pem -partial_chain
```

## The Bitcoin attestation

The ZIP also contains the OpenTimestamps `.ots` file of the batch root (the
root is in `proof.json` under `merkle.root`):

```bash
ots verify -d "$(jq -r .merkle.root proof.json)" <anchor>.ots
ots --no-bitcoin verify -d "$(jq -r .merkle.root proof.json)" <anchor>.ots   # without a node: names the block to check
```

## What to tell the user

Verification proves the bytes existed no later than the anchored time and
are unchanged. It says nothing about who created them or whether their
content is true.
