import { afterEach, describe, expect, it, vi } from "vitest";
import { RelayRoomState } from "./room-state.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("RelayRoomState", () => {
  it("allows bridge registration exactly once", () => {
    const room = new RelayRoomState();

    expect(room.registerBridge("bridge-pub-a")).toEqual({ status: "registered" });
    expect(room.registerBridge("bridge-pub-a")).toEqual({ status: "already_registered" });
    expect(room.registerBridge("bridge-pub-b")).toEqual({ status: "locked" });
  });

  it("keeps separate per-device buffers and aggregate cap", () => {
    const room = new RelayRoomState({ perDeviceMaxBytes: 100, roomMaxBytes: 150 });
    room.addDeviceMessage("device-a", {
      relaySeq: 1,
      msgId: "a",
      chunkIdx: 0,
      totalChunks: 1,
      bytes: 80,
      createdAt: 1
    });
    room.addDeviceMessage("device-b", {
      relaySeq: 2,
      msgId: "b",
      chunkIdx: 0,
      totalChunks: 1,
      bytes: 80,
      createdAt: 2
    });

    expect(room.deviceEntries("device-a")).toEqual([]);
    expect(room.deviceEntries("device-b").map((entry) => entry.msgId)).toEqual(["b"]);
  });

  it("does not over-evict aggregate buffers after per-device eviction", () => {
    const room = new RelayRoomState({ perDeviceMaxBytes: 600, roomMaxBytes: 1_000 });
    room.addDeviceMessage("device-a", {
      relaySeq: 1,
      msgId: "a-old",
      chunkIdx: 0,
      totalChunks: 1,
      bytes: 600,
      createdAt: 1
    });
    room.addDeviceMessage("device-b", {
      relaySeq: 2,
      msgId: "b",
      chunkIdx: 0,
      totalChunks: 1,
      bytes: 380,
      createdAt: 2
    });
    room.addDeviceMessage("device-a", {
      relaySeq: 3,
      msgId: "a-new",
      chunkIdx: 0,
      totalChunks: 1,
      bytes: 600,
      createdAt: 3
    });

    expect(room.deviceEntries("device-a").map((entry) => entry.msgId)).toEqual(["a-new"]);
    expect(room.deviceEntries("device-b").map((entry) => entry.msgId)).toEqual(["b"]);
  });

  it("evicts expired snapshot entries using the durable object wake time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(86_400_001);

    const room = new RelayRoomState(
      { perDeviceMaxBytes: 1_000, roomMaxBytes: 1_000 },
      {
        buffers: [
          {
            deviceId: "device-a",
            entries: [
              {
                relaySeq: 1,
                msgId: "expired",
                chunkIdx: 0,
                totalChunks: 1,
                bytes: 100,
                createdAt: 0
              }
            ]
          }
        ]
      }
    );

    expect(room.deviceEntries("device-a")).toEqual([]);
  });

  it("rate-limits repeated failures by key", () => {
    const room = new RelayRoomState();

    expect(room.recordFailure("ip:1", 1_000)).toBe(false);
    expect(room.recordFailure("ip:1", 1_001)).toBe(false);
    expect(room.recordFailure("ip:1", 1_002)).toBe(false);
    expect(room.recordFailure("ip:1", 1_003)).toBe(false);
    expect(room.recordFailure("ip:1", 1_004)).toBe(true);
  });
});
