import { describe, expect, it } from "vitest";
import { RemoteControlRoom } from "./worker.js";

class MemoryStorage {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

function durableState(storage: MemoryStorage): DurableObjectState {
  return {
    storage,
    acceptWebSocket() {
      throw new Error("not used");
    }
  } as unknown as DurableObjectState;
}

describe("RemoteControlRoom storage", () => {
  it("persists bridge registration across durable object wakeups", async () => {
    const storage = new MemoryStorage();
    const firstWake = new RemoteControlRoom(durableState(storage));

    expect(await firstWake.registerBridgeForTest("bridge-a")).toEqual({ status: "registered" });

    const secondWake = new RemoteControlRoom(durableState(storage));
    expect(await secondWake.registerBridgeForTest("bridge-b")).toEqual({ status: "locked" });
  });
});
