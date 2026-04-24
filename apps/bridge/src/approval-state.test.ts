import { describe, expect, it } from "vitest";
import { ApprovalState } from "./approval-state.js";

describe("ApprovalState", () => {
  it("lets the first valid response win and marks late responses already_resolved", () => {
    const state = new ApprovalState();
    state.open({
      requestId: "req-1",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      kind: "command_approval",
      expiresAt: 10_000
    });

    expect(state.resolve("req-1", "device-a", 1_000)).toEqual({
      status: "accepted",
      resolvedBy: "device-a"
    });
    expect(state.resolve("req-1", "device-b", 1_001)).toEqual({
      status: "already_resolved",
      resolvedBy: "device-a"
    });
  });

  it("expires unresolved approval requests", () => {
    const state = new ApprovalState();
    state.open({
      requestId: "req-1",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      kind: "file_approval",
      expiresAt: 10
    });

    expect(state.resolve("req-1", "device-a", 11)).toEqual({ status: "expired" });
  });
});
