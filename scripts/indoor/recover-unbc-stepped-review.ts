/** Reconstruct the documented 03-S201/03-S301 proposal and reissue its source
 * proof in this process. Saved input/receipts cannot enable a route. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  initializeReviewedSourceSteppedStairV2Proofs,
  type SourceSteppedStairV2Review,
} from "./source-stepped-stair-v2-review.ts";
const root = path.resolve(process.argv[2]!),
  recovered = path.resolve(root, "../unbc-recovery-20261017"),
  out = path.join(root, "reviews"),
  hash = (b: Uint8Array | string) =>
    createHash("sha256").update(b).digest("hex");
const [rvt, sourceRooms, indoor, cache, drawings, stations] = await Promise.all(
  [
    readFile(path.join(recovered, "UNBC.original.rvt")),
    readFile(path.join(recovered, "historical-master/floors/rooms.json")),
    readFile(path.join(recovered, "reconstructed-input/indoor.json")),
    readFile(
      path.join(
        root,
        "materials/reissued/UNBC.regenerated-materials.native-cache.json",
      ),
    ),
    readFile(path.join(out, "reviewed-drawing-references.json"), "utf8"),
    readFile(
      new URL(
        "../../../reviter/tests/fixtures/unbc-1696012-stepped-stations.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ],
);
const data = JSON.parse(indoor.toString()),
  edge = data.edges.filter(
    (e: { nativeElementId: number; kind: string }) =>
      e.nativeElementId === 1_696_006 && e.kind === "stairs",
  );
assert.equal(edge.length, 1);
const lower = data.nodes.find(
    (n: { id: string }) => n.id === edge[0].from,
  ).pointFeet,
  upper = data.nodes.find((n: { id: string }) => n.id === edge[0].to).pointFeet;
const review: SourceSteppedStairV2Review = {
  format: "openindoormaps-original-stepped-stair-v2-review-v1",
  sourceModelSha256: hash(rvt),
  sourceRoomsSha256: hash(sourceRooms),
  nativeCacheSha256: hash(cache),
  originalDatasetSha256: hash(indoor),
  requests: [
    {
      retainedOriginalElementIds: JSON.parse(
        await readFile(
          path.join(out, "stepped-source-dependencies.json"),
          "utf8",
        ),
      ).requestedOriginalFrameIds,
      originalEdgeId: edge[0].id,
      foreignScopeBoundsFeet: {
        min: { x: -15, y: -328, z: 23 },
        max: { x: 6, y: -300, z: 42 },
      },
      sourceRequest: {
        nativeStairId: 1_696_006,
        nativeRunId: 1_696_012,
        nativeDefinitionId: 1_696_013,
      },
      terminalMaterials: [
        { kind: "floor-domains", nativeFloorElementId: 402_395 },
        { kind: "planar-slab", nativeFloorElementId: 405_772 },
      ],
      placedTrimRequests: [
        { nativeElementId: 1_074_348, nativeDefinitionId: 775_553 },
      ],
      proposal: {
        nativeRunId: 1_696_012,
        terminals: [
          {
            nativeFloorElementId: 402_395,
            originalCapFaceToken: 249,
            lateralAxis: "y",
            approachXYFeet: [
              [lower[0], lower[1]],
              [lower[0], -323.302_563_053_045_6],
              [1.6, -323.302_563_053_045_6],
              [0.514_804_339_988_472_3, -323.302_563_053_045_6],
            ],
          },
          {
            nativeFloorElementId: 405_772,
            originalCapFaceToken: 5,
            lateralAxis: "y",
            approachXYFeet: [
              [upper[0], upper[1]],
              [upper[0], -318.123_431_768_413_07],
              [-0.983_106_118_077_395_5, -318.123_431_768_413_07],
            ],
          },
        ],
        stations: JSON.parse(stations).stations,
      },
    },
  ],
};
await writeFile(
  path.join(out, "proposed-stepped-stair-review.json"),
  JSON.stringify(review, null, 2) + "\n",
  { flag: "wx" },
);
const result = initializeReviewedSourceSteppedStairV2Proofs({
  originalRVTBytes: rvt,
  originalDatasetBytes: indoor,
  originalSourceRoomsBytes: sourceRooms,
  sourceModelSha256: review.sourceModelSha256,
  sourceRoomsSha256: review.sourceRoomsSha256,
  nativeCacheSha256: review.nativeCacheSha256,
  reviewedDrawingReferences: JSON.parse(drawings),
  review,
  log: (v) => console.log(JSON.stringify(v)),
});
await writeFile(
  path.join(out, "checked-stepped-stair-review.json"),
  JSON.stringify(review, null, 2) + "\n",
  { flag: "wx" },
);
await writeFile(
  path.join(out, "stepped-stair-source-replay.json"),
  JSON.stringify(result.receipt, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  "Fresh original-source proof reissued. Runtime and current landing-cell policy admission still required.",
);
