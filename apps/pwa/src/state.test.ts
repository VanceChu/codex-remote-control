import { describe, expect, it } from "vitest";
import { nextScreen, parsePairingFragment } from "./state.js";

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

  it("shows workspace once paired", () => {
    expect(nextScreen({ paired: true, deviceId: "device-a", roomId: "room-a" })).toBe("workspace");
  });
});
