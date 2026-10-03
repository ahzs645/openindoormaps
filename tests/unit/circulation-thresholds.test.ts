import test from "node:test";
import assert from "node:assert/strict";
import polygonClipping from "polygon-clipping";
import { circulationThresholds } from "../../app/indoor-project/circulation-thresholds";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
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
const area = (parts: [number, number][][][]) => {
  let total = 0;
  for (const rings of parts)
    for (const [i, ring] of rings.entries()) {
      let signed = 0;
      for (const [j, p] of ring.entries()) {
        const q = ring[(j + 1) % ring.length];
        signed += p[0] * q[1] - q[0] * p[1];
      }
      total += ((i ? -1 : 1) * Math.abs(signed)) / 2;
    }
  return total;
};
function fixture() {
  const rooms = ["a", "b"].map((key, i) => ({
    key,
    building: "06",
    levelId: 1,
    elevationFeet: 0,
    circulation: true,
    stair: i === 1,
    access: "unknown",
    walkable: true,
    ringsFeet: [rect(i ? 5.4 : 0, 0, i ? 4.6 : 5, 10)],
    properties: {},
  })) as IndoorRecord[];
  return {
    source: { modelSha256: "model" },
    records: rooms,
    walls: [],
    nodes: [
      { id: "a", levelId: 1, pointFeet: [4.8, 5, 0] },
      { id: "b", levelId: 1, pointFeet: [5.6, 5, 0] },
    ],
    edges: [
      {
        id: "opening",
        kind: "opening",
        enabled: true,
        from: "a",
        to: "b",
        roomKeys: ["a", "b"],
        pointsFeet: [
          [4.8, 5, 0],
          [5.6, 5, 0],
        ],
        openingSpan: {
          version: 1,
          sourceModelSha256: "model",
          levelId: 1,
          pointsFeet: [
            [5.2, 4.5, 0],
            [5.2, 5.5, 0],
          ],
          nativeFloorElementIds: [10],
          walkingStripWidthFeet: 2,
          apertureFeet: rect(4.8, 4, 0.8, 2),
        },
      },
    ],
    walkingSupport: {
      version: 1,
      sourceModelSha256: "model",
      floors: [
        {
          nativeElementId: 10,
          elevationFeet: 0,
          ringsFeet: [rect(0, 0, 10, 10)],
        },
      ],
    },
  } as unknown as IndoorDataset;
}
test("a proved flat aperture paints the source contour gap without modifying the graph or creating a room block", () => {
  const d = fixture(),
    before = JSON.stringify(d),
    result = circulationThresholds(d, d.records);
  assert.equal(result.length, 1);
  assert.equal(result[0].owner.key, "a");
  assert.ok(
    area(polygonClipping.intersection(result[0].parts, [rect(5, 4, 0.4, 2)])) >
      0.79,
  );
  assert.equal(JSON.stringify(d), before);
});
test("disabled, stale, unsupported or foreign-floor apertures cannot paint a connection", () => {
  for (const change of [
    (d: IndoorDataset) => {
      d.edges[0].enabled = false;
    },
    (d: IndoorDataset) => {
      d.edges[0].openingSpan!.sourceModelSha256 = "foreign";
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.floors[0].elevationFeet = 3;
    },
    (d: IndoorDataset) => {
      d.records[1].circulation = false;
    },
  ]) {
    const d = fixture();
    change(d);
    assert.equal(circulationThresholds(d, d.records).length, 0);
  }
});
test("actual walls, columns, third rooms and floor holes remain absent from the threshold paint", () => {
  for (const mask of ["wall", "column", "room", "hole"]) {
    const d = fixture(),
      strip = rect(5.1, 4, 0.2, 2);
    if (mask === "wall" || mask === "column")
      d.walls.push({
        levelId: 1,
        kind: mask,
        nativeElementId: 20,
        ringsFeet: [strip],
      });
    else if (mask === "room")
      d.records.push({
        ...d.records[0],
        key: "private",
        circulation: false,
        ringsFeet: [strip],
      });
    else d.walkingSupport!.floors[0].ringsFeet.push(strip);
    const result = circulationThresholds(d, d.records);
    assert.equal(result.length, 1);
    assert.ok(
      area(polygonClipping.intersection(result[0].parts, [strip])) < 1e-8,
      mask,
    );
  }
});

