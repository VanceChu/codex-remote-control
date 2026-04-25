import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";

export const phase2RoomId = "default";
export const pairingCodeTtlMs = 5 * 60 * 1_000;
export const websocketAuthTimeoutMs = 8_000;

export type Phase2SecretPurpose = "pair-code" | "device-token";

export const PairCreateResponseSchema = z.object({
  roomId: z.literal(phase2RoomId),
  code: z.string().min(16),
  pairUrl: z.string().url(),
  expiresAt: z.number().int().positive()
});
export type PairCreateResponse = z.infer<typeof PairCreateResponseSchema>;

export const PairClaimRequestSchema = z.object({
  roomId: z.string().min(1),
  code: z.string().min(1),
  deviceId: z.string().min(1).max(128),
  deviceName: z.string().min(1).max(128).optional()
});
export type PairClaimRequest = z.infer<typeof PairClaimRequestSchema>;

export const PairClaimResponseSchema = z.object({
  roomId: z.literal(phase2RoomId),
  deviceId: z.string().min(1),
  deviceToken: z.string().min(16),
  wsPath: z.literal("/ws/client")
});
export type PairClaimResponse = z.infer<typeof PairClaimResponseSchema>;

export const BridgeAuthPayloadSchema = z.object({
  roomId: z.literal(phase2RoomId),
  secret: z.string().min(1)
});
export type BridgeAuthPayload = z.infer<typeof BridgeAuthPayloadSchema>;

export const ClientAuthPayloadSchema = z.object({
  roomId: z.literal(phase2RoomId),
  deviceId: z.string().min(1),
  deviceToken: z.string().min(1)
});
export type ClientAuthPayload = z.infer<typeof ClientAuthPayloadSchema>;

export const ClientPingPayloadSchema = z.object({
  pingId: z.string().min(1)
});
export type ClientPingPayload = z.infer<typeof ClientPingPayloadSchema>;

export const BridgePingPayloadSchema = z.object({
  pingId: z.string().min(1),
  sourceDeviceId: z.string().min(1)
});
export type BridgePingPayload = z.infer<typeof BridgePingPayloadSchema>;

export const BridgePongPayloadSchema = z.object({
  pingId: z.string().min(1),
  targetDeviceId: z.string().min(1)
});
export type BridgePongPayload = z.infer<typeof BridgePongPayloadSchema>;

export const PresenceUpdatePayloadSchema = z.object({
  bridgeOnline: z.boolean(),
  devices: z.array(z.object({ deviceId: z.string().min(1), online: z.boolean() }))
});
export type PresenceUpdatePayload = z.infer<typeof PresenceUpdatePayloadSchema>;

export const ErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

export const Phase2MessageSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("bridge.auth"),
    payload: BridgeAuthPayloadSchema,
    ts: z.number().int().nonnegative()
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("client.auth"),
    payload: ClientAuthPayloadSchema,
    ts: z.number().int().nonnegative()
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("client.ping"),
    payload: ClientPingPayloadSchema,
    ts: z.number().int().nonnegative()
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("bridge.ping"),
    payload: BridgePingPayloadSchema,
    ts: z.number().int().nonnegative()
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("bridge.pong"),
    payload: BridgePongPayloadSchema,
    ts: z.number().int().nonnegative()
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("presence.update"),
    payload: PresenceUpdatePayloadSchema,
    ts: z.number().int().nonnegative()
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("error"),
    payload: ErrorPayloadSchema,
    ts: z.number().int().nonnegative()
  })
]);
export type Phase2Message = z.infer<typeof Phase2MessageSchema>;

export function makeMessage<T extends Phase2Message["type"]>(
  type: T,
  payload: Extract<Phase2Message, { type: T }>["payload"],
  id = createMessageId(),
  ts = Date.now()
): Extract<Phase2Message, { type: T }> {
  return { id, type, payload, ts } as Extract<Phase2Message, { type: T }>;
}

export function parsePhase2Message(value: unknown): Phase2Message {
  return Phase2MessageSchema.parse(value);
}

export function parsePhase2MessageText(text: string): Phase2Message {
  return parsePhase2Message(JSON.parse(text));
}

export function createMessageId(): string {
  return base64Url(randomBytes(16));
}

export function createPairingCode(bytes = 24): string {
  return base64Url(randomBytes(bytes));
}

export function createDeviceToken(bytes = 32): string {
  return base64Url(randomBytes(bytes));
}

export function hashPhase2Secret(
  roomId: string,
  purpose: Phase2SecretPurpose,
  secret: string
): string {
  return bytesToHex(sha256(utf8ToBytes(`${roomId}\0${purpose}\0${secret}`)));
}

export function verifyPhase2SecretHash(
  roomId: string,
  purpose: Phase2SecretPurpose,
  secret: string,
  expectedHash: string
): boolean {
  return constantTimeEqualHex(hashPhase2Secret(roomId, purpose, secret), expectedHash);
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  const left = utf8ToBytes(a);
  const right = utf8ToBytes(b);
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    diff |= left[index]! ^ right[index]!;
  }
  return diff === 0;
}

function base64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += alphabet[first >> 2]!;
    output += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)]!;
    if (second !== undefined) {
      output += alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)]!;
    }
    if (third !== undefined) {
      output += alphabet[third & 0x3f]!;
    }
  }
  return output;
}
