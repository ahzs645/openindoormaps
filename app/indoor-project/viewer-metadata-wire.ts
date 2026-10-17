import { deflateSync } from "fflate";
import { boundedInflate } from "./review-bundle-inflate";

const FORMAT = "openindoormaps-viewer-metadata-wire";
// A complete native campus (seal rows, material sections, envelopes) packs to
// about 18 MiB from 72 MiB of JSON; keep bounded headroom above that.
const ENTRY_LIMIT = 32 * 1024 * 1024;
const EXPANDED_LIMIT = 128 * 1024 * 1024;
const REFERENCE_FIELDS = new Set([
  "nativeMaterialSections",
  "nativeProvisionalCornerSeals",
  "nativeDerivedFrameReturns",
  "nativeSourceStairMaterials",
  "nativeIndoorEnvelopes",
]);
const hashPattern = /^[a-f0-9]{64}$/;
type DatasetReference = { field: string; bytes: number; sha256: string };
type ReferenceSource = { modelSha256: string; roomsSha256: string };
type ReferenceWire = {
  format: typeof FORMAT;
  version: 2;
  encoding: "dataset-field-references-v2";
  bytes: number;
  sha256: string;
  source: ReferenceSource;
  keys: string[];
  references: DatasetReference[];
  inline: object;
};
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf8", { fatal: true });
const fail = () => {
  throw new Error("Invalid packed viewer metadata.");
};
const hash = async (bytes: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const base64 = (bytes: Uint8Array) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCodePoint(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const own = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const boundedLength = (value: unknown): value is number =>
  Number.isSafeInteger(value) &&
  typeof value === "number" &&
  value > 0 &&
  value <= EXPANDED_LIMIT;
function referenceSource(dataset: object | undefined): ReferenceSource {
  const source = (dataset as { source?: unknown } | undefined)?.source;
  if (
    !object(source) ||
    typeof source.modelSha256 !== "string" ||
    !hashPattern.test(source.modelSha256) ||
    typeof source.roomsSha256 !== "string" ||
    !hashPattern.test(source.roomsSha256)
  )
    return fail();
  return {
    modelSha256: source.modelSha256,
    roomsSha256: source.roomsSha256,
  };
}

async function packLegacyMetadata<T extends object>(value: T) {
  const raw = encoder.encode(JSON.stringify(value));
  if (raw.length <= ENTRY_LIMIT) return value;
  if (raw.length > EXPANDED_LIMIT) fail();
  const wire = {
    format: FORMAT,
    version: 1,
    encoding: "deflate-json-v1",
    bytes: raw.length,
    sha256: await hash(raw),
    compressedBase64: base64(deflateSync(raw, { level: 6 })),
  };
  if (encoder.encode(JSON.stringify(wire)).length > ENTRY_LIMIT) fail();
  return wire;
}

/** Lossless wire storage for the complete minimal visitor metadata. Packing
 * each physical descriptor alone can still exceed the unchanged entry limit. */
export async function packViewerMetadata<T extends object>(
  value: T,
  dataset?: object,
): Promise<T | object> {
  if ((value as { format?: string }).format === FORMAT) fail();
  if (!dataset) return packLegacyMetadata(value);
  const raw = encoder.encode(JSON.stringify(value));
  if (raw.length > EXPANDED_LIMIT) fail();
  // Own the logical snapshot. Export callers may retain mutable source objects;
  // neither the wire nor the hydrated metadata may alias those objects.
  const snapshot: Record<string, unknown> = JSON.parse(decoder.decode(raw));
  if (!object(snapshot)) fail();
  const inline = { ...snapshot };
  const references: DatasetReference[] = [];
  for (const field of REFERENCE_FIELDS) {
    if (!own(snapshot, field) || !own(dataset, field)) continue;
    const text = JSON.stringify(snapshot[field]);
    if (
      text.length < 1024 ||
      text !== JSON.stringify((dataset as Record<string, unknown>)[field])
    )
      continue;
    const bytes = encoder.encode(text);
    references.push({ field, bytes: bytes.length, sha256: await hash(bytes) });
    delete inline[field];
  }
  if (references.length === 0) return packLegacyMetadata(value);
  const wire: ReferenceWire = {
    format: FORMAT,
    version: 2,
    encoding: "dataset-field-references-v2",
    bytes: raw.length,
    sha256: await hash(raw),
    source: referenceSource(dataset),
    keys: Object.keys(snapshot),
    references,
    inline: await packLegacyMetadata(inline),
  };
  if (encoder.encode(JSON.stringify(wire)).length > ENTRY_LIMIT) fail();
  return wire;
}

export async function hydrateViewerMetadata<T extends object>(
  value: T,
  dataset?: object,
): Promise<T> {
  if ((value as { format?: string })?.format !== FORMAT) return value;
  if ((value as { version?: number }).version === 2)
    return hydrateReferences(
      value as unknown as ReferenceWire,
      dataset,
    ) as Promise<T>;
  return hydrateLegacyMetadata(value);
}

async function hydrateReferences(
  wire: ReferenceWire,
  dataset: object | undefined,
): Promise<object> {
  if (
    Object.keys(wire).sort().join(",") !==
      "bytes,encoding,format,inline,keys,references,sha256,source,version" ||
    wire.encoding !== "dataset-field-references-v2" ||
    !boundedLength(wire.bytes) ||
    !hashPattern.test(wire.sha256) ||
    !object(wire.source) ||
    Object.keys(wire.source).sort().join(",") !== "modelSha256,roomsSha256" ||
    !Array.isArray(wire.keys) ||
    wire.keys.length === 0 ||
    wire.keys.some((key) => typeof key !== "string") ||
    new Set(wire.keys).size !== wire.keys.length ||
    !Array.isArray(wire.references) ||
    wire.references.length === 0 ||
    wire.references.length > REFERENCE_FIELDS.size ||
    !object(wire.inline) ||
    encoder.encode(JSON.stringify(wire)).length > ENTRY_LIMIT
  )
    return fail();
  const source = referenceSource(dataset);
  if (
    source.modelSha256 !== wire.source.modelSha256 ||
    source.roomsSha256 !== wire.source.roomsSha256
  )
    return fail();
  const inline = structuredClone(await hydrateLegacyMetadata(wire.inline));
  if (!object(inline) || (inline as { format?: string }).format === FORMAT)
    return fail();
  const values = new Map<string, unknown>();
  let referencedBytes = 0;
  for (const reference of wire.references) {
    if (
      !object(reference) ||
      Object.keys(reference).sort().join(",") !== "bytes,field,sha256" ||
      !REFERENCE_FIELDS.has(reference.field) ||
      values.has(reference.field) ||
      !wire.keys.includes(reference.field) ||
      own(inline, reference.field) ||
      !boundedLength(reference.bytes) ||
      !hashPattern.test(reference.sha256) ||
      !own(dataset!, reference.field)
    )
      return fail();
    referencedBytes += reference.bytes;
    if (referencedBytes > wire.bytes) return fail();
    const text = JSON.stringify(
      (dataset as Record<string, unknown>)[reference.field],
    );
    if (typeof text !== "string") return fail();
    const bytes = encoder.encode(text);
    if (
      bytes.length !== reference.bytes ||
      (await hash(bytes)) !== reference.sha256
    )
      return fail();
    values.set(reference.field, JSON.parse(text));
  }
  if (
    Object.keys(inline).length + values.size !== wire.keys.length ||
    Object.keys(inline).some((key) => !wire.keys.includes(key))
  )
    return fail();
  const metadata = Object.fromEntries(
    wire.keys.map((key) => {
      if (!values.has(key) && !own(inline, key)) return fail();
      return [key, values.has(key) ? values.get(key) : inline[key]];
    }),
  );
  const raw = encoder.encode(JSON.stringify(metadata));
  if (raw.length !== wire.bytes || (await hash(raw)) !== wire.sha256)
    return fail();
  return metadata;
}

async function hydrateLegacyMetadata<T extends object>(value: T): Promise<T> {
  if ((value as { format?: string })?.format !== FORMAT) return value;
  const wire = value as unknown as {
    version: number;
    encoding: string;
    bytes: number;
    sha256: string;
    compressedBase64: string;
  };
  if (
    Object.keys(wire).some(
      (k) =>
        ![
          "format",
          "version",
          "encoding",
          "bytes",
          "sha256",
          "compressedBase64",
        ].includes(k),
    ) ||
    wire.version !== 1 ||
    wire.encoding !== "deflate-json-v1" ||
    !Number.isSafeInteger(wire.bytes) ||
    wire.bytes < 1 ||
    wire.bytes > EXPANDED_LIMIT ||
    !/^[a-f0-9]{64}$/.test(wire.sha256) ||
    typeof wire.compressedBase64 !== "string" ||
    wire.compressedBase64.length > ENTRY_LIMIT ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(wire.compressedBase64)
  )
    fail();
  let compressed: Uint8Array;
  try {
    compressed = Uint8Array.from(
      atob(wire.compressedBase64),
      (c) => c.codePointAt(0) ?? 0,
    );
  } catch {
    return fail();
  }
  const raw = boundedInflate(compressed, wire.bytes);
  if ((await hash(raw)) !== wire.sha256) fail();
  let metadata: T;
  try {
    metadata = JSON.parse(decoder.decode(raw));
  } catch {
    return fail();
  }
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    (metadata as { format?: string }).format === FORMAT
  )
    fail();
  return metadata;
}
