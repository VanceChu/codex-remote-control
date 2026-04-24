export interface SequenceRange {
  readonly start: bigint;
  readonly end: bigint;
}

export interface SequenceStore {
  reserveRange(key: string, size: bigint): Promise<SequenceRange>;
}

export class InMemorySequenceStore implements SequenceStore {
  private readonly values = new Map<string, bigint>();

  async reserveRange(key: string, size: bigint): Promise<SequenceRange> {
    const previousEnd = this.values.get(key) ?? 0n;
    const start = previousEnd + 1n;
    const end = previousEnd + size;
    this.values.set(key, end);
    return { start, end };
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
  const { start, end } = await store.reserveRange(key, BigInt(size));

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
