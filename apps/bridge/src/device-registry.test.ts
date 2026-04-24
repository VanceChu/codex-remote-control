import { describe, expect, it } from "vitest";
import { DeviceRegistry } from "./device-registry.js";

describe("DeviceRegistry", () => {
  it("stops fanout to revoked devices and keeps other devices active", () => {
    const registry = new DeviceRegistry();
    registry.add({
      deviceId: "a",
      label: "phone",
      deviceSignPub: "sign-a",
      deviceNoisePub: "noise-a",
      revoked: false
    });
    registry.add({
      deviceId: "b",
      label: "tablet",
      deviceSignPub: "sign-b",
      deviceNoisePub: "noise-b",
      revoked: false
    });

    registry.revoke("a");

    expect(registry.activeDeviceIds()).toEqual(["b"]);
    expect(registry.get("a")?.revoked).toBe(true);
  });
});
