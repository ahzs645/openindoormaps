import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { gzipSync, Gunzip } from "fflate";
import type { NativeExploreResult } from "./native-explore";
import type { prepareFloor } from "./prepared-floor";

export type PreparedDisplayOptions = Readonly<
  Record<string, boolean | string | number | null>
>;
export type PreparedDisplayAssetBinding = {
  version: 1;
  datasetSha256: string;
  enginePreparationSha256: string;
  levelIds: number[];
  building: string;
  windowMode: string;
  options: PreparedDisplayOptions;
};
export type PreparedDisplayPayload = {
  nativeFaces: NativeExploreResult;
  preparedFloor: ReturnType<typeof prepareFloor>;
};
export type PreparedDisplayChunk = {
  sha256: string;
  storedBytes: number;
  expandedBytes: number;
  expandedSha256: string;
};
export type PreparedDisplayAssetDescriptor = {
  version: 1;
  format: "openindoormaps-prepared-display-v1";
  encoding: "gzip-json-subtree-pool-v1";
  binding: PreparedDisplayAssetBinding;
  bindingSha256: string;
  logicalJsonSha256: string;
  logicalJsonBytes: number;
  pooledJsonSha256: string;
  pooledJsonBytes: number;
  poolEntries: number;
  chunks: PreparedDisplayChunk[];
};
export type PreparedDisplayAssetLimits = {
  storedChunkBytes: number;
  expandedChunkBytes: number;
  aggregateStoredBytes: number;
  aggregatePooledBytes: number;
  logicalJsonBytes: number;
  poolEntries: number;
  nodes: number;
  depth: number;
  chunks: number;
};
/** Limits apply to separate display assets, never enlarge indoor/viewer JSON limits. */
export const PREPARED_DISPLAY_ASSET_LIMITS: Readonly<PreparedDisplayAssetLimits> =
  Object.freeze({
    storedChunkBytes: 16 * 1024 * 1024,
    expandedChunkBytes: 64 * 1024 * 1024,
    aggregateStoredBytes: 128 * 1024 * 1024,
    aggregatePooledBytes: 256 * 1024 * 1024,
    logicalJsonBytes: 512 * 1024 * 1024,
    poolEntries: 200000,
    nodes: 50000000,
    depth: 128,
    chunks: 64,
  });
export class PreparedDisplayAssetError extends Error {
  readonly code: "binding" | "limit" | "checksum" | "format";
  constructor(
    code: "binding" | "limit" | "checksum" | "format",
    message: string,
  ) {
    super(`Prepared display asset: ${message}`);
    this.name = "PreparedDisplayAssetError";
    this.code = code;
  }
}
const encoder = new TextEncoder();
const referenceKey = "__preparedDisplaySubtreeReference";
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Pool = {
  version: 1;
  value: Json;
  pool: Json[];
  logicalJsonSha256: string;
  logicalJsonBytes: number;
};
const fail = (code: PreparedDisplayAssetError["code"], text: string): never => {
  throw new PreparedDisplayAssetError(code, text);
};
const digest = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const hashText = (text: string) => digest(encoder.encode(text));
const hashPattern = /^[a-f0-9]{64}$/;
const byteLength = (text: string) => encoder.encode(text).length;
const integer = (n: unknown, maximum: number, minimum = 1): n is number =>
  typeof n === "number" &&
  Number.isSafeInteger(n) &&
  n >= minimum &&
  n <= maximum;

