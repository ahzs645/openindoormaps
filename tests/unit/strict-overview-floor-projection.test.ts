import assert from "node:assert/strict";
import test from "node:test";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import { projectStrictOverviewFloor } from "../../scripts/indoor/strict-overview-floor-projection.ts";
import { geographicPoint } from "../../app/indoor-project/routing.ts";
import type { IndoorDataset } from "../../app/indoor-project/contract.ts";
import type { PreparedFloor } from "../../app/indoor-project/prepared-floor.ts";
const model = "1".repeat(64),
  square = (x: number, y: number, w: number) =>
    [
      [x, y],
      [x + w, y],
      [x + w, y + w],
      [x, y + w],
    ] as [number, number][];
function inputs() {
  const outer = square(0, 0, 12),
    hole = square(3, 3, 2),
    mask = square(7, 7, 2);
  const data = {
    source: { modelSha256: model },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      rotationRadians: 0.2,
      projectionLatitude: 53,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    indoorExclusions: {
      version: 1,
      sourceModelSha256: model,
      areas: [
        {
          id: "reviewed-shaft",
          levelId: 311,
          elevationFeet: 0,
          partsFeet: [[mask]],
        },
      ],
    },
  } as unknown as IndoorDataset;
  const parts = [[outer, hole]],
    exact = parts.map((p) =>
      p.map((r) => r.map((pt) => pt.map((n) => `${n}/1`))),
    );
  const prepared = {
    stairCutAreas: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            nativeFloor: true,
            nativePhysical: true,
            nativeFloorId: 99,
            levelId: 311,
            nativeDisplayExactParts: exact,
            nativeDisplayPartsFeet: parts,
          },
          geometry: {
            type: "MultiPolygon",
            coordinates: parts.map((p) =>
              p.map((r) => [...r, r[0]].map((p) => geographicPoint(data, p))),
            ),
          },
        },
      ],
    },
  } as unknown as Pick<PreparedFloor, "stairCutAreas">;
  return { data, prepared };
}
const covered = (
  floor: ReturnType<typeof projectStrictOverviewFloor>["floor"],
  data: IndoorDataset,
  p: number[],
) => floor.features.some((f) => pointInPolygon(geographicPoint(data, p), f));
test("exact prepared floor projection retains native hole and reviewed exclusion while restoring supported paint", () => {
  const { data, prepared } = inputs(),
    before = JSON.stringify(prepared),
    r = projectStrictOverviewFloor(data, prepared, model);
  assert.equal(r.receipt.inputPhysicalFloorCount, 1);
  assert.equal(r.receipt.outputPhysicalFloorCount, 1);
  assert.equal(covered(r.floor, data, [1, 1]), true);
  assert.equal(covered(r.floor, data, [4, 4]), false);
  assert.equal(covered(r.floor, data, [8, 8]), false);
  assert.equal(covered(r.floor, data, [13, 1]), false);
  assert.equal(r.receipt.features[0]!.sourceOutsideEmpty, true);
  assert.equal(r.receipt.features[0]!.exclusionIntersectionEmpty, true);
  assert.equal(JSON.stringify(prepared), before);
});
test("a numeric drawing cannot impersonate the retained exact prepared carrier", () => {
  const { data, prepared } = inputs();
  delete prepared.stairCutAreas.features[0]!.properties!
    .nativeDisplayExactParts;
  assert.throws(
    () => projectStrictOverviewFloor(data, prepared, model),
    /retained exact carrier/,
  );
});
test("source and exclusion bindings must match the expected normally verified model", () => {
  const { data, prepared } = inputs();
  assert.throws(
    () => projectStrictOverviewFloor(data, prepared, "2".repeat(64)),
    /binding mismatch/,
  );
  data.indoorExclusions!.sourceModelSha256 = "3".repeat(64);
  assert.throws(
    () => projectStrictOverviewFloor(data, prepared, model),
    /binding mismatch/,
  );
});
test("an exclusion on another level cannot cut the prepared floor", () => {
  const { data, prepared } = inputs();
  data.indoorExclusions!.areas[0]!.levelId = 400_176;
  const r = projectStrictOverviewFloor(data, prepared, model);
  assert.equal(covered(r.floor, data, [8, 8]), true);
  assert.equal(covered(r.floor, data, [4, 4]), false);
});
test("nonphysical room paint is not substituted for a strict physical floor", () => {
  const { data, prepared } = inputs();
  prepared.stairCutAreas.features[0]!.properties!.nativePhysical = false;
  assert.equal(
    projectStrictOverviewFloor(data, prepared, model).floor.features.length,
    0,
  );
});
test("a complete exclusion yields an empty floor rather than an uncut fallback", () => {
  const { data, prepared } = inputs();
  data.indoorExclusions!.areas[0]!.partsFeet = [[square(-1, -1, 20)]];
  const r = projectStrictOverviewFloor(data, prepared, model);
  assert.equal(r.floor.features.length, 0);
  assert.equal(r.receipt.features[0]!.retainedExactParts.length, 0);
});
