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
  idempotency cache, and a deterministic `Noise_IK_25519_ChaChaPoly_SHA256` KAT harness.
- `@crc/codex-client` with Codex App Server slash-method whitelist, unsupported server-request
  matrix, and a JSON-RPC peer.
- `@crc/bridge` scaffold with approval arbitration, device registry, pairing URL generation, and
  `crc bridge doctor/pair/start` plus `crc relay doctor`.
- `@crc/relay` scaffold with Durable Object hibernatable WebSocket entrypoint, one-time bridge
  registration state, rate limiting, per-device buffer logic, Worker-first static assets config, and
  a gated Noise KAT self-test route.
- `@crc/pwa` scaffold with unpaired pairing screen, paired workspace shell, and browser runtime Noise
  KAT.

Not yet complete in this slice:

- Real bridge-to-relay WebSocket connection.
- Real phone pairing claim or ping/pong routing.
- Real `codex app-server` lifecycle and stream fanout.
- Web Push delivery.
- Cloudflare deployment verification against a live account.

## Commands

```bash
npm install
npm test
npm run test:browser --workspace @crc/pwa
npm run check
npm run build
npm run generate:codex-schema
```

Run the bridge CLI after building:

```bash
npm run build --workspace @crc/bridge
node apps/bridge/dist/cli.js bridge doctor
node apps/bridge/dist/cli.js relay doctor
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

Run the Phase 1 browser Noise KAT:

```bash
npx playwright install chromium
npm run test:browser --workspace @crc/pwa
```

Deploy the current workers.dev baseline:

```bash
CLOUDFLARE_API_TOKEN=... npm run deploy --workspace @crc/relay
```

Wrangler may require `CLOUDFLARE_API_TOKEN` in non-interactive environments even when
`wrangler whoami` succeeds locally.

Run the deploy script without setting extra environment if you are in an interactive terminal that
Wrangler can authenticate:

```bash
npm run deploy --workspace @crc/relay
```

Stage 1 still does not implement pairing. `crc bridge start` remains a scaffold, and the relay
continues to fail closed for WebSockets unless `CRC_DEV_WS_SECRET` is configured. Static assets are
served by Cloudflare's asset layer unless the path is whitelisted in `run_worker_first`, so regular
PWA resources do not consume Worker request budget.

The relay self-test route `/__crc/self-test/noise-kat` is disabled by default with a runtime
environment flag, not removed from the production bundle. Leave `CRC_ENABLE_SELF_TEST` unset in
production; set it to `1` only with the provisional secret in a non-production environment.

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
