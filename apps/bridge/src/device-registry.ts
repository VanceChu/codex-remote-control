export interface DeviceRecord {
  deviceId: string;
  label: string;
  deviceNoisePub: string;
  deviceSignPub: string;
  revoked: boolean;
}

export class DeviceRegistry {
  private readonly devices = new Map<string, DeviceRecord>();

  add(device: DeviceRecord): void {
    this.devices.set(device.deviceId, { ...device });
  }

  get(deviceId: string): DeviceRecord | undefined {
    const device = this.devices.get(deviceId);
    return device ? { ...device } : undefined;
  }

  list(): DeviceRecord[] {
    return [...this.devices.values()].map((device) => ({ ...device }));
  }

  revoke(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) {
      return false;
    }
    device.revoked = true;
    return true;
  }

  activeDeviceIds(): string[] {
    return this.list()
      .filter((device) => !device.revoked)
      .map((device) => device.deviceId)
      .sort();
  }
}
