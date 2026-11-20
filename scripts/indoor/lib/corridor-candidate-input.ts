import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import type { IndoorDataset } from "../../../app/indoor-project/contract";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Optional CLI collection at boundaries where a whole archive/member/string
 * has become unreachable. Correctness never depends on collection being exposed. */
function releaseInputTemporaries() {
  globalThis.gc?.();
}

/** Identical to SHA256(JSON.stringify(value)). Keep native JSON serialization,
 * key/array order and numeric semantics, but avoid one dataset-sized UTF-8
 * allocation while feeding the hash. Never split a UTF-16 surrogate pair. */
export function corridorCandidateDatasetSha256(value: unknown): string {
  releaseInputTemporaries();
  let serialized: string | undefined = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Expected JSON source data");
  const hash = createHash("sha256");
  for (let offset = 0; offset < serialized.length; ) {
    let end = Math.min(offset + 65_536, serialized.length);
    // A supplementary code point here starts with the last code unit of this
    // chunk and ends in the next one. Keep both units in the following chunk.
    if (end < serialized.length && serialized.codePointAt(end - 1)! > 0xff_ff)
      end--;
    hash.update(serialized.slice(offset, end), "utf8");
    offset = end;
  }
  const digest = hash.digest("hex");
  serialized = undefined;
  releaseInputTemporaries();
  return digest;
}

/** Read the complete unchanged dataset from its actual archive. Member hashes
 * are checked before parsing; no projection, cached authority or thin fixture
 * substitutes for the original physical/policy data. The large ZIP and rooms
 * buffers have no use after verification, so release them before JSON.parse. */
export async function readCorridorCandidateInput(
  input: string,
  onPhase?: (phase: string) => void,
): Promise<{
  data: IndoorDataset;
  inputZipSha256: string;
  inputJsonSha256: string;
  sourceSnapshot: string;
}> {
  let archive: Uint8Array | undefined = await readFile(input);
  onPhase?.("archive-read");
  const inputZipSha256 = sha(archive);
  const manifestFiles = unzipSync(archive, {
    filter: (entry) => entry.name === "manifest.json",
  });
  if (!manifestFiles["manifest.json"])
    throw new Error("Missing package manifest");
  const manifest = JSON.parse(strFromU8(manifestFiles["manifest.json"]));
  const descriptors = [manifest.indoor, manifest.floors, manifest.georeference];
  if (descriptors.some((descriptor) => typeof descriptor?.path !== "string"))
    throw new Error("Missing package member descriptor");
  const wanted = new Set(descriptors.map((descriptor) => descriptor.path));
  let files: ReturnType<typeof unzipSync> | undefined = unzipSync(archive, {
    filter: (entry) => wanted.has(entry.name),
  });
  let inputJsonSha256 = "";
  for (const descriptor of descriptors) {
    const member = files[descriptor.path];
    if (!member || member.length !== descriptor.bytes)
      throw new Error("Package member does not match its manifest");
    const digest = sha(member);
    if (digest !== descriptor.sha256)
      throw new Error("Package member does not match its manifest");
    if (descriptor === manifest.indoor) inputJsonSha256 = digest;
  }
  onPhase?.("members-verified");
  let indoor: Uint8Array | undefined = files[manifest.indoor.path];
  files = undefined;
  archive = undefined;
  releaseInputTemporaries();
  onPhase?.("archive-and-other-members-released");
  let text: string | undefined = strFromU8(indoor);
  indoor = undefined;
  releaseInputTemporaries();
  onPhase?.("source-member-buffer-released");
  const data = JSON.parse(text) as IndoorDataset;
  text = undefined;
  releaseInputTemporaries();
  onPhase?.("complete-source-parsed");
  if (data.source.modelSha256 !== manifest.model.sha256)
    throw new Error("Model identities disagree");
  const sourceSnapshot = corridorCandidateDatasetSha256(data);
  onPhase?.("complete-source-snapshot-hashed");
  return { data, inputZipSha256, inputJsonSha256, sourceSnapshot };
}
