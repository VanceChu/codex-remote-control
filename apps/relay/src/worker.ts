import { RelayRoomState, type ClaimPairingResult, type RelayRoomSnapshot } from "./room-state.js";
import {
  BridgeAuthPayloadSchema,
  BridgePongPayloadSchema,
  ClientAuthPayloadSchema,
  ClientPingPayloadSchema,
  PairClaimRequestSchema,
  makeMessage,
  parsePhase2MessageText,
  runNoiseIkKnownAnswerTest,
  websocketAuthTimeoutMs,
  type Phase2Message
} from "@crc/protocol";

export interface Env {
  ASSETS?: Fetcher;
  ROOM: DurableObjectNamespace;
  CRC_ENABLE_SELF_TEST?: string;
  CRC_DEV_WS_SECRET?: string;
}

export type WebSocketAuthResult = { ok: true } | { ok: false; status: 401 | 501; message: string };
export type SecretConfiguredResult = { ok: true } | { ok: false; status: 501; message: string };
export type SelfTestAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 404 | 501; message: string };

interface SocketAttachment {
  routeRole: "bridge" | "client";
  authenticated: boolean;
  connectedAt: number;
  deviceId?: string;
}

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
    if (url.pathname === "/api/pair/create" && request.method === "POST") {
      const auth = authorizeDevSecretRequest(request, env.CRC_DEV_WS_SECRET, "Pair create");
      if (!auth.ok) {
        return new Response(auth.message, { status: auth.status });
      }
      const id = env.ROOM.idFromName(roomName);
      return env.ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/api/pair/claim" && request.method === "POST") {
      const id = env.ROOM.idFromName(roomName);
      return env.ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/ws/client" || url.pathname === "/ws/bridge") {
      const auth = requireWebSocketSecretConfigured(env.CRC_DEV_WS_SECRET);
      if (!auth.ok) {
        return new Response(auth.message, { status: auth.status });
      }
      const id = env.ROOM.idFromName(roomName);
      return env.ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/pair") {
      return servePwaShell(request, env);
    }
    return new Response("Codex Remote Control relay", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};

function servePwaShell(request: Request, env: Env): Response | Promise<Response> {
  if (!env.ASSETS) {
    return new Response("PWA assets are not configured", { status: 501 });
  }
  const url = new URL("/", request.url);
  return env.ASSETS.fetch(new Request(url, request));
}

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
  return authorizeDevSecretRequest(request, devSecret, "WebSocket");
}

export function authorizeDevSecretRequest(
  request: Request,
  devSecret: string | undefined,
  label: string
): WebSocketAuthResult {
  if (!devSecret) {
    return { ok: false, status: 501, message: `${label} auth is not configured` };
  }
  if (request.headers.get("x-crc-dev-secret") !== devSecret) {
    return { ok: false, status: 401, message: `Invalid ${label} credentials` };
  }
  return { ok: true };
}

export function requireWebSocketSecretConfigured(
  devSecret: string | undefined
): SecretConfiguredResult {
  if (!devSecret) {
    return { ok: false, status: 501, message: "WebSocket auth is not configured" };
  }
  return { ok: true };
}

