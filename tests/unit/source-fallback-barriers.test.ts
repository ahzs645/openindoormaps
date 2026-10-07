import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures/native-area-project";
import type { IndoorEdge } from "../../app/indoor-project/contract";
import type { RoutePath } from "../../app/indoor-project/centered-route";
import { sourceFallbackBarrierHits } from "../../app/indoor-project/source-fallback-barriers";
import { findProjectRoute } from "../../app/indoor-project/routing";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [[number, number], [number, number], [number, number], [number, number]] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
function setup() {
  const d = fixture();
  d.records = d.records.slice(0, 2);
  d.records.forEach((r, i) => {
    r.circulation = true;
    r.access = "public";
    r.arrivalNodeId = i ? "b" : "a";
    r.ringsFeet = [rect(i * 10, 0, 10, 10)];
  });
  d.nodes = d.records.map((r, i) => ({
    id: r.arrivalNodeId!,
    roomKey: r.key,
    kind: "arrival",
    levelId: 1,
    building: "01",
    surfaceId: "first",
    pointFeet: [i ? 15 : 5, 5, 0],
    geographic: [0, 0],
  }));
  const edge: IndoorEdge = {
    id: "walk",
    from: "a",
    to: "b",
    kind: "walk",
    roomKeys: ["0", "1"],
    lengthMetres: 3.048,
    pointsFeet: [
      [5, 5, 0],
      [15, 5, 0],
    ],
    enabled: true,
    accessible: "yes",
    evidence: "source",
  };
  d.edges = [edge];
  d.doors = [];
  d.walls = [
    {
      levelId: 1,
      nativeElementId: 10,
      kind: "wall",
      ringsFeet: [rect(9.8, 0, 0.4, 10)],
    },
  ];
  const path: RoutePath = {
    edgeIds: ["walk"],
    levelIds: [1],
    pointsFeet: edge.pointsFeet,
    centered: false,
    sourceReason: "no-clearance-route",
  };
  return { d, edge, path };
}
test("failed refinement cannot return a saved walk through a precise wall", () => {
  const { d, path, edge } = setup();
  assert.deepEqual(sourceFallbackBarrierHits(d, path, [edge]), [10]);
  assert.equal(findProjectRoute(d, "0", "1", "public"), null);
});
test("a nearby side-room doorway does not license the fallback crossing", () => {
  const { d, path, edge } = setup();
  d.doors = [
    {
      id: "side",
      levelId: 1,
      nativeElementId: 11,
      state: "connected",
      pointFeet: [10, 5],
      footprintFeet: rect(9.7, 4, 0.6, 2),
      roomKeys: ["0", "side-room"],
    },
  ];
  d.edges.push({
    ...edge,
    id: "side",
    kind: "door",
    roomKeys: ["0", "side-room"],
  });
  assert.deepEqual(sourceFallbackBarrierHits(d, path, [edge]), [10]);
});
test("an enabled native doorway between the same source owners stays usable", () => {
  const { d, path, edge } = setup();
  d.doors = [
    {
      id: "door",
      levelId: 1,
      nativeElementId: 11,
      state: "connected",
      pointFeet: [10, 5],
      footprintFeet: rect(9.7, 4, 0.6, 2),
      roomKeys: ["0", "1"],
    },
  ];
  const portal = { ...edge, id: "door", kind: "door" as const };
  d.edges.push(portal);
  assert.deepEqual(sourceFallbackBarrierHits(d, path, [edge]), []);
  d.edges[1].enabled = false;
  assert.deepEqual(sourceFallbackBarrierHits(d, path, [edge]), [10]);
});
test("wall contacts and actual native wall holes stay passable, columns do not become doors", () => {
  const { d, path, edge } = setup();
  d.walls[0].ringsFeet.push(rect(9.9, 4, 0.2, 2));
  path.pointsFeet = [
    [9.95, 4.5, 0],
    [10.05, 5.5, 0],
  ];
  assert.deepEqual(sourceFallbackBarrierHits(d, path, [edge]), []);
  path.pointsFeet = [
    [9.8, 1, 0],
    [9.8, 9, 0],
  ];
  assert.deepEqual(sourceFallbackBarrierHits(d, path, [edge]), []);
  d.walls[0].kind = "column";
  d.walls[0].ringsFeet = [rect(9.8, 0, 0.4, 10)];
  path.pointsFeet = edge.pointsFeet;
  d.doors = [
    {
      id: "door",
      levelId: 1,
      nativeElementId: 11,
      state: "connected",
      pointFeet: [10, 5],
      footprintFeet: rect(9.7, 4, 0.6, 2),
      roomKeys: ["0", "1"],
    },
  ];
  d.edges.push({ ...edge, id: "door", kind: "door" });
  assert.deepEqual(sourceFallbackBarrierHits(d, path, [edge]), [10]);
});
test("the scoped fallback guard preserves independently reviewed stair and door paths", () => {
  const { d, path, edge } = setup();
  assert.deepEqual(
    sourceFallbackBarrierHits(d, { ...path, sourceReason: "stair-landing" }, [
      edge,
    ]),
    [],
  );
  assert.deepEqual(
    sourceFallbackBarrierHits(d, { ...path, sourceReason: "native-door" }, [
      edge,
    ]),
    [],
  );
  assert.deepEqual(
    sourceFallbackBarrierHits(
      d,
      {
        ...path,
        pointsFeet: [
          [5, 5, 0],
          [15, 5, 8],
        ],
      },
      [edge],
    ),
    [],
  );
});

test("a blocked fallback retries a supported source branch around the finite wall end", () => {
  const { d, edge } = setup();
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 20, 12)],
      },
    ],
  };
  d.edges.push({
    ...edge,
    id: "safe-alternative",
    lengthMetres: 7,
    pointsFeet: [
      [5, 5, 0],
      [5, 11, 0],
      [15, 11, 0],
      [15, 5, 0],
    ],
  });
  const route = findProjectRoute(d, "0", "1", "public");
  assert.ok(route);
  assert.ok(route.edges.some((e) => e.id === "safe-alternative"));
  assert.ok(!route.edges.some((e) => e.id === "walk"));
  for (const path of route.paths)
    assert.deepEqual(sourceFallbackBarrierHits(d, path, route.edges), []);
});