function doorFixture() {
  const d = fixture();
  d.records[1].stair = false;
  d.records[0].ringsFeet = [rect(0, 0, 4.7, 10)];
  d.records[1].ringsFeet = [rect(5.3, 0, 4.7, 10)];
  d.nodes = [
    { id: "door:0", roomKey: "a", levelId: 1, pointFeet: [4.6, 5, 0] },
    { id: "door:1", roomKey: "b", levelId: 1, pointFeet: [5.4, 5, 0] },
  ] as IndoorDataset["nodes"];
  d.edges = [
    {
      id: "door",
      from: "door:0",
      to: "door:1",
      kind: "door",
      enabled: true,
      roomKeys: ["a", "b"],
      nativeElementId: 30,
      pointsFeet: [
        [4.6, 5, 0],
        [5.4, 5, 0],
      ],
    },
  ] as IndoorDataset["edges"];
  d.doors = [
    {
      id: "door",
      levelId: 1,
      nativeElementId: 30,
      state: "connected",
      pointFeet: [5, 5],
      normalFeet: [1, 0],
      footprintFeet: rect(4.9, 4, 0.2, 2),
      roomKeys: ["a", "b"],
    },
  ];
  d.walls = [
    {
      levelId: 1,
      nativeElementId: 20,
      kind: "wall",
      ringsFeet: [rect(4.7, 0, 0.6, 10)],
    },
  ] as IndoorDataset["walls"];
  return d;
}

test("an enabled native circulation door fills the carved host thickness with hallway paint", () => {
  const d = doorFixture(),
    before = JSON.stringify(d),
    result = circulationThresholds(d, d.records);
  assert.equal(result.length, 1);
  assert.equal(result[0].boundarySource, "prepared-native-door");
  assert.ok(
    area(
      polygonClipping.intersection(result[0].parts, [rect(4.7, 4, 0.6, 2)]),
    ) > 1.199,
  );
  assert.equal(
    JSON.stringify(d),
    before,
    "threshold paint must not alter routing",
  );
});

test("hidden native threshold paint cannot imply disabled, restricted, mismatched or other-floor access", () => {
  for (const change of [
    (d: IndoorDataset) => {
      d.edges[0].enabled = false;
    },
    (d: IndoorDataset) => {
      d.doors![0].state = "unmatched";
    },
    (d: IndoorDataset) => {
      d.records[1].access = "staff";
    },
    (d: IndoorDataset) => {
      d.records[1].circulation = false;
    },
    (d: IndoorDataset) => {
      d.edges[0].nativeElementId = 31;
    },
    (d: IndoorDataset) => {
      d.edges[0].roomKeys = ["a", "foreign"];
    },
    (d: IndoorDataset) => {
      d.nodes[1].pointFeet[2] = 3;
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.sourceModelSha256 = "foreign";
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.floors[0].elevationFeet = 3;
    },
  ]) {
    const d = doorFixture();
    change(d);
    assert.equal(circulationThresholds(d, d.records).length, 0);
  }
  const opening = fixture();
  opening.records[1].access = "staff";
  assert.equal(circulationThresholds(opening, opening.records).length, 0);
});

test("native thresholds keep columns, other walls, staff rooms and actual slab holes unpainted", () => {
  for (const kind of ["column", "wall", "staff", "hole"]) {
    const d = doorFixture(),
      strip = rect(5.5, 4, 0.2, 2);
    if (kind === "column" || kind === "wall")
      d.walls.push({
        ...d.walls[0],
        nativeElementId: 40,
        kind,
        ringsFeet: [strip],
      });
    else if (kind === "staff")
      d.records.push({
        ...d.records[0],
        key: "private",
        access: "staff",
        ringsFeet: [strip],
      });
    else d.walkingSupport!.floors[0].ringsFeet.push(strip);
    const result = circulationThresholds(d, d.records);
    assert.equal(result.length, 1);
    assert.ok(
      area(polygonClipping.intersection(result[0].parts, [strip])) < 1e-8,
      kind,
    );
  }
});
