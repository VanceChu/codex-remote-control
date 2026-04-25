import { describe, expect, it } from "vitest";
import {
  claimPairing,
  clientAuthMessage,
  clientPingMessage,
  clientWebSocketUrl
} from "./client.js";

describe("claimPairing", () => {
  it("posts room, code, and device id without persisting code", async () => {
    const requests: Request[] = [];
    const response = await claimPairing(
      "https://relay.example",
      { roomId: "default", code: "code-a" },
      "device-a",
      async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          roomId: "default",
          deviceId: "device-a",
          deviceToken: "token-a-token-a-token-a",
          wsPath: "/ws/client"
        });
      }
    );

    expect(response.deviceToken).toBe("token-a-token-a-token-a");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://relay.example/api/pair/claim");
    await expect(requests[0]!.json()).resolves.toMatchObject({
      roomId: "default",
      code: "code-a",
      deviceId: "device-a"
    });
  });
});

describe("client websocket helpers", () => {
  it("builds auth and ping messages", () => {
    expect(clientWebSocketUrl("https://relay.example")).toBe("wss://relay.example/ws/client");

    const auth = JSON.parse(
      clientAuthMessage({
        paired: true,
        roomId: "default",
        deviceId: "device-a",
        deviceToken: "token-a"
      })
    );
    expect(auth).toMatchObject({
      type: "client.auth",
      payload: { roomId: "default", deviceId: "device-a", deviceToken: "token-a" }
    });

    expect(JSON.parse(clientPingMessage("ping-a"))).toMatchObject({
      type: "client.ping",
      payload: { pingId: "ping-a" }
    });
  });
});
