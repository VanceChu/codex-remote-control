import type { SequenceRange, SequenceStore } from "@crc/protocol";

const storeName = "reservations";

interface SequenceLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export class IndexedDbSequenceStore implements SequenceStore {
  constructor(
    private readonly indexedDb: IDBFactory = globalThis.indexedDB,
    private readonly dbName = "crc-sequence-v1",
    private readonly lockManager: SequenceLockManager | undefined = defaultLockManager()
  ) {}

  async reserveRange(key: string, size: bigint): Promise<SequenceRange> {
    const reserve = () => this.reserveRangeInTransaction(key, size);
    if (this.lockManager) {
      return this.lockManager.request(`crc-sequence:${key}`, reserve);
    }
    return reserve();
  }

  private async reserveRangeInTransaction(key: string, size: bigint): Promise<SequenceRange> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      let range: SequenceRange | undefined;
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        try {
          const previousEnd =
            typeof getRequest.result === "string" ? BigInt(getRequest.result) : 0n;
          const start = previousEnd + 1n;
          const end = previousEnd + size;
          range = { start, end };
          store.put(end.toString(), key);
        } catch (error) {
          tx.abort();
          reject(error);
        }
      };

      tx.oncomplete = () => {
        db.close();
        if (!range) {
          reject(new Error("Sequence reservation did not complete"));
          return;
        }
        resolve(range);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("IndexedDB transaction failed"));
      };
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.indexedDb.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(storeName);
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to open sequence database"));
      };
    });
  }
}

function defaultLockManager(): SequenceLockManager | undefined {
  return (globalThis.navigator as (Navigator & { locks?: SequenceLockManager }) | undefined)?.locks;
}
