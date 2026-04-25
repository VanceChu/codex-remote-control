import { describe, expect, it } from "vitest";
import {
  loadOrCreateDeviceId,
  loadPairingState,
  nextScreen,
  parsePairingFragment,
  savePairingState,
  savePendingPairing
} from "./state.js";

describe("parsePairingFragment", () => {
  it("reads room and code from hash fragment", () => {
    expect(parsePairingFragment("#room=abc&code=secret")).toEqual({
      roomId: "abc",
      code: "secret"
    });
  });

  it("rejects missing pairing data", () => {
    expect(parsePairingFragment("")).toBeUndefined();
    expect(parsePairingFragment("#room=abc")).toBeUndefined();
  });
});

describe("nextScreen", () => {
  it("shows pairing screen for unpaired state", () => {
    expect(nextScreen({ paired: false })).toBe("pairing");
  });

  it("keeps fragment pairing as pending until proof succeeds", () => {
    const storage = new Map<string, string>();
    savePendingPairing(
      {
        setItem(key, value) {
          storage.set(key, value);
        }
      },
      { roomId: "room-a", code: "secret" }
    );

    expect(
      loadPairingState({
        getItem(key) {
          return storage.get(key) ?? null;
        }
      })
    ).toEqual({ paired: false, pending: { roomId: "room-a" } });
  });

  it("shows workspace once paired", () => {
    expect(
      nextScreen({
        paired: true,
        deviceId: "device-a",
        roomId: "room-a",
        deviceToken: "token-a",
        relayOrigin: "https://relay.example"
      })
    ).toBe("workspace");
  });

  it("stores device token but never stores pairing code", () => {
    const storage = new Map<string, string>();
    savePairingState(
      {
        setItem(key, value) {
          storage.set(key, value);
        }
      },
      {
        paired: true,
        roomId: "room-a",
        deviceId: "device-a",
        deviceToken: "token-a",
        relayOrigin: "https://relay.example"
      }
    );

    expect(storage.get("crc.pairing")).toContain("token-a");
    expect(storage.get("crc.pairing")).toContain("https://relay.example");
    expect(storage.get("crc.pairing")).not.toContain("pair-code-a");
  });
});

describe("loadOrCreateDeviceId", () => {
  it("persists a generated device id", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      }
    };

    const first = loadOrCreateDeviceId(adapter);
    const second = loadOrCreateDeviceId(adapter);

    expect(first).toBe(second);
    expect(first).toMatch(/^device-/);
  });
});
