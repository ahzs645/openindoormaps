import assert from "node:assert/strict";
import test from "node:test";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { fixture } from "../fixtures/native-area-project";
import { geographicPoint } from "../../app/indoor-project/routing";
import {
  overviewGround,
  prepareOverviewGround,
} from "../../app/indoor-project/overview-ground";
import type { PreparedFloor } from "../../app/indoor-project/prepared-floor";

const rectangle = (
  x: number,
  y: number,
  right: number,
  top: number,
): [number, number][] => [
  [x, y],
  [right, y],
  [right, top],
  [x, top],
];

test("overview backing retains slab holes and removes reviewed exclusions without changing the source", () => {
  const data = fixture();
  const levelId = data.records[0].levelId;
  data.indoorExclusions = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    areas: [
      {
        id: "reviewed-void",
        levelId,
        elevationFeet: 0,
        label: "Reviewed exclusion",
        nativeFloorIds: [1],
        reason: "off-limits",
        partsFeet: [[rectangle(0, 0, 4, 4)]],
        notes: "Reviewed non-traversable footprint.",
      },
    ],
  };
  const ground: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { nativeFloor: true, nativePhysical: true, levelId },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [rectangle(0, 0, 20, 20), rectangle(8, 8, 12, 12)].map((ring) =>
              [...ring, ring[0]].map((p) => geographicPoint(data, p)),
            ),
          ],
        },
      },
    ],
  };
  const before = JSON.stringify({ data, ground });
  const result = overviewGround(data, ground);
  const contains = (x: number, y: number) =>
    result.features.some((feature) =>
      pointInPolygon(geographicPoint(data, [x, y]), feature),
    );
  assert.equal(contains(6, 6), true, "native slab remains the grey backing");
  assert.equal(contains(10, 10), false, "original slab aperture stays open");
  assert.equal(contains(2, 2), false, "reviewed void is not painted as floor");
  assert.equal(
    contains(25, 10),
    false,
    "no footprint is invented beyond the slab",
  );
  assert.equal(JSON.stringify({ data, ground }), before);
});

test("supported wall gaps blend into grey while real holes, exclusions and remote fragments remain clear", () => {
  const data = fixture(),
    levelId = data.records[0].levelId;
  const hole = rectangle(8, 8, 12, 12);
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      {
        nativeElementId: 1,
        elevationFeet: 0,
        ringsFeet: [rectangle(0, 0, 5, 1000)],
      },
      {
        nativeElementId: 2,
        elevationFeet: 0,
        ringsFeet: [rectangle(6, 0, 1000, 1000), hole],
      },
    ],
  };
  data.indoorExclusions = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    areas: [
      {
        id: "reviewed-void",
        levelId,
        elevationFeet: 0,
        label: "Reviewed exclusion",
        nativeFloorIds: [1],
        reason: "off-limits",
        partsFeet: [[rectangle(0, 0, 4, 4)]],
        notes: "Reviewed void.",
      },
    ],
  };
  const collection = (
    parts: [number, number][][][],
  ): FeatureCollection<MultiPolygon> => ({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          levelId,
          nativeFloor: true,
          nativePhysical: true,
          nativeElementId: 7,
          approximate: false,
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: parts.map((part) =>
            part.map((ring) =>
              [...ring, ring[0]].map((p) => geographicPoint(data, p)),
            ),
          ),
        },
      },
    ],
  });
  const wall = rectangle(5, 5, 6, 8);
  const ground = collection([[rectangle(0, 0, 20, 20), hole, wall]]);
  const materials = collection([
    [wall],
    [rectangle(8, 8, 8.5, 12)],
    [rectangle(0, 0, 4, 4)],
    [rectangle(500, 500, 505, 505)],
  ]);
  const before = JSON.stringify({ data, ground, materials });
  const result = overviewGround(data, ground, materials);
  const contains = (x: number, y: number) =>
    result.features.some((f) =>
      pointInPolygon(geographicPoint(data, [x, y]), f),
    );
  assert.equal(
    contains(5.5, 6),
    true,
    "native material between two slab edges gets grey backing",
  );
  assert.equal(contains(10, 10), false, "unoccupied slab aperture stays open");
  assert.equal(
    contains(8.25, 10),
    true,
    "original physical material beside an aperture still blends into grey",
  );
  assert.equal(
    contains(2, 2),
    false,
    "wall projection cannot cover a reviewed exclusion",
  );
  assert.equal(
    contains(502, 502),
    false,
    "remote source walls cannot appear at overview zoom",
  );
  assert.equal(JSON.stringify({ data, ground, materials }), before);
  const prepared = {
    stairCutAreas: ground,
    presentation: { display: { exposedWalls: materials } },
  } as unknown as PreparedFloor;
  const wallPaint = prepareOverviewGround(data, prepared);
  assert(wallPaint.features.length > 0);
  assert(
    wallPaint.features.every((f) => f.properties?.overviewMaterial === true),
  );
  assert.equal(
    wallPaint.features.some((f) =>
      pointInPolygon(geographicPoint(data, [7, 6]), f),
    ),
    false,
    "floor and hallway tint remain owned by the native floor layers",
  );
});

