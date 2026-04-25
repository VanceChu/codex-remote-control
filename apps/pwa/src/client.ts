import {
  PairClaimResponseSchema,
  makeMessage,
  parsePhase2MessageText,
  phase2RoomId,
  type PairClaimResponse,
  type Phase2Message
} from "@crc/protocol";
import type { PairingFragment, PairingState } from "./state.js";

export async function claimPairing(
  origin: string,
  fragment: PairingFragment,
  deviceId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PairClaimResponse> {
  const response = await fetchImpl(new URL("/api/pair/claim", origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pairClaimBody(fragment, deviceId))
  });
  if (!response.ok) {
    throw new Error(`Pair claim failed with HTTP ${response.status}`);
  }
  return PairClaimResponseSchema.parse(await response.json());
}

function pairClaimBody(
  fragment: PairingFragment,
  deviceId: string
): {
  roomId: string;
  code: string;
  deviceId: string;
  deviceName?: string;
} {
  const body: {
    roomId: string;
    code: string;
    deviceId: string;
    deviceName?: string;
  } = { roomId: fragment.roomId, code: fragment.code, deviceId };
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    body.deviceName = navigator.userAgent.slice(0, 120);
  }
  return body;
}

export function clientWebSocketUrl(origin: string): string {
  const url = new URL("/ws/client", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function clientAuthMessage(state: Extract<PairingState, { paired: true }>): string {
  if (state.roomId !== phase2RoomId) {
    throw new Error(`Unsupported room: ${state.roomId}`);
  }
  return JSON.stringify(
    makeMessage("client.auth", {
      roomId: phase2RoomId,
      deviceId: state.deviceId,
      deviceToken: state.deviceToken
    })
  );
}

export function clientPingMessage(pingId: string): string {
  return JSON.stringify(makeMessage("client.ping", { pingId }));
}

export function parseRelayMessage(text: string): Phase2Message {
  return parsePhase2MessageText(text);
}
