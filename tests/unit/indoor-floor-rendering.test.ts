import test from "node:test";
import studioColumn from "../fixtures/unbc-studio-shared-column.json";
import deskDisplay from "../fixtures/unbc-library-services-desk-display.json";
import wallClippingFailure from "../fixtures/unbc-wall-roof-clipping-failure.json";
import polygonClipping from "polygon-clipping";
import assert from "node:assert/strict";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import {
  projectDisplayGeometry,
  ROOM_BLOCK_HEIGHT_METRES,
  subtractRoomRoofsFromWalls,
} from "../../app/indoor-project/display-geometry";
import { geographicPoint } from "../../app/indoor-project/routing";
const rect = (
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
function record(
  key: string,
  levelId: number,
  elevationFeet: number,
  ringsFeet: [number, number][][],
  building = "A",
): IndoorRecord {
  return {
    key,
    number: key,
    name: key,
    levelId,
    elevationFeet,
    building,
    surfaceId: `floor:${levelId}:${building}`,
    elevationEvidence: "native",
    circulation: false,
    stair: false,
    access: "public",
    walkable: true,
    confidence: 1,
    ringsFeet,
    properties: {},
  };
}
function fixture(): IndoorDataset {
  return {
    format: "reviter-indoor",
    version: 1,
    generator: "reviter/indoor-pipeline-1",
    source: {
      modelFileName: "sample.rvt",
      modelSha256: "model",
      roomsSha256: "rooms",
    },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-123, 49],
      projectionLatitude: 49,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
      rmsMetres: 0,
      referenceCount: 2,
    },
    floors: [{ id: "upper", name: "Level2", levelIds: [2], elevationFeet: 12 }],
    nativeLevels: [
      { id: 1, name: "Level1", elevationFeet: 0 },
      { id: 2, name: "Level2", elevationFeet: 12 },
    ],
    records: [
      record("upper", 2, 12, [rect(0, 0, 20, 20), rect(4, 4, 8, 8)]),
      record("lower", 1, 0, [rect(0, 0, 20, 20)]),
    ],
    nodes: [],
    edges: [],
    walls: [],
    issues: [],
    report: {
      recordCount: 2,
      routableArrivals: 0,
      components: 0,
      largestComponentArrivals: 0,
      unmatchedDoors: 0,
      cellSizeFeet: 0.6,
      omittedSourceLabels: 0,
    },
  };
}
test("lower floor uses prepared roof footprint and measured vertical depth without changing source", () => {
  const d = fixture();
  d.records[1].ringsFeet = [rect(5, 5, 2, 2)];
  d.presentation = {
    version: 1,
    generator: "reviter/native-room-presentation-1",
    sourceModelSha256: "model",
    junctionToleranceFeet: 0.05,
    diagnostics: [],
    rooms: [
      {
        roomKey: "lower",
        levelId: 1,
        sourceGeometryKey: "geometry",
        interiorRingsFeet: [rect(4, 4, 8, 8)],
        blockPartsFeet: [[rect(4, 4, 8, 8)]],
        boundarySource: "native-wall-enclosure",
        boundaryElementIds: [1, 2, 3, 4],
        sourceCoverage: 1,
        cellCoverage: 1,
      },
    ],
  };
  const before = JSON.stringify(d);
  const display = projectDisplayGeometry(d, [2], "A");
  const feature = display.lowerRooms.features[0];
  assert.equal(feature.properties?.baseMetres, -12 * 0.3048);
  assert.equal(feature.properties?.heightMetres, ROOM_BLOCK_HEIGHT_METRES);
  assert.equal(feature.properties?.surfaceId, "floor:1:A");
  assert.equal(feature.properties?.boundarySource, "prepared-native-walls");
  assert.ok(
    booleanPointInPolygon(geographicPoint(d, [10, 10]), feature),
    "prepared wall-defined corner survives instead of inset source polygon",
  );
  assert.equal(
    booleanPointInPolygon(geographicPoint(d, [13, 10]), feature),
    false,
  );
  assert.equal(JSON.stringify(d), before);
});
test("aperture ignores higher remote mezzanine and rooms in another building", () => {
  const d = fixture();
  d.records.push(record("remote", 3, 8, [rect(100, 100, 10, 10)]));
  d.records.push(record("otherbuilding", 4, 9, [rect(4, 4, 8, 8)], "B"));
  const result = projectDisplayGeometry(d, [2], "A").lowerRooms.features;
  assert.deepEqual(
    result.map((f) => f.properties?.key),
    ["lower"],
  );
  assert.equal(result[0].properties?.baseMetres, -12 * 0.3048);
});
test("column recess cannot reveal a lower storey and reviewed open drop can", () => {
  const d = fixture();
  d.walls = [
    {
      kind: "column",
      levelId: 2,
      nativeElementId: 9,
      ringsFeet: [rect(4, 4, 8, 8)],
    },
  ];
  assert.equal(
    projectDisplayGeometry(d, [2], "A").lowerRooms.features.length,
    0,
  );
  d.walls = [];
  d.records[0].ringsFeet = [rect(4, 4, 8, 8)];
  d.records[0].walkable = false;
  assert.equal(
    projectDisplayGeometry(d, [2], "A").lowerRooms.features.length,
    0,
  );
  d.records[0].properties.notes = "Reviewed open to below";
  assert.equal(
    projectDisplayGeometry(d, [2], "A").lowerRooms.features.length,
    1,
  );
});
test("lower circulation is flat, lower exposed walls carry same real depth, and only nearest intersecting floor is used", () => {
  const d = fixture();
  d.records[1].circulation = true;
  d.records.push(record("basement", -1, -12, [rect(0, 0, 20, 20)]));
  d.walls = [
    {
      kind: "wall",
      levelId: 1,
      nativeElementId: 20,
      ringsFeet: [rect(7, 4, 0.5, 8)],
    },
  ];
  const result = projectDisplayGeometry(d, [2], "A");
  assert.equal(result.lowerRooms.features[0].properties?.kind, "floor");
  assert.equal(result.lowerRooms.features[0].properties?.heightMetres, 0);
  assert.equal(result.lowerRooms.features.length, 1);
  assert.equal(result.lowerWalls.features.length, 1);
  assert.equal(
    result.lowerWalls.features[0].properties?.baseMetres,
    -12 * 0.3048,
  );
});
test("unproven repeated surface elevation never establishes another floor", () => {
  const d = fixture();
  d.records[1].surfaceId = d.records[0].surfaceId;
  assert.equal(
    projectDisplayGeometry(d, [2], "A").lowerRooms.features.length,
    0,
  );
});

