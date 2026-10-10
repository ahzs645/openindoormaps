import assert from "node:assert/strict";
import test from "node:test";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { NativeExploreResult } from "../../app/indoor-project/native-explore";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { fixture } from "../fixtures/native-area-project";
import { strictNativeDisplay } from "../../app/indoor-project/strict-native-display";
import { relativeHeightGeometry } from "../../app/indoor-project/relative-heights";
import { precisionWallMesh } from "../../app/indoor-project/precision-wall-layer";
import {
  groundedWalls,
  nativeWallOwnerLevel,
  singleExtrusionWalls,
} from "../../app/indoor-project/native-wall-level-owner";

// Three native levels of one campus floor, as in UNBC Floor 1:
// 1 = Floor 0.5 (-3.28 ft), 2 = Main (0 ft), 3 = Floor 1.25 (+3.28 ft).
const FT = 3.2808398950131235;
const LEVELS = [
  { id: 1, name: "Floor 0.5", elevationFeet: -FT },
  { id: 2, name: "Floor 1", elevationFeet: 0 },
  { id: 3, name: "Floor 1.25", elevationFeet: FT },
];
// A physical wall is described once by its source base/top. Each native level
// section is cut 4 ft above that level, so a wall is returned for every cut
// plane that passes through it.
const ELEMENTS = [
  { id: 100, base: 0, top: 13.78 }, // stands on Main, passes all three cuts
  { id: 101, base: FT, top: 13.78 }, // stands on 1.25, cut by Main and 1.25
  { id: 102, base: -FT, top: 13.78 }, // stands on 0.5, passes all three cuts
  { id: 103, base: 1, top: 5 }, // low partition, Main cut only
];
function project(): { data: IndoorDataset; native: NativeExploreResult } {
  const data = fixture();
  data.nativeLevels = LEVELS;
  data.records = [];
  // Presence is all the display needs: it switches on native physical heights.
  data.nativeIndoorEnvelopes = {} as IndoorDataset["nativeIndoorEnvelopes"];
  data.nativeMaterialSections = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    geometrySha256: "d".repeat(64),
    levels: LEVELS.map((level) => ({
      levelId: level.id,
      elevationFeet: level.elevationFeet,
      cutElevationFeet: level.elevationFeet + 4,
      evidenceSha256: "e".repeat(64),
      sourceElementIds: ELEMENTS.map((e) => e.id),
      sections: ELEMENTS.filter(
        (e) =>
          e.base <= level.elevationFeet + 4 && level.elevationFeet + 4 < e.top,
      ).map((e) => ({
        nativeElementId: e.id,
        categoryId: -2000011,
        kind: "wall" as const,
        baseElevationFeet: e.base,
        topElevationFeet: e.top,
        partsFeet: [],
      })),
    })),
  };
  const [lng, lat] = data.alignment.originGeographic;
  const strip = (i: number): number[][] => {
    const x = lng + i * 2e-5,
      y = lat;
    return [
      [x, y],
      [x + 1e-5, y],
      [x + 1e-5, y + 4e-5],
      [x, y + 4e-5],
      [x, y],
    ];
  };
  const walls: Feature<Polygon>[] = [];
  for (const level of LEVELS)
    ELEMENTS.forEach((e, i) => {
      if (
        e.base <= level.elevationFeet + 4 &&
        level.elevationFeet + 4 < e.top
      )
        walls.push({
          type: "Feature",
          properties: { levelId: level.id, nativeElementId: e.id, kind: "wall" },
          geometry: { type: "Polygon", coordinates: [strip(i)] },
        });
    });
  // Provisional corner seals use negative IDs that repeat per level but are
  // different bodies: they must never be merged.
  for (const level of LEVELS.slice(0, 2))
    walls.push({
      type: "Feature",
      properties: { levelId: level.id, nativeElementId: -700000000, kind: "wall" },
      geometry: { type: "Polygon", coordinates: [strip(9 + level.id)] },
    });
  const native = {
    regions: [],
    outlines: { type: "FeatureCollection", features: [] },
    overview: { type: "FeatureCollection", features: [] },
    walls: { type: "FeatureCollection", features: walls },
  } as unknown as NativeExploreResult;
  return { data, native };
}
const extrusionsByElement = (walls: FeatureCollection<MultiPolygon>) => {
  const out = new Map<number, number[]>();
  for (const f of walls.features) {
    const id = Number(f.properties?.nativeElementId);
    out.set(id, [...(out.get(id) ?? []), Number(f.properties?.base)]);
  }
  return out;
};
const bake = (data: IndoorDataset, levels: number[], native: NativeExploreResult) =>
  relativeHeightGeometry(
    data,
    levels,
    strictNativeDisplay(data, levels, "all", "", true, native).exposedWalls,
    "wall",
  );