export class RemoteControlRoom implements DurableObject {
  private stateModel?: RelayRoomState;
  private bridgeSocket: WebSocket | undefined;
  private readonly clientSockets = new Map<string, WebSocket>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env = { ROOM: undefined as unknown as DurableObjectNamespace }
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/pair/create" && request.method === "POST") {
      const state = await this.roomState();
      const now = Date.now();
      if (state.isRateLimited("pair-create", now)) {
        return Response.json({ error: "rate_limited" }, { status: 429 });
      }
      state.recordFailure("pair-create", now);
      const response = state.createPairing(url.origin);
      await this.saveRoomState(state);
      return Response.json(response);
    }
    if (url.pathname === "/api/pair/claim" && request.method === "POST") {
      const state = await this.roomState();
      let input: unknown;
      try {
        input = await request.json();
      } catch {
        return Response.json({ error: "invalid_json" }, { status: 400 });
      }
      const parsed = PairClaimRequestSchema.safeParse(input);
      if (!parsed.success) {
        state.recordFailure("pair-claim:invalid", Date.now());
        return Response.json({ error: "invalid_pair_claim" }, { status: 400 });
      }
      const now = Date.now();
      if (state.isRateLimited("pair-claim", now)) {
        return Response.json({ error: "rate_limited" }, { status: 429 });
      }
      const result = state.claimPairing(
        parsed.data.deviceName === undefined
          ? { roomId: parsed.data.roomId, code: parsed.data.code, deviceId: parsed.data.deviceId }
          : {
              roomId: parsed.data.roomId,
              code: parsed.data.code,
              deviceId: parsed.data.deviceId,
              deviceName: parsed.data.deviceName
            }
      );
      if (result.status !== "claimed") {
        state.recordFailure("pair-claim", now);
      }
      await this.saveRoomState(state);
      return claimPairingResponse(result);
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json({ ok: true, room: "default" });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const role = request.url.includes("/ws/bridge") ? "bridge" : "client";
    const attachment: SocketAttachment = {
      routeRole: role,
      authenticated: false,
      connectedAt: Date.now()
    };
    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server, [role]);
    this.scheduleAuthTimeout(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.rehydrateSockets();
    if (typeof message !== "string") {
      this.closeForProtocolError(ws, "binary messages are not supported");
      return;
    }
    const attachment = this.attachment(ws);
    if (!attachment.authenticated && Date.now() - attachment.connectedAt > websocketAuthTimeoutMs) {
      await this.recordSocketFailure(attachment.routeRole, "auth-timeout");
      ws.close(1008, "authentication timeout");
      return;
    }
    let parsed: Phase2Message;
    try {
      parsed = parsePhase2MessageText(message);
    } catch {
      this.closeForProtocolError(ws, "invalid message");
      return;
    }
    if (!attachment.authenticated) {
      await this.handleAuthMessage(ws, attachment, parsed);
      return;
    }
    await this.handleAuthenticatedMessage(ws, attachment, parsed);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.rehydrateSockets();
    const attachment = this.attachment(ws);
    if (attachment.routeRole === "bridge" && this.bridgeSocket === ws) {
      this.bridgeSocket = undefined;
      this.broadcastPresence();
    }
    if (attachment.routeRole === "client" && attachment.deviceId) {
      const current = this.clientSockets.get(attachment.deviceId);
      if (current === ws) {
        this.clientSockets.delete(attachment.deviceId);
        this.broadcastPresence();
      }
    }
  }

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

  private async handleAuthMessage(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Phase2Message
  ): Promise<void> {
    this.rehydrateSockets();
    if (attachment.routeRole === "bridge" && message.type === "bridge.auth") {
      const parsed = BridgeAuthPayloadSchema.safeParse(message.payload);
      if (!parsed.success || parsed.data.secret !== this.expectedBridgeSecret()) {
        await this.recordSocketFailure("bridge", "bad-auth");
        ws.close(1008, "invalid bridge auth");
        return;
      }
      attachment.authenticated = true;
      ws.serializeAttachment(attachment);
      if (this.bridgeSocket && this.bridgeSocket !== ws) {
        this.bridgeSocket.close(1000, "bridge replaced");
      }
      this.bridgeSocket = ws;
      ws.send(JSON.stringify(makeMessage("presence.update", this.presencePayload())));
      this.broadcastPresence();
      return;
    }
    if (attachment.routeRole === "client" && message.type === "client.auth") {
      const parsed = ClientAuthPayloadSchema.safeParse(message.payload);
      const state = await this.roomState();
      if (
        !parsed.success ||
        !state.verifyDeviceToken(parsed.data.deviceId, parsed.data.deviceToken)
      ) {
        await this.recordSocketFailure("client", "bad-auth");
        ws.close(1008, "invalid client auth");
        return;
      }
      attachment.authenticated = true;
      attachment.deviceId = parsed.data.deviceId;
      ws.serializeAttachment(attachment);
      const existing = this.clientSockets.get(parsed.data.deviceId);
      if (existing && existing !== ws) {
        existing.close(1000, "client replaced");
      }
      this.clientSockets.set(parsed.data.deviceId, ws);
      ws.send(JSON.stringify(makeMessage("presence.update", this.presencePayload())));
      this.broadcastPresence();
      return;
    }
    await this.recordSocketFailure(attachment.routeRole, "business-before-auth");
    ws.close(1008, "authentication required");
  }

  private async handleAuthenticatedMessage(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Phase2Message
  ): Promise<void> {
    if (attachment.routeRole === "client" && message.type === "client.ping") {
      const parsed = ClientPingPayloadSchema.parse(message.payload);
      if (!this.bridgeSocket) {
        ws.send(
          JSON.stringify(
            makeMessage(
              "error",
              { code: "bridge_offline", message: "Bridge is offline" },
              message.id
            )
          )
        );
        return;
      }
      this.bridgeSocket.send(
        JSON.stringify(
          makeMessage("bridge.ping", {
            pingId: parsed.pingId,
            sourceDeviceId: attachment.deviceId ?? "unknown"
          })
        )
      );
      return;
    }
    if (attachment.routeRole === "bridge" && message.type === "bridge.pong") {
      const parsed = BridgePongPayloadSchema.parse(message.payload);
      const client = this.clientSockets.get(parsed.targetDeviceId);
      if (client) {
        client.send(JSON.stringify(makeMessage("bridge.pong", parsed, message.id)));
      }
      return;
    }
    ws.send(
      JSON.stringify(makeMessage("error", { code: "unsupported", message: "Unsupported message" }))
    );
  }

  private scheduleAuthTimeout(ws: WebSocket): void {
    setTimeout(() => {
      const attachment = this.attachment(ws);
      if (!attachment.authenticated) {
        void this.recordSocketFailure(attachment.routeRole, "auth-timeout");
        ws.close(1008, "authentication timeout");
      }
    }, websocketAuthTimeoutMs);
  }

  private closeForProtocolError(ws: WebSocket, reason: string): void {
    const attachment = this.attachment(ws);
    void this.recordSocketFailure(attachment.routeRole, "protocol-error");
    ws.close(1008, reason);
  }

  private async recordSocketFailure(role: string, reason: string): Promise<void> {
    const state = await this.roomState();
    state.recordFailure(`ws:${role}:${reason}`, Date.now());
  }

  private broadcastPresence(): void {
    this.rehydrateSockets();
    const message = JSON.stringify(makeMessage("presence.update", this.presencePayload()));
    if (this.bridgeSocket) {
      this.bridgeSocket.send(message);
    }
    for (const socket of this.clientSockets.values()) {
      socket.send(message);
    }
  }

  private presencePayload(): {
    bridgeOnline: boolean;
    devices: Array<{ deviceId: string; online: boolean }>;
  } {
    return {
      bridgeOnline: this.bridgeSocket !== undefined,
      devices: [...this.clientSockets.keys()].map((deviceId) => ({ deviceId, online: true }))
    };
  }

  private attachment(ws: WebSocket): SocketAttachment {
    return ws.deserializeAttachment() as SocketAttachment;
  }

  private rehydrateSockets(): void {
    const state = this.state as DurableObjectState & {
      getWebSockets?: () => WebSocket[];
    };
    const sockets = state.getWebSockets?.() ?? [];
    for (const socket of sockets) {
      const attachment = this.attachment(socket);
      if (!attachment.authenticated) {
        continue;
      }
      if (attachment.routeRole === "bridge") {
        this.bridgeSocket ??= socket;
      }
      if (attachment.routeRole === "client" && attachment.deviceId) {
        this.clientSockets.set(attachment.deviceId, socket);
      }
    }
  }

  private expectedBridgeSecret(): string | undefined {
    return this.env.CRC_DEV_WS_SECRET;
  }
}

function claimPairingResponse(result: ClaimPairingResult): Response {
  if (result.status === "claimed") {
    return Response.json(result);
  }
  const status = result.status === "expired" ? 410 : 401;
  return Response.json({ error: result.status }, { status });
}
