import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { SequenceRange, SequenceStore } from "@crc/protocol";

type SequenceFile = Record<string, string>;

export class FileSequenceStore implements SequenceStore {
  private static readonly locks = new Map<string, Promise<void>>();

  constructor(private readonly filePath: string) {}

  async reserveRange(key: string, size: bigint): Promise<SequenceRange> {
    return FileSequenceStore.withKeyLock(`${this.filePath}:${key}`, async () => {
      const data = await this.readFile();
      const previousEnd = typeof data[key] === "string" ? BigInt(data[key]) : 0n;
      const start = previousEnd + 1n;
      const end = previousEnd + size;
      data[key] = end.toString();
      await this.writeFile(data);
      return { start, end };
    });
  }

  private static withKeyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = FileSequenceStore.locks.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const next = run.then(
      () => undefined,
      () => undefined
    );
    FileSequenceStore.locks.set(key, next);
    return run.finally(() => {
      if (FileSequenceStore.locks.get(key) === next) {
        FileSequenceStore.locks.delete(key);
      }
    });
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
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${randomSuffix()}.tmp`;
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
  } catch (error) {
    if (isUnsupportedDirectoryFsync(error)) {
      return;
    }
    throw error;
  }
}

function randomSuffix(): string {
  return Math.random().toString(16).slice(2);
}

function isUnsupportedDirectoryFsync(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["EINVAL", "ENOTSUP", "EISDIR"].includes(String((error as { code?: unknown }).code))
  );
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