/** Match the actual JSON dataset in a worker without allocating its whole JSON string. */
export function preparedDisplayDatasetSha256(value: unknown): string {
  return jsonSummary(value).sha256;
}
function streamJson(
  value: unknown,
  emit: (text: string) => void,
  active = new WeakSet<object>(),
): void {
  if (value === null || typeof value !== "object") {
    const text = JSON.stringify(value);
    if (text === undefined) fail("format", "non-JSON root/scalar");
    emit(text);
    return;
  }
  if (active.has(value)) fail("format", "cyclic JSON input");
  active.add(value);
  if (Array.isArray(value)) {
    emit("[");
    for (let i = 0; i < value.length; i++) {
      if (i) emit(",");
      const item = value[i];
      streamJson(item === undefined ? null : item, emit, active);
    }
    emit("]");
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
      fail("format", "input must contain plain JSON objects");
    emit("{");
    let count = 0;
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      if (count++) emit(",");
      emit(JSON.stringify(key));
      emit(":");
      streamJson(item, emit, active);
    }
    emit("}");
  }
  active.delete(value);
}
function jsonSummary(
  value: unknown,
  maximumBytes = Number.MAX_SAFE_INTEGER,
): { sha256: string; bytes: number } {
  const hash = sha256.create();
  let bytes = 0,
    chars = 0,
    pending: string[] = [];
  const flush = () => {
    if (!pending.length) return;
    const b = encoder.encode(pending.join(""));
    bytes += b.length;
    if (bytes > maximumBytes) fail("limit", "logical JSON byte limit");
    hash.update(b);
    pending = [];
    chars = 0;
  };
  streamJson(value, (text) => {
    pending.push(text);
    chars += text.length;
    if (chars >= 65536) flush();
  });
  flush();
  return { sha256: bytesToHex(hash.digest()), bytes };
}
function canonicalBinding(
  binding: PreparedDisplayAssetBinding,
): PreparedDisplayAssetBinding {
  if (
    !binding ||
    typeof binding !== "object" ||
    binding.version !== 1 ||
    !hashPattern.test(binding.datasetSha256) ||
    !hashPattern.test(binding.enginePreparationSha256) ||
    !Array.isArray(binding.levelIds) ||
    !binding.levelIds.length ||
    binding.levelIds.length > 256 ||
    binding.levelIds.some((n) => !Number.isSafeInteger(n)) ||
    new Set(binding.levelIds).size !== binding.levelIds.length ||
    typeof binding.building !== "string" ||
    binding.building.length > 256 ||
    typeof binding.windowMode !== "string" ||
    binding.windowMode.length > 256 ||
    !binding.options ||
    typeof binding.options !== "object" ||
    Array.isArray(binding.options)
  )
    fail("binding", "invalid binding");
  const options: Record<string, boolean | string | number | null> = {};
  for (const key of Object.keys(binding.options).sort()) {
    const value = binding.options[key];
    if (
      key.length > 256 ||
      !(
        value === null ||
        typeof value === "boolean" ||
        (typeof value === "string" && value.length <= 1024) ||
        (typeof value === "number" && Number.isFinite(value))
      )
    )
      fail("binding", "non-scalar option");
    Object.defineProperty(options, key, { value, enumerable: true });
  }
  if (Object.keys(options).length > 64) fail("binding", "too many options");
  return {
    version: 1,
    datasetSha256: binding.datasetSha256,
    enginePreparationSha256: binding.enginePreparationSha256,
    levelIds: [...binding.levelIds],
    building: binding.building,
    windowMode: binding.windowMode,
    options,
  };
}
export function preparedDisplayBindingSha256(
  binding: PreparedDisplayAssetBinding,
): string {
  return hashText(JSON.stringify(canonicalBinding(binding)));
}
/** Generic lossless JSON pooling: byte equality never implies shared source identity. */
function encodePool(value: unknown, limits: PreparedDisplayAssetLimits): Pool {
  const logical = jsonSummary(value, limits.logicalJsonBytes);
  const texts = new WeakMap<object, string>(),
    counts = new Map<string, { text: string; count: number }>();
  let visited = 0;
  const active = new WeakSet<object>();
  const collect = (v: unknown, depth = 0) => {
    if (++visited > limits.nodes || depth > limits.depth)
      fail("limit", "input node/depth limit");
    if (!v || typeof v !== "object") return;
    if (active.has(v)) fail("format", "cyclic input");
    active.add(v);
    if (!Array.isArray(v) && Object.hasOwn(v, referenceKey))
      fail("format", "reserved reference key");
    if (Array.isArray(v) ? v.length >= 4 : Object.keys(v).length >= 4) {
      const text = JSON.stringify(v);
      texts.set(v, text);
      if (byteLength(text) >= 1024) {
        const key = hashText(text),
          old = counts.get(key);
        if (old) {
          if (old.text !== text) fail("checksum", "digest collision");
          old.count++;
        } else counts.set(key, { text, count: 1 });
      }
    }
    for (const q of Object.values(v))
      if (q !== undefined) collect(q, depth + 1);
    active.delete(v);
  };
  collect(value);
  const pool: Json[] = [],
    ids = new Map<string, number>();
  const inline = (v: object): Json =>
    Array.isArray(v)
      ? v.map((q) => encode(q === undefined ? null : q))
      : Object.fromEntries(
          Object.entries(v)
            .filter(([, q]) => q !== undefined)
            .map(([k, q]) => [k, encode(q)]),
        );
  const encode = (v: unknown): Json => {
    if (!v || typeof v !== "object") {
      const text = JSON.stringify(v);
      if (text === undefined) return fail("format", "non-JSON scalar");
      return JSON.parse(text) as Json;
    }
    const text = texts.get(v),
      key = text && byteLength(text) >= 1024 ? hashText(text) : undefined;
    if (key && counts.get(key)!.count > 1) {
      let id = ids.get(key);
      if (id === undefined) {
        const entry = inline(v);
        id = pool.length;
        if (id >= limits.poolEntries) fail("limit", "pool entry limit");
        ids.set(key, id);
        pool.push(entry);
      }
      return { [referenceKey]: id };
    }
    return inline(v);
  };
  return {
    version: 1,
    value: encode(value),
    pool,
    logicalJsonSha256: logical.sha256,
    logicalJsonBytes: logical.bytes,
  };
}

