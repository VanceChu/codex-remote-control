import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalize } from "./canonical.js";
import type { AeadContext, JsonValue, PairingTranscript, SignedEnvelope } from "./types.js";

export interface Ed25519Keypair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateEd25519Keypair(seed?: Uint8Array): Ed25519Keypair {
  const keypair = seed ? ed25519.keygen(seed) : ed25519.keygen();
  return {
    secretKey: keypair.secretKey,
    publicKey: keypair.publicKey
  };
}

export function keyId(publicKey: Uint8Array): string {
  return toHex(sha256(publicKey)).slice(0, 24);
}

export function derivePairingMacKey(pairingSecret: Uint8Array): Uint8Array {
  return hmac(sha256, utf8ToBytes("crc-pairing-v1"), pairingSecret);
}

export function computePairingProof(macKey: Uint8Array, transcript: PairingTranscript): Uint8Array {
  return hmac(sha256, macKey, utf8ToBytes(canonicalize(transcriptToJson(transcript))));
}

export function verifyPairingProof(
  macKey: Uint8Array,
  transcript: PairingTranscript,
  proof: Uint8Array
): boolean {
  return constantTimeEqual(computePairingProof(macKey, transcript), proof);
}

export async function signEnvelope(
  secretKey: Uint8Array,
  envelope: SignedEnvelope
): Promise<Uint8Array> {
  return ed25519.sign(utf8ToBytes(canonicalize(envelopeToJson(envelope))), secretKey);
}

export async function verifyEnvelopeSignature(
  publicKey: Uint8Array,
  envelope: SignedEnvelope,
  signature: Uint8Array
): Promise<boolean> {
  return ed25519.verify(signature, utf8ToBytes(canonicalize(envelopeToJson(envelope))), publicKey);
}

export function createNonce(noncePrefix: Uint8Array, senderSeq: bigint): Uint8Array {
  if (noncePrefix.byteLength !== 16) {
    throw new RangeError("Nonce prefix must be 16 bytes");
  }
  if (senderSeq < 0n || senderSeq > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError("senderSeq must fit in 64 bits");
  }
  const nonce = new Uint8Array(24);
  nonce.set(noncePrefix, 0);
  new DataView(nonce.buffer, nonce.byteOffset + 16, 8).setBigUint64(0, senderSeq, false);
  return nonce;
}

export function buildAad(context: AeadContext): Uint8Array {
  return utf8ToBytes(
    canonicalize({
      roomId: context.roomId,
      epoch: context.epoch,
      senderId: context.senderId,
      direction: context.direction,
      senderSeq: context.senderSeq.toString(),
      msgId: context.msgId,
      chunkIdx: context.chunkIdx,
      totalChunks: context.totalChunks,
      kind: context.kind
    })
  );
}

export function encryptPayload(
  key: Uint8Array,
  noncePrefix: Uint8Array,
  context: AeadContext,
  plaintext: Uint8Array
): Uint8Array {
  const cipher = xchacha20poly1305(
    key,
    createNonce(noncePrefix, context.senderSeq),
    buildAad(context)
  );
  return cipher.encrypt(plaintext);
}

export function decryptPayload(
  key: Uint8Array,
  noncePrefix: Uint8Array,
  context: AeadContext,
  ciphertext: Uint8Array
): Uint8Array {
  const cipher = xchacha20poly1305(
    key,
    createNonce(noncePrefix, context.senderSeq),
    buildAad(context)
  );
  return cipher.decrypt(ciphertext);
}

function transcriptToJson(transcript: PairingTranscript): JsonValue {
  return { ...transcript };
}

function envelopeToJson(envelope: SignedEnvelope): JsonValue {
  return { ...envelope };
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.byteLength; index += 1) {
    diff |= a[index]! ^ b[index]!;
  }
  return diff === 0;
}
