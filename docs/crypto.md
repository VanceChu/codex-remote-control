# Crypto Contract

This document is part of the implementation contract for Codex Remote Control. Code that changes
message authentication, encryption, pairing, replay protection, or revocation must update this file
and the crypto known-answer tests in the same change.

## Threat Model

The relay is treated as honest-but-curious for confidentiality. It may see room ids, device ids,
message sizes, timing, connection metadata, and failure rates. It must not see prompts, command
output, diffs, approval contents, or thread snapshots.

Browser E2EE does not protect against Cloudflare actively serving malicious JavaScript, because the
PWA bundle is hosted by the same platform as the relay. Stronger protection requires a signed native
wrapper or a locally verified bundle, which is out of scope for this MVP.

If a device is lost, OS storage protections and device screen lock are the first line of defense.
The second line is revocation from another trusted device. There is no server-side remote wipe or
hardware-backed recovery in this MVP.

## Identity Keys

Bridge and device identities use two independent key types:

- X25519 static key for Noise IK authentication.
- Ed25519 signing key for product envelopes.

The same key material must never be reused for both roles. If a future implementation derives both
keys from one master seed, it must use HKDF with separate `info` labels:

- `crc/noise-static/v1`
- `crc/envelope-sign/v1`

The pairing transcript binds both key families:

```text
roomId || bridgeNoisePub || bridgeSignPub || deviceNoisePub || deviceSignPub ||
nonceB || nonceD || keyId || epoch
```

The transcript proof uses an HMAC key derived from the pairing secret. Any missing or substituted
public key invalidates the proof.

## Pairing And Session Establishment

The target handshake is `Noise_IK_25519_ChaChaPoly_SHA256`, with the device as initiator and the
bridge as responder. The device pins the bridge static public key during pairing, and the bridge
pins each device static public key.

Implementation must first run a crypto spike:

1. Try `noise-protocol` in Node, Cloudflare Worker, and iOS/Android PWA contexts.
2. Verify bundle size, CSP compatibility, WASM or Buffer assumptions, and KAT output.
3. If the package is not portable enough, implement a narrow adapter with `@noble/curves`,
   `@noble/ciphers`, and `@noble/hashes`.
4. If neither path can pass KAT in all three runtimes, stop and revise the protocol.

Noise sessions are control-plane sessions. They authenticate pairing, reconnect, key update, and
revoke messages. Business payloads are encrypted with long-term per-device payload keys so ring
buffer replay works across reconnects.

### Phase 1 Noise Spike Result

The `noise-protocol` npm package was rejected for this MVP because its documented implementation is
limited to `Noise_*_25519_ChaChaPoly_BLAKE2b`, while this contract requires
`Noise_IK_25519_ChaChaPoly_SHA256`.

The active implementation is a narrow `@noble/*` adapter:

- `@noble/curves` for X25519.
- `@noble/ciphers` for Noise `ChaChaPoly`.
- `@noble/hashes` for SHA-256, HMAC, and HKDF.

The deterministic KAT fixture fixes initiator/responder static keypairs, initiator/responder
ephemeral keypairs, prologue, protocol name, and handshake payloads. KAT inputs live in
`packages/protocol/src/noise-kat.fixture.ts`; Node, Worker, and browser tests import the same
fixture. Production handshakes must use CSPRNG-generated ephemeral keys.

Noise `ChaChaPoly` is the Noise spec cipher suite and uses a 96-bit nonce formed from 32 zero bits
plus the 64-bit little-endian Noise nonce. This is intentionally separate from business payload
XChaCha20-Poly1305, which remains defined in the payload-key section below.

The Phase 1 control-plane KAT only proves opaque byte encryption/decryption and associated-data
binding over the split Noise transport state. It does not define Stage 3 business message schemas
such as payload-key issue, revoke, or epoch rotate.

The Phase 1 export label is:

```text
crc/noise-ik/export/control-plane/v1
```

## Payload Keys

Each paired device has two payload keys:

- `uplinkKey`: device encrypts product commands for bridge.
- `downlinkKey`: bridge encrypts events, approvals, status, snapshots, and terminal results for
  that device.