/** Structural completeness only. The worker adapter separately compares the
 * exact carriers to the current published mapping; this cache certifies no geometry. */
export function validatePreparedDisplayPayload(
  value: PreparedDisplayPayload,
  binding: PreparedDisplayAssetBinding,
): void {
  const collection = (v: unknown) =>
    !!v &&
    typeof v === "object" &&
    (v as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((v as { features?: unknown }).features);
  const faces = value?.nativeFaces,
    floor = value?.preparedFloor;
  if (
    !faces ||
    !floor ||
    JSON.stringify(faces.levelIds) !== JSON.stringify(binding.levelIds) ||
    !Array.isArray(faces.regions) ||
    !Array.isArray(faces.warnings) ||
    faces.warnings.some((w) => typeof w !== "string") ||
    !integer(faces.warningCount, Number.MAX_SAFE_INTEGER, 0)
  )
    fail("format", "invalid native face scope/regions/warnings");
  for (const key of [
    "fills",
    "overview",
    "outlines",
    "partitions",
    "walls",
  ] as const)
    if (!collection(faces[key]))
      fail("format", `missing native ${key} collection`);
  const exactIds = new Map<number, Set<string>>();
  if (faces.exactTopologies !== undefined) {
    if (!Array.isArray(faces.exactTopologies))
      fail("format", "invalid native exact topologies");
    for (const entry of faces.exactTopologies) {
      const topology = entry?.topology;
      if (
        !entry ||
        !binding.levelIds.includes(entry.levelId) ||
        exactIds.has(entry.levelId) ||
        !hashPattern.test(entry.geometrySha256) ||
        !topology ||
        topology.version !== 1 ||
        !hashPattern.test(topology.geometrySha256) ||
        !hashPattern.test(topology.sourceModelSha256) ||
        typeof topology.sourceGeometryKey !== "string" ||
        typeof topology.kernelVersion !== "string" ||
        !Array.isArray(topology.coordinates) ||
        !Array.isArray(topology.faces)
      )
        fail("format", "invalid native exact topology identity");
      const ids = new Set<string>();
      for (const face of topology.faces) {
        if (
          !face ||
          typeof face.id !== "string" ||
          ids.has(face.id) ||
          !Array.isArray(face.parts)
        )
          fail("format", "invalid/duplicate exact face identity");
        ids.add(face.id);
      }
      exactIds.set(entry.levelId, ids);
    }
  }
  const regionIds = new Set<string>();
  for (const region of faces.regions) {
    if (
      !region ||
      typeof region.id !== "string" ||
      regionIds.has(`${region.levelId}:${region.id}`) ||
      !binding.levelIds.includes(region.levelId) ||
      !Array.isArray(region.ringsFeet) ||
      !Array.isArray(region.displayPartsFeet) ||
      !Array.isArray(region.roomKeys) ||
      !Array.isArray(region.nativeFloorIds) ||
      !Array.isArray(region.nativeDoorIds) ||
      !Number.isFinite(region.areaSquareFeet) ||
      (region.exactFaceId !== undefined &&
        !exactIds.get(region.levelId)?.has(region.exactFaceId))
    )
      fail("format", "invalid native region/authority identity");
    regionIds.add(`${region.levelId}:${region.id}`);
  }
  if (
    !floor.presentation ||
    !floor.presentation.display ||
    !Array.isArray(floor.nativeStairKeys) ||
    !Array.isArray(floor.stairSurroundKeys)
  )
    fail("format", "missing complete prepared presentation");
  for (const key of [
    "assumedRoomBlocks",
    "selectionAreas",
    "physicalGround",
    "nativeStairs",
    "stairCutAreas",
    "stairCutRooms",
  ] as const)
    if (!collection(floor[key]))
      fail("format", `missing prepared ${key} collection`);
}

/** Generation runs off the UI thread. Chunks are independently bounded archive entries. */
export function encodePreparedDisplayAsset(
  payload: PreparedDisplayPayload,
  binding: PreparedDisplayAssetBinding,
  limits: PreparedDisplayAssetLimits = PREPARED_DISPLAY_ASSET_LIMITS,
): {
  descriptor: PreparedDisplayAssetDescriptor;
  blobs: ReadonlyMap<string, Uint8Array>;
} {
  const normalized = canonicalBinding(binding);
  validatePreparedDisplayPayload(payload, normalized);
  const pool = encodePool(payload, limits),
    pooled = encoder.encode(JSON.stringify(pool));
  if (pooled.length > limits.aggregatePooledBytes)
    fail("limit", "aggregate pooled byte limit");
  const blobs = new Map<string, Uint8Array>(),
    chunks: PreparedDisplayChunk[] = [];
  let storedTotal = 0;
  const chunkSize = Math.min(4 * 1024 * 1024, limits.expandedChunkBytes);
  if (!integer(chunkSize, 64 * 1024 * 1024))
    fail("limit", "invalid chunk bound");
  for (let offset = 0; offset < pooled.length; offset += chunkSize) {
    const raw = pooled.subarray(offset, offset + chunkSize),
      compressed = gzipSync(raw, { level: 6 }),
      id = digest(compressed);
    storedTotal += compressed.length;
    if (
      compressed.length > limits.storedChunkBytes ||
      storedTotal > limits.aggregateStoredBytes ||
      chunks.length >= limits.chunks
    )
      fail("limit", "stored chunk/count limit");
    blobs.set(id, compressed);
    chunks.push({
      sha256: id,
      storedBytes: compressed.length,
      expandedBytes: raw.length,
      expandedSha256: digest(raw),
    });
  }
  return {
    descriptor: {
      version: 1,
      format: "openindoormaps-prepared-display-v1",
      encoding: "gzip-json-subtree-pool-v1",
      binding: normalized,
      bindingSha256: preparedDisplayBindingSha256(normalized),
      logicalJsonSha256: pool.logicalJsonSha256,
      logicalJsonBytes: pool.logicalJsonBytes,
      pooledJsonSha256: digest(pooled),
      pooledJsonBytes: pooled.length,
      poolEntries: pool.pool.length,
      chunks,
    },
    blobs,
  };
}

function decodePool(raw: Pool, limits: PreparedDisplayAssetLimits): unknown {
  if (
    !raw ||
    raw.version !== 1 ||
    !Array.isArray(raw.pool) ||
    !hashPattern.test(raw.logicalJsonSha256) ||
    !integer(raw.logicalJsonBytes, limits.logicalJsonBytes) ||
    raw.pool.length > limits.poolEntries
  )
    fail("format", "invalid pool header");
  type Summary = { bytes: number; nodes: number; depth: number };
  const summaries: Summary[] = [];
  let inspected = 0;
  const bounded = (s: Summary) => {
    if (
      !integer(s.bytes, limits.logicalJsonBytes) ||
      !integer(s.nodes, limits.nodes) ||
      s.depth > limits.depth
    )
      fail("limit", "pool expansion limit");
    return s;
  };
  const summary = (v: Json, maximumReference: number, depth = 0): Summary => {
    if (++inspected > limits.nodes || depth > limits.depth)
      fail("limit", "pool traversal limit");
    if (v === null || typeof v !== "object")
      return bounded({
        bytes: byteLength(JSON.stringify(v)),
        nodes: 1,
        depth: 0,
      });
    if (!Array.isArray(v) && Object.hasOwn(v, referenceKey)) {
      const id = v[referenceKey];
      if (Object.keys(v).length !== 1 || !integer(id, maximumReference - 1, 0))
        return fail("format", "invalid backward reference");
      return summaries[id];
    }
    let bytes = 2,
      nodes = 1,
      childDepth = 0;
    const entries = Array.isArray(v)
      ? v.map((q) => [null, q] as const)
      : Object.entries(v);
    for (let i = 0; i < entries.length; i++) {
      const [key, q] = entries[i],
        s = summary(q, maximumReference, depth + 1);
      bytes +=
        (i ? 1 : 0) +
        (key === null ? 0 : byteLength(JSON.stringify(key)) + 1) +
        s.bytes;
      nodes += s.nodes;
      childDepth = Math.max(childDepth, s.depth + 1);
      bounded({ bytes, nodes, depth: childDepth });
    }
    return bounded({ bytes, nodes, depth: childDepth });
  };
  for (let i = 0; i < raw.pool.length; i++)
    summaries.push(summary(raw.pool[i], i));
  const root = summary(raw.value, raw.pool.length);
  if (root.bytes !== raw.logicalJsonBytes)
    fail("checksum", "underdeclared logical byte count");
  const completed = new Map<number, unknown>();
  const restore = (v: Json): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (!Array.isArray(v) && Object.hasOwn(v, referenceKey)) {
      const id = v[referenceKey] as number;
      if (!completed.has(id)) completed.set(id, restore(raw.pool[id]));
      return completed.get(id);
    }
    return Array.isArray(v)
      ? v.map(restore)
      : Object.fromEntries(Object.entries(v).map(([k, q]) => [k, restore(q)]));
  };
  const value = restore(raw.value),
    logical = jsonSummary(value, raw.logicalJsonBytes);
  if (
    logical.bytes !== raw.logicalJsonBytes ||
    logical.sha256 !== raw.logicalJsonSha256
  )
    fail("checksum", "logical checksum mismatch");
  const seen = new WeakSet<object>();
  const freeze = (v: unknown) => {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    for (const q of Object.values(v)) freeze(q);
    Object.freeze(v);
  };
  freeze(value);
  return value;
}

