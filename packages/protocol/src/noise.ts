import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { NOISE_IK_FIXTURE } from "./noise-kat.fixture.js";

export const NOISE_IK_PROTOCOL_NAME = "Noise_IK_25519_ChaChaPoly_SHA256";
const hashLength = 32;
const x25519KeyLength = 32;
const chachaPolyTagLength = 16;

export interface NoiseKeypair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface NoiseIkHandshakeInputs {
  initiatorStatic: NoiseKeypair;
  responderStatic: NoiseKeypair;
  initiatorEphemeral: NoiseKeypair;
  responderEphemeral: NoiseKeypair;
  prologue: Uint8Array;
  initiatorPayload: Uint8Array;
  responderPayload: Uint8Array;
}

export interface NoiseCipherStateSnapshot {
  key: Uint8Array;
  nonce: bigint;
}

export interface NoiseIkHandshakeResult {
  message1: Uint8Array;
  message2: Uint8Array;
  handshakeHash: Uint8Array;
  finalChainingKey: Uint8Array;
  initiator: {
    send: NoiseCipherStateSnapshot;
    receive: NoiseCipherStateSnapshot;
    receivedPayload: Uint8Array;
  };
  responder: {
    send: NoiseCipherStateSnapshot;
    receive: NoiseCipherStateSnapshot;
    receivedPayload: Uint8Array;
  };
}

export interface NoiseKatResult {
  ok: boolean;
  fixtureId: string;
  protocolName: string;
  handshakeHash: string;
  failures: string[];
}

export interface NoiseIkKatHex {
  initiatorStaticPublicKey: string;
  responderStaticPublicKey: string;
  initiatorEphemeralPublicKey: string;
  responderEphemeralPublicKey: string;
  message1: string;
  message2: string;
  handshakeHash: string;
  initiatorSendKey: string;
  initiatorReceiveKey: string;
  responderSendKey: string;
  responderReceiveKey: string;
  exportedSecret: string;
  controlPlaneCiphertext: string;
}

export function createX25519Keypair(privateKey: Uint8Array = randomBytes(32)): NoiseKeypair {
  assertLength(privateKey, x25519KeyLength, "X25519 private key");
  return {
    privateKey: copy(privateKey),
    publicKey: x25519.getPublicKey(privateKey)
  };
}

export function runNoiseIkHandshake(inputs: NoiseIkHandshakeInputs): NoiseIkHandshakeResult {
  assertKeypair(inputs.initiatorStatic, "initiator static");
  assertKeypair(inputs.responderStatic, "responder static");
  assertKeypair(inputs.initiatorEphemeral, "initiator ephemeral");
  assertKeypair(inputs.responderEphemeral, "responder ephemeral");

  const initiator = new HandshakeState({
    initiator: true,
    localStatic: inputs.initiatorStatic,
    remoteStatic: inputs.responderStatic.publicKey,
    localEphemeral: inputs.initiatorEphemeral,
    prologue: inputs.prologue
  });
  const responder = new HandshakeState({
    initiator: false,
    localStatic: inputs.responderStatic,
    remoteStatic: undefined,
    localEphemeral: inputs.responderEphemeral,
    prologue: inputs.prologue
  });

  const message1 = initiator.writeMessageA(inputs.initiatorPayload);
  const responderReceivedPayload = responder.readMessageA(message1);
  const responderSplit = responder.writeMessageB(inputs.responderPayload);
  const message2 = responderSplit.message;
  const initiatorSplit = initiator.readMessageB(message2);

  if (!equalBytes(initiator.handshakeHash, responder.handshakeHash)) {
    throw new Error("Noise IK handshake hashes diverged");
  }
  if (!equalBytes(initiator.finalChainingKey, responder.finalChainingKey)) {
    throw new Error("Noise IK chaining keys diverged");
  }

  return {
    message1,
    message2,
    handshakeHash: initiator.handshakeHash,
    finalChainingKey: initiator.finalChainingKey,
    initiator: {
      send: snapshotCipherState(initiatorSplit.send),
      receive: snapshotCipherState(initiatorSplit.receive),
      receivedPayload: initiatorSplit.payload
    },
    responder: {
      send: snapshotCipherState(responderSplit.send),
      receive: snapshotCipherState(responderSplit.receive),
      receivedPayload: responderReceivedPayload
    }
  };
}

