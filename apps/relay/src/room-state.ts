import { DeviceRingBuffer, type RingBufferEntry } from "@crc/protocol";
import {
  createDeviceToken,
  createPairingCode,
  hashPhase2Secret,
  pairingCodeTtlMs,
  phase2RoomId,
  verifyPhase2SecretHash
} from "@crc/protocol";

export interface RelayRoomLimits {
  perDeviceMaxBytes: number;
  roomMaxBytes: number;
}

export type RegisterBridgeResult =
  | { status: "registered" }
  | { status: "already_registered" }
  | { status: "locked" };

export interface RelayRoomSnapshot {
  bridgePublicKey?: string;
  buffers: Array<{ deviceId: string; entries: RingBufferEntry[] }>;
  pairings?: PairingRecord[];
  devices?: DeviceRecord[];
}

interface FailureWindow {
  count: number;
  firstSeen: number;
}

export interface PairingRecord {
  codeHash: string;
  expiresAt: number;
  claimed: boolean;
  createdAt: number;
}

export interface DeviceRecord {
  deviceId: string;
  deviceName?: string;
  tokenHash: string;
  createdAt: number;
}

export type ClaimPairingResult =
  | {
      status: "claimed";
      roomId: string;
      deviceId: string;
      deviceToken: string;
      wsPath: "/ws/client";
    }
  | { status: "invalid" | "expired" | "already_claimed" };

export class RelayRoomState {
  private bridgePublicKey: string | undefined;
  private readonly buffers = new Map<string, DeviceRingBuffer>();
  private readonly failures = new Map<string, FailureWindow>();
  private readonly pairings: PairingRecord[] = [];
  private readonly devices = new Map<string, DeviceRecord>();
  private roomBytes = 0;

  constructor(
    private readonly limits: RelayRoomLimits = {
      perDeviceMaxBytes: 10_000_000,
      roomMaxBytes: 50_000_000
    },
    snapshot?: RelayRoomSnapshot
  ) {
    if (snapshot) {
      this.restore(snapshot);
    }
  }

  registerBridge(bridgePublicKey: string): RegisterBridgeResult {
    if (!this.bridgePublicKey) {
      this.bridgePublicKey = bridgePublicKey;
      return { status: "registered" };
    }
    if (this.bridgePublicKey === bridgePublicKey) {
      return { status: "already_registered" };
    }
    return { status: "locked" };
  }

  addDeviceMessage(deviceId: string, entry: RingBufferEntry): void {
    const before = this.sumBytes(deviceId);
    this.bufferFor(deviceId).add(entry);
    const after = this.sumBytes(deviceId);
    this.roomBytes += after - before;
    this.evictAggregate();
  }

  deviceEntries(deviceId: string): RingBufferEntry[] {
    return this.bufferFor(deviceId).entries();
  }

  snapshot(): RelayRoomSnapshot {
    const snapshot: RelayRoomSnapshot = {
      buffers: [...this.buffers.entries()].map(([deviceId, buffer]) => ({
        deviceId,
        entries: buffer.entries()
      })),
      pairings: [...this.pairings],
      devices: [...this.devices.values()]
    };
    if (this.bridgePublicKey) {
      snapshot.bridgePublicKey = this.bridgePublicKey;
    }
    return snapshot;
  }

  recordFailure(key: string, now: number): boolean {
    const windowMs = 60_000;
    const limit = 5;
    const current = this.failures.get(key);
    if (!current || now - current.firstSeen > windowMs) {
      this.failures.set(key, { count: 1, firstSeen: now });
      return false;
    }
    current.count += 1;
    return current.count >= limit;
  }

  isRateLimited(key: string, now: number): boolean {
    const windowMs = 60_000;
    const limit = 5;
    const current = this.failures.get(key);
    return current !== undefined && now - current.firstSeen <= windowMs && current.count >= limit;
  }

  createPairing(
    origin: string,
    now = Date.now()
  ): {
    roomId: string;
    code: string;
    pairUrl: string;
    expiresAt: number;
  } {
    const code = createPairingCode();
    const expiresAt = now + pairingCodeTtlMs;
    this.pairings.push({
      codeHash: hashPhase2Secret(phase2RoomId, "pair-code", code),
      expiresAt,
      claimed: false,
      createdAt: now
    });
    this.pruneExpiredPairings(now);
    const pairUrl = new URL("/pair", origin);
    pairUrl.hash = new URLSearchParams({ room: phase2RoomId, code }).toString();
    return { roomId: phase2RoomId, code, pairUrl: pairUrl.toString(), expiresAt };
  }