test("partial column recess remains solid in both lower footprints and perspective aperture mask", () => {
  const d = fixture();
  d.walls = [
    {
      kind: "column",
      levelId: 2,
      nativeElementId: 9,
      ringsFeet: [rect(4, 4, 3, 8)],
    },
  ];
  const result = projectDisplayGeometry(d, [2], "A");
  const blocked = geographicPoint(d, [5, 8]);
  const open = geographicPoint(d, [10, 8]);
  for (const feature of [
    result.lowerRooms.features[0],
    result.lowerOpenings.features[0],
  ]) {
    assert.equal(booleanPointInPolygon(blocked, feature), false);
    assert.equal(booleanPointInPolygon(open, feature), true);
  }
});

test("curated department colors, display names and landmark priority survive both floor contexts", () => {
  const d = fixture();
  d.visitor = {
    version: 1,
    buildings: { A: { name: "Library", shortName: "LIB" } },
    places: {
      lower: {
        displayName: "Learning Commons",
        category: "study",
        color: "#cde5ab",
        landmark: true,
      },
    },
  };
  d.records[1].arrivalNodeId = "arrival";
  d.nodes = [
    {
      id: "arrival",
      roomKey: "lower",
      levelId: 1,
      building: "A",
      surfaceId: "floor:1:A",
      pointFeet: [6, 6, 0],
      geographic: [-123, 49],
      kind: "arrival",
    },
  ];
  const display = projectDisplayGeometry(d, [1], "A");
  assert.equal(display.roomBlocks.features[0].properties?.color, "#cde5ab");
  assert.equal(
    display.labels.features[0].properties?.name,
    "lower\nLearning Commons",
  );
  assert.equal(display.labels.features[0].properties?.priority, 0);
  assert.equal(display.labels.features[0].properties?.category, "study");
  assert.equal(
    projectDisplayGeometry(d, [2], "A").lowerRooms.features[0].properties
      ?.color,
    "#cde5ab",
  );
});

