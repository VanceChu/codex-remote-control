import { describe, expect, it } from "vitest";
import { DeviceRingBuffer } from "./ring-buffer.js";

describe("DeviceRingBuffer", () => {
  it("evicts chunked messages atomically by msgId", () => {
    const buffer = new DeviceRingBuffer({ maxBytes: 100, maxMessages: 10, maxAgeMs: 86_400_000 });

    buffer.add({ relaySeq: 1, msgId: "a", chunkIdx: 0, totalChunks: 2, bytes: 40, createdAt: 1 });
    buffer.add({ relaySeq: 2, msgId: "a", chunkIdx: 1, totalChunks: 2, bytes: 40, createdAt: 2 });
    buffer.add({ relaySeq: 3, msgId: "b", chunkIdx: 0, totalChunks: 1, bytes: 40, createdAt: 3 });

    expect(buffer.entries().map((entry) => entry.msgId)).toEqual(["b"]);
  });

  it("returns only entries after the requested relay sequence", () => {
    const buffer = new DeviceRingBuffer({ maxBytes: 1_000, maxMessages: 10, maxAgeMs: 86_400_000 });
    buffer.add({ relaySeq: 1, msgId: "a", chunkIdx: 0, totalChunks: 1, bytes: 10, createdAt: 1 });
    buffer.add({ relaySeq: 2, msgId: "b", chunkIdx: 0, totalChunks: 1, bytes: 10, createdAt: 2 });

    expect(buffer.after(1).map((entry) => entry.msgId)).toEqual(["b"]);
  });
});
