import qrcode from "qrcode-terminal";
import {
  PairCreateResponseSchema,
  makeMessage,
  parsePhase2MessageText,
  phase2RoomId,
  type Phase2Message
} from "@crc/protocol";

export interface BridgeRuntimeOptions {
  relayOrigin: string;
  secret: string;
  log?: (line: string) => void;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
}

export async function createRemotePairing(options: BridgeRuntimeOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(new URL("/api/pair/create", options.relayOrigin), {
    method: "POST",
    headers: { "x-crc-dev-secret": options.secret }
  });
  if (!response.ok) {
    throw new Error(`Pair create failed with HTTP ${response.status}`);
  }
  const payload = PairCreateResponseSchema.parse(await response.json());
  options.log?.(payload.pairUrl);
  qrcode.generate(payload.pairUrl, { small: true }, (code) => options.log?.(code));
  return payload.pairUrl;
}

export function startBridgeRuntime(options: BridgeRuntimeOptions): () => void {
  const log = options.log ?? console.log;
  const WebSocketCtor = options.WebSocketImpl ?? WebSocket;
  let closed = false;
  let current: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = (): void => {
    if (closed) {
      return;
    }
    const wsUrl = websocketUrl(options.relayOrigin, "/ws/bridge");
    const ws = new WebSocketCtor(wsUrl);
    current = ws;
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify(makeMessage("bridge.auth", { roomId: phase2RoomId, secret: options.secret }))
      );
      log(`bridge online: ${wsUrl}`);
    });
    ws.addEventListener("message", (event) => {
      const text = typeof event.data === "string" ? event.data : undefined;
      if (!text) {
        return;
      }
      handleBridgeMessage(ws, text, log);
    });
    ws.addEventListener("close", () => {
      log("bridge websocket closed");
      if (!closed) {
        reconnectTimer = setTimeout(connect, 1_000);
      }
    });
    ws.addEventListener("error", () => {
      log("bridge websocket error");
    });
  };

  connect();
  return () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    current?.close();
  };
}

export function handleBridgeMessage(
  ws: Pick<WebSocket, "send">,
  text: string,
  log = console.log
): void {
  let message: Phase2Message;
  try {
    message = parsePhase2MessageText(text);
  } catch {
    log("bridge ignored malformed relay message");
    return;
  }
  if (message.type === "presence.update") {
    log(
      `presence: bridge=${message.payload.bridgeOnline ? "online" : "offline"} devices=${message.payload.devices.length}`
    );
    return;
  }
  if (message.type === "bridge.ping") {
    log(`ping from ${message.payload.sourceDeviceId}: ${message.payload.pingId}`);
    ws.send(
      JSON.stringify(
        makeMessage("bridge.pong", {
          pingId: message.payload.pingId,
          targetDeviceId: message.payload.sourceDeviceId
        })
      )
    );
  }
}

export function websocketUrl(relayOrigin: string, path: string): string {
  const url = new URL(path, relayOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
