export interface SequenceStore {
  readReserved(key: string): Promise<bigint>;
  writeReserved(key: string, value: bigint): Promise<void>;
}

export class InMemorySequenceStore implements SequenceStore {
  private readonly values = new Map<string, bigint>();

  async readReserved(key: string): Promise<bigint> {
    return this.values.get(key) ?? 0n;
  }

  async writeReserved(key: string, value: bigint): Promise<void> {
    this.values.set(key, value);
  }
}

export interface SequenceReservation {
  readonly start: bigint;
  readonly end: bigint;
  next(): bigint;
}

export async function reserveSequence(
  store: SequenceStore,
  key: string,
  size: number
): Promise<SequenceReservation> {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new RangeError("Reservation size must be a positive safe integer");
  }
  const previousEnd = await store.readReserved(key);
  const start = previousEnd + 1n;
  const end = previousEnd + BigInt(size);
  await store.writeReserved(key, end);

  let cursor = start;
  return {
    start,
    end,
    next(): bigint {
      if (cursor > end) {
        throw new RangeError("Sequence reservation exhausted");
      }
      const value = cursor;
      cursor += 1n;
      return value;
    }
  };
}
