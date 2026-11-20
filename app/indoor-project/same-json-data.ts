const omitted = (value: unknown) =>
  value === undefined ||
  typeof value === "function" ||
  typeof value === "symbol";

/** The package's parsed JSON and derived plain data have no serialization
 * hooks. Check that before comparing their JSON semantics without materialising
 * two campus-sized strings. Exotic callers retain native JSON.stringify. */
function plainJsonData(value: unknown) {
  for (const prototype of [Object.prototype, Array.prototype]) {
    if (Object.getOwnPropertyDescriptor(prototype, "toJSON")) return false;
    // JSON reads inherited array indices when an array has a hole.
    if (
      Object.getOwnPropertyNames(prototype).some((key) =>
        /^(0|[1-9][0-9]*)$/.test(key),
      )
    )
      return false;
  }
  const active = new Set<object>();
  const visit = (item: unknown): boolean => {
    if (item === null || typeof item !== "object")
      // Functions are objects to JSON.stringify: their callable toJSON hook
      // may supply a value even though ordinary functions are omitted.
      return typeof item !== "bigint" && typeof item !== "function";
    const array = Array.isArray(item),
      prototype = Object.getPrototypeOf(item);
    if (
      (array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null) ||
      active.has(item)
    )
      return false;
    const hook = Object.getOwnPropertyDescriptor(item, "toJSON");
    if (hook && (!("value" in hook) || typeof hook.value === "function"))
      return false;
    active.add(item);
    if (array) {
      for (let i = 0; i < (item as unknown[]).length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, i);
        if (
          descriptor &&
          (!("value" in descriptor) || !visit(descriptor.value))
        )
          return false;
      }
    } else {
      for (const key of Object.keys(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!("value" in descriptor) || !visit(descriptor.value)) return false;
      }
    }
    active.delete(item);
    return true;
  };
  return visit(value);
}

function samePlainJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return JSON.stringify(a) === JSON.stringify(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    for (let i = 0; i < a.length; i++)
      if (
        !samePlainJson(omitted(a[i]) ? null : a[i], omitted(b[i]) ? null : b[i])
      )
        return false;
    return true;
  }
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>,
    leftKeys = Object.keys(left).filter((key) => !omitted(left[key])),
    rightKeys = Object.keys(right).filter((key) => !omitted(right[key]));
  if (leftKeys.length !== rightKeys.length) return false;
  for (const [i, key] of leftKeys.entries()) {
    if (key !== rightKeys[i] || !samePlainJson(left[key], right[key]))
      return false;
  }
  return true;
}

/** Exact JSON text equality, including key order, omitted object values,
 * sparse arrays, non-finite numbers and negative zero. No content hash or
 * object-identity cache can admit a changed source. */
export function sameJsonData(a: unknown, b: unknown) {
  if (!plainJsonData(a) || !plainJsonData(b))
    return JSON.stringify(a) === JSON.stringify(b);
  return samePlainJson(a, b);
}