/** Package import validates this lightweight metadata before any lazy inflate. */
export function validatePreparedDisplayAssetDescriptor(
  value: unknown,
  limits: PreparedDisplayAssetLimits = PREPARED_DISPLAY_ASSET_LIMITS,
): asserts value is PreparedDisplayAssetDescriptor {
  const descriptor = value as PreparedDisplayAssetDescriptor;
  if (
    !descriptor ||
    descriptor.version !== 1 ||
    descriptor.format !== "openindoormaps-prepared-display-v1" ||
    descriptor.encoding !== "gzip-json-subtree-pool-v1"
  )
    fail("format", "invalid asset header");
  if (
    preparedDisplayBindingSha256(descriptor.binding) !==
    descriptor.bindingSha256
  )
    fail("binding", "descriptor binding checksum mismatch");
  if (
    !integer(descriptor.pooledJsonBytes, limits.aggregatePooledBytes) ||
    !integer(descriptor.logicalJsonBytes, limits.logicalJsonBytes) ||
    !integer(descriptor.poolEntries, limits.poolEntries, 0) ||
    !Array.isArray(descriptor.chunks) ||
    !integer(descriptor.chunks.length, limits.chunks) ||
    !hashPattern.test(descriptor.pooledJsonSha256) ||
    !hashPattern.test(descriptor.logicalJsonSha256)
  )
    fail("limit", "invalid declared asset bounds");
  let expandedTotal = 0,
    storedTotal = 0;
  for (const c of descriptor.chunks) {
    if (
      !c ||
      typeof c !== "object" ||
      !hashPattern.test(c.sha256) ||
      !hashPattern.test(c.expandedSha256) ||
      !integer(c.storedBytes, limits.storedChunkBytes) ||
      !integer(c.expandedBytes, limits.expandedChunkBytes)
    )
      fail("limit", "invalid chunk bounds");
    expandedTotal += c.expandedBytes;
    storedTotal += c.storedBytes;
  }
  if (
    expandedTotal !== descriptor.pooledJsonBytes ||
    storedTotal > limits.aggregateStoredBytes
  )
    fail("limit", "aggregate chunk bound mismatch");
}

