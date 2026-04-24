import { loadPairingState, parsePairingFragment, savePendingPairing } from "./state.js";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing app root");
}

const root = app;

const fragment = parsePairingFragment(window.location.hash);
if (fragment) {
  savePendingPairing(window.localStorage, fragment);
  history.replaceState(null, "", "/");
}

render();

function render(): void {
  const state = loadPairingState(window.localStorage);
  if (!state.paired && state.pending) {
    root.innerHTML = `
      <section class="shell">
        <div class="panel">
          <p class="eyebrow">Codex Remote Control</p>
          <h1>Pairing pending</h1>
          <p>Waiting for bridge proof before this device can open room <code>${escapeHtml(
            state.pending.roomId
          )}</code>.</p>
          <p class="status">Pending verification</p>
        </div>
      </section>
    `;
    return;
  }

  if (!state.paired) {
    root.innerHTML = `
      <section class="shell">
        <div class="panel">
          <p class="eyebrow">Codex Remote Control</p>
          <h1>Pair this device</h1>
          <p>Run <code>crc bridge pair</code> on your computer, then scan or paste the pairing URL here.</p>
          <label>
            Pairing URL
            <input id="pair-url" autocomplete="off" placeholder="https://.../pair#room=...&code=..." />
          </label>
          <button id="pair-button" type="button">Pair</button>
          <p id="pair-error" class="error" aria-live="polite"></p>
        </div>
      </section>
    `;
    document.querySelector<HTMLButtonElement>("#pair-button")?.addEventListener("click", () => {
      const value = document.querySelector<HTMLInputElement>("#pair-url")?.value ?? "";
      const parsedUrl = safeUrl(value);
      const parsed = parsedUrl ? parsePairingFragment(parsedUrl.hash) : undefined;
      if (!parsed) {
        const error = document.querySelector<HTMLParagraphElement>("#pair-error");
        if (error) {
          error.textContent = "Invalid pairing URL.";
        }
        return;
      }
      savePendingPairing(window.localStorage, parsed);
      render();
    });
    return;
  }

  root.innerHTML = `
    <section class="workspace">
      <header>
        <div>
          <p class="eyebrow">Connected room</p>
          <h1>${escapeHtml(state.roomId)}</h1>
        </div>
        <span class="status">Paired</span>
      </header>
      <section class="composer">
        <textarea placeholder="Ask Codex to work on this computer"></textarea>
        <button type="button">Send</button>
      </section>
      <section class="timeline" aria-live="polite">
        <article>
          <strong>Ready</strong>
          <p>The relay, bridge, and encrypted transport scaffolding are installed. Live Codex streaming is the next implementation slice.</p>
        </article>
      </section>
    </section>
  `;
}

function safeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
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
