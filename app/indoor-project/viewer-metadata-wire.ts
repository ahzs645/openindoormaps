import { deflateSync } from "fflate";
import { boundedInflate } from "./review-bundle-inflate";

const FORMAT = "openindoormaps-viewer-metadata-wire";
const ENTRY_LIMIT = 16 * 1024 * 1024;
const EXPANDED_LIMIT = 64 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
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
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};

/** Lossless wire storage for the complete minimal visitor metadata. Packing
 * each physical descriptor alone can still exceed the unchanged entry limit. */
export async function packViewerMetadata<T extends object>(
  value: T,
): Promise<T | object> {
  if ((value as { format?: string }).format === FORMAT) fail();
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

export async function hydrateViewerMetadata<T extends object>(
  value: T,
): Promise<T> {
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
    compressed = Uint8Array.from(atob(wire.compressedBase64), (c) =>
      c.charCodeAt(0),
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
