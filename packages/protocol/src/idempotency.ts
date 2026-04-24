import type { IdempotencyTerminalResult } from "./types.js";

type CacheValue =
  | { status: "in_progress"; createdAt: number }
  | { status: "terminal"; createdAt: number; result: IdempotencyTerminalResult };

export type IdempotencyStartResult =
  | { status: "new" }
  | { status: "in_progress" }
  | { status: "duplicate"; result: IdempotencyTerminalResult };

export class IdempotencyCache {
  private readonly values = new Map<string, CacheValue>();

  constructor(private readonly ttlMs: number) {}

  start(threadId: string, idempotencyKey: string, now: number): IdempotencyStartResult {
    this.expire(now);
    const key = this.cacheKey(threadId, idempotencyKey);
    const existing = this.values.get(key);
    if (existing?.status === "in_progress") {
      return { status: "in_progress" };
    }
    if (existing?.status === "terminal") {
      return { status: "duplicate", result: existing.result };
    }
    this.values.set(key, { status: "in_progress", createdAt: now });
    return { status: "new" };
  }

  complete(
    threadId: string,
    idempotencyKey: string,
    result: IdempotencyTerminalResult,
    now: number
  ): void {
    this.values.set(this.cacheKey(threadId, idempotencyKey), {
      status: "terminal",
      createdAt: now,
      result
    });
  }

  private expire(now: number): void {
    for (const [key, value] of this.values) {
      if (now - value.createdAt > this.ttlMs) {
        this.values.delete(key);
      }
    }
  }

  private cacheKey(threadId: string, idempotencyKey: string): string {
    return `${threadId}\0${idempotencyKey}`;
  }
}
