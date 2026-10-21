/** Reuse a checked routing carrier checksum without reserializing its immutable
 * parsed graph. No caller can attach an attestation to an existing object.
 */
import type { IndoorDataset } from "./contract";
import { progressiveSha256 } from "./progressive-delivery";
const verified = new WeakMap<IndoorDataset, string>();
const immutable = new WeakSet<IndoorDataset>();
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferOf = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)!.get!;
const offsetOf = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)!.get!;
const lengthOf = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)!.get!;
const decoder = new TextDecoder("utf8", { fatal: true });

/** Called only on a graph freshly owned by structuredClone.
 * Frozen Maps, Dates and shared buffers still have mutable internal storage;
 * they are never an immutable routing snapshot. */
function freezeOwnedGraph(value: IndoorDataset) {
  if (!value || value.format !== "reviter-indoor" || value.version !== 1)
    throw new Error("Directions are missing their original dataset.");
  const pending: object[] = [value],
    visited = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== Array.prototype)
      throw new Error("Directions require an ordinary immutable source graph.");
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === "object") pending.push(child);
      else if (
        typeof child !== "string" &&
        typeof child !== "number" &&
        typeof child !== "boolean" &&
        child !== undefined &&
        child !== null
      )
        throw new Error("Directions contain a non-JSON source value.");
      else if (typeof child === "number" && !Number.isFinite(child))
        throw new Error("Directions contain a nonfinite source value.");
    }
    Object.freeze(current);
  }
  immutable.add(value);
  return value;
}

/** Private to the checked-byte parser, immediately after its own JSON.parse.
 * JSON creates ordinary, acyclic objects/arrays without getters or aliases.
 * Keep the clone path's general graph checks above; no caller can select this
 * specialization for an existing object. JSON number overflow still refuses.
 */
function freezeOwnedJsonTree(value: IndoorDataset) {
  if (!value || value.format !== "reviter-indoor" || value.version !== 1)
    throw new Error("Directions are missing their original dataset.");
  const pending: object[] = [value];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === "object") pending.push(child);
      else if (typeof child === "number" && !Number.isFinite(child))
        throw new Error("Directions contain a nonfinite source value.");
    }
    Object.freeze(current);
  }
  return value;
}

/** Own the clone before registering it: caller objects, getters and Proxies
 * cannot attach authority to an editable or merely shallow-frozen graph. */
export function createImmutableRoutingWorkerDataset(
  input: IndoorDataset,
): IndoorDataset {
  return freezeOwnedGraph(structuredClone(input));
}
export function isPrivateImmutableRoutingDataset(data: IndoorDataset) {
  return immutable.has(data);
}

/** Synchronous from checksum through freeze: ordinary unshared storage cannot
 * change between verification and parsing. Intrinsic getters ignore forged
 * view metadata; a new plain view avoids subclass/property overrides. No
 * second117MB copy is needed. Shared storage cannot confer this capability.
 */
export function parseVerifiedRoutingDataset(
  input: Uint8Array,
  expectedSha256: string,
): IndoorDataset {
  const buffer: unknown = bufferOf.call(input);
  if (!(buffer instanceof ArrayBuffer))
    throw new Error("Verified routing requires unshared source bytes.");
  const bytes = new Uint8Array(
    buffer,
    offsetOf.call(input),
    lengthOf.call(input),
  );
  if (
    !/^[a-f0-9]{64}$/.test(expectedSha256) ||
    progressiveSha256(bytes) !== expectedSha256
  )
    throw new Error("Directions source checksum mismatch.");
  const value = JSON.parse(decoder.decode(bytes)) as IndoorDataset;
  // JSON.parse creates only fresh objects/arrays, with no accessors or cycles.
  // This graph belongs to the visitor worker, never an editable authoring model.
  freezeOwnedJsonTree(value);
  immutable.add(value);
  verified.set(value, expectedSha256);
  return value;
}
export function verifiedRoutingDatasetSha256(
  data: IndoorDataset,
): string | undefined {
  return verified.get(data);
}
