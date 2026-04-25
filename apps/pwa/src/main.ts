import {
  claimPairing,
  clientAuthMessage,
  clientPingMessage,
  clientWebSocketUrl,
  isClientAuthCloseFailure,
  parseRelayMessage
} from "./client.js";
import { parsePairingTarget, type PairingTarget } from "./pairing-target.js";
import {
  clearPairingState,
  loadOrCreateDeviceId,
  loadPairingState,
  parsePairingFragment,
  savePairingState,
  type PairingState
} from "./state.js";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing app root");
}

const root = app;
let claimStatus: { loading: boolean; roomId?: string; error?: string } = { loading: false };
let clientSocket: WebSocket | undefined;
let clientSocketKey: string | undefined;
let wsState = "idle";
let bridgeOnline = false;
let pingLog: string[] = [];

const fragment = parsePairingFragment(window.location.hash);
if (fragment) {
  void claimAndClearFragment({ relayOrigin: window.location.origin, fragment });
}

render();

function render(): void {
  const state = loadPairingState(window.localStorage);
  if (!state.paired) {
    renderPairingScreen();
    return;
  }

  ensureClientSocket(state);
  root.innerHTML = `
    <section class="workspace">
      <header>
        <div>
          <p class="eyebrow">Connected room</p>
          <h1>${escapeHtml(state.roomId)}</h1>
          <p class="muted">Device ${escapeHtml(state.deviceId)}</p>
        </div>
        <div class="status-stack">
          <span class="status">${bridgeOnline ? "Bridge online" : "Bridge offline"}</span>
          <span class="status muted-status">WS ${escapeHtml(wsState)}</span>
        </div>
      </header>
      <section class="composer">
        <button id="ping-button" type="button">Send ping</button>
      </section>
      <section class="timeline" aria-live="polite">
        ${pingLog
          .map(
            (line) => `
              <article>
                <p>${escapeHtml(line)}</p>
              </article>
            `
          )
          .join("")}
      </section>
    </section>
  `;
  document.querySelector<HTMLButtonElement>("#ping-button")?.addEventListener("click", sendPing);
}

function renderPairingScreen(): void {
  root.innerHTML = `
    <section class="shell">
      <div class="panel">
        <p class="eyebrow">Codex Remote Control</p>
        <h1>Pair this device</h1>
        <p>Run <code>crc bridge pair &lt;relay-url&gt;</code> on your computer, then scan or paste the pairing URL here.</p>
        <label>
          Pairing URL
          <input id="pair-url" autocomplete="off" placeholder="https://.../pair#room=...&code=..." />
        </label>
        <button id="pair-button" type="button" ${claimStatus.loading ? "disabled" : ""}>Pair</button>
        <p class="status-line" aria-live="polite">${pairingStatusText()}</p>
        <p id="pair-error" class="error" aria-live="polite">${escapeHtml(claimStatus.error ?? "")}</p>
      </div>
    </section>
  `;
  document.querySelector<HTMLButtonElement>("#pair-button")?.addEventListener("click", () => {
    const value = document.querySelector<HTMLInputElement>("#pair-url")?.value ?? "";
    const target = parsePairingTarget(value, window.location.origin);
    if (!target) {
      claimStatus = { loading: false, error: "Invalid pairing URL." };
      render();
      return;
    }
    void claimAndClearFragment(target);
  });
}

async function claimAndClearFragment(input: PairingTarget): Promise<void> {
  const { relayOrigin, fragment } = input;
  claimStatus = { loading: true, roomId: fragment.roomId };
  render();
  try {
    const deviceId = loadOrCreateDeviceId(window.localStorage);
    const claimed = await claimPairing(relayOrigin, fragment, deviceId);
    savePairingState(window.localStorage, {
      paired: true,
      roomId: claimed.roomId,
      deviceId: claimed.deviceId,
      deviceToken: claimed.deviceToken,
      relayOrigin
    });
    claimStatus = { loading: false };
  } catch (error) {
    clearPairingState(window.localStorage);
    claimStatus = {
      loading: false,
      error: error instanceof Error ? error.message : "Pair claim failed."
    };
  } finally {
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname || "/");
    }
    render();
  }
}

function ensureClientSocket(state: Extract<PairingState, { paired: true }>): void {
  const key = `${state.roomId}:${state.deviceId}:${state.deviceToken}`;
  if (
    clientSocketKey === key &&
    clientSocket &&
    (clientSocket.readyState === WebSocket.CONNECTING || clientSocket.readyState === WebSocket.OPEN)
  ) {
    return;
  }
  clientSocket?.close();
  clientSocketKey = key;
  wsState = "connecting";
  const ws = new WebSocket(clientWebSocketUrl(state.relayOrigin));
  clientSocket = ws;
  let authAccepted = false;
  ws.addEventListener("open", () => {
    wsState = "open";
    ws.send(clientAuthMessage(state));
    pushLog("client.auth sent");
    render();
  });
  ws.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    try {
      const message = parseRelayMessage(event.data);
      if (message.type === "presence.update") {
        authAccepted = true;
        bridgeOnline = message.payload.bridgeOnline;
        pushLog(`presence bridge=${bridgeOnline ? "online" : "offline"}`);
      }
      if (message.type === "bridge.pong") {
        pushLog(`pong ${message.payload.pingId}`);
      }
      if (message.type === "error") {
        pushLog(`error ${message.payload.code}: ${message.payload.message}`);
      }
    } catch {
      pushLog("ignored malformed relay message");
    }
    render();
  });
  ws.addEventListener("close", (event) => {
    if (clientSocket === ws) {
      if (isClientAuthCloseFailure(authAccepted, event.code)) {
        clearPairingState(window.localStorage);
        clientSocket = undefined;
        clientSocketKey = undefined;
        claimStatus = {
          loading: false,
          error: "WebSocket authentication failed. Please pair this device again."
        };
        wsState = "closed";
        bridgeOnline = false;
        render();
        return;
      }
      wsState = "closed";
      bridgeOnline = false;
      render();
    }
  });
  ws.addEventListener("error", () => {
    if (clientSocket === ws) {
      wsState = "error";
      render();
    }
  });
}

function sendPing(): void {
  const pingId = `ping-${Date.now()}`;
  if (!clientSocket || clientSocket.readyState !== WebSocket.OPEN) {
    pushLog(`cannot send ${pingId}: ws ${wsState}`);
    render();
    return;
  }
  clientSocket.send(clientPingMessage(pingId));
  pushLog(`sent ${pingId}`);
  render();
}

function pushLog(line: string): void {
  pingLog = [line, ...pingLog].slice(0, 20);
}

function pairingStatusText(): string {
  if (claimStatus.loading) {
    return `Claiming room ${claimStatus.roomId ?? ""}`;
  }
  return "Waiting for pairing URL";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
