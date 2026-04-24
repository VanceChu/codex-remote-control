import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reserveSequence } from "@crc/protocol";
import { describe, expect, it } from "vitest";
import { FileSequenceStore } from "./sequence-store.js";

describe("FileSequenceStore", () => {
  it("persists write-ahead reservations across process restarts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crc-sequence-"));
    const file = join(dir, "seq.json");

    try {
      const firstStore = new FileSequenceStore(file);
      const first = await reserveSequence(firstStore, "device-a:uplink", 10);
      expect(first.next()).toBe(1n);
      expect(first.next()).toBe(2n);

      const restartedStore = new FileSequenceStore(file);
      const afterCrash = await reserveSequence(restartedStore, "device-a:uplink", 10);
      expect(afterCrash.next()).toBe(11n);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
