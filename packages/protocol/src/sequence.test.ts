import { describe, expect, it } from "vitest";
import { InMemorySequenceStore, reserveSequence } from "./sequence.js";

describe("reserveSequence", () => {
  it("write-ahead reserves a range and skips unused values after crash", async () => {
    const store = new InMemorySequenceStore();

    const first = await reserveSequence(store, "device-a", 10);
    expect(first.next()).toBe(1n);
    expect(first.next()).toBe(2n);

    const afterCrash = await reserveSequence(store, "device-a", 10);
    expect(afterCrash.next()).toBe(11n);
  });
});
