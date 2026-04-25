import { makeMessage, phase2RoomId } from "@crc/protocol";
import { describe, expect, it } from "vitest";
import { createRemotePairing, handleBridgeMessage, websocketUrl } from "./relay-runtime.js";

describe("createRemotePairing", () => {
  it("posts pair create with the provisional secret and returns the pair URL", async () => {
    const requests: Request[] = [];
    const pairUrl = "https://relay.example/pair#room=default&code=code-a";
    const fetchImpl: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return Response.json({
        roomId: phase2RoomId,
        code: "code-a-code-a-code-a",
        pairUrl,
        expiresAt: Date.now() + 60_000
      });
    };

    const returned = await createRemotePairing({
      relayOrigin: "https://relay.example",
      secret: "dev-secret",
      fetchImpl,
      log: () => {}
    });

    expect(returned).toBe(pairUrl);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://relay.example/api/pair/create");
    expect(requests[0]!.headers.get("x-crc-dev-secret")).toBe("dev-secret");
  });
});

describe("handleBridgeMessage", () => {
  it("answers bridge ping with a targeted pong", () => {
    const sent: string[] = [];
    handleBridgeMessage(
      { send: (message: string) => sent.push(message) },
      JSON.stringify(
        makeMessage("bridge.ping", { pingId: "ping-a", sourceDeviceId: "device-a" }, "ping-msg")
      ),
      () => {}
    );

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toMatchObject({
      type: "bridge.pong",
      payload: { pingId: "ping-a", targetDeviceId: "device-a" }
    });
  });
});

describe("websocketUrl", () => {
  it("converts relay origins to websocket URLs", () => {
    expect(websocketUrl("https://relay.example", "/ws/bridge")).toBe(
      "wss://relay.example/ws/bridge"
    );
    expect(websocketUrl("http://127.0.0.1:8787", "/ws/client")).toBe(
      "ws://127.0.0.1:8787/ws/client"
    );
  });
});