Both keys are 32 bytes. Each key has one random 16 byte nonce prefix. The prefix is public and
stored with the key metadata, but it is bound to exactly one key. Rotating a key always rotates its
prefix.

Pairing creates the payload keys. The bridge generates them and sends them to the device over the
authenticated Noise channel. Both sides persist the relevant keys:

- bridge: device registry under local config.
- PWA: IndexedDB, preferably as `CryptoKey` objects with `extractable=false`.

When a library requires raw symmetric keys, the PWA must wrap them with a non-extractable WebCrypto
KEK before storing them. Raw key bytes may exist only in memory while the app is running.

## Envelope Signing

Every product envelope is signed before encryption:

- device signs product commands with its Ed25519 signing key.
- bridge signs events, approval requests, status messages, and snapshots with the bridge Ed25519
  signing key.

The signing input is RFC 8785 canonical JSON. The signature is inside the encrypted payload,
so the relay cannot inspect or alter it. Receivers reject valid ciphertext with an invalid signature.

## AEAD, Nonce, And Replay Protection

Business payload encryption uses XChaCha20-Poly1305.

Nonce format:

```text
24 bytes = 16 byte key-bound nonce prefix || 8 byte big-endian sendSeq
```

Each payload key has its own `sendSeq`. `senderId` is `deviceId`, not `tabId`. Multiple tabs from
the same device share a counter through IndexedDB and `navigator.locks`.

Both PWA and bridge must use atomic write-ahead sequence reservation. A process reserves a range
before using any value in that range, and the reservation backend must perform read-modify-write in
one critical section. The PWA backend uses a single IndexedDB `readwrite` transaction and Web Locks
when available; the bridge backend serializes reservations with an in-process per-key mutex before
fsyncing the updated file. After a crash, unused values in the reserved range are skipped. If a
process cannot prove a nonce was not reused, it must rotate the affected key and prefix before
sending more messages.

AEAD AAD contains:

```text
roomId, epoch, senderId, direction, senderSeq, msgId, chunkIdx, totalChunks, kind
```

The relay may drop or delay messages, but it cannot alter sequence-bound metadata without causing
decryption failure.

## Chunking And Ring Buffers

Each chunk is independently encrypted and authenticated. A chunk AAD includes `msgId`, `chunkIdx`,
and `totalChunks`; receivers reject incomplete or duplicated chunk sets.

Durable Object storage is per-device fanout. Limits:

- Per-device buffer: `2000 messages`, `24h`, or `10MB`, whichever is hit first.
- Per-room aggregate cap: `50MB`.
- Eviction is atomic by `msgId`; all chunks for one message are kept or removed together.

The relay stores ciphertext, minimal routing metadata, sizes, timestamps, and relay sequence
numbers. It does not decrypt payloads and cannot generate summaries. Summaries and snapshots are
created by the bridge and encrypted as normal downlink messages.

To control Cloudflare Free usage, token-level stream deltas are online-only. The persisted buffer
stores coalesced timeline items, approvals, terminal events, and snapshots.

## Revocation

Revoking a device has three effects:

1. The relay closes that device's active sockets and rejects future reconnects.
2. The bridge deletes the device payload keys and stops generating downlink fanout for it.
3. The relay deletes that device's ring buffer.

Revocation gives future secrecy. It does not delete plaintext already decrypted by the device.

Offline trusted devices that were not revoked reconnect through Noise, receive the current key
epoch and a fresh encrypted thread snapshot, and then continue from the new state.

## Unsupported Codex Server Requests

Until explicit support is implemented and tested, unsupported server requests are fail-closed:

- `item/permissions/requestApproval`: interrupt current turn and reply with a JSON-RPC error to
  prevent app-server from hanging.
- `item/tool/requestUserInput`: JSON-RPC error and UI hint that this prompt requires local handling.
- `mcpServer/elicitation/request`: return `cancel`.
- `item/tool/call`, `account/chatgptAuthTokens/refresh`, `applyPatchApproval`, `execCommandApproval`:
  JSON-RPC error, safe failure, and local-handling UI hint.

Permissions approval must not be treated as supported until the deny semantics are proven against a
real `codex app-server`.