export function encryptNoiseTransport(
  state: NoiseCipherStateSnapshot,
  associatedData: Uint8Array,
  plaintext: Uint8Array
): Uint8Array {
  const cipher = new CipherState(state.key, state.nonce);
  const ciphertext = cipher.encryptWithAd(associatedData, plaintext);
  state.nonce = cipher.nonce;
  return ciphertext;
}

export function decryptNoiseTransport(
  state: NoiseCipherStateSnapshot,
  associatedData: Uint8Array,
  ciphertext: Uint8Array
): Uint8Array {
  const cipher = new CipherState(state.key, state.nonce);
  const plaintext = cipher.decryptWithAd(associatedData, ciphertext);
  state.nonce = cipher.nonce;
  return plaintext;
}

export function exportNoiseSecret(
  finalChainingKey: Uint8Array,
  label: string,
  length = 32
): Uint8Array {
  assertLength(finalChainingKey, hashLength, "Noise final chaining key");
  return hkdf(sha256, new Uint8Array(), finalChainingKey, utf8ToBytes(label), length);
}

export function runNoiseIkKnownAnswerTest(): NoiseKatResult {
  const actual = computeNoiseIkKat();
  const expected = NOISE_IK_FIXTURE.expected;
  const failures = [
    compareHex(
      "initiatorStaticPublicKey",
      actual.initiatorStaticPublicKey,
      expected.initiatorStaticPublicKey
    ),
    compareHex(
      "responderStaticPublicKey",
      actual.responderStaticPublicKey,
      expected.responderStaticPublicKey
    ),
    compareHex(
      "initiatorEphemeralPublicKey",
      actual.initiatorEphemeralPublicKey,
      expected.initiatorEphemeralPublicKey
    ),
    compareHex(
      "responderEphemeralPublicKey",
      actual.responderEphemeralPublicKey,
      expected.responderEphemeralPublicKey
    ),
    compareHex("message1", actual.message1, expected.message1),
    compareHex("message2", actual.message2, expected.message2),
    compareHex("handshakeHash", actual.handshakeHash, expected.handshakeHash),
    compareHex("initiatorSendKey", actual.initiatorSendKey, expected.initiatorSendKey),
    compareHex("initiatorReceiveKey", actual.initiatorReceiveKey, expected.initiatorReceiveKey),
    compareHex("responderSendKey", actual.responderSendKey, expected.responderSendKey),
    compareHex("responderReceiveKey", actual.responderReceiveKey, expected.responderReceiveKey),
    compareHex("exportedSecret", actual.exportedSecret, expected.exportedSecret),
    compareHex(
      "controlPlaneCiphertext",
      actual.controlPlaneCiphertext,
      expected.controlPlaneCiphertext
    )
  ].filter((failure): failure is string => failure !== undefined);
  return {
    ok: failures.length === 0,
    fixtureId: NOISE_IK_FIXTURE.id,
    protocolName: NOISE_IK_PROTOCOL_NAME,
    handshakeHash: actual.handshakeHash,
    failures
  };
}

