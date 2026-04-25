import { RelayRoomState, type RelayRoomSnapshot } from "./room-state.js";
import { runNoiseIkKnownAnswerTest } from "@crc/protocol";

export interface Env {
  ASSETS?: Fetcher;
  ROOM: DurableObjectNamespace;
  CRC_ENABLE_SELF_TEST?: string;
  CRC_DEV_WS_SECRET?: string;
}

export type WebSocketAuthResult = { ok: true } | { ok: false; status: 401 | 501; message: string };
export type SelfTestAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 404 | 501; message: string };

const roomName = "default";
const roomStateStorageKey = "room-state-v1";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/__crc/self-test/noise-kat") {
      return handleNoiseKatSelfTest(request, env);
    }
    if (url.pathname === "/ws/client" || url.pathname === "/ws/bridge") {
      const auth = authorizeWebSocketRequest(request, env.CRC_DEV_WS_SECRET);
      if (!auth.ok) {
        return new Response(auth.message, { status: auth.status });
      }
      const id = env.ROOM.idFromName(roomName);
      return env.ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/pair") {
      return new Response("Open the Codex Remote Control PWA to complete pairing.", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Codex Remote Control relay", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};

export function authorizeSelfTestRequest(request: Request, env: Env): SelfTestAuthResult {
  if (env.CRC_ENABLE_SELF_TEST !== "1") {
    return { ok: false, status: 404, message: "Not found" };
  }
  if (!env.CRC_DEV_WS_SECRET) {
    return { ok: false, status: 501, message: "Self-test auth is not configured" };
  }
  if (request.headers.get("x-crc-dev-secret") !== env.CRC_DEV_WS_SECRET) {
    return { ok: false, status: 401, message: "Invalid self-test credentials" };
  }
  return { ok: true };
}

export function handleNoiseKatSelfTest(request: Request, env: Env): Response {
  const auth = authorizeSelfTestRequest(request, env);
  if (!auth.ok) {
    return new Response(auth.message, { status: auth.status });
  }
  const result = runNoiseIkKnownAnswerTest();
  return Response.json({
    ok: result.ok,
    fixtureId: result.fixtureId,
    protocolName: result.protocolName,
    handshakeHash: result.handshakeHash,
    failures: result.failures
  });
}

export function authorizeWebSocketRequest(
  request: Request,
  devSecret: string | undefined
): WebSocketAuthResult {
  if (!devSecret) {
    return { ok: false, status: 501, message: "WebSocket auth is not configured" };
  }
  if (request.headers.get("x-crc-dev-secret") !== devSecret) {
    return { ok: false, status: 401, message: "Invalid WebSocket credentials" };
  }
  return { ok: true };
}

export class RemoteControlRoom implements DurableObject {
  private stateModel?: RelayRoomState;

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json({ ok: true, room: "default" });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const role = request.url.includes("/ws/bridge") ? "bridge" : "client";
    server.serializeAttachment({ role });
    this.state.acceptWebSocket(server, [role]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as { role?: string } | undefined;
    const role = attachment?.role ?? "unknown";
    ws.send(
      JSON.stringify({
        type: "ack",
        role,
        bytes: typeof message === "string" ? message.length : message.byteLength
      })
    );
  }

  async webSocketClose(): Promise<void> {}

  async webSocketError(): Promise<void> {}

  async registerBridgeForTest(
    publicKey: string
  ): Promise<ReturnType<RelayRoomState["registerBridge"]>> {
    const state = await this.roomState();
    const result = state.registerBridge(publicKey);
    await this.saveRoomState(state);
    return result;
  }

  private async roomState(): Promise<RelayRoomState> {
    if (!this.stateModel) {
      const snapshot = await this.state.storage.get<RelayRoomSnapshot>(roomStateStorageKey);
      this.stateModel = new RelayRoomState(undefined, snapshot);
    }
    return this.stateModel;
  }

  private async saveRoomState(state: RelayRoomState): Promise<void> {
    await this.state.storage.put(roomStateStorageKey, state.snapshot());
  }
}
