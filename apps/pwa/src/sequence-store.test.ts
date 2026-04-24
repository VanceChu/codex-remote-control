import { reserveSequence } from "@crc/protocol";
import { indexedDB } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IndexedDbSequenceStore } from "./sequence-store.js";

let dbId = 0;

describe("IndexedDbSequenceStore", () => {
  it("persists write-ahead reservations across app restarts", async () => {
    dbId += 1;
    const dbName = `crc-sequence-test-${dbId}`;
    const firstStore = new IndexedDbSequenceStore(indexedDB, dbName);
    const first = await reserveSequence(firstStore, "device-a:downlink", 10);

    expect(first.next()).toBe(1n);
    expect(first.next()).toBe(2n);

    const restartedStore = new IndexedDbSequenceStore(indexedDB, dbName);
    const afterCrash = await reserveSequence(restartedStore, "device-a:downlink", 10);
    expect(afterCrash.next()).toBe(11n);
  });
});