test("explicit corridor landmark labels do not create room volumes or label generic halls", () => {
  const d = fixture();
  d.records[1].circulation = true;
  d.records[1].arrivalNodeId = "arrival";
  d.nodes = [
    {
      id: "arrival",
      roomKey: "lower",
      levelId: 1,
      building: "A",
      surfaceId: "floor:1:A",
      pointFeet: [6, 6, 0],
      geographic: [-123, 49],
      kind: "arrival",
    },
  ];
  assert.equal(projectDisplayGeometry(d, [1], "A").labels.features.length, 0);
  d.visitor = {
    version: 1,
    buildings: {},
    places: { lower: { displayName: "Library", landmark: true } },
  };
  const display = projectDisplayGeometry(d, [1], "A");
  assert.equal(display.labels.features.length, 1);
  assert.equal(display.labels.features[0].properties?.heightMetres, 0.03);
  assert.equal(display.roomBlocks.features.length, 0);
});
test("a concave mezzanine bounding box cannot hide the real floor beneath an opening", () => {
  const d = fixture();
  d.records.push(
    record("remote-L", 3, 6, [
      [
        [0, 0],
        [20, 0],
        [20, 1],
        [1, 1],
        [1, 20],
        [0, 20],
      ],
    ]),
  );
  d.nativeLevels.push({ id: 3, name: "Mezzanine", elevationFeet: 6 });
  const lower = projectDisplayGeometry(d, [2], "A").lowerRooms;
  assert.ok(lower.features.length > 0);
  assert.ok(lower.features.every((f) => f.properties?.levelId === 1));
});

test("hiding a pillar closes only its native solid corner material on an adjacent room roof", () => {
  const d = fixture();
  d.records = [
    record("room", 2, 12, [rect(0, 0, 10, 10), rect(0, 0, 2, 2)]),
    {
      ...record("corridor", 2, 12, [rect(10, 0, 10, 10)]),
      circulation: true,
    },
  ];
  d.walls = [
    {
      kind: "column",
      levelId: 2,
      nativeElementId: 9,
      ringsFeet: [rect(0, 0, 2, 2)],
    },
    {
      kind: "column",
      levelId: 2,
      nativeElementId: 10,
      ringsFeet: [rect(15, 3, 2, 2)],
    },
  ];
  d.presentation = {
    version: 1,
    generator: "reviter/native-room-presentation-1",
    sourceModelSha256: "model",
    junctionToleranceFeet: 0.05,
    diagnostics: [],
    rooms: [
      {
        roomKey: "room",
        levelId: 2,
        sourceGeometryKey: "geometry",
        interiorRingsFeet: d.records[0].ringsFeet,
        blockPartsFeet: [d.records[0].ringsFeet],
        boundarySource: "native-wall-enclosure",
        boundaryElementIds: [9],
        sourceCoverage: 1,
        cellCoverage: 1,
      },
    ],
  };
  const before = JSON.stringify(d);
  const hidden = projectDisplayGeometry(d, [2], "A", "", false);
  assert.ok(
    booleanPointInPolygon(
      geographicPoint(d, [1, 1]),
      hidden.roomBlocks.features[0],
    ),
  );
  assert.equal(
    booleanPointInPolygon(
      geographicPoint(d, [16, 4]),
      hidden.roomBlocks.features[0],
    ),
    false,
  );
  assert.equal(hidden.roomBlocks.features.length, 1, "corridor remains flat");
  const shown = projectDisplayGeometry(d, [2], "A", "", true);
  assert.equal(
    booleanPointInPolygon(
      geographicPoint(d, [1, 1]),
      shown.roomBlocks.features[0],
    ),
    false,
  );
  assert.equal(JSON.stringify(d), before);
});

