import {
  checkedStairPreferences,
  type HostedStairPreferences,
} from "./stair-exclusions";
/** Transport for an unchanged project ZIP split to fit static hosting limits.
 * The ordinary package worker still validates geometry, identities and routes. */
type HostedProjectManifest = {
  version: 1;
  format: "openindoormaps-hosted-project-v1";
  fileName: string;
  bytes: number;
  sha256: string;
  parts: { path: string; bytes: number; sha256: string }[];
  viewerPreferences?: HostedStairPreferences;
  developmentSnapshot?: string;
};
const MAX_PACKAGE = 900 * 1024 * 1024;
const MAX_PART = 24 * 1024 * 1024;
const isHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const digest = async (bytes: Uint8Array) => {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
};
async function boundedResponse(response: Response, maximum: number) {
  if (!response.ok)
    throw new Error(`Map download failed (${response.status}).`);
  if (!response.body) throw new Error("Map download returned no data.");
  const reader = response.body.getReader();
  const pieces: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("Map download exceeds its declared size.");
      }
      pieces.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const piece of pieces) {
    bytes.set(piece, offset);
    offset += piece.length;
  }
  return bytes;
}

export async function fetchHostedProject(
  manifestUrl: string,
  options: {
    signal: AbortSignal;
    cachedBytes?: Uint8Array;
    onProgress?: (received: number, total: number) => void;
    fetcher?: typeof fetch;
  },
) {
  const fetcher = options.fetcher ?? fetch;
  const url = new URL(manifestUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("Unsupported hosted map URL.");
  const raw = await boundedResponse(
    await fetcher(url.href, { signal: options.signal, cache: "no-cache" }),
    65_536,
  );
  const manifest = JSON.parse(
    new TextDecoder().decode(raw),
  ) as HostedProjectManifest;
  if (
    manifest.version !== 1 ||
    manifest.format !== "openindoormaps-hosted-project-v1" ||
    typeof manifest.fileName !== "string" ||
    !manifest.fileName.endsWith(".zip") ||
    manifest.fileName.length > 200 ||
    !Number.isSafeInteger(manifest.bytes) ||
    manifest.bytes <= 0 ||
    manifest.bytes > MAX_PACKAGE ||
    !isHash(manifest.sha256) ||
    !Array.isArray(manifest.parts) ||
    manifest.parts.length === 0 ||
    manifest.parts.length > 64
  )
    throw new Error("Invalid hosted map manifest.");
  let total = 0;
  const paths = new Set<string>();
  for (const part of manifest.parts) {
    if (
      !part ||
      !isHash(part.sha256) ||
      part.path !== `parts/${part.sha256}.bin` ||
      paths.has(part.path) ||
      !Number.isSafeInteger(part.bytes) ||
      part.bytes <= 0 ||
      part.bytes > MAX_PART
    )
      throw new Error("Invalid hosted map part.");
    paths.add(part.path);
    total += part.bytes;
  }
  if (total !== manifest.bytes)
    throw new Error("Hosted map part sizes do not match.");
  const viewerPreferences =
    manifest.viewerPreferences === undefined
      ? undefined
      : checkedStairPreferences(manifest.viewerPreferences);
  options.signal.throwIfAborted();
  if (
    options.cachedBytes?.length === manifest.bytes &&
    (await digest(options.cachedBytes)) === manifest.sha256
  ) {
    options.signal.throwIfAborted();
    options.onProgress?.(total, total);
    return {
      bytes: options.cachedBytes,
      fileName: manifest.fileName,
      sha256: manifest.sha256,
      cached: true,
      viewerPreferences,
    };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of manifest.parts) {
    options.signal.throwIfAborted();
    const chunk = await boundedResponse(
      await fetcher(new URL(part.path, url).href, { signal: options.signal }),
      part.bytes,
    );
    if (chunk.length !== part.bytes || (await digest(chunk)) !== part.sha256)
      throw new Error("Downloaded map part failed its checksum.");
    bytes.set(chunk, offset);
    offset += chunk.length;
    options.onProgress?.(offset, total);
  }
  if ((await digest(bytes)) !== manifest.sha256)
    throw new Error("Downloaded map failed its checksum.");
  options.signal.throwIfAborted();
  return {
    bytes,
    fileName: manifest.fileName,
    sha256: manifest.sha256,
    cached: false,
    viewerPreferences,
  };
}

/** Discover a paired source download without fetching or decoding the map. */
export async function hostedDevelopmentOffer(
  manifestUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(manifestUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("Unsupported hosted map URL.");
  const raw = await boundedResponse(
    await fetcher(url.href, { signal, cache: "no-cache" }),
    65_536,
  );
  const manifest = JSON.parse(
    new TextDecoder().decode(raw),
  ) as HostedProjectManifest;
  if (
    manifest.format !== "openindoormaps-hosted-project-v1" ||
    manifest.version !== 1 ||
    !isHash(manifest.sha256)
  )
    throw new Error("Invalid hosted map manifest.");
  if (manifest.developmentSnapshot === undefined) return;
  if (typeof manifest.developmentSnapshot !== "string")
    throw new Error("Invalid development download link.");
  const snapshot = new URL(manifest.developmentSnapshot, url);
  if (
    snapshot.origin !== url.origin ||
    snapshot.username ||
    snapshot.password ||
    snapshot.hash ||
    snapshot.search ||
    !snapshot.pathname.endsWith(".json")
  )
    throw new Error("Development download must use the map's own origin.");
  return { url: snapshot.href, viewerSha256: manifest.sha256 };
}
