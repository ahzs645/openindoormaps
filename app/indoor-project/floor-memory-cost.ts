/** Worker/CLI-only conservative retained JS graph estimate. Every object,
 * shared subtree and backing buffer is charged once. Strings/property slots
 * are charged per reference (conservative even when the engine interns them).
 * This is a retention budget, not a claim about an engine's exact heap size. */
export function floorMemoryCostBytes(value: unknown): number {
  const seen = new WeakSet<object>(),
    pending: unknown[] = [value];
  let bytes = 0;
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === "string") {
      bytes += 24 + current.length * 2;
      continue;
    }
    if (typeof current === "bigint") {
      bytes += 32 + current.toString(16).length;
      continue;
    }
    if (current === null || typeof current !== "object") {
      bytes += 8;
      continue;
    }
    if (seen.has(current)) continue;
    seen.add(current);
    bytes += 64;
    if (
      current instanceof ArrayBuffer ||
      (typeof SharedArrayBuffer !== "undefined" &&
        current instanceof SharedArrayBuffer)
    ) {
      bytes += current.byteLength;
      continue;
    }
    if (ArrayBuffer.isView(current)) {
      pending.push(current.buffer);
      continue;
    }
    if (current instanceof Map) {
      bytes += current.size * 48;
      for (const [k, v] of current) pending.push(k, v);
      continue;
    }
    if (current instanceof Set) {
      bytes += current.size * 32;
      for (const entry of current) pending.push(entry);
      continue;
    }
    if (Array.isArray(current)) {
      bytes += current.length * 8;
      for (const entry of current) pending.push(entry);
      continue;
    }
    for (const key of Object.keys(current)) {
      bytes += 32 + key.length * 2;
      const property = Object.getOwnPropertyDescriptor(current, key);
      // Worker outputs are plain cloneable data. Unknown accessors cannot be
      // conservatively measured without running code, so refuse to cache them.
      if (!property || !("value" in property)) return Number.POSITIVE_INFINITY;
      pending.push(property.value);
    }
    if (!Number.isSafeInteger(bytes)) return Number.POSITIVE_INFINITY;
  }
  return Number.isSafeInteger(bytes) ? bytes : Number.POSITIVE_INFINITY;
}

/** Reuse a cost only for immutable completed results, never project inputs. */
export function createFloorMemoryCostQuery() {
  const costs = new WeakMap<object, number>();
  return (value: unknown): number => {
    if (!value || typeof value !== "object") return floorMemoryCostBytes(value);
    const cached = costs.get(value);
    if (cached !== undefined) return cached;
    const cost = floorMemoryCostBytes(value);
    costs.set(value, cost);
    return cost;
  };
}
