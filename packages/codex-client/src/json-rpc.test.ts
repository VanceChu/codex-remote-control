import { describe, expect, it } from "vitest";
import { JsonRpcPeer, type JsonlTransport } from "./json-rpc.js";

class MemoryTransport implements JsonlTransport {
  readonly sent: string[] = [];
  private handler?: (line: string) => void;

  send(line: string): void {
    this.sent.push(line);
  }

  onLine(handler: (line: string) => void): void {
    this.handler = handler;
  }

  receive(value: unknown): void {
    this.handler?.(JSON.stringify(value));
  }
}

describe("JsonRpcPeer", () => {
  it("sends slash method requests and resolves matching responses", async () => {
    const transport = new MemoryTransport();
    const peer = new JsonRpcPeer(transport);

    const promise = peer.request("thread/list", {});
    expect(JSON.parse(transport.sent[0] ?? "{}")).toMatchObject({
      id: 1,
      method: "thread/list",
      params: {}
    });

    transport.receive({ id: 1, result: { threads: [] } });

    await expect(promise).resolves.toEqual({ threads: [] });
  });

  it("dispatches server requests to a handler", async () => {
    const transport = new MemoryTransport();
    const peer = new JsonRpcPeer(transport);
    const seen: string[] = [];

    peer.onServerRequest(async (request) => {
      seen.push(request.method);
      return { decision: "accept" };
    });

    transport.receive({
      id: "srv-1",
      method: "item/commandExecution/requestApproval",
      params: { threadId: "t", turnId: "turn", itemId: "item" }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toEqual(["item/commandExecution/requestApproval"]);
    expect(JSON.parse(transport.sent[0] ?? "{}")).toEqual({
      id: "srv-1",
      result: { decision: "accept" }
    });
  });

  it("dispatches app-server notifications without ids", () => {
    const transport = new MemoryTransport();
    const peer = new JsonRpcPeer(transport);
    const seen: string[] = [];

    peer.onNotification((notification) => {
      seen.push(notification.method);
    });

    transport.receive({
      method: "turn/started",
      params: { threadId: "thread-a", turnId: "turn-a" }
    });

    expect(seen).toEqual(["turn/started"]);
  });

  it("rejects invalid JSON-RPC error responses", async () => {
    const transport = new MemoryTransport();
    const peer = new JsonRpcPeer(transport);
    const promise = peer.request("thread/list", {});

    transport.receive({ id: 1, error: { code: -32000, message: "nope" } });

    await expect(promise).rejects.toThrow("nope");
  });
});
