import { describe, expect, it } from "vitest";
import {
  computeNoiseIkKat,
  createX25519Keypair,
  decryptNoiseTransport,
  encryptNoiseTransport,
  runNoiseIkHandshake,
  runNoiseIkKnownAnswerTest
} from "./noise.js";
import { NOISE_IK_CACOPHONY_VECTOR, NOISE_IK_FIXTURE } from "./noise-kat.fixture.js";

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

  it("matches the independent cacophony Noise IK vector", () => {
    const vector = NOISE_IK_CACOPHONY_VECTOR;
    const handshake = runNoiseIkHandshake({
      initiatorStatic: createX25519Keypair(hexToBytes(vector.initStatic)),
      responderStatic: createX25519Keypair(hexToBytes(vector.respStatic)),
      initiatorEphemeral: createX25519Keypair(hexToBytes(vector.initEphemeral)),
      responderEphemeral: createX25519Keypair(hexToBytes(vector.respEphemeral)),
      prologue: hexToBytes(vector.initPrologue),
      initiatorPayload: hexToBytes(vector.messages[0].payload),
      responderPayload: hexToBytes(vector.messages[1].payload)
    });

    expect(toHex(handshake.message1)).toBe(vector.messages[0].ciphertext);
    expect(toHex(handshake.message2)).toBe(vector.messages[1].ciphertext);
    expect(toHex(handshake.handshakeHash)).toBe(vector.handshakeHash);
    expect(toHex(handshake.responder.receivedPayload)).toBe(vector.messages[0].payload);
    expect(toHex(handshake.initiator.receivedPayload)).toBe(vector.messages[1].payload);

    const initiatorTransport0 = encryptNoiseTransport(
      handshake.initiator.send,
      new Uint8Array(),
      hexToBytes(vector.messages[2].payload)
    );
    const responderTransport0 = encryptNoiseTransport(
      handshake.responder.send,
      new Uint8Array(),
      hexToBytes(vector.messages[3].payload)
    );
    const initiatorTransport1 = encryptNoiseTransport(
      handshake.initiator.send,
      new Uint8Array(),
      hexToBytes(vector.messages[4].payload)
    );
    const responderTransport1 = encryptNoiseTransport(
      handshake.responder.send,
      new Uint8Array(),
      hexToBytes(vector.messages[5].payload)
    );

    expect(toHex(initiatorTransport0)).toBe(vector.messages[2].ciphertext);
    expect(toHex(responderTransport0)).toBe(vector.messages[3].ciphertext);
    expect(toHex(initiatorTransport1)).toBe(vector.messages[4].ciphertext);
    expect(toHex(responderTransport1)).toBe(vector.messages[5].ciphertext);
  });
});

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
