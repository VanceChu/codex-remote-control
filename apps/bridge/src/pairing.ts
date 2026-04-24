import { randomBytes } from "node:crypto";

export function createPairingUrl(relayOrigin: string, roomId: string, pairingCode: string): string {
  const url = new URL("/pair", relayOrigin);
  url.hash = new URLSearchParams({ room: roomId, code: pairingCode }).toString();
  return url.toString();
}

export function createPairingCode(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