export function computeNoiseIkKat(): NoiseIkKatHex {
  const initiatorStatic = createX25519Keypair(NOISE_IK_FIXTURE.initiatorStaticPrivateKey);
  const responderStatic = createX25519Keypair(NOISE_IK_FIXTURE.responderStaticPrivateKey);
  const initiatorEphemeral = createX25519Keypair(NOISE_IK_FIXTURE.initiatorEphemeralPrivateKey);
  const responderEphemeral = createX25519Keypair(NOISE_IK_FIXTURE.responderEphemeralPrivateKey);
  const handshake = runNoiseIkHandshake({
    initiatorStatic,
    responderStatic,
    initiatorEphemeral,
    responderEphemeral,
    prologue: NOISE_IK_FIXTURE.prologue,
    initiatorPayload: NOISE_IK_FIXTURE.initiatorPayload,
    responderPayload: NOISE_IK_FIXTURE.responderPayload
  });
  const initiatorSend = snapshotCipherState(handshake.initiator.send);
  const responderReceive = snapshotCipherState(handshake.responder.receive);
  const controlPlaneCiphertext = encryptNoiseTransport(
    initiatorSend,
    NOISE_IK_FIXTURE.controlPlaneAd,
    NOISE_IK_FIXTURE.controlPlanePlaintext
  );
  const decrypted = decryptNoiseTransport(
    responderReceive,
    NOISE_IK_FIXTURE.controlPlaneAd,
    controlPlaneCiphertext
  );
  if (!equalBytes(decrypted, NOISE_IK_FIXTURE.controlPlanePlaintext)) {
    throw new Error("Noise KAT control-plane decrypt failed");
  }
  return {
    initiatorStaticPublicKey: bytesToHex(initiatorStatic.publicKey),
    responderStaticPublicKey: bytesToHex(responderStatic.publicKey),
    initiatorEphemeralPublicKey: bytesToHex(initiatorEphemeral.publicKey),
    responderEphemeralPublicKey: bytesToHex(responderEphemeral.publicKey),
    message1: bytesToHex(handshake.message1),
    message2: bytesToHex(handshake.message2),
    handshakeHash: bytesToHex(handshake.handshakeHash),
    initiatorSendKey: bytesToHex(handshake.initiator.send.key),
    initiatorReceiveKey: bytesToHex(handshake.initiator.receive.key),
    responderSendKey: bytesToHex(handshake.responder.send.key),
    responderReceiveKey: bytesToHex(handshake.responder.receive.key),
    exportedSecret: bytesToHex(
      exportNoiseSecret(handshake.finalChainingKey, NOISE_IK_FIXTURE.exportLabel)
    ),
    controlPlaneCiphertext: bytesToHex(controlPlaneCiphertext)
  };
}

interface HandshakeStateOptions {
  initiator: boolean;
  localStatic: NoiseKeypair;
  remoteStatic: Uint8Array | undefined;
  localEphemeral: NoiseKeypair;
  prologue: Uint8Array;
}

class HandshakeState {
  private readonly initiator: boolean;
  private readonly localStatic: NoiseKeypair;
  private readonly localEphemeral: NoiseKeypair;
  private remoteStatic: Uint8Array | undefined;
  private remoteEphemeral: Uint8Array | undefined;
  private readonly symmetric: SymmetricState;
  private splitResult: { send: CipherState; receive: CipherState } | undefined;

  constructor(options: HandshakeStateOptions) {
    this.initiator = options.initiator;
    this.localStatic = options.localStatic;
    this.localEphemeral = options.localEphemeral;
    this.remoteStatic = options.remoteStatic ? copy(options.remoteStatic) : undefined;
    this.symmetric = new SymmetricState(NOISE_IK_PROTOCOL_NAME);
    this.symmetric.mixHash(options.prologue);
    const premessageStatic = this.initiator ? this.remoteStatic : this.localStatic.publicKey;
    if (!premessageStatic) {
      throw new Error("Noise IK responder premessage static key is missing");
    }
    this.symmetric.mixHash(premessageStatic);
  }

  get handshakeHash(): Uint8Array {
    return this.symmetric.handshakeHash;
  }

  get finalChainingKey(): Uint8Array {
    return this.symmetric.chainingKeySnapshot;
  }

  writeMessageA(payload: Uint8Array): Uint8Array {
    if (!this.initiator) {
      throw new Error("Only the initiator can write Noise IK message A");
    }
    const remoteStatic = requireRemoteKey(this.remoteStatic, "responder static");
    const encryptedStatic = this.symmetric.withEphemeralPublicKey(this.localEphemeral.publicKey);
    this.symmetric.mixKey(dh(this.localEphemeral.privateKey, remoteStatic));
    const encryptedLocalStatic = this.symmetric.encryptAndHash(this.localStatic.publicKey);
    this.symmetric.mixKey(dh(this.localStatic.privateKey, remoteStatic));
    const encryptedPayload = this.symmetric.encryptAndHash(payload);
    return concatBytes(encryptedStatic, encryptedLocalStatic, encryptedPayload);
  }

