import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/native-area-project";
import type { NativeExploreResult } from "../../app/indoor-project/native-explore";
import {
  createPreparedFloorCache,
  floorWorkerPreparationOptions,
} from "../../app/indoor-project/prepared-floor-cache";
import { createFloorPresentationCache } from "../../app/indoor-project/floor-presentation";
import type { FloorPreparationOptions } from "../../app/indoor-project/prepared-floor";
import { prepareFloor } from "../../app/indoor-project/prepared-floor";
const options: FloorPreparationOptions = {
  showPillars: false,
  showPassThroughPlaces: false,
  showVestibuleDoors: false,
  showStructures: false,
  review: false,
  simplifyGeometry: true,
};
const faces = () =>
  ({
    regions: [],
    outlines: { type: "FeatureCollection", features: [] },
    overview: { type: "FeatureCollection", features: [] },
  }) as unknown as NativeExploreResult;
test("complete preparation cache uses dataset, scope, options and exact face identity", () => {
  let count = 0;
  const cached = createPreparedFloorCache(() => ({ generation: ++count }));
  const d = fixture(),
    f = faces(),
    o = { ...options, nativeFaces: f };
  const first = cached(d, [2, 1], "all", o);
  assert.equal(cached(d, [1, 2, 1], "all", o), first);
  assert.notEqual(
    cached(d, [1, 2], "all", { ...o, nativeFaces: faces() }),
    first,
  );
  assert.notEqual(cached(d, [1, 2], "08", o), first);
  assert.notEqual(
    cached(d, [1, 2], "all", { ...o, showDoorwayRecesses: false }),
    first,
  );
  assert.notEqual(cached({ ...d }, [1, 2], "all", o), first);
});
test("complete preparation cache evicts least recently used and never retains failed output", () => {
  let count = 0,
    fail = false;
  const cached = createPreparedFloorCache(() => {
    count++;
    if (fail) throw Error("invalid native faces");
    return { generation: count };
  }, 2);
  const d = fixture();
  const first = cached(d, [1], "all", options);
  const second = cached(d, [2], "all", options);
  assert.equal(cached(d, [1], "all", options), first);
  cached(d, [3], "all", options);
  assert.notEqual(cached(d, [2], "all", options), second);
  fail = true;
  assert.throws(() => cached(d, [4], "all", options), /invalid native faces/);
  assert.throws(() => cached(d, [4], "all", options), /invalid native faces/);
  fail = false;
  const fourth = cached(d, [4], "all", options);
  assert.equal(cached(d, [4], "all", options), fourth);
});

test("worker complete preparation byte budget preserves identity and scope but does not retain oversized floors", () => {
  let builds = 0;
  const cached = createPreparedFloorCache(
    (_d, _levels) => ({ generation: ++builds }),
    12,
    150,
    () => 100,
  );
  const d = fixture(),
    a = cached(d, [1], "all", options);
  assert.equal(cached(d, [1], "all", options), a);
  cached(d, [2], "all", options);
  assert.notEqual(cached(d, [1], "all", options), a);
  const oversized = createPreparedFloorCache(
    () => ({ generation: ++builds }),
    12,
    99,
    () => 100,
  );
  assert.notEqual(
    oversized(d, [1], "all", options),
    oversized(d, [1], "all", options),
  );
});
test("inner floor presentation cache cannot substitute a different supplied native face carrier", () => {
  const d = fixture();
  d.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    geometrySha256: "a".repeat(64),
    levels: [],
  };
  const cache = createFloorPresentationCache(),
    a = faces(),
    b = faces();
  const ring = (width: number): [number, number][] => [
    [0, 0],
    [width, 0],
    [width, 10],
    [0, 10],
  ];
  a.regions = [
    {
      id: "native-a",
      levelId: 1,
      roomKeys: ["0"],
      ringsFeet: [ring(10)],
      visitorPartsFeet: [[ring(10)]],
      displayPartsFeet: [[ring(10)]],
      nativeFloorIds: [100],
      nativeDoorIds: [],
      areaSquareFeet: 100,
      exposedFloorEdgeFeet: 0,
    },
  ];
  b.regions = [
    {
      id: "native-b",
      levelId: 1,
      roomKeys: ["0"],
      ringsFeet: [ring(8)],
      visitorPartsFeet: [[ring(8)]],
      displayPartsFeet: [[ring(8)]],
      nativeFloorIds: [100],
      nativeDoorIds: [],
      areaSquareFeet: 80,
      exposedFloorEdgeFeet: 0,
    },
  ];
  const first = cache(d, [1], "all", { ...options, nativeFaces: a });
  assert.equal(cache(d, [1], "all", { ...options, nativeFaces: a }), first);
  const replacement = cache(d, [1], "all", { ...options, nativeFaces: b });
  assert.notEqual(replacement, first);
  assert.notDeepEqual(
    replacement.display.areas.features.map((f) => f.geometry),
    first.display.areas.features.map((f) => f.geometry),
  );
  assert.notEqual(
    cache({ ...d }, [1], "all", { ...options, nativeFaces: a }),
    first,
  );
});

test("strict ordinary/native-height preparations are equal and share normalized cache; partial source stays separate", () => {
  const d = fixture(),
    native = faces();
  const outer: [number, number][] = [
    [0, 0],
    [12, 0],
    [12, 10],
    [0, 10],
  ];
  const hole: [number, number][] = [
    [4, 4],
    [4, 6],
    [6, 6],
    [6, 4],
  ];
  d.nativeLevels[0].elevationFeet = 9;
  d.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    geometrySha256: "a".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 9,
        partsFeet: [[outer]],
        sourceElementIds: [100],
        cutElevationsFeet: [13],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  d.nativeMaterialSections = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    geometrySha256: "c".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 9,
        cutElevationFeet: 13,
        evidenceSha256: "d".repeat(64),
        sourceElementIds: [100],
        sections: [],
      },
    ],
  };
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      { nativeElementId: 100, elevationFeet: 9, ringsFeet: [outer, hole] },
    ],
  };
  native.regions = [
    {
      id: "measured",
      levelId: 1,
      roomKeys: ["0"],
      ringsFeet: [outer, hole],
      visitorPartsFeet: [[outer, hole]],
      displayPartsFeet: [[outer, hole]],
      nativeFloorIds: [100],
      nativeDoorIds: [],
      areaSquareFeet: 116,
      exposedFloorEdgeFeet: 0,
    },
  ];
  const a = { ...options, nativeFaces: native, relativeHeights: false },
    b = { ...a, relativeHeights: true };
  const ordinary = prepareFloor(d, [1], "all", a),
    physical = prepareFloor(d, [1], "all", b);
  assert.deepEqual(ordinary, physical);
  assert(
    ordinary.physicalGround.features.some((f) =>
      f.geometry.coordinates.some((p) => p.length === 2),
    ),
    "source floor opening remains excluded",
  );
  let builds = 0;
  const cached = createPreparedFloorCache(
    (...args: Parameters<typeof prepareFloor>) => {
      builds++;
      return prepareFloor(...args);
    },
  );
  const first = cached(d, [1], "all", floorWorkerPreparationOptions(d, a));
  assert.equal(
    cached(d, [1], "all", floorWorkerPreparationOptions(d, b)),
    first,
  );
  assert.equal(builds, 1);
  const partial = { ...d, nativeMaterialSections: undefined };
  assert.equal(floorWorkerPreparationOptions(partial, a), a);
  assert.equal(floorWorkerPreparationOptions(fixture(), a), a);
});
