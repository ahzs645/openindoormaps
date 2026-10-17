import assert from "node:assert/strict";
import { progressiveRoutingFixture } from "./progressive-routing";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import {
  prepareNativeCirculationGeometry,
  attachNativeCirculationCellRoutes,
} from "../../../reviter/lib/reviter/native-circulation-geometry";
import type { ConvertResult } from "../../../reviter/lib/reviter/types";

/** Complete small synthetic source fixture; it certifies no UNBC geometry. */
export async function candidateNativeRoutingFixture() {
  const data = progressiveRoutingFixture(),
    ring: [number, number][] = [
      [0, 0],
      [30, 0],
      [30, 10],
      [0, 10],
    ];
  data.records.forEach((record) => {
    record.circulation = true;
    record.access = "public";
  });
  data.records[0].ringsFeet = [
    [
      [0, 0],
      [15, 0],
      [15, 10],
      [0, 10],
    ],
  ];
  data.records[1].ringsFeet = [
    [
      [15, 0],
      [30, 0],
      [30, 10],
      [15, 10],
    ],
  ];
  data.edges = [];
  data.walls = [];
  data.doors = [];
  const envelope = {
    version: 1 as const,
    sourceModelSha256: data.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[ring]],
        sourceElementIds: [10],
        cutElevationsFeet: [4, 8],
        evidenceSha256: "c".repeat(64),
      },
    ],
  };
  data.nativeIndoorEnvelopes = {
    ...envelope,
    geometrySha256: await nativeIndoorEnvelopeHash(envelope),
  };
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [{ nativeElementId: 10, elevationFeet: 0, ringsFeet: [ring] }],
  };
  const model = {
    elementBounds: [
      {
        elementId: 10,
        categoryId: -2000032,
        boundsFeet: { min: { x: 0, y: 0, z: -1 }, max: { x: 30, y: 10, z: 0 } },
        loops: [ring.map(([x, y]) => [x, y, 0])],
      },
    ],
    levels: [{ levelId: 1, elevation: 0 }],
    nativeAssociatedLevelRelations: [],
  } as unknown as ConvertResult;
  data.circulationGeometry = prepareNativeCirculationGeometry(
    model,
    data,
  ).geometry;
  attachNativeCirculationCellRoutes(data);
  assert(data.edges.length > 0);
  return data;
}