test("unverified floor drawings and isolated wall footprints cannot become an overview backing", () => {
  const data = fixture();
  const ground: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      { nativeFloor: true },
      { nativePhysical: true, kind: "wall" },
    ].map((properties) => ({
      type: "Feature",
      properties,
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        ],
      },
    })),
  };
  assert.equal(overviewGround(data, ground).features.length, 0);
});

test("overview paints original glazing and frames opaque grey in either window mode, without filling a void or changing source material", () => {
  const data = fixture(),
    levelId = data.records[0].levelId;
  data.windowDisplay = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    mode: "simplified",
    routing: "original-barriers",
    wallCuts: [],
    unresolvedNativeElementIds: [],
    elements: [
      {
        nativeElementId: 91,
        hostId: 90,
        levelId,
        role: "glazing",
        materialEvidence: "native-material",
        transparency: 1,
        materialColorSrgb: [0, 200, 255],
        baseElevationFeet: 0,
        topElevationFeet: 10,
        assemblyTopElevationFeet: 10,
        footprintFeet: rectangle(4, 3, 4.4, 9),
      },
      {
        nativeElementId: 92,
        hostId: 90,
        levelId,
        role: "frame",
        materialEvidence: "native-material",
        materialColorSrgb: [30, 50, 70],
        baseElevationFeet: 0,
        topElevationFeet: 10,
        assemblyTopElevationFeet: 10,
        footprintFeet: rectangle(4.4, 3, 5, 9),
      },
      {
        nativeElementId: 93,
        hostId: 90,
        levelId,
        role: "glazing",
        materialEvidence: "native-material",
        baseElevationFeet: 0,
        topElevationFeet: 10,
        assemblyTopElevationFeet: 10,
        footprintFeet: rectangle(100, 100, 102, 102),
      },
    ],
  };
  const ground: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { nativeFloor: true, nativePhysical: true, levelId },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              rectangle(0, 0, 20, 20),
              rectangle(4, 3, 5, 9),
              rectangle(8, 8, 12, 12),
            ].map((r) => [...r, r[0]].map((p) => geographicPoint(data, p))),
          ],
        },
      },
    ],
  };
  const prepared = {
    stairCutAreas: ground,
    presentation: {
      display: { exposedWalls: { type: "FeatureCollection", features: [] } },
    },
  } as unknown as PreparedFloor;
  const before = JSON.stringify({ data, prepared });
  const result = prepareOverviewGround(data, prepared);
  const contains = (x: number, y: number) =>
    result.features.some((f) =>
      pointInPolygon(geographicPoint(data, [x, y]), f),
    );
  assert.equal(
    contains(4.2, 6),
    true,
    "transparent glazing receives solid overview paint",
  );
  assert.equal(contains(4.8, 6), true, "frames use the same overview paint");
  assert.equal(
    contains(10, 10),
    false,
    "the unrelated floor aperture remains clear",
  );
  assert.equal(
    contains(101, 101),
    false,
    "windows outside the checked floor scope stay hidden",
  );
  assert(
    result.features.every(
      (f) => f.properties?.overviewMaterial && f.properties.overviewWindow,
    ),
  );
  assert.equal(JSON.stringify({ data, prepared }), before);
  data.windowDisplay.mode = "native";
  assert.deepEqual(prepareOverviewGround(data, prepared), result);
  data.windowDisplay.sourceModelSha256 = "stale";
  assert.equal(prepareOverviewGround(data, prepared).features.length, 0);
});