/** Lazy worker loader. Expected binding MUST come from the current runtime/dataset,
 * never from the asset's own declaration. Missing/stale asset fallback is caller policy. */
export async function decodePreparedDisplayAsset(
  descriptor: PreparedDisplayAssetDescriptor,
  expectedBinding: PreparedDisplayAssetBinding,
  loadChunk: (
    sha256: string,
  ) => Uint8Array | undefined | Promise<Uint8Array | undefined>,
  limits: PreparedDisplayAssetLimits = PREPARED_DISPLAY_ASSET_LIMITS,
): Promise<PreparedDisplayPayload> {
  validatePreparedDisplayAssetDescriptor(descriptor, limits);
  if (
    preparedDisplayBindingSha256(expectedBinding) !== descriptor.bindingSha256
  )
    fail("binding", "stale dataset/engine/options/scope binding");
  const expandedTotal = descriptor.pooledJsonBytes;
  const combined = new Uint8Array(expandedTotal);
  let offset = 0;
  for (const c of descriptor.chunks) {
    const stored = await loadChunk(c.sha256);
    if (
      !(stored instanceof Uint8Array) ||
      stored.length !== c.storedBytes ||
      digest(stored) !== c.sha256
    )
      return fail("checksum", "missing/corrupt compressed chunk");
    const hash = sha256.create();
    let expanded = 0;
    const gunzip = new Gunzip((bytes) => {
      expanded += bytes.length;
      if (expanded > c.expandedBytes) fail("limit", "chunk expansion overflow");
      hash.update(bytes);
      combined.set(bytes, offset);
      offset += bytes.length;
    });
    try {
      for (let n = 0; n < stored.length; n += 65536)
        gunzip.push(stored.subarray(n, n + 65536), n + 65536 >= stored.length);
    } catch (error) {
      if (error instanceof PreparedDisplayAssetError) throw error;
      return fail("format", "invalid gzip chunk");
    }
    if (
      expanded !== c.expandedBytes ||
      bytesToHex(hash.digest()) !== c.expandedSha256
    )
      fail("checksum", "chunk expansion checksum mismatch");
  }
  if (digest(combined) !== descriptor.pooledJsonSha256)
    fail("checksum", "pooled checksum mismatch");
  let pool: Pool;
  try {
    pool = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(combined),
    ) as Pool;
  } catch {
    return fail("format", "invalid pool JSON");
  }
  if (
    pool.logicalJsonSha256 !== descriptor.logicalJsonSha256 ||
    pool.logicalJsonBytes !== descriptor.logicalJsonBytes ||
    pool.pool?.length !== descriptor.poolEntries
  )
    fail("checksum", "pool/descriptor mismatch");
  const value = decodePool(pool, limits) as PreparedDisplayPayload;
  validatePreparedDisplayPayload(value, expectedBinding);
  return value;
}
