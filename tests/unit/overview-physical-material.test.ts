import assert from "node:assert/strict";
import test from "node:test";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import { fixture } from "../fixtures/native-area-project";
import { overviewPhysicalMaterial } from "../../app/indoor-project/overview-physical-material";
import { geographicPoint } from "../../app/indoor-project/routing";
import {
  doorApertureGeometryKey,
  type ReviewedDoorApertures,
} from "../../app/indoor-project/reviewed-door-apertures";
import type { NativeMaterialSections } from "../../app/indoor-project/native-material-sections";

type Point = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const source = (
  sections: NativeMaterialSections["levels"][number]["sections"],
) => {
  const data = fixture();
  data.nativeMaterialSections = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    geometrySha256: "c".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 0.1,
        evidenceSha256: "d".repeat(64),
        sourceElementIds: sections.map((section) => section.nativeElementId),
        sections,
      },
    ],
  };
  return data;
};
const section = (
  nativeElementId: number,
  kind: "column" | "wall",
  topElevationFeet: number,
  partsFeet: Point[][][],
) => ({
  nativeElementId,
  categoryId: kind === "column" ? -2_000_100 : -2_000_011,
  kind,
  baseElevationFeet: 0,
  topElevationFeet,
  partsFeet,
});

test("overview material paints only source-bound columns and low walls, retaining holes and disconnected parts", () => {
  const data = source([
    section(10, "column", 12, [
      [rect(0, 0, 8, 8), rect(2, 2, 6, 6)],
      [rect(10, 0, 12, 2)],
    ]),
    section(11, "wall", 3.937, [[rect(0, 10, 8, 11)]]),
    section(12, "wall", 12, [[rect(0, 15, 8, 16)]]),
  ]);
  // A historical uncut proxy cannot acquire paint without native evidence.
  data.walls.push({
    levelId: 1,
    nativeElementId: 999,
    kind: "column",
    approximate: false,
    ringsFeet: [rect(20, 20, 30, 30)],
  });
  const before = JSON.stringify(data);
  const drawing = overviewPhysicalMaterial(data, [1, 1]);
  const contains = (x: number, y: number) =>
    drawing.features.some((feature) =>
      pointInPolygon(geographicPoint(data, [x, y]), feature),
    );
  assert.equal(contains(1, 1), true);
  assert.equal(contains(4, 4), false, "native inner ring remains open");
  assert.equal(contains(11, 1), true, "disconnected source part survives");
  assert.equal(contains(1, 10.5), true, "wall below the 4 ft cut is painted");
  assert.equal(
    contains(1, 15.5),
    false,
    "normal tall wall remains with its plan drawing",
  );
  assert.equal(contains(25, 25), false, "raw uncut proxy is never used");
  assert.equal(drawing.features.length, 2);
  assert.equal(JSON.stringify(data), before);
  assert.equal(overviewPhysicalMaterial(data, [2]).features.length, 0);
  data.nativeMaterialSections!.sourceModelSha256 = "f".repeat(64);
  assert.equal(overviewPhysicalMaterial(data, [1]).features.length, 0);
});

test("overview low-wall paint retains a current reviewed host aperture and rigid source placement", () => {
  const host = rect(-1, 0, 1, 6),
    aperture = rect(-1, 2, 1, 4);
  const data = source([section(1, "wall", 3.9, [[host]])]);
  const reviewed: ReviewedDoorApertures = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    patches: [
      {
        id: "reviewed-host",
        levelId: 1,
        nativeDoorId: 2,
        apertureFeet: aperture,
        normalFeet: [1, 0],
        wallEvidence: [{ nativeElementId: 1, partsFeet: [host] }],
        frameEvidence: [3, 4, 5, 6].map((nativeElementId) => ({
          nativeElementId,
          orientedBox: Array.from({ length: 8 }, (_, i) => [i, 0, 0]),
        })),
        notes: "Preserve a measured native threshold.",
      },
    ],
  };
  data.doors = [
    {
      id: "door",
      nativeElementId: 2,
      levelId: 1,
      pointFeet: [0, 3],
      normalFeet: [1, 0],
      footprintFeet: aperture,
      roomKeys: ["0", "1"],
      state: "connected",
    },
  ];
  data.walls = [rect(-1, 0, 1, 2), rect(-1, 4, 1, 6)].map((ring) => ({
    nativeElementId: 1,
    levelId: 1,
    kind: "wall",
    approximate: false,
    ringsFeet: [ring],
  }));
  data.doorAperturePatchState = {
    regenerated: true,
    sourceGeometryKey: doorApertureGeometryKey(reviewed),
  };
  const before = JSON.stringify(data);
  const drawing = overviewPhysicalMaterial(data, [1]);
  const contains = (x: number, y: number) =>
    drawing.features.some((feature) =>
      pointInPolygon(geographicPoint(data, [x, y]), feature),
    );
  assert.equal(contains(0, 1), true);
  assert.equal(
    contains(0, 3),
    false,
    "a source-bound aperture is not refilled",
  );
  assert.equal(contains(0, 5), true);
  assert.equal(JSON.stringify(data), before);

  delete data.doorAperturePatchState;
  data.nativeWallPositionRepairs = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    walls: [
      {
        id: "source-wall-placement",
        nativeElementId: 1,
        levelId: 1,
        supportEvidence: {
          nativeElementId: 2,
          ringsFeet: [rect(1, 0, 1.005, 6)],
        },
        evidenceSha256: "c".repeat(64),
        notes: "Measured rigid wall placement fixture.",
        originalRingsFeet: [host],
        ringsFeet: [host.map(([x, y]) => [x + 0.005, y])],
      },
    ],
  };
  const moved = overviewPhysicalMaterial(data, [1]);
  assert.equal(
    moved.features.some((feature) =>
      pointInPolygon(geographicPoint(data, [1.002, 1]), feature),
    ),
    true,
    "current validated rigid material placement is retained",
  );
});
