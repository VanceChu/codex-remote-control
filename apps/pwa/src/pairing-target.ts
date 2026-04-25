import { parsePairingFragment, type PairingFragment } from "./state.js";

export interface PairingTarget {
  relayOrigin: string;
  fragment: PairingFragment;
}

export function parsePairingTarget(
  value: string,
  currentOrigin: string
): PairingTarget | undefined {
  const directFragment = parsePairingFragment(value);
  if (directFragment) {
    return { relayOrigin: currentOrigin, fragment: directFragment };
  }
  const url = safeUrl(value);
  if (!url) {
    return undefined;
  }
  const fragment = parsePairingFragment(url.hash);
  if (!fragment) {
    return undefined;
  }
  return { relayOrigin: url.origin, fragment };
}

function safeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
