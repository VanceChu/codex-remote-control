import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { SequenceStore } from "@crc/protocol";

type SequenceFile = Record<string, string>;

export class FileSequenceStore implements SequenceStore {
  constructor(private readonly filePath: string) {}

  async readReserved(key: string): Promise<bigint> {
    const data = await this.readFile();
    const value = data[key];
    return typeof value === "string" ? BigInt(value) : 0n;
  }

  async writeReserved(key: string, value: bigint): Promise<void> {
    const data = await this.readFile();
    data[key] = value.toString();
    await this.writeFile(data);
  }

  private async readFile(): Promise<SequenceFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => {
          return typeof entry[1] === "string";
        })
      );
    } catch (error) {
      if (isMissingFile(error)) {
        return {};
      }
      throw error;
    }
  }

  private async writeFile(data: SequenceFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(tempPath, "w");
    try {
      await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, this.filePath);
    await fsyncDirectory(dirname(this.filePath));
  }
}

async function fsyncDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some filesystems do not allow directory fsync. The file itself was already fsynced.
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
