/** Scalar-only LRU: callers on the UI thread must use the worker's measured
 * cost, never walk/stringify/decode a complete floor just to retain it. */
export const COMPLETE_FLOOR_CACHE_BYTES = 128 * 1024 * 1024;
export const NATIVE_FACE_CACHE_BYTES = 64 * 1024 * 1024;
export class FloorMemoryCache<K, V> {
  private entries = new Map<K, { value: V; bytes: number }>();
  private bytes = 0;
  private readonly capacity: number;
  private readonly maximumBytes: number;
  constructor(capacity = 12, maximumBytes = COMPLETE_FLOOR_CACHE_BYTES) {
    this.capacity =
      Number.isSafeInteger(capacity) && capacity >= 0 ? capacity : 0;
    this.maximumBytes =
      Number.isSafeInteger(maximumBytes) && maximumBytes >= 0
        ? maximumBytes
        : 0;
  }
  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: K, value: V, memoryCostBytes: number | undefined): boolean {
    this.delete(key);
    if (
      this.capacity <= 0 ||
      !Number.isSafeInteger(memoryCostBytes) ||
      memoryCostBytes! < 0 ||
      memoryCostBytes! > this.maximumBytes
    )
      return false;
    while (
      this.entries.size &&
      (this.entries.size >= this.capacity ||
        this.bytes + memoryCostBytes! > this.maximumBytes)
    )
      this.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, bytes: memoryCostBytes! });
    this.bytes += memoryCostBytes!;
    return true;
  }
  delete(key: K) {
    const entry = this.entries.get(key);
    if (entry) {
      this.bytes -= entry.bytes;
      this.entries.delete(key);
    }
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
  statistics() {
    return {
      entries: this.entries.size,
      memoryCostBytes: this.bytes,
      maximumBytes: this.maximumBytes,
      capacity: this.capacity,
    };
  }
}