test("rotated shared column follows each roof perimeter independently of room keys and record order", () => {
  const angle = (37 * Math.PI) / 180;
  const rotate = ([x, y]: [number, number]): [number, number] => [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  ];
  const left: [number, number][] = [
    [-5, -3],
    [0, -3],
    [0, -1],
    [-1, -1],
    [-1, 1],
    [0, 1],
    [0, 3],
    [-5, 3],
  ];
  const right = left.map(([x, y]) => [-x, y] as [number, number]);
  for (const reversed of [false, true]) {
    const d = fixture();
    const leftKey = reversed ? "z-left" : "a-left",
      rightKey = reversed ? "a-right" : "z-right";
    const leftRoom = record(leftKey, 2, 12, [left.map(rotate)]),
      rightRoom = record(rightKey, 2, 12, [right.map(rotate)]);
    d.records = reversed ? [rightRoom, leftRoom] : [leftRoom, rightRoom];
    d.walls = [
      {
        kind: "column",
        levelId: 2,
        nativeElementId: 9,
        ringsFeet: [rect(-1, -1, 2, 2).map(rotate)],
      },
    ];
    d.presentation = {
      version: 1,
      generator: "reviter/native-room-presentation-1",
      sourceModelSha256: "model",
      junctionToleranceFeet: 0.05,
      diagnostics: [],
      rooms: d.records.map((r) => ({
        roomKey: r.key,
        levelId: 2,
        sourceGeometryKey: "geometry",
        interiorRingsFeet: r.ringsFeet,
        blockPartsFeet: [r.ringsFeet],
        boundarySource: "native-wall-enclosure",
        boundaryElementIds: [9],
        sourceCoverage: 1,
        cellCoverage: 1,
      })),
    };
    const before = JSON.stringify(d),
      output = projectDisplayGeometry(d, [2], "A");
    const leftRoof = output.roomBlocks.features.find(
      (f) => f.properties?.key === leftKey,
    )!;
    const rightRoof = output.roomBlocks.features.find(
      (f) => f.properties?.key === rightKey,
    )!;
    for (const [native, expectedLeft] of [
      [[-0.5, 0], true],
      [[0.5, 0], false],
    ] as [[number, number], boolean][]) {
      const point = geographicPoint(d, rotate(native));
      assert.equal(booleanPointInPolygon(point, leftRoof), expectedLeft);
      assert.equal(booleanPointInPolygon(point, rightRoof), !expectedLeft);
    }
    assert.equal(
      booleanPointInPolygon(geographicPoint(d, rotate([0, 4])), leftRoof),
      false,
      "no free floor outside native column is added",
    );
    assert.equal(JSON.stringify(d), before);
  }
});

test("shared native Studio column closes the actual 05-122 corner without assigning its whole footprint to the preceding room", () => {
  const d = fixture();
  d.records = studioColumn.records as unknown as IndoorRecord[];
  d.walls = [studioColumn.column] as IndoorDataset["walls"];
  d.presentation = {
    version: 1,
    generator: "reviter/native-room-presentation-1",
    sourceModelSha256: "model",
    junctionToleranceFeet: 0.05,
    diagnostics: [],
    rooms: studioColumn.rooms as NonNullable<
      IndoorDataset["presentation"]
    >["rooms"],
  };
  const before = JSON.stringify(d);
  const hidden = projectDisplayGeometry(d, [311], "05");
  const studio = hidden.roomBlocks.features.find(
    (f) => f.properties?.key === "rm-311-433cf6296f39",
  )!;
  for (const point of [
    [156.2, 326],
    [156.3, 326.5],
    [156.5, 327],
  ])
    assert.ok(
      booleanPointInPolygon(geographicPoint(d, point), studio),
      "actual native column notch follows Studio roof continuation",
    );
  assert.equal(
    booleanPointInPolygon(geographicPoint(d, [155, 327]), studio),
    false,
    "the neighbouring Studio owns its own side",
  );
  assert.ok(
    hidden.exposedWalls.features.some((feature) =>
      booleanPointInPolygon(geographicPoint(d, [155.2, 326]), feature),
    ),
    "ambiguous shared wall material remains solid and neutral",
  );
  const shown = projectDisplayGeometry(d, [311], "05", "", true);
  const shownStudio = shown.roomBlocks.features.find(
    (f) => f.properties?.key === "rm-311-433cf6296f39",
  )!;
  assert.equal(
    booleanPointInPolygon(geographicPoint(d, [156.3, 326.5]), shownStudio),
    false,
  );
  assert.equal(JSON.stringify(d), before);
});

