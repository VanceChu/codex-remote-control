#!/usr/bin/env node
import { runBridgeDoctor, runRelayDoctor } from "./doctor.js";
import { createRemotePairing, startBridgeRuntime } from "./relay-runtime.js";

async function main(argv: string[]): Promise<number> {
  const [scope, action, extra] = argv;
  if (scope === "bridge" && action === "doctor") {
    const result = await runBridgeDoctor();
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (scope === "relay" && action === "doctor") {
    const result = await runRelayDoctor();
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (scope === "bridge" && action === "pair") {
    const relayOrigin = extra ?? process.env.CRC_RELAY_ORIGIN;
    const secret = process.env.CRC_DEV_WS_SECRET;
    if (!relayOrigin) {
      console.error("Missing relay URL. Usage: crc bridge pair <relay-url>");
      return 2;
    }
    if (!secret) {
      console.error("Missing CRC_DEV_WS_SECRET.");
      return 2;
    }
    await createRemotePairing({ relayOrigin, secret, log: console.log });
    return 0;
  }
  if (scope === "bridge" && action === "start") {
    const relayOrigin = relayFromArgs(argv) ?? process.env.CRC_RELAY_ORIGIN;
    const secret = process.env.CRC_DEV_WS_SECRET;
    if (!relayOrigin) {
      console.error("Missing relay URL. Usage: crc bridge start --relay <relay-url>");
      return 2;
    }
    if (!secret) {
      console.error("Missing CRC_DEV_WS_SECRET.");
      return 2;
    }
    startBridgeRuntime({ relayOrigin, secret, log: console.log });
    await new Promise<void>(() => {});
  }
  console.error("Usage: crc bridge <doctor|pair|start> | crc relay doctor");
  return 2;
}

function relayFromArgs(argv: string[]): string | undefined {
  const relayFlag = argv.indexOf("--relay");
  if (relayFlag === -1) {
    return undefined;
  }
  return argv[relayFlag + 1];
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
