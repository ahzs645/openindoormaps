/** One source preparation through the diagnostic phase, without landing search,
 * native floor compilation, export or route admission. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { serialize, deserialize } from "node:v8";
import path from "node:path";
import { prepareIndoorDataset } from "../../../reviter/lib/reviter/indoor-pipeline.ts";
import { initializeNativeExactGeosOverlay } from "../../../reviter/lib/reviter/native-exact-geos-overlay.ts";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory.ts";
import type { IndoorDataset } from "../../../reviter/lib/reviter/indoor-contract.ts";
const root = path.resolve(process.argv[2]!),
  out = path.join(root, "reviews"),
  sha = (b: Uint8Array | string) =>
    createHash("sha256").update(b).digest("hex");
const stateBytes = await readFile(path.join(out, "checked-source-state.bin"));
const state = deserialize(stateBytes) as {
  rooms: RoomDirectoryData;
  context: IndoorDataset;
  modelSha: string;
  sourceRoomsSha256: string;
  nativeCacheSha256: string;
};
const cacheBytes = await readFile(
  path.join(
    root,
    "materials/reissued/UNBC.regenerated-materials.native-cache.json",
  ),
);
assert.equal(sha(cacheBytes), state.nativeCacheSha256);
const cache = JSON.parse(cacheBytes.toString());
assert.equal(cache.sourceModelSha256, state.modelSha);
await initializeNativeExactGeosOverlay();
let captured = false;
try {
  await prepareIndoorDataset(
    cache.nativeModel,
    state.rooms,
    state.modelSha,
    console.log,
    {
      physicalDoorSource: state.context,
      async onPreLandingSnapshot(snapshot) {
        const bytes = serialize(snapshot),
          snapshotSha = sha(bytes);
        await writeFile(
          path.join(out, "prelanding-source-snapshot.bin"),
          bytes,
          { flag: "wx" },
        );
        await writeFile(
          path.join(out, "prelanding-source-snapshot.json"),
          JSON.stringify(
            {
              format: "prelanding-diagnostic-capture-v1",
              createdAt: new Date().toISOString(),
              bytes: bytes.length,
              sha256: snapshotSha,
              sourceStateSha256: sha(stateBytes),
              nativeCacheSha256: state.nativeCacheSha256,
              sourceModelSha256: state.modelSha,
              sourceRoomsSha256: snapshot.source.roomsSha256,
              records: snapshot.records.length,
              doors: snapshot.doors?.length,
              graphEdges: snapshot.edges.length,
              stage:
                "after-original-doors-before-closure-validation-and-landing-search",
              validationAuthorityRestored: false,
              physicalOrRoutingApprovalGranted: false,
            },
            null,
            2,
          ) + "\n",
          { flag: "wx" },
        );
        captured = true;
        throw new Error(
          "Diagnostic snapshot captured; compilation intentionally stopped before validation",
        );
      },
    },
  );
} catch (error) {
  if (!captured) throw error;
  console.log(
    "Captured exact current prelanding stage. No export or physical approval.",
  );
}
assert(captured);
