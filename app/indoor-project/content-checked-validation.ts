import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
/** One complete typed tree covers structure AND every actual scalar value.
 * JSON bytes omit undefined keys and collapse holes and special numbers. Explicit
 * type/presence/container markers and JSON-escaped string/key payloads retain
 * those distinctions without a second dataset traversal. Exotic inputs retain the original validator;
 * neither cloning nor a cached result may broaden what it accepts. */
function fingerprint(value: unknown): string | undefined {
  // Prototype numeric entries can affect both sparse source arrays and the
  // hash buffer's own arrays. Inspect only keys before creating that buffer;
  // never invoke inherited values/getters while deciding whether to cache.
  const checkedPrototypes = new Set<object>();
  for (const origin of [Array.prototype, Object.prototype]) {
    let prototype: object | null = origin;
    while (prototype && !checkedPrototypes.has(prototype)) {
      checkedPrototypes.add(prototype);
      for (const key of Reflect.ownKeys(prototype))
        if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key))
          return undefined;
      prototype = Object.getPrototypeOf(prototype);
    }
  }
  const hash = sha256.create(),
    encoder = new TextEncoder();
  let pending: string[] = [],
    size = 0;
  const flush = () => {
    hash.update(encoder.encode(pending.join("")));
    pending = [];
    size = 0;
  };
  const emit = (s: string) => {
    pending.push(s);
    size += s.length;
    if (size >= 65536) flush();
  };
  const active = new WeakSet<object>();
  const visit = (v: unknown): boolean => {
    if (v === null) {
      emit("null;");
      return true;
    }
    const type = typeof v;
    if (type !== "object") {
      if (!["undefined", "boolean", "number", "string"].includes(type))
        return false;
      if (type === "string") {
        // JSON escaping preserves lone surrogates before UTF-8 encoding. Length
        // and a terminating token make keys/payloads unambiguous even when
        // user text contains the tree's structural markers.
        const text = v as string;
        emit("string:" + text.length + ":" + JSON.stringify(text) + ";");
      } else if (type === "number") {
        const n = v as number;
        emit("number:" + (Object.is(n, -0) ? "-0" : String(n)) + ";");
      } else emit(type + ":" + String(v) + ";");
      return true;
    }
    const o = v as object;
    if (active.has(o)) return false;
    const array = Array.isArray(o),
      proto = Object.getPrototypeOf(o);
    // structuredClone normalizes null prototypes. Validate those inputs in
    // place, like other exotic carriers, rather than certify a changed shape.
    if (array ? proto !== Array.prototype : proto !== Object.prototype)
      return false;
    const keys = Reflect.ownKeys(o);
    if (keys.some((k) => typeof k !== "string")) return false;
    active.add(o);
    emit(array ? "array;" : "object;");
    if (array) {
      const a = o as unknown[];
      // JSON does not include arbitrary array properties. Do not cache them.
      if (
        keys.some(
          (k) =>
            k !== "length" &&
            (!/^(0|[1-9][0-9]*)$/.test(k as string) || Number(k) >= a.length),
        )
      )
        return false;
      emit(String(a.length) + ";");
      for (let i = 0; i < a.length; i++) {
        const d = Object.getOwnPropertyDescriptor(a, String(i));
        if (!d) {
          // A hole can resolve an inherited numeric value/getter. The former
          // JSON pass read it; never erase that dependency or execute its hook.
          if (String(i) in a) return false;
          emit("hole;");
          continue;
        }
        if (!d.enumerable || !("value" in d)) return false;
        emit("present;");
        if (!visit(d.value)) return false;
      }
    } else {
      for (const key of keys as string[]) {
        const d = Object.getOwnPropertyDescriptor(o, key)!;
        if (!d.enumerable || !("value" in d)) return false;
        emit("key:" + key.length + ":" + JSON.stringify(key) + ";");
        if (!visit(d.value)) return false;
      }
    }
    emit("end;");
    active.delete(o);
    return true;
  };
  if (!visit(value)) return undefined;
  flush();
  return "content-tree-v2:" + bytesToHex(hash.digest());
}

/** First proof always runs unchanged against a detached snapshot. Reuse requires
 * hashing the entire actual carrier again, not trusting declared checksums or
 * object identity. Pending identical requests share proof; failures never do. */
export function createContentCheckedValidation<T extends object>(
  validate: (snapshot: T) => Promise<void>,
): (value: T) => Promise<void> {
  type Entry = { fingerprint: string; promise: Promise<void> };
  const entries = new WeakMap<T, Entry>();
  return async (value) => {
    const initial = fingerprint(value);
    if (initial === undefined) {
      entries.delete(value);
      return validate(value);
    }
    let entry = entries.get(value);
    if (!entry || entry.fingerprint !== initial) {
      const owned: Entry = { fingerprint: initial, promise: Promise.resolve() };
      owned.promise = Promise.resolve()
        .then(async () => {
          const snapshot = structuredClone(value);
          if (fingerprint(snapshot) !== initial)
            throw new Error(
              "Validation input changed while taking its snapshot.",
            );
          await validate(snapshot);
          if (fingerprint(value) !== initial)
            throw new Error("Validation input changed during validation.");
        })
        .catch((error) => {
          if (entries.get(value) === owned) entries.delete(value);
          throw error;
        });
      entries.set(value, owned);
      entry = owned;
    }
    await entry.promise;
    if (fingerprint(value) !== initial) {
      if (entries.get(value) === entry) entries.delete(value);
      throw new Error("Validation input changed during validation.");
    }
  };
}
