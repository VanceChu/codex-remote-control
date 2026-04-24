import { describe, expect, it } from "vitest";
import {
  buildAad,
  computePairingProof,
  createNonce,
  decryptPayload,
  derivePairingMacKey,
  encryptPayload,
  generateEd25519Keypair,
  keyId,
  signEnvelope,
  verifyEnvelopeSignature,
  verifyPairingProof
} from "./crypto.js";
import type { AeadContext, PairingTranscript, SignedEnvelope } from "./types.js";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("pairing proof", () => {
  it("binds room id, both DH keys, both signing keys, nonces, key id, and epoch", () => {
    const secret = new TextEncoder().encode("test pairing secret");
    const macKey = derivePairingMacKey(secret);
    const transcript: PairingTranscript = {
      roomId: "room-a",
      bridgeNoisePub: "bn",
      bridgeSignPub: "bs",
      deviceNoisePub: "dn",
      deviceSignPub: "ds",
      nonceB: "nb",
      nonceD: "nd",
      keyId: "k1",
      epoch: "1"
    };

    const proof = computePairingProof(macKey, transcript);

    expect(verifyPairingProof(macKey, transcript, proof)).toBe(true);
    expect(verifyPairingProof(macKey, { ...transcript, deviceSignPub: "attacker" }, proof)).toBe(
      false
    );
  });
});

describe("envelope signing", () => {
  it("signs canonical JSON so key order does not affect verification", async () => {
    const keypair = generateEd25519Keypair(
      new Uint8Array([
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        1
      ])
    );
    const envelope: SignedEnvelope = {
      v: 1,
      roomId: "room-a",
      deviceId: "device-a",
      senderId: "device-a",
      direction: "device_to_bridge",
      senderSeq: "42",
      msgId: "msg-a",
      kind: "turn.start",
      payload: { threadId: "t1", prompt: "hello", options: { mode: "fast", retry: false } }
    };

    const signature = await signEnvelope(keypair.secretKey, envelope);

    expect(await verifyEnvelopeSignature(keypair.publicKey, envelope, signature)).toBe(true);
    expect(
      await verifyEnvelopeSignature(
        keypair.publicKey,
        {
          ...envelope,
          payload: { prompt: "hello", threadId: "t1", options: { retry: false, mode: "fast" } }
        },
        signature
      )
    ).toBe(true);
    expect(
      await verifyEnvelopeSignature(keypair.publicKey, { ...envelope, kind: "forged" }, signature)
    ).toBe(false);
  });
});

describe("payload encryption", () => {
  const context: AeadContext = {
    roomId: "room-a",
    epoch: "1",
    senderId: "device-a",
    direction: "device_to_bridge",
    senderSeq: 7n,
    msgId: "msg-a",
    chunkIdx: "0",
    totalChunks: "1",
    kind: "turn.start"
  };
  const key = new Uint8Array(32).fill(7);
  const noncePrefix = new Uint8Array(16).fill(3);

  it("uses a key-bound 16 byte prefix plus 8 byte sequence nonce", () => {
    expect(hex(createNonce(noncePrefix, 7n))).toBe(
      "030303030303030303030303030303030000000000000007"
    );
  });

  it("binds ciphertext to AAD", () => {
    const plaintext = new TextEncoder().encode("secret prompt");
    const ciphertext = encryptPayload(key, noncePrefix, context, plaintext);

    expect(decryptPayload(key, noncePrefix, context, ciphertext)).toEqual(plaintext);
    expect(() =>
      decryptPayload(key, noncePrefix, { ...context, kind: "turn.interrupt" }, ciphertext)
    ).toThrow();
  });

  it("includes all routing fields in AAD", () => {
    expect(new TextDecoder().decode(buildAad(context))).toBe(
      '{"chunkIdx":"0","direction":"device_to_bridge","epoch":"1","kind":"turn.start","msgId":"msg-a","roomId":"room-a","senderId":"device-a","senderSeq":"7","totalChunks":"1"}'
    );
  });
});

describe("key id", () => {
  it("is derived from public key bytes", () => {
    expect(keyId(new Uint8Array([1, 2, 3, 4]))).toHaveLength(24);
  });
});
