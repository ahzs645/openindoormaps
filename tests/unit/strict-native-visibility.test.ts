import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { fixture } from "../fixtures/native-area-project";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import {
  nativeRenderProperties,
  nativeRenderExactParts,
} from "../../app/indoor-project/native-render-parts";
import { nativeFloorGround } from "../../app/indoor-project/native-floor-ground";
import { rampFloorApertures } from "../../app/indoor-project/ramp-floor-apertures";
import { exactVisibleTreadDrawing } from "../../app/indoor-project/stair-occlusion";
import { stairsAboveDisplayedGround } from "../../app/indoor-project/stair-ground-occlusion";
import { stairFloorApertures } from "../../app/indoor-project/stair-floor-apertures";
import { geographicPoint } from "../../app/indoor-project/routing";

type P = [number, number];
type Parts = P[][][];
const box = (x: number, y: number, w: number, h: number): P[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
function data() {
  const d = fixture();
  d.nativeLevels = [{ id: 1, name: "Floor 1", elevationFeet: 0 }];
  d.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    geometrySha256: "a".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[box(0, 0, 10, 10)]],
        sourceElementIds: [100],
        cutElevationsFeet: [4],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  return d;
}
function floor(d: IndoorDataset, parts: Parts, extra = {}) {
  const drawing = nativeRenderProperties(nativeRationalOverlay("union", parts));
  return {
    type: "Feature" as const,
    properties: { ...drawing, base: 0, nativePhysical: true, ...extra },
    geometry: {
      type: "MultiPolygon" as const,
      coordinates: drawing.nativeDisplayPartsFeet.map((p) =>
        p.map((r) => [...r, r[0]].map((q) => geographicPoint(d, q))),
      ),
    },
  };
}
function tread(d: IndoorDataset, parts: Parts) {
  const drawing = nativeRenderProperties(nativeRationalOverlay("union", parts));
  assert.equal(drawing.nativeDisplayPartsFeet.length, 1);
  return {
    type: "Feature" as const,
    properties: { ...drawing, topMetres: -1, descending: true },
    geometry: {
      type: "Polygon" as const,
      coordinates: drawing.nativeDisplayPartsFeet[0].map((r) =>
        [...r, r[0]].map((q) => geographicPoint(d, q)),
      ),
    },
  };
}
test("strict ground intersects original floor/enclosure and preserves every positive exact remainder", () => {
  const d = data();
  const hole = box(3.25, 3.5, 0.0000002, 2.125);
  const triangle: P[] = [
    [0, 0],
    [10, 3],
    [0, 10],
  ];
  d.nativeIndoorEnvelopes!.levels[0].partsFeet = [[triangle]];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [box(0, 0, 10, 10), hole],
      },
    ],
  };
  const before = JSON.stringify(d);
  const shown = nativeFloorGround(d, [1], "all");
  const expected = nativeRationalOverlay(
    "intersection",
    [[box(0, 0, 10, 10), hole]],
    [[triangle]],
  );
  const actual = nativeRenderExactParts(shown[0].properties)!;
  assert.deepEqual(nativeRationalOverlay("xor", expected, actual), []);
  assert.deepEqual(
    nativeRationalOverlay(
      "difference",
      shown[0].properties!.nativeDisplayPartsFeet,
      expected,
    ),
    [],
  );
  assert.equal(JSON.stringify(d), before);
});
test("strict ramp cut uses original feet and original triangles, retaining the floor hole and exact residual", () => {
  const d = data();
  const parts: Parts = [[box(0, 0, 10, 10), box(2, 2, 1, 1)]];
  const triangles = [
    [
      [0, 0, 0],
      [10, 3, 0],
      [0, 10, 1],
    ],
  ] as [number, number, number][][];
  d.rampDisplay = {
    sourceModelSha256: d.source.modelSha256,
    ramps: [
      {
        nativeElementId: 20,
        levelIds: [1],
        trianglesFeet: triangles,
        displayTrianglesFeet: [
          [
            [100, 100, 0],
            [110, 100, 0],
            [100, 110, 1],
          ],
        ],
      },
    ],
  } as unknown as IndoorDataset["rampDisplay"];
  const f = floor(d, parts);
  const before = JSON.stringify({ d, f });
  const result = rampFloorApertures(d, [1], {
    type: "FeatureCollection",
    features: [f],
  });
  const cut: Parts = [[[triangles[0].map((p) => [p[0], p[1]] as P)][0]]];
  const expected = nativeRationalOverlay("difference", parts, cut);
  assert.deepEqual(
    nativeRationalOverlay(
      "xor",
      expected,
      nativeRenderExactParts(result.features[0].properties)!,
    ),
    [],
  );
  assert.deepEqual(
    nativeRationalOverlay(
      "difference",
      result.features[0].properties!.nativeDisplayPartsFeet,
      expected,
    ),
    [],
  );
  assert.equal(JSON.stringify({ d, f }), before);
});
test("strict stair occlusion retains a positive slit narrower than the old native grid", () => {
  const ring = box(0, 0, 10, 2),
    hole = box(4, 0, 0.0000002, 2);
  const flight = {
    floorOccluders: [
      {
        nativeElementId: 10,
        elevationFeet: 10,
        ringsFeet: [box(-1, -1, 12, 4), hole],
      },
    ],
  };
  const input = { runElementId: 1, elevationFeet: 8, ringFeet: ring };
  const before = JSON.stringify({ flight, input });
  const result = exactVisibleTreadDrawing(flight, input);
  const expected = nativeRationalOverlay(
    "difference",
    [[ring]],
    [flight.floorOccluders[0].ringsFeet],
  );
  assert.deepEqual(
    nativeRationalOverlay("xor", expected, nativeRenderExactParts(result)!),
    [],
  );
  assert(result.nativeDisplayPartsFeet.length > 0);
  assert.equal(JSON.stringify({ flight, input }), before);
});
test("strict displayed-ground occlusion does not drop a tiny positive tread surface", () => {
  const d = data();
  const strip = box(4, 0, 0.0000002, 2),
    ring = box(0, 0, 10, 2);
  const floors: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [floor(d, [[box(-1, -1, 12, 4), strip]])],
  };
  const treads: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [tread(d, [[ring]])],
  };
  const result = stairsAboveDisplayedGround(treads, floors, true, d);
  assert(result.features.length > 0);
  const exact = result.features
    .map((f) => nativeRenderExactParts(f.properties)!)
    .reduce((parts, next) => nativeRationalOverlay("union", parts, next));
  assert.deepEqual(nativeRationalOverlay("xor", exact, [[strip]]), []);
  const overlapping = {
    ...floors,
    features: [...floors.features, floor(d, [[box(1, -1, 8, 4), strip]])],
  };
  const repeated = stairsAboveDisplayedGround(
    { ...treads, features: [treads.features[0], treads.features[0]] },
    overlapping,
    true,
    d,
  );
  assert.equal(repeated.features.length, result.features.length * 2);
  const repeatedExact = repeated.features
    .map((f) => nativeRenderExactParts(f.properties)!)
    .reduce((parts, next) => nativeRationalOverlay("union", parts, next));
  assert.deepEqual(nativeRationalOverlay("xor", repeatedExact, [[strip]]), []);
});
test("strict stair apertures cut only declared open drops in native coordinates", () => {
  const d = data(),
    outer = box(0, 0, 10, 10),
    hole = box(1, 1, 0.0000002, 2),
    cut = box(4, 4, 2, 2);
  const solid = floor(d, [[outer, hole]]),
    open = floor(d, [[outer, hole]], { openDrop: true });
  const treads: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [tread(d, [[cut]])],
  };
  const result = stairFloorApertures(
    { type: "FeatureCollection", features: [solid, open] },
    treads,
    true,
    d,
  );
  assert.equal(result.features[0], solid);
  assert.deepEqual(
    nativeRationalOverlay(
      "xor",
      nativeRenderExactParts(result.features[1].properties)!,
      nativeRationalOverlay("difference", [[outer, hole]], [[cut]]),
    ),
    [],
  );
});

