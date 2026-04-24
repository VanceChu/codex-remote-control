import { RelayRoomState } from "./room-state.js";

export interface Env {
  ROOM: DurableObjectNamespace;
}

const roomName = "default";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/ws/client" || url.pathname === "/ws/bridge") {
      const id = env.ROOM.idFromName(roomName);
      return env.ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/pair") {
      return new Response("Open the Codex Remote Control PWA to complete pairing.", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
    return new Response("Codex Remote Control relay", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};

export class RemoteControlRoom implements DurableObject {
  private readonly stateModel = new RelayRoomState();

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

  registerBridgeForTest(publicKey: string): ReturnType<RelayRoomState["registerBridge"]> {
    return this.stateModel.registerBridge(publicKey);
  }
}
