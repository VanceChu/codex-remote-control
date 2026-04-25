import {
  PairCreateResponseSchema,
  PairClaimResponseSchema,
  makeMessage,
  phase2RoomId,
  websocketAuthTimeoutMs
} from "@crc/protocol";
import { describe, expect, it } from "vitest";
import { RemoteControlRoom, type Env } from "./worker.js";

class MemoryStorage {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

class FakeSocket {
  readonly sent: string[] = [];
  closeCode: number | undefined;
  closeReason: string | undefined;
  private attachment: unknown;

  constructor(attachment: unknown) {
    this.attachment = attachment;
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code;
    this.closeReason = reason;
  }

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

function durableState(storage: MemoryStorage, sockets: FakeSocket[] = []): DurableObjectState {
  return {
    storage,
    acceptWebSocket() {
      throw new Error("not used");
    },
    getWebSockets() {
      return sockets as unknown as WebSocket[];
    }
  } as unknown as DurableObjectState;
}

function env(): Env {
  return {
    ROOM: undefined as unknown as DurableObjectNamespace,
    CRC_DEV_WS_SECRET: "dev-secret"
  };
}

function socket(role: "bridge" | "client", connectedAt = Date.now()): FakeSocket {
  return new FakeSocket({
    routeRole: role,
    authenticated: false,
    connectedAt
  });
}

async function createClaimedDevice(room: RemoteControlRoom): Promise<{
  deviceId: string;
  deviceToken: string;
}> {
  const createResponse = await room.fetch(
    new Request("https://relay.example/api/pair/create", { method: "POST" })
  );
  const created = PairCreateResponseSchema.parse(await createResponse.json());
  const deviceId = "device-a";
  const claimResponse = await room.fetch(
    new Request("https://relay.example/api/pair/claim", {
      method: "POST",
      body: JSON.stringify({ roomId: phase2RoomId, code: created.code, deviceId }),
      headers: { "content-type": "application/json" }
    })
  );
  const claimed = PairClaimResponseSchema.parse(await claimResponse.json());
  return { deviceId, deviceToken: claimed.deviceToken };
}

describe("RemoteControlRoom phase 2 HTTP pairing", () => {
  it("claims a pairing code once and rejects reuse", async () => {
    const room = new RemoteControlRoom(durableState(new MemoryStorage()), env());
    const createResponse = await room.fetch(
      new Request("https://relay.example/api/pair/create", { method: "POST" })
    );
    expect(createResponse.status).toBe(200);
    const created = PairCreateResponseSchema.parse(await createResponse.json());

    const firstClaim = await room.fetch(
      new Request("https://relay.example/api/pair/claim", {
        method: "POST",
        body: JSON.stringify({ roomId: phase2RoomId, code: created.code, deviceId: "device-a" })
      })
    );
    expect(firstClaim.status).toBe(200);

    const secondClaim = await room.fetch(
      new Request("https://relay.example/api/pair/claim", {
        method: "POST",
        body: JSON.stringify({ roomId: phase2RoomId, code: created.code, deviceId: "device-b" })
      })
    );
    expect(secondClaim.status).toBe(401);
    await expect(secondClaim.json()).resolves.toEqual({ error: "already_claimed" });
  });

  it("rejects room mismatch and rate limits repeated bad claims", async () => {
    const room = new RemoteControlRoom(durableState(new MemoryStorage()), env());
    const createResponse = await room.fetch(
      new Request("https://relay.example/api/pair/create", { method: "POST" })
    );
    const created = PairCreateResponseSchema.parse(await createResponse.json());

    const badRoom = await room.fetch(
      new Request("https://relay.example/api/pair/claim", {
        method: "POST",
        body: JSON.stringify({ roomId: "other-room", code: created.code, deviceId: "device-a" })
      })
    );
    expect(badRoom.status).toBe(401);
    await expect(badRoom.json()).resolves.toEqual({ error: "invalid" });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await room.fetch(
        new Request("https://relay.example/api/pair/claim", {
          method: "POST",
          body: JSON.stringify({ roomId: phase2RoomId, code: "bad-code", deviceId: "device-a" })
        })
      );
    }
    const limited = await room.fetch(
      new Request("https://relay.example/api/pair/claim", {
        method: "POST",
        body: JSON.stringify({ roomId: phase2RoomId, code: created.code, deviceId: "device-a" })
      })
    );
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ error: "rate_limited" });
  });

