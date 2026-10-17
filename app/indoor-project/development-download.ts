import { zipSync, strToU8 } from "fflate";
import { fetchHostedProject } from "./hosted-project";

export type DevelopmentSnapshot = {
  format: "openindoormaps-development-v1";
  version: 1;
  releaseId: string;
  createdAt: string;
  fileName: string;
  viewer: { manifestPath: string; sha256: string; bytes: number };
  repositories: {
    name: "openindoormaps" | "reviter";
    commit: string;
    branch: string;
    repositoryUrl: string;
    sha256: string;
    bytes: number;
    parts: { path: string; sha256: string; bytes: number }[];
  }[];
  nativeRebuildReady: boolean;
  missingInputs: { name: string; reason: string; sha256?: string }[];
  readme: string;
  restoreScript: string;
};
const MAX_BYTES = 256 * 1024 * 1024;
const hash = (x: unknown): x is string =>
  typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const bytes = (x: unknown): x is number =>
  Number.isSafeInteger(x) && Number(x) > 0 && Number(x) <= MAX_BYTES;
const digest = async (x: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(x).buffer),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
function localUrl(path: string, base: string) {
  const url = new URL(path, base),
    origin = new URL(base);
  if (
    !/^https?:$/.test(url.protocol) ||
    url.origin !== origin.origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error("Development assets must use the map's own origin.");
  return url.href;
}
async function read(response: Response, limit: number, signal: AbortSignal) {
  if (!response.ok || !response.body)
    throw new Error(`Development download failed (${response.status}).`);
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Development asset exceeds its declared size.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
export function validateDevelopmentSnapshot(
  value: unknown,
): asserts value is DevelopmentSnapshot {
  const d = value as DevelopmentSnapshot;
  if (
    !d ||
    d.version !== 1 ||
    d.format !== "openindoormaps-development-v1" ||
    !/^[a-f0-9]{12,64}$/.test(d.releaseId) ||
    typeof d.createdAt !== "string" ||
    !/^UNBC\.development-[a-f0-9]{12,64}\.zip$/.test(d.fileName) ||
    !d.viewer ||
    !hash(d.viewer.sha256) ||
    !bytes(d.viewer.bytes) ||
    typeof d.viewer.manifestPath !== "string" ||
    d.nativeRebuildReady !== false ||
    !Array.isArray(d.missingInputs) ||
    d.missingInputs.length === 0 ||
    d.missingInputs.length > 32 ||
    d.missingInputs.some(
      (x) =>
        !x ||
        typeof x.name !== "string" ||
        x.name.length > 200 ||
        typeof x.reason !== "string" ||
        x.reason.length > 2000 ||
        (x.sha256 !== undefined && !hash(x.sha256)),
    ) ||
    (d.nativeRebuildReady && d.missingInputs.length > 0) ||
    typeof d.readme !== "string" ||
    d.readme.length > 20_000 ||
    typeof d.restoreScript !== "string" ||
    d.restoreScript.length > 20_000 ||
    !Array.isArray(d.repositories) ||
    d.repositories.length !== 2
  )
    throw new Error("Invalid development snapshot.");
  const names = new Set<string>(),
    paths = new Set<string>();
  let total = d.viewer.bytes;
  for (const repo of d.repositories) {
    if (
      !repo ||
      !["openindoormaps", "reviter"].includes(repo.name) ||
      names.has(repo.name) ||
      !/^[a-f0-9]{40}$/.test(repo.commit) ||
      !hash(repo.sha256) ||
      typeof repo.branch !== "string" ||
      repo.branch.length > 200 ||
      repo.repositoryUrl !== `https://github.com/ahzs645/${repo.name}` ||
      !bytes(repo.bytes) ||
      !Array.isArray(repo.parts) ||
      repo.parts.length === 0 ||
      repo.parts.length > 16
    )
      throw new Error("Invalid development source archive.");
    names.add(repo.name);
    let size = 0;
    for (const part of repo.parts) {
      if (
        !part ||
        !hash(part.sha256) ||
        part.path !== `parts/${part.sha256}.bin` ||
        paths.has(part.path) ||
        !bytes(part.bytes) ||
        part.bytes > 24 * 1024 * 1024
      )
        throw new Error("Invalid development source part.");
      paths.add(part.path);
      size += part.bytes;
    }
    if (size !== repo.bytes)
      throw new Error("Development source sizes do not match.");
    total += size;
  }
  if (total > MAX_BYTES)
    throw new Error("Development snapshot exceeds the download budget.");
}
export async function readDevelopmentSnapshot(
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const safe = localUrl(url, url);
  const raw = await read(
    await fetcher(safe, { signal, cache: "no-cache" }),
    65_536,
    signal,
  );
  const value: unknown = JSON.parse(new TextDecoder().decode(raw));
  validateDevelopmentSnapshot(value);
  localUrl(value.viewer.manifestPath, url);
  return value;
}
/** Transport only: reuses the hosted viewer parts. Never imports geometry or
 * starts floor/directions workers. Sources are already-compressed archives. */
export async function buildDevelopmentDownload(
  url: string,
  expectedViewerSha256: string,
  options: {
    signal: AbortSignal;
    fetcher?: typeof fetch;
    onProgress?: (message: string) => void;
  },
) {
  const fetcher = options.fetcher ?? fetch,
    signal = options.signal;
  const snapshot = await readDevelopmentSnapshot(url, signal, fetcher);
  if (snapshot.viewer.sha256 !== expectedViewerSha256)
    throw new Error(
      "The development snapshot belongs to another map release. Reload the download page.",
    );
  const files: Record<string, Uint8Array> = {
    "README.md": strToU8(snapshot.readme),
    "RELEASE.json": strToU8(JSON.stringify(snapshot, null, 2)),
    "restore.py": strToU8(snapshot.restoreScript),
  };
  for (const repo of snapshot.repositories) {
    options.onProgress?.(`Downloading ${repo.name} source…`);
    const buffer = new Uint8Array(repo.bytes);
    let offset = 0;
    for (const part of repo.parts) {
      signal.throwIfAborted();
      const chunk = await read(
        await fetcher(localUrl(part.path, url), { signal }),
        part.bytes,
        signal,
      );
      if (chunk.length !== part.bytes || (await digest(chunk)) !== part.sha256)
        throw new Error("Development source part failed its checksum.");
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    if ((await digest(buffer)) !== repo.sha256)
      throw new Error("Development source archive failed its checksum.");
    files[`sources/${repo.name}.source.tar.xz`] = buffer;
  }
  const viewer = await fetchHostedProject(
    localUrl(snapshot.viewer.manifestPath, url),
    {
      signal,
      fetcher,
      onProgress: (n, total) =>
        options.onProgress?.(
          `Downloading visitor map · ${(n / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`,
        ),
    },
  );
  if (
    viewer.sha256 !== snapshot.viewer.sha256 ||
    viewer.bytes.length !== snapshot.viewer.bytes
  )
    throw new Error(
      "The published map changed during the development download. Retry after reloading.",
    );
  files["data/UNBC.campus-viewer.zip"] = viewer.bytes;
  signal.throwIfAborted();
  options.onProgress?.("Assembling verified development snapshot…");
  const archive = zipSync(files, { level: 0 });
  signal.throwIfAborted();
  return {
    bytes: archive,
    fileName: snapshot.fileName,
    sha256: await digest(archive),
    snapshot,
  };
}