test("successive strict ramp cuts retain previous exclusions instead of restoring original ground", () => {
  const d = data(),
    parts: Parts = [[box(0, 0, 10, 10)]];
  const a: [number, number, number][] = [
    [0, 0, 0],
    [10, 3, 0],
    [0, 10, 1],
  ];
  const b: [number, number, number][] = [
    [6, 0, 0],
    [10, 0, 0],
    [10, 10, 1],
  ];
  const ramps = (triangle: [number, number, number][]) =>
    ({
      sourceModelSha256: d.source.modelSha256,
      ramps: [
        { nativeElementId: 20, levelIds: [1], trianglesFeet: [triangle] },
      ],
    }) as unknown as IndoorDataset["rampDisplay"];
  d.rampDisplay = ramps(a);
  const first = rampFloorApertures(d, [1], {
    type: "FeatureCollection",
    features: [floor(d, parts)],
  });
  d.rampDisplay = ramps(b);
  const second = rampFloorApertures(d, [1], first);
  const expected = nativeRationalOverlay(
    "difference",
    parts,
    [[a.map((p) => [p[0], p[1]] as P)]],
    [[b.map((p) => [p[0], p[1]] as P)]],
  );
  const properties = second.features[0].properties!;
  assert.deepEqual(
    nativeRationalOverlay("xor", expected, nativeRenderExactParts(properties)!),
    [],
  );
  assert.deepEqual(
    nativeRationalOverlay(
      "xor",
      expected,
      nativeRenderExactParts({
        ...properties,
        nativeDisplayExactParts: undefined,
      })!,
    ),
    [],
  );
});

