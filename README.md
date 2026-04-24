# Codex Remote Control

Personal MVP for controlling a local headless Codex session from a phone PWA through a Cloudflare
Free relay.

This repository is intentionally scoped for one user and one development machine. The bridge keeps
Codex credentials local and connects outbound to the relay. The relay routes encrypted messages and
does not receive OpenAI/Codex credentials.

## Current Status

Implemented in this slice:

- npm workspaces monorepo with TypeScript, Vitest, Wrangler, and Vite.
- `docs/crypto.md` with the v5 crypto contract.
- `@crc/protocol` for canonical JSON, pairing proof, Ed25519 envelope signing,
  XChaCha20-Poly1305 payload encryption, write-ahead sequence reservation, atomic chunk ring buffer,
  and idempotency cache.
- `@crc/codex-client` with Codex App Server slash-method whitelist, unsupported server-request
  matrix, and a JSON-RPC peer.
- `@crc/bridge` scaffold with approval arbitration, device registry, pairing URL generation, and
  `crc bridge doctor/pair/start`.
- `@crc/relay` scaffold with Durable Object hibernatable WebSocket entrypoint, one-time bridge
  registration state, rate limiting, and per-device buffer logic.
- `@crc/pwa` scaffold with unpaired pairing screen and paired workspace shell.

Not yet complete in this slice:

- Real Noise IK runtime implementation and KAT spike.
- Real bridge-to-relay WebSocket connection.
- Real `codex app-server` lifecycle and stream fanout.
- Web Push delivery.
- Cloudflare deployment verification against a live account.

## Commands

```bash
npm install
npm test
npm run check
npm run build
npm run generate:codex-schema
```

Run the bridge CLI after building:

```bash
npm run build --workspace @crc/bridge
node apps/bridge/dist/cli.js bridge doctor
node apps/bridge/dist/cli.js bridge pair https://example.workers.dev
```

Run the PWA locally:

```bash
npm run dev --workspace @crc/pwa
```

Run the relay locally:

```bash
npm run dev --workspace @crc/relay
```

## Security Model

E2EE protects against an honest-but-curious relay, logs, and storage leakage. The relay can still see
metadata such as room id, device id, message timing, message size, connection state, and failure
rates.

Cloudflare-hosted JavaScript cannot protect against Cloudflare actively serving malicious PWA code.
Future hardening should use a native wrapper or signed/verifiable bundle.

If a phone is lost, OS screen lock and browser storage protection are the first line of defense.
Revoke the device from another paired device or use the break-glass relay reset. This MVP does not
include HSM-backed keys or server-side remote wipe.

## Cloudflare Free Notes

The relay is designed for low-volume personal use. Durable Object hibernation must use
`ctx.acceptWebSocket()`; regular stream deltas should be coalesced before persistence. If Cloudflare
Free quotas are exceeded, the expected behavior is failure with clear errors, not automatic paid
scale-out.

Prefer a custom domain for production. If using `workers.dev`, cookies must use the `__Host-`
prefix, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and no `Domain` attribute.
