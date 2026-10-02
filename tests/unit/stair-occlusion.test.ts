import test from "node:test";
import assert from "node:assert/strict";
import polygonClipping from "polygon-clipping";
import { visibleTreadPolygons } from "../../app/indoor-project/stair-occlusion";
import type { IndoorDataset } from "../../app/indoor-project/contract";
type Flight = NonNullable<IndoorDataset["stairDisplay"]>["flights"][number];
const ring = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
test("descending treads stop at solid slabs, retain real openings, and never cut or modify native evidence", () => {
  const tread = {
    runElementId: 2,
    elevationFeet: 8,
    ringFeet: ring(0, 0, 10, 2),
  };
  const flight = {
    floorElevationFeet: 10,
    treads: [tread],
    floorOccluders: [
      {
        nativeElementId: 3,
        elevationFeet: 10,
        ringsFeet: [ring(-1, -1, 12, 4), ring(4, -0.5, 2, 3)],
      },
    ],
  } as Flight;
  const before = structuredClone(flight);
  const shown = visibleTreadPolygons(flight, tread);
  assert.deepEqual(
    polygonClipping.intersection(shown, flight.floorOccluders![0].ringsFeet),
    [],
  );
  assert.deepEqual(polygonClipping.xor(shown, [ring(4, 0, 2, 2)]), []);
  assert.deepEqual(flight, before);
  flight.floorOccluders![0].ringsFeet = [ring(-1, -1, 12, 4)];
  assert.deepEqual(visibleTreadPolygons(flight, tread), []);
  assert.deepEqual(
    visibleTreadPolygons(flight, { ...tread, elevationFeet: 10 }),
    [[tread.ringFeet]],
  );
  assert.deepEqual(
    visibleTreadPolygons({ ...flight, floorOccluders: undefined }, tread),
    [[tread.ringFeet]],
  );
});
