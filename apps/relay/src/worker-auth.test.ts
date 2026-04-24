import { describe, expect, it } from "vitest";
import { authorizeWebSocketRequest } from "./worker.js";

describe("authorizeWebSocketRequest", () => {
  it("returns 501 when websocket auth is not configured", () => {
    const request = new Request("https://relay.example/ws/client", {
      headers: { Upgrade: "websocket" }
    });

    expect(authorizeWebSocketRequest(request, undefined)).toEqual({
      ok: false,
      status: 501,
      message: "WebSocket auth is not configured"
    });
  });

  it("requires the configured dev websocket secret", () => {
    const denied = new Request("https://relay.example/ws/client", {
      headers: { Upgrade: "websocket", "x-crc-dev-secret": "wrong" }
    });
    const allowed = new Request("https://relay.example/ws/client", {
      headers: { Upgrade: "websocket", "x-crc-dev-secret": "secret" }
    });

    expect(authorizeWebSocketRequest(denied, "secret")).toEqual({
      ok: false,
      status: 401,
      message: "Invalid WebSocket credentials"
    });
    expect(authorizeWebSocketRequest(allowed, "secret")).toEqual({ ok: true });
  });
});
