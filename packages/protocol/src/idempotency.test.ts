import { describe, expect, it } from "vitest";
import { IdempotencyCache } from "./idempotency.js";

describe("IdempotencyCache", () => {
  it("keeps terminal results until TTL instead of releasing immediately", () => {
    const cache = new IdempotencyCache(600_000);

    expect(cache.start("thread-a", "key-a", 1_000)).toEqual({ status: "new" });
    cache.complete("thread-a", "key-a", { status: "completed", turnId: "turn-a" }, 2_000);

    expect(cache.start("thread-a", "key-a", 3_000)).toEqual({
      status: "duplicate",
      result: { status: "completed", turnId: "turn-a" }
    });
    expect(cache.start("thread-a", "key-a", 700_000)).toEqual({ status: "new" });
  });
});
