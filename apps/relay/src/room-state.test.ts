import { describe, expect, it } from "vitest";
import { RelayRoomState } from "./room-state.js";

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

  it("rate-limits repeated failures by key", () => {
    const room = new RelayRoomState();

    expect(room.recordFailure("ip:1", 1_000)).toBe(false);
    expect(room.recordFailure("ip:1", 1_001)).toBe(false);
    expect(room.recordFailure("ip:1", 1_002)).toBe(false);
    expect(room.recordFailure("ip:1", 1_003)).toBe(false);
    expect(room.recordFailure("ip:1", 1_004)).toBe(true);
  });
});
