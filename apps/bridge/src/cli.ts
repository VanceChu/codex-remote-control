#!/usr/bin/env node
import { createPairingCode, createPairingUrl } from "./pairing.js";
import { runBridgeDoctor } from "./doctor.js";

async function main(argv: string[]): Promise<number> {
  const [scope, action, extra] = argv;
  if (scope === "bridge" && action === "doctor") {
    const result = await runBridgeDoctor();
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (scope === "bridge" && action === "pair") {
    const relayOrigin = extra ?? process.env.CRC_RELAY_ORIGIN ?? "https://example.workers.dev";
    const roomId = process.env.CRC_ROOM_ID ?? "local-room";
    const code = createPairingCode();
    console.log(createPairingUrl(relayOrigin, roomId, code));
    return 0;
  }
  if (scope === "bridge" && action === "start") {
    console.log(
      "crc bridge start: bridge runtime scaffold is installed; relay connection is not started in this MVP slice."
    );
    return 0;
  }
  console.error("Usage: crc bridge <doctor|pair|start>");
  return 2;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