  readMessageA(message: Uint8Array): Uint8Array {
    if (this.initiator) {
      throw new Error("Only the responder can read Noise IK message A");
    }
    if (message.byteLength < x25519KeyLength + x25519KeyLength + chachaPolyTagLength) {
      throw new Error("Noise IK message A is too short");
    }
    this.remoteEphemeral = message.slice(0, x25519KeyLength);
    this.symmetric.mixHash(this.remoteEphemeral);
    this.symmetric.mixKey(dh(this.localStatic.privateKey, this.remoteEphemeral));
    const encryptedStaticStart = x25519KeyLength;
    const encryptedStaticEnd = encryptedStaticStart + x25519KeyLength + chachaPolyTagLength;
    this.remoteStatic = this.symmetric.decryptAndHash(
      message.slice(encryptedStaticStart, encryptedStaticEnd)
    );
    this.symmetric.mixKey(dh(this.localStatic.privateKey, this.remoteStatic));
    return this.symmetric.decryptAndHash(message.slice(encryptedStaticEnd));
  }

  writeMessageB(payload: Uint8Array): {
    message: Uint8Array;
    send: CipherState;
    receive: CipherState;
  } {
    if (this.initiator) {
      throw new Error("Only the responder can write Noise IK message B");
    }
    const remoteEphemeral = requireRemoteKey(this.remoteEphemeral, "initiator ephemeral");
    const remoteStatic = requireRemoteKey(this.remoteStatic, "initiator static");
    const encryptedEphemeral = this.symmetric.withEphemeralPublicKey(this.localEphemeral.publicKey);
    this.symmetric.mixKey(dh(this.localEphemeral.privateKey, remoteEphemeral));
    this.symmetric.mixKey(dh(this.localEphemeral.privateKey, remoteStatic));
    const encryptedPayload = this.symmetric.encryptAndHash(payload);
    this.splitResult = this.symmetric.split(false);
    return {
      message: concatBytes(encryptedEphemeral, encryptedPayload),
      send: this.splitResult.send,
      receive: this.splitResult.receive
    };
  }

  readMessageB(message: Uint8Array): {
    payload: Uint8Array;
    send: CipherState;
    receive: CipherState;
  } {
    if (!this.initiator) {
      throw new Error("Only the initiator can read Noise IK message B");
    }
    if (message.byteLength < x25519KeyLength) {
      throw new Error("Noise IK message B is too short");
    }
    this.remoteEphemeral = message.slice(0, x25519KeyLength);
    this.symmetric.mixHash(this.remoteEphemeral);
    this.symmetric.mixKey(dh(this.localEphemeral.privateKey, this.remoteEphemeral));
    this.symmetric.mixKey(dh(this.localStatic.privateKey, this.remoteEphemeral));
    const payload = this.symmetric.decryptAndHash(message.slice(x25519KeyLength));
    this.splitResult = this.symmetric.split(true);
    return {
      payload,
      send: this.splitResult.send,
      receive: this.splitResult.receive
    };
  }
}

class SymmetricState {
  private chainingKey: Uint8Array;
  private hash: Uint8Array;
  private readonly cipher = new CipherState();

  constructor(protocolName: string) {
    const protocolNameBytes = utf8ToBytes(protocolName);
    if (protocolNameBytes.byteLength <= hashLength) {
      this.hash = new Uint8Array(hashLength);
      this.hash.set(protocolNameBytes);
    } else {
      this.hash = sha256(protocolNameBytes);
    }
    this.chainingKey = copy(this.hash);
  }

  get handshakeHash(): Uint8Array {
    return copy(this.hash);
  }

  get chainingKeySnapshot(): Uint8Array {
    return copy(this.chainingKey);
  }

  mixHash(data: Uint8Array): void {
    this.hash = sha256(concatBytes(this.hash, data));
  }

  mixKey(inputKeyMaterial: Uint8Array): void {
    const [chainingKey, temporaryKey] = noiseHkdf2(this.chainingKey, inputKeyMaterial);
    this.chainingKey = chainingKey;
    this.cipher.initializeKey(temporaryKey);
  }