  it("does not let bad claims for one device globally lock a valid claim", async () => {
    const room = new RemoteControlRoom(durableState(new MemoryStorage()), env());
    const createResponse = await room.fetch(
      new Request("https://relay.example/api/pair/create", { method: "POST" })
    );
    const created = PairCreateResponseSchema.parse(await createResponse.json());

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await room.fetch(
        new Request("https://relay.example/api/pair/claim", {
          method: "POST",
          body: JSON.stringify({
            roomId: phase2RoomId,
            code: "bad-code",
            deviceId: "attacker-device"
          }),
          headers: { "CF-Connecting-IP": "203.0.113.10" }
        })
      );
    }

    const valid = await room.fetch(
      new Request("https://relay.example/api/pair/claim", {
        method: "POST",
        body: JSON.stringify({
          roomId: phase2RoomId,
          code: created.code,
          deviceId: "legit-device"
        }),
        headers: { "CF-Connecting-IP": "203.0.113.20" }
      })
    );

    expect(valid.status).toBe(200);
    expect(PairClaimResponseSchema.parse(await valid.json())).toMatchObject({
      deviceId: "legit-device"
    });
  });
});

describe("RemoteControlRoom phase 2 websocket routing", () => {
  it("closes sockets that send business messages before auth", async () => {
    const room = new RemoteControlRoom(durableState(new MemoryStorage()), env());
    const client = socket("client");

    await room.webSocketMessage(
      client as unknown as WebSocket,
      JSON.stringify(makeMessage("client.ping", { pingId: "ping-a" }))
    );

    expect(client.closeCode).toBe(1008);
    expect(client.closeReason).toBe("authentication required");
  });

  it("closes sockets that miss the auth timeout", async () => {
    const room = new RemoteControlRoom(durableState(new MemoryStorage()), env());
    const client = socket("client", Date.now() - websocketAuthTimeoutMs - 1);

    await room.webSocketMessage(
      client as unknown as WebSocket,
      JSON.stringify(
        makeMessage("client.auth", { roomId: phase2RoomId, deviceId: "d", deviceToken: "t" })
      )
    );

    expect(client.closeCode).toBe(1008);
    expect(client.closeReason).toBe("authentication timeout");
  });

  it("routes client ping to bridge and bridge pong back to the source device", async () => {
    const room = new RemoteControlRoom(durableState(new MemoryStorage()), env());
    const claimed = await createClaimedDevice(room);
    const bridge = socket("bridge");
    const client = socket("client");

    await room.webSocketMessage(
      bridge as unknown as WebSocket,
      JSON.stringify(makeMessage("bridge.auth", { roomId: phase2RoomId, secret: "dev-secret" }))
    );
    await room.webSocketMessage(
      client as unknown as WebSocket,
      JSON.stringify(
        makeMessage("client.auth", {
          roomId: phase2RoomId,
          deviceId: claimed.deviceId,
          deviceToken: claimed.deviceToken
        })
      )
    );

    await room.webSocketMessage(
      client as unknown as WebSocket,
      JSON.stringify(makeMessage("client.ping", { pingId: "ping-a" }, "client-msg"))
    );

    const routedPing = bridge.sent
      .map((line) => JSON.parse(line))
      .find((msg) => msg.type === "bridge.ping");
    expect(routedPing).toMatchObject({
      type: "bridge.ping",
      payload: { pingId: "ping-a", sourceDeviceId: claimed.deviceId }
    });

    await room.webSocketMessage(
      bridge as unknown as WebSocket,
      JSON.stringify(
        makeMessage(
          "bridge.pong",
          { pingId: "ping-a", targetDeviceId: claimed.deviceId },
          "pong-msg"
        )
      )
    );

    const routedPong = client.sent
      .map((line) => JSON.parse(line))
      .find((msg) => msg.type === "bridge.pong");
    expect(routedPong).toMatchObject({
      type: "bridge.pong",
      id: "pong-msg",
      payload: { pingId: "ping-a", targetDeviceId: claimed.deviceId }
    });
  });

  it("rehydrates authenticated sockets from hibernation attachments", async () => {
    const storage = new MemoryStorage();
    const firstWake = new RemoteControlRoom(durableState(storage), env());
    const claimed = await createClaimedDevice(firstWake);
    const bridge = new FakeSocket({
      routeRole: "bridge",
      authenticated: true,
      connectedAt: Date.now()
    });
    const client = new FakeSocket({
      routeRole: "client",
      authenticated: true,
      connectedAt: Date.now(),
      deviceId: claimed.deviceId
    });
    const secondWake = new RemoteControlRoom(durableState(storage, [bridge, client]), env());

    await secondWake.webSocketMessage(
      client as unknown as WebSocket,
      JSON.stringify(makeMessage("client.ping", { pingId: "ping-after-wake" }))
    );

    const routedPing = bridge.sent
      .map((line) => JSON.parse(line))
      .find((msg) => msg.type === "bridge.ping");
    expect(routedPing).toMatchObject({
      type: "bridge.ping",
      payload: { pingId: "ping-after-wake", sourceDeviceId: claimed.deviceId }
    });
  });
});
