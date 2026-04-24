import { describe, expect, it } from "vitest";
import { loadPairingState, nextScreen, parsePairingFragment, savePendingPairing } from "./state.js";

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
    expect(nextScreen({ paired: true, deviceId: "device-a", roomId: "room-a" })).toBe("workspace");
  });
});