  withEphemeralPublicKey(publicKey: Uint8Array): Uint8Array {
    this.mixHash(publicKey);
    return copy(publicKey);
  }

  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    const ciphertext = this.cipher.encryptWithAd(this.hash, plaintext);
    this.mixHash(ciphertext);
    return ciphertext;
  }

  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    const plaintext = this.cipher.decryptWithAd(this.hash, ciphertext);
    this.mixHash(ciphertext);
    return plaintext;
  }

  split(initiator: boolean): { send: CipherState; receive: CipherState } {
    const [temporaryKey1, temporaryKey2] = noiseHkdf2(this.chainingKey, new Uint8Array());
    const first = new CipherState(temporaryKey1);
    const second = new CipherState(temporaryKey2);
    return initiator ? { send: first, receive: second } : { send: second, receive: first };
  }
}

class CipherState {
  private _key: Uint8Array | undefined;
  private _nonce = 0n;

  constructor(key?: Uint8Array, nonce = 0n) {
    if (key) {
      this.initializeKey(key);
      this._nonce = nonce;
    }
  }

  get key(): Uint8Array {
    if (!this._key) {
      throw new Error("Noise cipher state has no key");
    }
    return copy(this._key);
  }

  get nonce(): bigint {
    return this._nonce;
  }

  initializeKey(key: Uint8Array): void {
    assertLength(key, 32, "Noise cipher key");
    this._key = copy(key);
    this._nonce = 0n;
  }

  encryptWithAd(associatedData: Uint8Array, plaintext: Uint8Array): Uint8Array {
    if (!this._key) {
      return copy(plaintext);
    }
    const cipher = chacha20poly1305(this._key, noiseChaChaPolyNonce(this._nonce), associatedData);
    const ciphertext = cipher.encrypt(plaintext);
    this.incrementNonce();
    return ciphertext;
  }

  decryptWithAd(associatedData: Uint8Array, ciphertext: Uint8Array): Uint8Array {
    if (!this._key) {
      return copy(ciphertext);
    }
    const cipher = chacha20poly1305(this._key, noiseChaChaPolyNonce(this._nonce), associatedData);
    const plaintext = cipher.decrypt(ciphertext);
    this.incrementNonce();
    return plaintext;
  }

  private incrementNonce(): void {
    if (this._nonce === 0xffff_ffff_ffff_ffffn) {
      throw new RangeError("Noise cipher nonce exhausted");
    }
    this._nonce += 1n;
  }
}

function noiseHkdf2(
  chainingKey: Uint8Array,
  inputKeyMaterial: Uint8Array
): [Uint8Array, Uint8Array] {
  const temporaryKey = hmac(sha256, chainingKey, inputKeyMaterial);
  const output1 = hmac(sha256, temporaryKey, new Uint8Array([0x01]));
  const output2 = hmac(sha256, temporaryKey, concatBytes(output1, new Uint8Array([0x02])));
  return [output1, output2];
}

function noiseChaChaPolyNonce(nonce: bigint): Uint8Array {
  if (nonce < 0n || nonce > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError("Noise nonce must fit in 64 bits");
  }
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer, bytes.byteOffset + 4, 8).setBigUint64(0, nonce, true);
  return bytes;
}

function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

function assertKeypair(keypair: NoiseKeypair, label: string): void {
  assertLength(keypair.privateKey, x25519KeyLength, `${label} private key`);
  assertLength(keypair.publicKey, x25519KeyLength, `${label} public key`);
  const derived = x25519.getPublicKey(keypair.privateKey);
  if (!equalBytes(derived, keypair.publicKey)) {
    throw new Error(`${label} public key does not match private key`);
  }
}

function assertLength(bytes: Uint8Array, expectedLength: number, label: string): void {
  if (bytes.byteLength !== expectedLength) {
    throw new RangeError(`${label} must be ${expectedLength} bytes`);
  }
}

function requireRemoteKey(key: Uint8Array | undefined, label: string): Uint8Array {
  if (!key) {
    throw new Error(`Missing Noise remote ${label}`);
  }
  return key;
}

function snapshotCipherState(
  state: CipherState | NoiseCipherStateSnapshot
): NoiseCipherStateSnapshot {
  return {
    key: copy(state.key),
    nonce: state.nonce
  };
}

function copy(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.byteLength; index += 1) {
    diff |= a[index]! ^ b[index]!;
  }
  return diff === 0;
}

function compareHex(label: string, actual: string, expected: string): string | undefined {
  return actual === expected ? undefined : `${label} mismatch`;
}
