import assert from "node:assert/strict";
import test from "node:test";
import type {
  IndoorDataset,
  IndoorEdge,
  IndoorNode,
} from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
import type { PathwayArc } from "../../app/indoor-project/shared-pathway-routing";
import {
  reviewedCrossCorridorDoor,
  crossCorridorStations,
  buildReviewedCrossCorridor,
} from "../../app/indoor-project/reviewed-cross-corridor-door";

const w = "rm-694-3fa5e106df03",
  e = "rm-694-43c823fdc35c",
  office = "rm-694-3f176906de8a",
  id = "door:694:1513453";
const westId =
    "native-cell:14.435696:634:walk:door:694:1513784:0|door:694:1513785:1",
  eastId =
    "native-cell:14.435696:637:walk:arrival:rm-694-43c823fdc35c|door:694:1992808:1",
  z = 14.435695538057743;
function fixture() {
  const data = {
    source: {
      modelSha256:
        "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
      roomsSha256:
        "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9",
    },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [0, 0],
      rotationRadians: 0,
      projectionLatitude: 0,
      horizontalMetresPerFoot: 0.3048,
    },
    edges: [],
    nodes: [
      { id: "door:694:1513784:0", roomKey: w },
      { id: "door:694:1992808:1", roomKey: e },
      { id: id + ":0", roomKey: office },
    ],
    records: [
      [w, "08-210"],
      [e, "08-202"],
      [office, "08-211"],
    ].map(([key, number]) => ({
      key,
      number,
      walkable: true,
      circulation: key !== office,
      access: "unknown",
      properties: {},
      levelId: 694,
      building: "08",
    })),
    doors: [
      {
        id,
        nativeElementId: 1513453,
        hostWallNativeElementId: 1513452,
        levelId: 694,
        state: "connected",
        roomKeys: [office, w],
        pointFeet: [48.51157536000714, 484.8917254283297],
        normalFeet: [-1, 0],
        footprintFeet: [
          [50.1519953075137, 483.46652857793634],
          [50.1519953075137, 486.3169222787231],
          [46.871155412500585, 486.3169222787231],
          [46.871155412500585, 483.46652857793634],
        ],
      },
    ],
  } as unknown as IndoorDataset;
  const wg: PreparedRouting["guides"][number] = {
      edgeId: westId,
      hallwayJoins: [0, 1],
      pointsFeet: [
        [45.67256093625021, 478.9967762477396, z],
        [45.65326523023899, 489.6699027224025, z],
      ],
    },
    eg: PreparedRouting["guides"][number] = {
      edgeId: eastId,
      hallwayJoins: [0, 3],
      pointsFeet: [
        [67.15980788979789, 510.1262846559747, z],
        [67.75235028168449, 487.8663975460291, z],
        [72.487296852108, 486.2230294348977, z],
        [75.85274401368304, 487.65706986990136, z],
      ],
    };
  const we = {
      id: westId,
      nativeCellId: "native-cell:14.435696:634",
    } as IndoorEdge,
    ee = {
      id: eastId,
      nativeCellId: "native-cell:14.435696:637",
    } as IndoorEdge;
  return { data, wg, eg, we, ee };
}
test("the reviewed public corridor door binds its persisted original owners without giving the office an entrance", () => {
  const { data } = fixture(),
    d = data.doors![0],
    before = structuredClone(d);
  assert.equal(reviewedCrossCorridorDoor(data), d);
  assert.deepEqual(d, before);
  d.hostWallNativeElementId = 1513457;
  assert.equal(reviewedCrossCorridorDoor(data), undefined);
  d.hostWallNativeElementId = 1513452;
  data.records[1].access = "staff";
  assert.equal(reviewedCrossCorridorDoor(data), undefined);
  data.records[1].access = "unknown";
  data.edges.push({ id, enabled: false } as IndoorEdge);
  assert.equal(reviewedCrossCorridorDoor(data), undefined);
});
test("the passage splits existing shared guide cores and carries the original raised sill in both directions", () => {
  const { data, wg, eg, we, ee } = fixture(),
    door = reviewedCrossCorridorDoor(data)!;
  const ss = crossCorridorStations(door, wg, eg, we, ee)!;
  assert.deepEqual(
    ss.map((s) => s.pointFeet),
    [
      [45.66190358981945, 484.8917254283297, z],
      [67.75235028168449, 487.8663975460291, z],
    ],
  );
  assert.equal(
    crossCorridorStations(
      door,
      { ...wg, pointsFeet: wg.pointsFeet.map((p) => [p[0], p[1] + 30, p[2]]) },
      eg,
      we,
      ee,
    ),
    undefined,
  );
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const build = (hasCore: boolean) =>
    buildReviewedCrossCorridor(
      data,
      nodes,
      new Map([
        [westId, wg],
        [eastId, eg],
      ]),
      new Map([
        [westId, we],
        [eastId, ee],
      ]),
      () =>
        hasCore
          ? [
              {
                link: { requiredRooms: [], passages: [] },
              } as unknown as PathwayArc,
            ]
          : [],
      () => true,
      (s) => s.stopId,
    );
  assert.equal(build(false).arcs.length, 0);
  const result = build(true);
  assert.equal(result.stations.length, 2);
  assert.equal(result.arcs.length, 6);
  const [along, back] = result.arcs.filter((a) => a.link.edge.id === id);
  assert.deepEqual(along.points, back.points.toReversed());
  assert.deepEqual(along.link.edge.roomKeys, [w, e]);
  assert.equal(along.points.length, 6);
  assert.ok(Math.abs(along.reviewedSillHeightFeet! * 304.8 - 50) < 1e-7);
  assert.equal(along.link.edge.accessible, "unknown");
  assert.equal(along.link.edge.direction, "both");
  assert.equal(nodes.get(id + ":0")!.roomKey, office);
  assert.equal(nodes.get(along.sourceFrom)!.roomKey, w);
  assert.equal(nodes.get(along.sourceTo)!.roomKey, e);
  assert.equal(along.validateReviewedDoor?.(), false);
});
