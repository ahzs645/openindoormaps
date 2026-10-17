import { unzip, unzipSync } from "fflate";
import type { IndoorProject, ProjectRooms } from "./package";
import { hydrateViewerMetadata } from "./viewer-metadata-wire";
import { hydrateRoomNativeMaterials } from "./native-material-wire";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import type { ProjectImportObserver } from "./project-import-progress";
import { projectImportReporter } from "./project-import-progress";
import { PUBLISHED_PROJECT_RECEIPTS } from "./published-project-receipts";

export type PublishedProjectReceipt = {
  id: string;
  packageSha256: string;
  packageBytes: number;
  validatorSha256: string;
  datasetSha256: string;
  source: IndoorProject["dataset"]["source"];
  entries: Record<string, { bytes: number; sha256: string }>;
  progressiveRevisionSha256: string;
  validationReportSha256: string;
  validationElapsedMs: number;
};
export type PublishedProjectImport = {
  project: IndoorProject;
  receipt?: PublishedProjectReceipt;
};
export const publishedSha256 = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");

/** A receipt is trusted only when compiled into this app. The optional policy
 * is for publisher/CLI tests; the browser worker never accepts it in a message.
 * A different archive or validator returns no admission and uses full import. */
export async function tryReadPublishedProject(
  bytes: Uint8Array,
  onProgress?: ProjectImportObserver,
  policy: {
    receipts: readonly PublishedProjectReceipt[];
    validatorSha256: string;
  } = {
    receipts: PUBLISHED_PROJECT_RECEIPTS,
    validatorSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  },
): Promise<PublishedProjectImport | undefined> {
  const candidates = policy.receipts.filter(
    (r) =>
      r.packageBytes === bytes.length &&
      r.validatorSha256 === policy.validatorSha256,
  );
  if (!candidates.length) return;
  const progress = projectImportReporter(onProgress);
  progress("checksums");
  const hash = await publishedSha256(bytes);
  const receipt = candidates.find((r) => r.packageSha256 === hash);
  if (!receipt) return;
  const seen = new Set<string>();
  unzipSync(bytes, {
    filter: (entry) => {
      const expected = receipt.entries[entry.name];
      if (
        !expected ||
        seen.has(entry.name) ||
        entry.originalSize !== expected.bytes
      )
        throw new Error(
          "Published map archive differs from its checked inventory.",
        );
      seen.add(entry.name);
      return false;
    },
  });
  if (seen.size !== Object.keys(receipt.entries).length)
    throw new Error("Published map is missing a checked file.");
  progress("archive");
  const files = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) =>
      unzip(bytes, (error, files) => (error ? reject(error) : resolve(files))),
  );
  for (const [path, expected] of Object.entries(receipt.entries))
    if (
      files[path]?.length !== expected.bytes ||
      (await publishedSha256(files[path])) !== expected.sha256
    )
      throw new Error("Published map file checksum mismatch.");
  progress("decode");
  const parse = (path: string) =>
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(files[path]));
  const manifest = parse("manifest.json") as IndoorProject["manifest"];
  const dataset = parse("viewer/indoor.json") as IndoorProject["dataset"];
  if (
    manifest.format !== "openindoormaps-viewer" ||
    manifest.version !== 1 ||
    manifest.preparedDisplay ||
    manifest.indoor.sha256 !== receipt.datasetSha256 ||
    JSON.stringify(dataset.source) !== JSON.stringify(receipt.source) ||
    manifest.model.sha256 !== receipt.source.modelSha256 ||
    manifest.sourceRoomsSha256 !== receipt.source.roomsSha256
  )
    throw new Error(
      "Published map identity differs from its validation receipt.",
    );
  progress("identity");
  const rooms = await hydrateRoomNativeMaterials(
    await hydrateViewerMetadata(
      parse("viewer/metadata.json") as ProjectRooms,
      dataset,
    ),
  );
  progress("transfer");
  return { project: { manifest, dataset, rooms, files }, receipt };
}
