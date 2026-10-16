# Private username discovery — research prototype

This is executable research, isolated from NULLIS's financial UI. It is NOT a reviewed protocol, not a private-name service ready for deployment, and not a token receiving system. No directory is exposed publicly or deployed onchain. All HTTP listeners bind to loopback and close after each run. All identities in tests/demos are synthetic.

## Run

From this directory, with Node 22+:

```
npm ci --ignore-scripts
node --test prototype.test.mjs
node demo.mjs
```

Dependency versions and integrity hashes are pinned in package-lock.json. The prototype uses @cloudflare/voprf-ts 1.0.0 for RFC 9497 verifiable oblivious PRF operations, not handwritten curve arithmetic. Upstream describes experimental code and cautions against production use; using the library does not give this composition a security proof or audit.

## Implemented flow

1. The client normalizes the name and blinds a domain-separated input independently for each of two P384-SHA384 VOPRF services. The client pins their distinct public keys and verifies evaluation proofs. The wire contains serialized blinded group elements rather than the input name.
2. The client combines the two results under separate hash domains to produce a deterministic registry tag and a record encryption key. This two-output composition is a research proposal, not a threshold-VOPRF implementation or a formally reviewed protocol.
3. Independent Ed25519 ownership and X25519 demonstration receiving keys are generated locally. Neither key is an Ethereum wallet key. No external wallet address enters this flow.
4. Registration sends the tag, an ownership public key and an AES-256-GCM encrypted receiving descriptor. A single-use, expiring registry challenge binds domain, operation, tag, ownership key and encrypted record. An Ed25519 signature authorizes registration. The in-memory registry rejects duplicate canonical tags atomically within its single process.
5. Lookup repeats blinded derivation, downloads the ENTIRE directory snapshot, selects the tag locally, verifies the record ownership signature, and decrypts the descriptor locally. The registry receives GET /snapshot, never a targeted username/tag lookup request. The OPRF services still receive queries and traffic metadata.
6. Recovery exports the independent private keys in a passphrase-protected scrypt/AES-256-GCM envelope. No backup is automatically written to disk. Recovery tests reconstruct the same public keys and reject tampering and wrong passphrases.

http.mjs exposes two OPRF services and a registry service for the end-to-end test and demo. There is deliberately no /lookup?username endpoint, no browser CORS access, no funding endpoint, and no persistent production service.

## What the prototype demonstrates

- Stable canonical tags despite randomized blinding.
- Correct two-user recipient resolution and case-insensitive duplicate rejection.
- Ownership authorization, challenge expiry/replay rejection, and detection of modified signatures/proofs/records.
- Identical registry request shape for different recipient lookups.
- Encrypted recovery of ownership and demonstration receiving keys.

These are functional properties. A test that checks a log contains no name is NOT a cryptographic privacy proof.

## Demonstrated privacy failures — production deployment prohibited

**Collusion:** both OPRF operators together can evaluate guessed names directly and identify their tags. An attack test intentionally recovers the synthetic registered name. Putting both services under NULLIS administration would invalidate the intended separation even if hosted in different regions.

**Online enumeration:** an ordinary client can ask both services about a small dictionary, download the snapshot and discover registered short names. An attack test intentionally succeeds. The toy global quota bounds request count; it does not solve enumeration or Sybil resistance. Even one oracle operator can participate as a client of the other service. A non-collusion assumption alone is insufficient.

**Metadata and lookup size:** servers see request times, connections and operation counts. The registry learns record tags, ownership public keys, registration volume and update timing. Full snapshot retrieval hides the selected row from the registry but exposes directory size and scales linearly in bandwidth. Traffic correlation remains unresolved.

**Registry integrity:** signatures prevent forged contents but not deletion/omission, rollback, selective snapshots, front-running a stolen signed registration, or selective denial of service. Authenticated snapshots/key transparency and a consistent historical state are missing. The protocol does not prove a submitted random tag corresponds to a valid canonical name, allowing junk-record spam.

**Key pinning and persistence:** the local harness obtains oracle keys from the factories; production needs a reviewed authenticated pinning/rotation ceremony and independently operated services. Restarting demo services rotates keys and loses all state. Durable keys, backup, rotation, database uniqueness transactions across processes and disaster recovery are not implemented.

**Recovery and rotation:** key backup/recovery is implemented. Ownership rotation, revocation, name release, transfer, lost-key adjudication, and shielded protocol recipient descriptors are not implemented. An X25519 demo key is not a private token address.

## Next decision from evidence

Do not connect this prototype to the app as globally private usernames and do not deploy it as satisfying the user's requirement. Short human-readable names plus unrestricted discoverability permit guessing. Achieving stronger privacy needs a reviewed discovery/registration construction, an explicit bounded adversary/abuse model, and independent review. A secret invitation/high-entropy suffix could change the product's discoverability assumptions, but the user has not authorized that substitution.

Candidate investigation paths include private information retrieval for scalable lookup (does not solve name guessing or registration by itself), enclave-based private registration with explicit hardware/attestation trust, or reviewed multi-party computation with genuinely independent operators and an abuse-resistant query authorization design. None is implemented or claimed secure here.

## References

- https://github.com/cloudflare/voprf-ts (including its Security Disclaimer)
- https://www.rfc-editor.org/rfc/rfc9497
- https://www.microsoft.com/en-us/research/publication/private-information-retrieval/
- https://signal.org/blog/private-contact-discovery/
