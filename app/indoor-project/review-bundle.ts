import { MAX_REVIEW_FILES, MAX_REVIEW_BYTES } from "./review-bundle-limits";
export { MAX_REVIEW_FILES, MAX_REVIEW_BYTES } from "./review-bundle-limits";
import { deflateSync } from "fflate";
import { boundedInflate } from "./review-bundle-inflate";
import {
  readIndoorProject,
  isViewerProject,
  type IndoorProject,
} from "./package";
import {
  saveEnclosureProposals,
  type EnclosureProposals,
} from "./enclosure-proposals";

type FolderFile = Pick<File, "name" | "size" | "arrayBuffer"> & {
  webkitRelativePath?: string;
};
export type ReviewBundle = {
  version: 1;
  masterSha256: string;
  files: {
    path: string;
    bytes: number;
    sha256: string;
    compressedBase64: string;
  }[];
};
const MAX_FILE = 32 * 1024 * 1024;
// Full authoring masters retain historical evidence alongside current repairs.
// Keep the individual-file/count limits while allowing a bounded growing ledger.
const MAX_TOTAL = MAX_REVIEW_BYTES;
const safePath = (p: unknown): p is string =>
  typeof p === "string" &&
  p.length < 256 &&
  !p.startsWith("/") &&
  !p.includes("\\") &&
  p.split("/").every((s) => !!s && s !== "." && s !== "..") &&
  /\.(json|md|txt|log|png|jpe?g)$/i.test(p);
const digest = async (bytes: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const base64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
};
export function reviewFileBytes(file: ReviewBundle["files"][number]) {
  const bytes = Uint8Array.from(atob(file.compressedBase64), (c) =>
    c.charCodeAt(0),
  );
  if (
    !Number.isSafeInteger(file.bytes) ||
    file.bytes < 0 ||
    file.bytes > MAX_FILE
  )
    throw new Error("Review companion exceeds its file limit.");
  return boundedInflate(bytes, file.bytes);
}
export function validateReviewBundle(
  value: unknown,
): asserts value is ReviewBundle | undefined {
  if (value === undefined) return;
  const b = value as ReviewBundle;
  if (
    !b ||
    b.version !== 1 ||
    !/^[a-f0-9]{64}$/.test(b.masterSha256) ||
    !Array.isArray(b.files) ||
    b.files.length > MAX_REVIEW_FILES ||
    b.files.some(
      (f) =>
        !f ||
        !safePath(f.path) ||
        !Number.isSafeInteger(f.bytes) ||
        f.bytes < 0 ||
        f.bytes > MAX_FILE ||
        !/^[a-f0-9]{64}$/.test(f.sha256) ||
        typeof f.compressedBase64 !== "string" ||
        f.compressedBase64.length > MAX_FILE * 2 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(f.compressedBase64),
    ) ||
    new Set(b.files.map((f) => f.path)).size !== b.files.length ||
    b.files.reduce((n, f) => n + f.bytes, 0) > MAX_TOTAL
  )
    throw new Error("Invalid review companion files or size limits.");
}
export async function verifyReviewBundle(value: unknown) {
  validateReviewBundle(value);
  if (value)
    for (const file of value.files) {
      const bytes = reviewFileBytes(file);
      if (bytes.length !== file.bytes || (await digest(bytes)) !== file.sha256)
        throw new Error(`Damaged review companion: ${file.path}`);
    }
}

