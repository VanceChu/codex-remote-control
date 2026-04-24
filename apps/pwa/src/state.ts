export interface PairingFragment {
  roomId: string;
  code: string;
}

export type PairingState = { paired: false } | { paired: true; deviceId: string; roomId: string };

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
    const value = JSON.parse(raw) as Partial<{ deviceId: string; roomId: string }>;
    if (typeof value.deviceId === "string" && typeof value.roomId === "string") {
      return { paired: true, deviceId: value.deviceId, roomId: value.roomId };
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
    JSON.stringify({ deviceId: state.deviceId, roomId: state.roomId })
  );
}
