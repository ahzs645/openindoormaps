import test from "node:test";
import assert from "node:assert/strict";
import type {
  IndoorDataset,
  IndoorEdge,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import type {
  ProjectRoutingGraph,
  ProjectRoutingLink,
} from "../../app/indoor-project/routing-graph";
import type { SharedPathwayStop } from "../../app/indoor-project/shared-pathway-routing";
import {
  buildReviewedCorridorRuns,
  rotundaRunAvoidsOtherBranches,
} from "../../app/indoor-project/reviewed-rotunda-north";
const z = 14.435695538057743,
  cell = "native-cell:14.435696:563",
  from = "door:694:2126282:0",
  to = "connector:unbc-04-lift:1",
  id = cell + ":walk:" + to + "|" + from;
const room = {
  key: "rm-694-07de695d7751",
  name: "Rotunda",
  number: "04-259",
  levelId: 694,
  building: "04",
  elevationFeet: z,
  walkable: true,
  stair: false,
  access: "unknown",
} as IndoorRecord;
const data = {
  source: {
    modelSha256:
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
    roomsSha256:
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9",
  },
  alignment: { horizontalMetresPerFoot: 0.3048 },
} as IndoorDataset;
const edge = {
  id,
  from,
  to,
  enabled: true,
  kind: "walk",
  nativeCellId: cell,
  accessible: "unknown",
  pointsFeet: [
    [-72, 377, z],
    [-73, 370, z],
  ],
} as IndoorEdge;
const link = {
  edge,
  to,
  blockers: [],
  requiredRooms: [],
  passages: [],
} as ProjectRoutingLink;
const stop = (nodeId: string, at: [number, number]) =>
  ({
    pointFeet: [...at, z],
    terminalNodeId: nodeId,
    cellId: cell,
    guideEdgeId: "original-guide",
    stopId: nodeId,
  }) as SharedPathwayStop;
const build = (links: ProjectRoutingLink[], stations = stop) =>
  buildReviewedCorridorRuns(
    data,
    {
      records: new Map([[room.key, room]]),
      adjacency: new Map([[from, links]]),
    } as ProjectRoutingGraph,
    new Map(),
    stations,
    () => false,
    (s) => s.stopId,
  );
test("northern station spans inherit original directional graph permission and validate both incident guides before use", () => {
  const arcs = build([link]);
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0].from, from);
  assert.equal(arcs[0].to, to);
  assert.equal(arcs[0].validateReviewedRun!(), false);
  for (const bad of [
    { ...link, requiredRooms: ["private"] },
    { ...link, blockers: [{ kind: "staff", edgeId: id }] },
    { ...link, passages: [{ edge, forward: true }] },
    { ...link, edge: { ...edge, enabled: false } },
    { ...link, edge: { ...edge, nativeCellId: "other" } },
  ] as ProjectRoutingLink[])
    assert.deepEqual(build([bad]), []);
  assert.deepEqual(build([]), []);
});
test("a new station span can meet its endpoint geometry but cannot cross a room approach midway", () => {
  const p: [number, number, number][] = [
    [0, 0, z],
    [4, 0, z],
  ];
  const guide = (x: number) => ({
    edgeId: cell + ":walk:source",
    kind: "shared-corridor" as const,
    pointsFeet: [
      [x, -1, z],
      [x, 1, z],
    ] as [number, number, number][],
  });
  assert.equal(rotundaRunAvoidsOtherBranches(p, [guide(2)]), false);
  assert.equal(rotundaRunAvoidsOtherBranches(p, [guide(5)]), true);
  assert.equal(
    rotundaRunAvoidsOtherBranches(p, [
      {
        ...guide(4),
        pointsFeet: [
          [4, 0, z],
          [4, 1, z],
        ],
      },
    ]),
    true,
  );
});

test("07-113A keeps its source direction, corridor access and checked hallway station", () => {
  const westKey = "rm-311-399064f64ec1",
    eastKey = "rm-311-8e1b19ddd9ef";
  const a =
      "opening:recovered-circulation-seam:" +
      westKey +
      ":" +
      eastKey +
      ":2:59:1",
    b = "arrival:" + eastKey;
  const cellId = "native-cell:0.000000:71";
  const e = {
    ...edge,
    from: a,
    to: b,
    id: cellId + ":walk:" + b + "|" + a,
    nativeCellId: cellId,
    pointsFeet: [
      [22.85, 307.25, 0],
      [51.72, 299.82, 0],
    ],
  } as IndoorEdge;
  const publicLink = { ...link, edge: e, to: b };
  const west = {
    ...room,
    key: westKey,
    number: "07-163",
    levelId: 311,
    elevationFeet: 0,
    walkable: true,
    circulation: true,
  };
  const east = {
    ...west,
    key: eastKey,
    number: "07-113A",
    access: "public" as const,
  };
  function build07(
    allowed = publicLink,
    target: IndoorRecord = east,
    available = true,
  ) {
    return buildReviewedCorridorRuns(
      data,
      {
        records: new Map([
          [west.key, west],
          [east.key, target],
        ]),
        adjacency: new Map([[a, [allowed]]]),
      } as ProjectRoutingGraph,
      new Map(),
      (id, p, _departure, scope) =>
        available && scope === cellId
          ? { ...stop(id, p), cellId, pointFeet: [...p, 0] }
          : undefined,
      () => false,
      (s) => s.stopId,
    );
  }
  const accepted = build07();
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].from, a);
  assert.equal(accepted[0].to, b);
  assert.deepEqual(accepted[0].points[1], [21.5, 301.5, 0]);
  assert.equal(accepted[0].validateReviewedRun!(), false);
  assert.deepEqual(build07({ ...publicLink, requiredRooms: [west.key] }), []);
  assert.deepEqual(build07(publicLink, { ...east, access: "staff" }), []);
  assert.deepEqual(build07(publicLink, { ...east, circulation: false }), []);
  assert.deepEqual(build07(publicLink, east, false), []);
});