test("hidden column continuation preserves a genuine larger floor opening touching the column", () => {
  const d = fixture();
  d.walls = [
    {
      kind: "column",
      levelId: 2,
      nativeElementId: 9,
      ringsFeet: [rect(4, 4, 3, 8)],
    },
  ];
  const result = projectDisplayGeometry(d, [2], "A");
  assert.equal(
    booleanPointInPolygon(
      geographicPoint(d, [5, 8]),
      result.roomBlocks.features[0],
    ),
    false,
  );
  assert.equal(
    result.exposedWalls.features.some(
      (f) => f.properties?.hiddenColumnContinuation,
    ),
    false,
  );
});

test("Library Services Desk fallback retains true walls and omits detached wall-top strips", () => {
  const d = deskDisplay as unknown as IndoorDataset;
  const before = JSON.stringify(d);
  const selected = "rm-311-ac6ce9426f1c";
  const shown = projectDisplayGeometry(d, [311], "05", selected, false, false);
  const roof = shown.roomBlocks.features.find((f) => f.id === selected)!;
  assert.equal(
    roof.properties?.boundarySource,
    "source-footprint",
    "display cleanup cannot imply a verified enclosure",
  );
  assert.equal(
    roof.geometry.coordinates.length,
    1,
    "only the principal room component is shown",
  );
  const a = d.alignment;
  const feet = ([lon, lat]: number[]): [number, number] => {
    const east =
      ((((lon - a.originGeographic[0]) * Math.PI) / 180) *
        6_378_137 *
        Math.cos((a.projectionLatitude * Math.PI) / 180)) /
      a.horizontalMetresPerFoot;
    const north =
      ((((lat - a.originGeographic[1]) * Math.PI) / 180) * 6_378_137) /
      a.horizontalMetresPerFoot;
    return [
      a.originFeet[0] +
        east * Math.cos(a.rotationRadians) +
        north * Math.sin(a.rotationRadians),
      a.originFeet[1] -
        east * Math.sin(a.rotationRadians) +
        north * Math.cos(a.rotationRadians),
    ];
  };
  const parts = roof.geometry.coordinates.map((part) =>
    part.map((ring) => ring.map(feet)),
  );
  const area = (parts: number[][][][]) =>
    parts.reduce(
      (sum, part) =>
        sum +
        part.reduce((sum, ring, i) => {
          const [ox, oy] = ring[0];
          const signed = ring.reduce((sum, p, j) => {
            const q = ring[(j + 1) % ring.length];
            return sum + (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy);
          }, 0);
          return sum + ((i ? -1 : 1) * Math.abs(signed)) / 2;
        }, 0),
      0,
    );
  const native = d.walls.flatMap((wall) =>
    polygonClipping.intersection(parts, wall.ringsFeet),
  );
  assert.ok(
    area(native) < 0.000_01,
    "uncertain annotation cannot paint over native walls",
  );
  const source = d.records.find((r) => r.key === selected)!;
  assert.ok(
    area(polygonClipping.difference(parts, source.ringsFeet)) < 0.000_01,
    "no wall material or invented floor area is added to the unresolved room",
  );
  assert.ok(
    area(parts) > 180,
    "the main desk roof is retained, not silently erased",
  );
  assert.equal(
    JSON.stringify(d),
    before,
    "source geometry and graph are unchanged",
  );
});

test("remote near-duplicate roof vertices cannot restore coplanar walls under another room", () => {
  type Rings = [number, number][][];
  const failed = wallClippingFailure as unknown as {
    parts: Rings[];
    blocks: Rings[];
  };
  const wall: Rings = [rect(0, 0, 10, 2)];
  const roof: Rings = [rect(0, 0, 4, 2)];
  // These four small native excerpts reproduce the whole-floor SweepLine failure.
  assert.throws(() => polygonClipping.difference(failed.parts, failed.blocks));
  const result = subtractRoomRoofsFromWalls(
    [wall, ...failed.parts],
    [roof, ...failed.blocks],
  );
  assert.deepEqual(
    polygonClipping.intersection(result, roof),
    [],
    "a malformed remote roof cannot restore this known overlapping wall",
  );
  assert.equal(
    polygonClipping.intersection(result, [rect(5, 0, 5, 2)]).length,
    1,
    "unclaimed native wall material remains visible",
  );
  assert.deepEqual(
    subtractRoomRoofsFromWalls([wall], failed.blocks),
    [wall],
    "remote malformed polygons do not affect an unrelated wall component",
  );
});
