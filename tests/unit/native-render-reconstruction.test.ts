import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { rampFloorApertures } from "../../app/indoor-project/ramp-floor-apertures";
import {
  nativeRenderExactParts,
  nativeRenderPartsMayIntersect,
  nativeRenderProperties,
} from "../../app/indoor-project/native-render-parts";
import {
  nativeRationalOverlay,
  type NativeRationalOverlayInput,
} from "../../app/indoor-project/native-rational-overlay";

type Point = [number, number];
const box = (x: number, y: number, width: number, height: number): Point[] => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height],
];
const data = () =>
  ({
    source: { modelSha256: "synthetic" },
    nativeIndoorEnvelopes: {},
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    floors: [{ id: "1", levelIds: [1], elevationFeet: 0 }],
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    rampDisplay: {
      ramps: [
        {
          levelIds: [1],
          trianglesFeet: [
            [
              [2, 2, 0],
              [6, 2, 1],
              [2, 6, 1],
            ],
          ],
        },
      ],
    },
  }) as unknown as IndoorDataset;
const floor = (parts: Point[][][]): FeatureCollection<MultiPolygon> => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { nativeDisplayPartsFeet: parts, base: 0 },
      geometry: { type: "MultiPolygon", coordinates: parts },
    },
  ],
});

test("equivalent presentation clones share immutable exact reconstruction; coordinate and residual edits invalidate it", () => {
  const properties = {
    nativeDisplayPartsFeet: [[box(0, 0, 10, 10), box(3, 3, 1, 1)]],
  };
  const before = JSON.stringify(properties);
  const first = nativeRenderExactParts(properties)!;
  const other = nativeRenderExactParts({
    ...structuredClone(properties),
    selected: true,
    base: 5,
  });
  assert.strictEqual(other, first);
  assert.throws(() => first[0]![0]![0]!.splice(0, 1), TypeError);
  assert.equal(JSON.stringify(properties), before);
  properties.nativeDisplayPartsFeet[0]![0]![1]![0] += 1;
  const changed = nativeRenderExactParts(properties)!;
  assert.notStrictEqual(changed, first);
  assert(nativeRationalOverlay("xor", first, changed).length);
  const residual = {
    ...properties,
    nativeDisplayResidualParts: [
      [box(20, 20, 1, 1).map(([x, y]) => [`${x}/1`, `${y}/1`])],
    ],
  };
  const withResidual = nativeRenderExactParts(residual)!;
  assert.notStrictEqual(withResidual, changed);
  assert(nativeRationalOverlay("difference", withResidual, changed).length);
});

test("strictly remote ramp cuts preserve original drawing without reconstructing its paint cells", () => {
  const source = floor([[box(20, 20, 5, 5)]]);
  const before = JSON.stringify(source);
  const output = rampFloorApertures(data(), [1], source);
  assert.strictEqual(output.features[0], source.features[0]);
  assert.equal(JSON.stringify(source), before);
  assert.equal(
    nativeRenderPartsMayIntersect(undefined, [[[box(2, 2, 1, 1)[0]!]]]),
    true,
  );
});

test("ramp visibility preserves original holes/disconnected drawing and matches the full exact difference", () => {
  const source = floor([
    [box(0, 0, 10, 10), box(3, 3, 1, 1)],
    [box(20, 20, 2, 2)],
  ]);
  const before = JSON.stringify(source);
  const original = nativeRenderExactParts(source.features[0]!.properties)!;
  const output = rampFloorApertures(data(), [1], source);
  const actual = nativeRenderExactParts(output.features[0]!.properties)!;
  const expected = nativeRationalOverlay("difference", original, [
    [
      [
        [2, 2],
        [6, 2],
        [2, 6],
      ],
    ],
  ]);
  assert.deepEqual(nativeRationalOverlay("xor", actual, expected), []);
  assert.equal(JSON.stringify(source), before);
});

test("ramp broad phase retains exact carriers and positive sub-IEEE residuals beyond numeric paint", () => {
  const denominator = 1n << 100n;
  const x = `${10n * denominator + 1n}/${denominator}`;
  const residual = [
    [
      [
        [x, "1/4"],
        ["11/1", "1/4"],
        ["11/1", "3/4"],
        [x, "3/4"],
      ],
    ],
  ];
  const cuts: NativeRationalOverlayInput = [[box(10, 0, 1, 1)]];
  const properties = {
    nativeDisplayPartsFeet: [[box(0, 0, 1, 1)]],
    nativeDisplayResidualParts: residual,
  };
  assert(nativeRenderPartsMayIntersect(properties, cuts));
  const exact = nativeRenderProperties(nativeRationalOverlay("union", cuts));
  assert(
    nativeRenderPartsMayIntersect(
      { ...exact, nativeDisplayPartsFeet: [[box(0, 0, 1, 1)]] },
      cuts,
    ),
  );
  assert(
    nativeRenderPartsMayIntersect(
      { nativeDisplayPartsFeet: [[box(11, 0, 1, 1)]] },
      cuts,
    ),
    "Touching bounds retain the original exact operation",
  );
});
