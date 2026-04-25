import { describe, expect, it } from "vitest";
import {
  BridgeAuthPayloadSchema,
  ClientAuthPayloadSchema,
  PairClaimRequestSchema,
  Phase2MessageSchema,
  hashPhase2Secret,
  makeMessage,
  verifyPhase2SecretHash
} from "./phase2.js";

describe("Phase 2 protocol schemas", () => {
  it("validates pair claim requests", () => {
    expect(
      PairClaimRequestSchema.parse({
        roomId: "default",
        code: "pair-code",
        deviceId: "device-a",
        deviceName: "iPhone"
      })
    ).toMatchObject({ roomId: "default", deviceId: "device-a" });
    expect(
      PairClaimRequestSchema.parse({ roomId: "other", code: "pair-code", deviceId: "device-a" })
    ).toMatchObject({ roomId: "other" });
  });

  it("validates auth frames", () => {
    expect(BridgeAuthPayloadSchema.parse({ roomId: "default", secret: "secret" })).toEqual({
      roomId: "default",
      secret: "secret"
    });
    expect(
      ClientAuthPayloadSchema.parse({
        roomId: "default",
        deviceId: "device-a",
        deviceToken: "token"
      })
    ).toMatchObject({ deviceId: "device-a" });
    expect(() => BridgeAuthPayloadSchema.parse({ roomId: "other", secret: "secret" })).toThrow();
  });

  it("validates ping and pong envelopes", () => {
    expect(
      Phase2MessageSchema.parse(makeMessage("client.ping", { pingId: "ping-a" }))
    ).toMatchObject({
      type: "client.ping",
      payload: { pingId: "ping-a" }
    });
    expect(
      Phase2MessageSchema.parse(
        makeMessage("bridge.pong", { pingId: "ping-a", targetDeviceId: "device-a" })
      )
    ).toMatchObject({
      type: "bridge.pong",
      payload: { targetDeviceId: "device-a" }
    });
  });

  it("rejects malformed envelopes", () => {
    expect(() =>
      Phase2MessageSchema.parse({ id: "msg-a", type: "client.ping", payload: {}, ts: 0 })
    ).toThrow();
    expect(() =>
      Phase2MessageSchema.parse({
        id: "msg-a",
        type: "unknown",
        payload: {},
        ts: 0
      })
    ).toThrow();
  });
});

describe("Phase 2 secret hashes", () => {
  it("binds hash input to room, purpose, and secret", () => {
    const hash = hashPhase2Secret("default", "pair-code", "secret");

    expect(verifyPhase2SecretHash("default", "pair-code", "secret", hash)).toBe(true);
    expect(verifyPhase2SecretHash("default", "device-token", "secret", hash)).toBe(false);
    expect(verifyPhase2SecretHash("other", "pair-code", "secret", hash)).toBe(false);
  });
});
