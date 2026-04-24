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

  it("serializes concurrent reservations for the same key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crc-sequence-"));
    const file = join(dir, "seq.json");

    try {
      const store = new FileSequenceStore(file);
      const reservations = await Promise.all([
        reserveSequence(store, "device-a:uplink", 10),
        reserveSequence(store, "device-a:uplink", 10)
      ]);

      expect(reservations.map((reservation) => reservation.start).sort()).toEqual([1n, 11n]);
      expect(reservations.map((reservation) => reservation.end).sort()).toEqual([10n, 20n]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves every key when different keys reserve concurrently", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crc-sequence-"));
    const file = join(dir, "seq.json");

    try {
      const store = new FileSequenceStore(file);
      const keys = Array.from({ length: 40 }, (_, index) => `device-${index}:uplink`);

      await Promise.all(keys.map((key) => reserveSequence(store, key, 10)));

      const restartedStore = new FileSequenceStore(file);
      const afterRestart = await Promise.all(
        keys.map((key) => reserveSequence(restartedStore, key, 10))
      );

      expect(afterRestart.map((reservation) => reservation.start)).toEqual(
        Array.from({ length: keys.length }, () => 11n)
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
