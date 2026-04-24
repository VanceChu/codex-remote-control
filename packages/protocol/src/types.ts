export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

export interface PairingTranscript {
  roomId: string;
  bridgeNoisePub: string;
  bridgeSignPub: string;
  deviceNoisePub: string;
  deviceSignPub: string;
  nonceB: string;
  nonceD: string;
  keyId: string;
  epoch: string;
}

export type Direction = "device_to_bridge" | "bridge_to_device";

export interface AeadContext {
  roomId: string;
  epoch: string;
  senderId: string;
  direction: Direction;
  senderSeq: bigint;
  msgId: string;
  chunkIdx: string;
  totalChunks: string;
  kind: string;
}

export interface SignedEnvelope {
  v: 1;
  roomId: string;
  deviceId?: string;
  senderId: string;
  direction: Direction;
  senderSeq: string;
  msgId: string;
  kind: string;
  payload: JsonValue;
}

export interface RingBufferEntry {
  relaySeq: number;
  msgId: string;
  chunkIdx: number;
  totalChunks: number;
  bytes: number;
  createdAt: number;
}

export interface IdempotencyTerminalResult {
  status: "completed" | "failed";
  turnId?: string;
  reason?: string;
}