test("BEFORE: a combined scope extrudes one physical wall once per level cut, 1 m apart", () => {
  const { data, native } = project();
  const walls = bake(data, [1, 2, 3], native);
  const bases = extrusionsByElement(walls);
  const metres = (feet: number[]) =>
    feet.map((b) => Number(b.toFixed(3))).sort((a, b) => a - b);
  // Same physical wall, three stacked copies at 0, 1 and 2 m (+0.61 m tall each).
  assert.deepEqual(metres(bases.get(100)!), [0, 1, 2]);
  assert.deepEqual(metres(bases.get(102)!), [0, 1, 2]);
  assert.equal(bases.get(101)!.length, 2);
  assert.equal(bases.get(103)!.length, 1);
  // 4 physical walls + 2 distinct seals = 6 bodies, drawn 3 + 2 + 3 + 1 + 2 = 11 times.
  assert.equal(walls.features.length, 11);
  const heights = new Set(
    walls.features.map((f) =>
      (Number(f.properties?.height) - Number(f.properties?.base)).toFixed(2),
    ),
  );
  assert.deepEqual([...heights], ["0.61"]);
});

test("AFTER: each physical wall is extruded once, on the level that carries it", () => {
  const { data, native } = project();
  const before = bake(data, [1, 2, 3], native);
  const after = singleExtrusionWalls(data, [1, 2, 3], before);
  const bases = extrusionsByElement(after);
  assert.equal(bases.get(100)!.length, 1);
  assert.ok(Math.abs(bases.get(100)![0] - FT * 0.3048) < 1e-9, "wall 100 stands on Main (+1 m over the 0.5 datum)");
  assert.equal(bases.get(101)!.length, 1);
  assert.ok(Math.abs(bases.get(101)![0] - 2 * FT * 0.3048) < 1e-9, "wall 101 stands on Floor 1.25");
  assert.deepEqual(bases.get(102), [0], "wall 102 stands on Floor 0.5");
  assert.equal(bases.get(103)!.length, 1);
  // 4 physical walls once each + the two distinct negative-ID seals untouched.
  assert.equal(after.features.length, 6);
  assert.equal(
    after.features.filter((f) => Number(f.properties?.nativeElementId) === -700000000).length,
    2,
  );
  // Input is not mutated; retained features are the same objects.
  assert.equal(before.features.length, 11);
  for (const f of after.features) assert.ok(before.features.includes(f));
});

test("single-level Main scope already draws each wall once and is unchanged", () => {
  const { data, native } = project();
  const main = bake(data, [2], native);
  const ids = main.features.map((f) => Number(f.properties?.nativeElementId));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(singleExtrusionWalls(data, [2], main), main, "identity for one level");
  // Level 2's own copies are exactly the AFTER set restricted to Main.
  const owned = singleExtrusionWalls(data, [1, 2, 3], bake(data, [1, 2, 3], native));
  const mainOwned = owned.features.filter((f) => f.properties?.levelId === 2);
  assert.deepEqual(
    mainOwned.map((f) => f.properties?.nativeElementId).sort(),
    [-700000000, 100, 103].sort(),
  );
});

test("rendered mesh shrinks to one extrusion per physical wall", () => {
  const { data, native } = project();
  const before = bake(data, [1, 2, 3], native);
  const after = singleExtrusionWalls(data, [1, 2, 3], before);
  const origin = data.alignment.originGeographic as [number, number];
  const a = precisionWallMesh(before, origin).vertices;
  const b = precisionWallMesh(after, origin).vertices;
  // Identical rectangles: vertices are proportional to extrusion count.
  assert.equal(a / b, 11 / 6);
});

test("owner rule: carrying level, own-level hint, unknown base and tolerance", () => {
  const c = [
    { levelId: 1, elevationFeet: -FT },
    { levelId: 2, elevationFeet: 0 },
    { levelId: 3, elevationFeet: FT },
  ];
  assert.equal(nativeWallOwnerLevel(c, 0.16), 2, "small base offset stays on its level");
  assert.equal(nativeWallOwnerLevel(c, 3.44), 3);
  assert.equal(nativeWallOwnerLevel(c, -10), 1, "below every level: lowest in scope");
  assert.equal(nativeWallOwnerLevel(c.slice(1), -FT), 2, "owner not in scope: lowest candidate");
  const { data, native } = project();
  const before = bake(data, [1, 2, 3], native);
  data.wallDisplay = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    elements: [{ nativeElementId: 100, levelId: 3, baseElevationFeet: 0, topElevationFeet: 13.78 }],
  };
  const hinted = singleExtrusionWalls(data, [1, 2, 3], before);
  assert.deepEqual(
    hinted.features.filter((f) => f.properties?.nativeElementId === 100).map((f) => f.properties?.levelId),
    [3],
    "wallDisplay source level wins, as in physicalWallCopies",
  );
  delete data.wallDisplay;
  data.nativeMaterialSections = undefined;
  assert.equal(
    singleExtrusionWalls(data, [1, 2, 3], before).features.length,
    before.features.length,
    "unknown source base: never guess, keep everything",
  );
});

test("optional 3D-rooms grounding rebases only native wall extrusions", () => {
  const { data, native } = project();
  const walls = singleExtrusionWalls(data, [1, 2, 3], bake(data, [1, 2, 3], native));
  const flat = groundedWalls(walls, 0.61);
  assert.ok(flat.features.every((f) => f.properties?.base === 0 && f.properties?.height === 0.61));
});
