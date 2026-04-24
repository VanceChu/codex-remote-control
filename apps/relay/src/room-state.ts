import { DeviceRingBuffer, type RingBufferEntry } from "@crc/protocol";

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
}

interface FailureWindow {
  count: number;
  firstSeen: number;
}

export class RelayRoomState {
  private bridgePublicKey: string | undefined;
  private readonly buffers = new Map<string, DeviceRingBuffer>();
  private readonly failures = new Map<string, FailureWindow>();
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
      }))
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
    for (const item of snapshot.buffers) {
      const buffer = this.bufferFor(item.deviceId);
      for (const entry of item.entries) {
        const before = this.sumBytes(item.deviceId);
        buffer.add(entry);
        const after = this.sumBytes(item.deviceId);
        this.roomBytes += after - before;
      }
    }
    this.evictAggregate();
  }
}
