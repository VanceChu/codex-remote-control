import { describe, expect, it } from "vitest";
import {
  computeNoiseIkKat,
  createX25519Keypair,
  decryptNoiseTransport,
  encryptNoiseTransport,
  runNoiseIkHandshake,
  runNoiseIkKnownAnswerTest
} from "./noise.js";
import { NOISE_IK_FIXTURE } from "./noise-kat.fixture.js";

describe("Noise IK 25519 ChaChaPoly SHA256", () => {
  it("matches the deterministic known-answer fixture", () => {
    expect(runNoiseIkKnownAnswerTest()).toEqual({
      ok: true,
      fixtureId: NOISE_IK_FIXTURE.id,
      protocolName: NOISE_IK_FIXTURE.protocolName,
      handshakeHash: NOISE_IK_FIXTURE.expected.handshakeHash,
      failures: []
    });
  });

  it("keeps the KAT fixture deterministic", () => {
    expect(computeNoiseIkKat()).toEqual(NOISE_IK_FIXTURE.expected);
  });

  it("decrypts an opaque control-plane message across split transport states", () => {
    const handshake = runNoiseIkHandshake({
      initiatorStatic: createX25519Keypair(NOISE_IK_FIXTURE.initiatorStaticPrivateKey),
      responderStatic: createX25519Keypair(NOISE_IK_FIXTURE.responderStaticPrivateKey),
      initiatorEphemeral: createX25519Keypair(NOISE_IK_FIXTURE.initiatorEphemeralPrivateKey),
      responderEphemeral: createX25519Keypair(NOISE_IK_FIXTURE.responderEphemeralPrivateKey),
      prologue: NOISE_IK_FIXTURE.prologue,
      initiatorPayload: NOISE_IK_FIXTURE.initiatorPayload,
      responderPayload: NOISE_IK_FIXTURE.responderPayload
    });

    const ciphertext = encryptNoiseTransport(
      handshake.initiator.send,
      NOISE_IK_FIXTURE.controlPlaneAd,
      NOISE_IK_FIXTURE.controlPlanePlaintext
    );
    const plaintext = decryptNoiseTransport(
      handshake.responder.receive,
      NOISE_IK_FIXTURE.controlPlaneAd,
      ciphertext
    );

    expect(plaintext).toEqual(NOISE_IK_FIXTURE.controlPlanePlaintext);
  });

  it("rejects tampered control-plane associated data", () => {
    const handshake = runNoiseIkHandshake({
      initiatorStatic: createX25519Keypair(NOISE_IK_FIXTURE.initiatorStaticPrivateKey),
      responderStatic: createX25519Keypair(NOISE_IK_FIXTURE.responderStaticPrivateKey),
      initiatorEphemeral: createX25519Keypair(NOISE_IK_FIXTURE.initiatorEphemeralPrivateKey),
      responderEphemeral: createX25519Keypair(NOISE_IK_FIXTURE.responderEphemeralPrivateKey),
      prologue: NOISE_IK_FIXTURE.prologue,
      initiatorPayload: NOISE_IK_FIXTURE.initiatorPayload,
      responderPayload: NOISE_IK_FIXTURE.responderPayload
    });
    const ciphertext = encryptNoiseTransport(
      handshake.initiator.send,
      NOISE_IK_FIXTURE.controlPlaneAd,
      NOISE_IK_FIXTURE.controlPlanePlaintext
    );

    expect(() =>
      decryptNoiseTransport(handshake.responder.receive, new Uint8Array([1, 2, 3]), ciphertext)
    ).toThrow();
  });
});