  claimPairing(input: {
    roomId: string;
    code: string;
    deviceId: string;
    deviceName?: string;
    now?: number;
  }): ClaimPairingResult {
    const now = input.now ?? Date.now();
    if (input.roomId !== phase2RoomId) {
      return { status: "invalid" };
    }
    const pairing = this.pairings.find((item) =>
      verifyPhase2SecretHash(phase2RoomId, "pair-code", input.code, item.codeHash)
    );
    if (!pairing) {
      return { status: "invalid" };
    }
    if (pairing.claimed) {
      return { status: "already_claimed" };
    }
    if (pairing.expiresAt <= now) {
      return { status: "expired" };
    }
    pairing.claimed = true;
    const deviceToken = createDeviceToken();
    const record: DeviceRecord = {
      deviceId: input.deviceId,
      tokenHash: hashPhase2Secret(phase2RoomId, "device-token", deviceToken),
      createdAt: now
    };
    if (input.deviceName) {
      record.deviceName = input.deviceName;
    }
    this.devices.set(input.deviceId, record);
    return {
      status: "claimed",
      roomId: phase2RoomId,
      deviceId: input.deviceId,
      deviceToken,
      wsPath: "/ws/client"
    };
  }

  verifyDeviceToken(deviceId: string, token: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) {
      return false;
    }
    return verifyPhase2SecretHash(phase2RoomId, "device-token", token, device.tokenHash);
  }

  private bufferFor(deviceId: string): DeviceRingBuffer {
    const existing = this.buffers.get(deviceId);
    if (existing) {
      return existing;
    }
    const buffer = new DeviceRingBuffer({
      maxBytes: this.limits.perDeviceMaxBytes,
      maxMessages: 2_000,
      maxAgeMs: 86_400_000
    });
    this.buffers.set(deviceId, buffer);
    return buffer;
  }

  private evictAggregate(): void {
    while (this.roomBytes > this.limits.roomMaxBytes) {
      const oldest = this.oldestDeviceEntry();
      if (!oldest) {
        this.roomBytes = 0;
        return;
      }
      const before = this.sumBytes(oldest.deviceId);
      this.removeMessage(oldest.deviceId, oldest.entry.msgId);
      const after = this.sumBytes(oldest.deviceId);
      this.roomBytes -= before - after;
    }
  }

  private oldestDeviceEntry(): { deviceId: string; entry: RingBufferEntry } | undefined {
    let oldest: { deviceId: string; entry: RingBufferEntry } | undefined;
    for (const [deviceId, buffer] of this.buffers) {
      const entry = buffer.entries()[0];
      if (!entry) {
        continue;
      }
      if (!oldest || entry.createdAt < oldest.entry.createdAt) {
        oldest = { deviceId, entry };
      }
    }
    return oldest;
  }

  private removeMessage(deviceId: string, msgId: string): void {
    const current = this.bufferFor(deviceId).entries();
    const next = current.filter((entry) => entry.msgId !== msgId);
    const rebuilt = new DeviceRingBuffer({
      maxBytes: this.limits.perDeviceMaxBytes,
      maxMessages: 2_000,
      maxAgeMs: 86_400_000
    });
    for (const entry of next) {
      rebuilt.add(entry);
    }
    this.buffers.set(deviceId, rebuilt);
  }

  private sumBytes(deviceId: string): number {
    return this.bufferFor(deviceId)
      .entries()
      .reduce((sum, entry) => sum + entry.bytes, 0);
  }

  private restore(snapshot: RelayRoomSnapshot): void {
    if (snapshot.bridgePublicKey) {
      this.bridgePublicKey = snapshot.bridgePublicKey;
    }
    const now = Date.now();
    for (const item of snapshot.buffers) {
      const buffer = this.bufferFor(item.deviceId);
      for (const entry of item.entries) {
        buffer.add(entry);
      }
      buffer.evictExpired(now);
    }
    for (const pairing of snapshot.pairings ?? []) {
      this.pairings.push({ ...pairing });
    }
    for (const device of snapshot.devices ?? []) {
      this.devices.set(device.deviceId, { ...device });
    }
    this.pruneExpiredPairings(Date.now());
    this.roomBytes = this.sumAllBytes();
    this.evictAggregate();
  }

  private pruneExpiredPairings(now: number): void {
    const kept = this.pairings.filter((pairing) => pairing.expiresAt > now);
    this.pairings.length = 0;
    this.pairings.push(...kept);
  }

  private sumAllBytes(): number {
    let total = 0;
    for (const deviceId of this.buffers.keys()) {
      total += this.sumBytes(deviceId);
    }
    return total;
  }
}