test("strict visibility never rejects native operands using their GIS paint bounds", () => {
  const d = data();
  const f = floor(d, [[box(0, 0, 10, 10)]], { openDrop: true });
  // Exact drawing is deliberately separate from paint-only GIS coordinates.
  f.geometry.coordinates = [
    [box(100, 100, 10, 10).map((p) => geographicPoint(d, p))],
  ];
  const t = tread(d, [[box(4, 4, 2, 2)]]);
  const stairs = stairFloorApertures(
    { type: "FeatureCollection", features: [f] },
    { type: "FeatureCollection", features: [t] },
    true,
    d,
  );
  assert.deepEqual(
    nativeRationalOverlay(
      "xor",
      nativeRenderExactParts(stairs.features[0].properties)!,
      nativeRationalOverlay(
        "difference",
        [[box(0, 0, 10, 10)]],
        [[box(4, 4, 2, 2)]],
      ),
    ),
    [],
  );
  d.rampDisplay = {
    sourceModelSha256: d.source.modelSha256,
    ramps: [
      {
        nativeElementId: 20,
        levelIds: [1],
        trianglesFeet: [
          [
            [4, 4, 0],
            [6, 4, 0],
            [4, 6, 1],
          ],
        ],
      },
    ],
  } as unknown as IndoorDataset["rampDisplay"];
  const ramps = rampFloorApertures(d, [1], {
    type: "FeatureCollection",
    features: [f],
  });
  assert.deepEqual(
    nativeRationalOverlay(
      "xor",
      nativeRenderExactParts(ramps.features[0].properties)!,
      nativeRationalOverlay(
        "difference",
        [[box(0, 0, 10, 10)]],
        [
          [
            [
              [4, 4],
              [6, 4],
              [4, 6],
            ],
          ],
        ],
      ),
    ),
    [],
  );
  const occluded = stairsAboveDisplayedGround(
    { type: "FeatureCollection", features: [t] },
    {
      type: "FeatureCollection",
      features: [{ ...f, properties: { ...f.properties, openDrop: false } }],
    },
    true,
    d,
  );
  assert.equal(occluded.features.length, 0);
});
