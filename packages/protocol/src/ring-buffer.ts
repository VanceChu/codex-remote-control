import type { RingBufferEntry } from "./types.js";

export interface DeviceRingBufferLimits {
  maxBytes: number;
  maxMessages: number;
  maxAgeMs: number;
}

export class DeviceRingBuffer {
  private readonly items: RingBufferEntry[] = [];
  private totalBytes = 0;

  constructor(private readonly limits: DeviceRingBufferLimits) {}

  add(entry: RingBufferEntry): void {
    this.items.push(entry);
    this.totalBytes += entry.bytes;
    this.evict(entry.createdAt);
  }

  entries(): RingBufferEntry[] {
    return [...this.items];
  }

  after(relaySeq: number): RingBufferEntry[] {
    return this.items.filter((entry) => entry.relaySeq > relaySeq);
  }

  private evict(now: number): void {
    while (this.items.length > 0 && this.shouldEvict(now)) {
      const first = this.items[0]!;
      this.removeMessage(first.msgId);
    }
  }

  private shouldEvict(now: number): boolean {
    if (this.items.length > this.limits.maxMessages) {
      return true;
    }
    if (this.totalBytes > this.limits.maxBytes) {
      return true;
    }
    const first = this.items[0];
    return first !== undefined && now - first.createdAt > this.limits.maxAgeMs;
  }

  private removeMessage(msgId: string): void {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index]!;
      if (item.msgId === msgId) {
        this.totalBytes -= item.bytes;
        this.items.splice(index, 1);
      }
    }
  }
}
