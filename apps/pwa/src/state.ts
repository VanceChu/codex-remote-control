export interface PairingFragment {
  roomId: string;
  code: string;
}

export type PairingState =
  | { paired: false; pending?: { roomId: string } }
  | { paired: true; deviceId: string; roomId: string; deviceToken: string };

export type Screen = "pairing" | "workspace";

export function parsePairingFragment(hash: string): PairingFragment | undefined {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(fragment);
  const roomId = params.get("room");
  const code = params.get("code");
  if (!roomId || !code) {
    return undefined;
  }
  return { roomId, code };
}

export function nextScreen(state: PairingState): Screen {
  return state.paired ? "workspace" : "pairing";
}

export function loadPairingState(storage: Pick<Storage, "getItem">): PairingState {
  const raw = storage.getItem("crc.pairing");
  if (!raw) {
    return { paired: false };
  }
  try {
    const value = JSON.parse(raw) as Partial<{
      status: string;
      deviceId: string;
      roomId: string;
      deviceToken: string;
    }>;
    if (value.status === "pending" && typeof value.roomId === "string") {
      return { paired: false, pending: { roomId: value.roomId } };
    }
    if (
      value.status === "paired" &&
      typeof value.deviceId === "string" &&
      typeof value.roomId === "string" &&
      typeof value.deviceToken === "string"
    ) {
      return {
        paired: true,
        deviceId: value.deviceId,
        roomId: value.roomId,
        deviceToken: value.deviceToken
      };
    }
  } catch {
    return { paired: false };
  }
  return { paired: false };
}

export function savePairingState(
  storage: Pick<Storage, "setItem">,
  state: Extract<PairingState, { paired: true }>
): void {
  storage.setItem(
    "crc.pairing",
    JSON.stringify({
      status: "paired",
      deviceId: state.deviceId,
      roomId: state.roomId,
      deviceToken: state.deviceToken
    })
  );
}

export function savePendingPairing(
  storage: Pick<Storage, "setItem">,
  fragment: PairingFragment
): void {
  storage.setItem("crc.pairing", JSON.stringify({ status: "pending", roomId: fragment.roomId }));
}

export function loadOrCreateDeviceId(storage: Pick<Storage, "getItem" | "setItem">): string {
  const existing = storage.getItem("crc.deviceId");
  if (existing) {
    return existing;
  }
  const deviceId = createDeviceId();
  storage.setItem("crc.deviceId", deviceId);
  return deviceId;
}

export function clearPairingState(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem("crc.pairing");
}

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `device-${crypto.randomUUID()}`;
  }
  return `device-${Math.random().toString(36).slice(2)}`;
}
