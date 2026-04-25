import { describe, expect, it } from "vitest";
import { parsePairingTarget } from "./pairing-target.js";

describe("parsePairingTarget", () => {
  it("uses current origin for scanned relay /pair fragments", () => {
    expect(parsePairingTarget("#room=default&code=code-a", "https://relay.example")).toEqual({
      relayOrigin: "https://relay.example",
      fragment: { roomId: "default", code: "code-a" }
    });
  });

  it("uses pasted URL origin for local PWA pairing", () => {
    expect(
      parsePairingTarget(
        "https://relay.example/pair#room=default&code=code-a",
        "http://127.0.0.1:5173"
      )
    ).toEqual({
      relayOrigin: "https://relay.example",
      fragment: { roomId: "default", code: "code-a" }
    });
  });
});
