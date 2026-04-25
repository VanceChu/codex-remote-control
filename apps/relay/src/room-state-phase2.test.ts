import { phase2RoomId } from "@crc/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RelayRoomState } from "./room-state.js";

describe("RelayRoomState phase 2 pairing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and claims a one-time pairing code", () => {
    const state = new RelayRoomState();
    const created = state.createPairing("https://relay.example", 1_000);

    expect(created.roomId).toBe(phase2RoomId);
    expect(created.pairUrl).toContain("/pair#");
    expect(created.pairUrl).toContain("room=default");

    const claimed = state.claimPairing({
      roomId: phase2RoomId,
      code: created.code,
      deviceId: "device-a",
      now: 2_000
    });

    expect(claimed).toMatchObject({
      status: "claimed",
      roomId: phase2RoomId,
      deviceId: "device-a",
      wsPath: "/ws/client"
    });

    if (claimed.status !== "claimed") {
      throw new Error("expected claimed result");
    }
    expect(state.verifyDeviceToken("device-a", claimed.deviceToken)).toBe(true);
  });

  it("rejects expired and reused pairing codes", () => {
    const state = new RelayRoomState();
    const created = state.createPairing("https://relay.example", 1_000);

    expect(
      state.claimPairing({
        roomId: phase2RoomId,
        code: created.code,
        deviceId: "device-a",
        now: created.expiresAt + 1
      })
    ).toEqual({ status: "expired" });

    const fresh = state.createPairing("https://relay.example", 2_000);
    expect(
      state.claimPairing({
        roomId: phase2RoomId,
        code: fresh.code,
        deviceId: "device-a",
        now: 3_000
      }).status
    ).toBe("claimed");
    expect(
      state.claimPairing({
        roomId: phase2RoomId,
        code: fresh.code,
        deviceId: "device-b",
        now: 4_000
      })
    ).toEqual({ status: "already_claimed" });
  });

  it("does not persist plaintext code or token in snapshots", () => {
    const state = new RelayRoomState();
    const created = state.createPairing("https://relay.example", 1_000);
    const claimed = state.claimPairing({
      roomId: phase2RoomId,
      code: created.code,
      deviceId: "device-a",
      now: 2_000
    });
    if (claimed.status !== "claimed") {
      throw new Error("expected claimed result");
    }

    const snapshot = JSON.stringify(state.snapshot());
    expect(snapshot).not.toContain(created.code);
    expect(snapshot).not.toContain(claimed.deviceToken);
  });

  it("restores device token hashes from snapshots", () => {
    const state = new RelayRoomState();
    const created = state.createPairing("https://relay.example", 1_000);
    const claimed = state.claimPairing({
      roomId: phase2RoomId,
      code: created.code,
      deviceId: "device-a",
      now: 2_000
    });
    if (claimed.status !== "claimed") {
      throw new Error("expected claimed result");
    }

    vi.spyOn(Date, "now").mockReturnValue(2_000);
    const restored = new RelayRoomState(undefined, state.snapshot());
    expect(restored.verifyDeviceToken("device-a", claimed.deviceToken)).toBe(true);
  });

  it("expires claimed pairing records from restored snapshots", () => {
    const state = new RelayRoomState();
    const created = state.createPairing("https://relay.example", 1_000);
    const claimed = state.claimPairing({
      roomId: phase2RoomId,
      code: created.code,
      deviceId: "device-a",
      now: 2_000
    });
    if (claimed.status !== "claimed") {
      throw new Error("expected claimed result");
    }

    vi.spyOn(Date, "now").mockReturnValue(created.expiresAt + 1);
    const restored = new RelayRoomState(undefined, state.snapshot());

    expect(restored.snapshot().pairings).toHaveLength(0);
    expect(restored.verifyDeviceToken("device-a", claimed.deviceToken)).toBe(true);
  });
});
