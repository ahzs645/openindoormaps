import assert from "node:assert/strict";
import test from "node:test";
import { strictNativeFloorPolygons } from "../../app/indoor-project/strict-native-floor-polygons";
import { strictNativeFloorPolygons as sourceFloorPolygons } from "../../../reviter/lib/reviter/strict-native-floor-polygons.ts";
import { nativeFloorPolygons as legacyFloorPolygons } from "../../../reviter/lib/reviter/routing-floor-support.ts";
type Point = [number, number];
const box = (x: number, y: number, width: number, height = width): Point[] => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height],
];
function replay(loops: Point[][]) {
  const before = JSON.stringify(loops);
  const current = strictNativeFloorPolygons({ loops });
  assert.deepEqual(
    sourceFloorPolygons({ loops }),
    current,
    "Source/runtime exact floor topology differs",
  );
  assert.deepEqual(
    legacyFloorPolygons(
      {
        loops: loops.map((r) =>
          r.map((p) => [...p, 0] as [number, number, number]),
        ),
      },
      true,
    ),
    current,
    "The strict compiler wrapper must use exact original-loop topology",
  );
  assert.equal(
    JSON.stringify(loops),
    before,
    "Original floor vertices changed",
  );
  assert.equal(
    current.flat().length,
    loops.length,
    "An original ring was discarded",
  );
  return current;
}
test("strict floor loop nesting retains a real hole below the legacy area hierarchy tolerance", () => {
  const loops = [box(0, 0, 3e-5), box(1e-5, 1e-5, 1e-5)];
  assert.equal(
    legacyFloorPolygons({
      loops: loops.map((r) =>
        r.map((p) => [...p, 0] as [number, number, number]),
      ),
    }).length,
    2,
  );
  assert.deepEqual(replay(loops), [loops]);
});
test("nearby original shell vertices outside the floor are not treated as touching", () => {
  const loops = [box(0, 0, 10), box(1, -1e-8, 1, 1)];
  assert.equal(
    legacyFloorPolygons({
      loops: loops.map((r) =>
        r.map((p) => [...p, 0] as [number, number, number]),
      ),
    }).length,
    1,
  );
  assert.deepEqual(
    replay(loops),
    loops.map((r) => [r]),
  );
});
test("native concave profiles do not adopt a crossing loop merely because its vertices are inside", () => {
  const outer: Point[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [7, 10],
    [7, 3],
    [3, 3],
    [3, 10],
    [0, 10],
  ];
  const bridge = box(1, 7, 8, 1);
  assert.deepEqual(replay([outer, bridge]), [[outer], [bridge]]);
});
test("exact native shell, hole and island depth is independent of loop order and winding", () => {
  const outer = box(1000000, 1000000, 1),
    hole = box(1000000.1, 1000000.1, 0.8).reverse(),
    island = box(1000000.3, 1000000.3, 0.1);
  assert.deepEqual(replay([island, hole, outer]), [[island], [outer, hole]]);
});
test("a floor edge cannot leave a concave shell through touching source vertices", () => {
  const outer: Point[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [8, 10],
    [8, 8],
    [6, 6],
    [4, 8],
    [2, 10],
    [0, 10],
  ];
  const crossing: Point[] = [
    [2, 8],
    [8, 8],
    [2, 2],
  ];
  assert.deepEqual(replay([outer, crossing]), [[outer], [crossing]]);
});
test("original positive small holes remain holes at large source coordinates", () => {
  const outer = box(1000000, 1000000, 1),
    hole = box(1000000.5, 1000000.5, 1e-6);
  assert.deepEqual(replay([outer, hole]), [[outer, hole]]);
});
test("exact boundary contacts and closed rings are retained without moving vertices", () => {
  const outer = box(0, 0, 10),
    hole = box(0, 2, 1);
  outer.push(outer[0]!);
  hole.push(hole[0]!);
  assert.deepEqual(replay([outer, hole]), [[outer, hole]]);
});
test("invalid source loops fail instead of disappearing from floor support", () => {
  assert.throws(
    () =>
      strictNativeFloorPolygons({
        loops: [
          [
            [0, 0],
            [1, 0],
            [2, 0],
          ],
        ],
      }),
    /zero exact area/,
  );
  assert.throws(
    () =>
      strictNativeFloorPolygons({
        loops: [
          [
            [0, 0],
            [1, 0],
          ],
        ],
      }),
    /incomplete/,
  );
  assert.throws(
    () =>
      strictNativeFloorPolygons({
        loops: [
          [
            [0, 0],
            [1, 0],
            [NaN, 1],
          ],
        ],
      }),
    /non-finite/,
  );
});

test("strict source floor callsites opt into original topology while legacy nesting stays unchanged", () => {
  const loops = [box(0, 0, 3e-5), box(1e-5, 1e-5, 1e-5)];
  const record = {
    loops: loops.map((r) =>
      r.map((p) => [...p, 0] as [number, number, number]),
    ),
  };
  const before = JSON.stringify(record);
  assert.equal(legacyFloorPolygons(record).length, 2);
  assert.deepEqual(
    legacyFloorPolygons(record, true),
    strictNativeFloorPolygons(record),
  );
  assert.equal(JSON.stringify(record), before);
});
