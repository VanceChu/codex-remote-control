import type { SequenceStore } from "@crc/protocol";

const storeName = "reservations";

export class IndexedDbSequenceStore implements SequenceStore {
  constructor(
    private readonly indexedDb: IDBFactory = globalThis.indexedDB,
    private readonly dbName = "crc-sequence-v1"
  ) {}

  async readReserved(key: string): Promise<bigint> {
    const db = await this.openDatabase();
    try {
      const tx = db.transaction(storeName, "readonly");
      const value = await requestResult<string | undefined>(tx.objectStore(storeName).get(key));
      await transactionDone(tx);
      return typeof value === "string" ? BigInt(value) : 0n;
    } finally {
      db.close();
    }
  }

  async writeReserved(key: string, value: bigint): Promise<void> {
    const db = await this.openDatabase();
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value.toString(), key);
      await transactionDone(tx);
    } finally {
      db.close();
    }
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

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    };
  });
}