/** Only consume files explicitly bound to one authoring master. Ignore old archives and provenance. */
export async function readProjectFolder(
  files: FolderFile[],
): Promise<{ project: IndoorProject; fileName: string }> {
  const path = (f: FolderFile) => f.webkitRelativePath || f.name;
  const allManifests = files.filter((f) =>
    /(^|\/)review-recommendations\/manifest\.json$/.test(path(f)),
  );
  // A master folder can contain archived masters under provenance. Select the
  // outer manifest; equally shallow masters remain ambiguous and are refused.
  const depth = Math.min(...allManifests.map((f) => path(f).split("/").length));
  const manifests = allManifests.filter(
    (f) => path(f).split("/").length === depth,
  );
  if (manifests.length !== 1)
    throw new Error(
      "Choose the master folder containing one review-recommendations/manifest.json.",
    );
  const manifestFile = manifests[0];
  if (manifestFile.size > 1024 * 1024)
    throw new Error("Review companion manifest is too large.");
  const manifest = JSON.parse(
    new TextDecoder().decode(await manifestFile.arrayBuffer()),
  );
  if (
    !["unbc-review-companion", "openindoormaps-review-companion"].includes(
      manifest.format,
    ) ||
    manifest.version !== 1 ||
    typeof manifest.masterFile !== "string" ||
    !/^[^/\\]+\.zip$/i.test(manifest.masterFile) ||
    !/^[a-f0-9]{64}$/.test(manifest.masterSha256) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > MAX_REVIEW_FILES
  )
    throw new Error("Invalid master folder manifest.");
  const companionRoot = path(manifestFile).slice(0, -"manifest.json".length);
  const masterRoot = companionRoot.slice(0, -"review-recommendations/".length);
  const master = files.find(
    (f) => path(f) === masterRoot + manifest.masterFile,
  );
  if (!master || master.size > 900 * 1024 * 1024)
    throw new Error(
      "The companion's master ZIP is missing or exceeds its size limit.",
    );
  const bytes = new Uint8Array(await master.arrayBuffer());
  if ((await digest(bytes)) !== manifest.masterSha256)
    throw new Error(
      "The master ZIP has changed since these review files were scanned. Update the companion manifest before importing this folder.",
    );
  let project = await readIndoorProject(bytes);
  const masterCompanions = project.rooms.reviewBundle?.files ?? [];
  if (isViewerProject(project))
    throw new Error(
      "Folder review requires the authoring master, not a campus viewer.",
    );
  const bundle: ReviewBundle = {
    version: 1,
    masterSha256: manifest.masterSha256,
    files: [],
  };
  const seen = new Set<string>();
  let total = 0;
  for (const entry of manifest.files) {
    if (
      !entry ||
      !safePath(entry.file) ||
      seen.has(entry.file) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      entry.bytes > MAX_FILE ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error("Invalid or duplicate companion file.");
    seen.add(entry.file);
    total += entry.bytes;
    if (total > MAX_TOTAL)
      throw new Error("Review companions exceed the 256 MiB limit.");
    const file = files.find((f) => path(f) === companionRoot + entry.file);
    if (!file || file.size !== entry.bytes)
      throw new Error(`Missing or changed review file: ${entry.file}`);
    const content = new Uint8Array(await file.arrayBuffer());
    if ((await digest(content)) !== entry.sha256)
      throw new Error(`Review checksum mismatch: ${entry.file}`);
    if (entry.file === "review-proposals.json")
      project = saveEnclosureProposals(
        project,
        JSON.parse(new TextDecoder().decode(content)) as EnclosureProposals,
      );
    // The folder manifest uses paths relative to its companion directory.
    // Keep the ZIP's authoritative namespace so review responses and evidence
    // references survive a folder round trip.
    const matching = masterCompanions.filter(
      (f) =>
        f.sha256 === entry.sha256 &&
        (f.path === entry.file || f.path.endsWith("/" + entry.file)),
    );
    const exact = matching.find((f) => f.path === entry.file);
    bundle.files.push({
      path:
        exact?.path ?? (matching.length === 1 ? matching[0].path : entry.file),
      bytes: content.length,
      sha256: entry.sha256,
      compressedBase64: base64(deflateSync(content)),
    });
  }
  validateReviewBundle(bundle);
  return {
    project: { ...project, rooms: { ...project.rooms, reviewBundle: bundle } },
    fileName: master.name,
  };
}
