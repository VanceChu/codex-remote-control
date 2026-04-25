import { describe, expect, it } from "vitest";
import { authorizeSelfTestRequest, handleNoiseKatSelfTest, type Env } from "./worker.js";

function env(overrides: Partial<Env> = {}): Env {
  return {
    ROOM: {} as DurableObjectNamespace,
    ...overrides
  };
}

describe("Noise KAT self-test route", () => {
  it("is hidden unless explicitly enabled", () => {
    const request = new Request("https://relay.example/__crc/self-test/noise-kat");

    expect(authorizeSelfTestRequest(request, env())).toEqual({
      ok: false,
      status: 404,
      message: "Not found"
    });
  });

  it("requires the provisional websocket secret when enabled", () => {
    const request = new Request("https://relay.example/__crc/self-test/noise-kat", {
      headers: { "x-crc-dev-secret": "wrong" }
    });

    expect(
      authorizeSelfTestRequest(
        request,
        env({ CRC_ENABLE_SELF_TEST: "1", CRC_DEV_WS_SECRET: "secret" })
      )
    ).toEqual({
      ok: false,
      status: 401,
      message: "Invalid self-test credentials"
    });
  });

  it("returns 501 when enabled without a configured secret", () => {
    const request = new Request("https://relay.example/__crc/self-test/noise-kat");

    expect(authorizeSelfTestRequest(request, env({ CRC_ENABLE_SELF_TEST: "1" }))).toEqual({
      ok: false,
      status: 501,
      message: "Self-test auth is not configured"
    });
  });

  it("returns the shared Noise KAT result with the correct gate and secret", async () => {
    const request = new Request("https://relay.example/__crc/self-test/noise-kat", {
      headers: { "x-crc-dev-secret": "secret" }
    });

    const response = handleNoiseKatSelfTest(
      request,
      env({ CRC_ENABLE_SELF_TEST: "1", CRC_DEV_WS_SECRET: "secret" })
    );
    const body = (await response.json()) as { ok: boolean; fixtureId: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      fixtureId: "noise-ik-25519-chachapoly-sha256-v1"
    });
  });
});
