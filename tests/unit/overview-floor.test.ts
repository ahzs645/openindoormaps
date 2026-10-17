import assert from "node:assert/strict";
import test from "node:test";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { fixture } from "../fixtures/native-area-project";
import { geographicPoint } from "../../app/indoor-project/routing";
import { prepareOverviewFloor } from "../../app/indoor-project/overview-floor";
import type { PreparedFloor } from "../../app/indoor-project/prepared-floor";

const rectangle = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

test("overview floor backs a supported doorway threshold while retaining physical holes, exclusions and source geometry", () => {
  const data = fixture();
  data.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    geometrySha256: "c".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[rectangle(0, 0, 100, 100)]],
        sourceElementIds: [100],
        cutElevationsFeet: [4],
        evidenceSha256: "d".repeat(64),
      },
    ],
  };
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rectangle(0, 0, 100, 100)],
      },
    ],
  };
  data.indoorExclusions = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    areas: [
      {
        id: "reviewed-void",
        reason: "off-limits",
        levelId: 1,
        elevationFeet: 0,
        label: "Reviewed exclusion",
        notes: "Physical source slab remains preserved.",
        nativeFloorIds: [100],
        partsFeet: [[rectangle(1, 1, 3, 3)]],
      },
    ],
  };
  const feature = (
    rings: [number, number][][],
    properties: Record<string, unknown>,
  ): FeatureCollection<MultiPolygon>["features"][number] => ({
    type: "Feature",
    properties: { levelId: 1, ...properties },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        rings.map((ring) =>
          [...ring, ring[0]].map((point) => geographicPoint(data, point)),
        ),
      ],
    },
  });
  const stairCutAreas: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      feature(
        [
          rectangle(0, 0, 20, 20),
          rectangle(8, 8, 12, 12),
          rectangle(14, 14, 17, 17),
        ],
        {
          nativeFloor: true,
          nativePhysical: true,
          nativeFloorId: 100,
        },
      ),
      feature([rectangle(30, 0, 40, 10)], {
        nativeFloor: true,
        nativePhysical: false,
      }),
      feature([rectangle(50, 0, 60, 10)], {
        nativeRegionId: "checked-area-is-not-a-physical-floor",
      }),
    ],
  };
  // Area tint excludes a narrow threshold; the physical slab still spans it.
  const overviewGeometry: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      feature([rectangle(0, 0, 5, 7)], { nativeRegionId: "left-room" }),
      feature([rectangle(6, 0, 20, 7)], { nativeRegionId: "right-room" }),
    ],
  };
  const prepared = {
    stairCutAreas,
    presentation: { overviewGeometry },
  } as PreparedFloor;
  const before = JSON.stringify({ data, prepared });
  const result = prepareOverviewFloor(data, prepared);
  const contains = (x: number, y: number) =>
    result.features.some((drawing) =>
      pointInPolygon(geographicPoint(data, [x, y]), drawing),
    );
  assert.equal(
    overviewGeometry.features.some((drawing) =>
      pointInPolygon(geographicPoint(data, [5.5, 4]), drawing),
    ),
    false,
  );
  assert.equal(contains(5.5, 4), true, "supported threshold receives backing");
  assert.equal(contains(10, 10), false, "real source slab opening stays open");
  assert.equal(contains(15, 15), false, "prepared stair/ramp cut stays open");
  assert.equal(contains(2, 2), false, "reviewed exclusion stays clear");
  assert.equal(
    contains(25, 5),
    false,
    "raw exterior slab beyond the prepared indoor crop is not admitted",
  );
  assert.equal(contains(35, 5), false, "approximate floor is not accepted");
  assert.equal(
    contains(55, 5),
    false,
    "native area alone is not physical floor",
  );
  assert.equal(JSON.stringify({ data, prepared }), before);
  data.nativeIndoorEnvelopes!.sourceModelSha256 = "f".repeat(64);
  assert.equal(
    prepareOverviewFloor(data, prepared).features.length,
    0,
    "stale certified indoor context cannot supply backing",
  );
});
