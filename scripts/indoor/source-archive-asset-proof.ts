/** Compare preserved source entry bytes independently of regenerated display,
 * the manifest wrapper and the separately reviewed authoring room JSON. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function preservedSourceEntryInventory(bytes: Uint8Array) {
  const entries = unzipSync(bytes, { filter: entry =>
    !entry.name.startsWith("viewer/") && entry.name !== "manifest.json" && entry.name !== "floors/rooms.json",
  });
  return Object.keys(entries).sort().map(path => ({ path, bytes: entries[path]!.length, sha256: sha(entries[path]!) }));
}
export function assertPreservedSourceEntryInventories(
  before: ReturnType<typeof preservedSourceEntryInventory>,
  after: ReturnType<typeof preservedSourceEntryInventory>,
) {
  assert(before.length > 0, "Original source archive has no preserved assets");
  assert.deepEqual(after, before, "Original model, GIS, scene and review-companion entry bytes must remain exact");
  return { originalSourceAssetsPreservedByteForByte: true as const, entries: before };
}
