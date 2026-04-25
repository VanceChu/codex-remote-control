import { describe, expect, it } from "vitest";
import { NOISE_IK_FIXTURE, runNoiseIkKnownAnswerTest } from "@crc/protocol";

describe("browser Noise IK KAT", () => {
  it("runs in a real browser runtime", () => {
    expect(globalThis.window).toBeDefined();
    expect(globalThis.crypto?.subtle).toBeDefined();
  });

  it("matches the shared Noise IK fixture", () => {
    expect(runNoiseIkKnownAnswerTest()).toEqual({
      ok: true,
      fixtureId: NOISE_IK_FIXTURE.id,
      protocolName: NOISE_IK_FIXTURE.protocolName,
      handshakeHash: NOISE_IK_FIXTURE.expected.handshakeHash,
      failures: []
    });
  });
});
