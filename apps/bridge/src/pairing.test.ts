import { describe, expect, it } from "vitest";
import { createPairingUrl } from "./pairing.js";

describe("createPairingUrl", () => {
  it("puts the pairing code in the fragment, not query string", () => {
    const url = createPairingUrl("https://relay.example", "ROOM", "SECRET");

    expect(url).toBe("https://relay.example/pair#room=ROOM&code=SECRET");
    expect(url).not.toContain("?code=");
  });
});
