import assert from "node:assert/strict";
import test from "node:test";
import type {
  IndoorDataset,
  IndoorEdge,
  IndoorNode,
} from "../../app/indoor-project/contract";
import { landingTurnBounds } from "../../app/indoor-project/native-public-corridor-strip";
import { nativeStairHallwayApproaches } from "../../app/indoor-project/native-stair-hallway-approaches";
import type { PathwayArc } from "../../app/indoor-project/shared-pathway-routing";
import type {
  ProjectRoutingGraph,
  ProjectRoutingLink,
} from "../../app/indoor-project/routing-graph";
type XYZ = [number, number, number];
const p: XYZ = [0, 0, 0],
  doorPoint: XYZ = [0, 4, 0],
  other: XYZ = [0, 5, 0];
const sr = "stair-room",
  h = "hall",
  a = "arrival-s",
  cap = "stair-start",
  door = "door-side",
  far = "door-other";
function fixture() {
  const flight = {
    id: "flight",
    kind: "stairs",
    nativeElementId: 17,
    enabled: true,
    accessible: "no",
    roomKeys: [sr, "upper"],
    from: cap,
    to: "upper",
    pointsFeet: [p, [0, -2, 0], [0, -1, 12]],
    nativeSteppedStairV2: {
      terminalApproaches: [
        { nodeId: cap, nativeCellId: "cell", walkEdgeId: "alias" },
      ],
    },
  } as unknown as IndoorEdge;
  const make = (
    id: string,
    from: string,
    to: string,
    pointsFeet: XYZ[],
    kind = "walk",
  ) =>
    ({
      id,
      kind,
      from,
      to,
      roomKeys: [sr, h],
      nativeCellId: "cell",
      lengthMetres: id === "alias" ? 0 : 1,
      enabled: true,
      pointsFeet,
    }) as IndoorEdge;
  const alias = make("alias", cap, a, [p, p]),
    walk = make("walk", a, door, [p, doorPoint]),
    threshold = make("door", door, far, [doorPoint, other], "door");
  threshold.nativeElementId = 24;
  const adj = new Map<string, ProjectRoutingLink[]>(),
    out = new Map<string, PathwayArc[]>();
  for (const edge of [flight, alias, walk, threshold]) {
    for (const [from, to] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ]) {
      const link = { to, edge, blockers: [], requiredRooms: [], passages: [] };
      adj.set(from, [...(adj.get(from) ?? []), link]);
      if (edge === walk) continue;
      const vertex = JSON.stringify([from]),
        arc = {
          from: vertex,
          to: JSON.stringify([to]),
          sourceFrom: from,
          sourceTo: to,
          metres: 1,
          link,
          points:
            from === edge.from ? edge.pointsFeet : edge.pointsFeet.toReversed(),
        };
      out.set(vertex, [...(out.get(vertex) ?? []), arc]);
    }
  }
  const nodes = new Map(
    [
      [cap, sr, "stair", p],
      [a, sr, "arrival", p],
      [door, sr, "portal", doorPoint],
      [far, h, "portal", other],
    ].map(([id, roomKey, kind, pointFeet]) => [
      id,
      { id, roomKey, kind, pointFeet, levelId: 1, building: "B" },
    ]),
  ) as Map<string, IndoorNode>;
  const graph = {
    adjacency: adj,
    records: new Map([
      [
        sr,
        { key: sr, walkable: true, levelId: 1, stair: true, arrivalNodeId: a },
      ],
      [h, { key: h, walkable: true, levelId: 1, circulation: true }],
    ]),
  } as unknown as ProjectRoutingGraph;
  const data = {
    source: { modelSha256: "model" },
    alignment: { horizontalMetresPerFoot: 0.3048 },
    edges: [flight, alias, threshold, walk],
    doors: [
      {
        id: "door",
        state: "connected",
        nativeElementId: 24,
        hostWallNativeElementId: 35,
        roomKeys: [sr, h],
      },
    ],
    stairDisplay: {
      sourceModelSha256: "model",
      sourceFlights: [
        {
          stairElementId: 17,
          levelIds: [1, 2],
          buildings: ["B"],
          treads: [{ runElementId: 18 }],
        },
      ],
    },
  } as unknown as IndoorDataset;
  return {
    data,
    graph,
    flight,
    threshold,
    out,
    arcs: () =>
      nativeStairHallwayApproaches(
        data,
        graph,
        nodes,
        out,
        new Map(),
        () => true,
      ),
  };
}
test("The original admitted stair and public door yield only the two original horizontal directions", () => {
  const f = fixture(),
    arcs = f.arcs();
  assert.deepEqual(
    arcs.map((v) => [v.sourceFrom, v.sourceTo]),
    [
      [a, door],
      [door, a],
    ],
  );
  assert.deepEqual(arcs[0].points, [p, doorPoint]);
  assert.ok(
    arcs.every((v) => v.link.edge.kind === "walk" && v.validateReviewedRun),
  );
});
test("Held stairs, missing terminal certificates, a restricted door and a non-corridor beyond all remain held", () => {
  let f = fixture();
  f.flight.enabled = false;
  assert.deepEqual(f.arcs(), []);
  f = fixture();
  f.flight.nativeSteppedStairV2!.terminalApproaches[0].nodeId =
    "other-terminal";
  assert.deepEqual(f.arcs(), []);
  f = fixture();
  f.graph.adjacency
    .get(door)!
    .find((l) => l.edge === f.threshold)!.requiredRooms = ["office"];
  assert.deepEqual(f.arcs(), []);
  f = fixture();
  f.graph.records.get(h)!.circulation = false;
  assert.deepEqual(f.arcs(), []);
  f = fixture();
  f.data.stairDisplay!.sourceModelSha256 = "other";
  assert.deepEqual(f.arcs(), []);
});
test("A cap contains the whole two-foot turn for nearly axial runs; reversals require the full square", () => {
  const [x, y] = landingTurnBounds([-0.1, -1, 0], p, [-0.2, 2, 0]);
  assert.equal(x, 1);
  assert.ok(y > 0.1 && y < 0.11);
  assert.deepEqual(landingTurnBounds([0, 1, 0], p, [0, 1, 0]), [1, 1]);
  assert.deepEqual(landingTurnBounds([0, -1, 0], p, [1, 0, 0]), [1, 1]);
});

test("Another admitted flight arriving at the same landing needs its own turning clearance", () => {
  const f = fixture();
  const other = {
    ...f.flight,
    id: "second flight",
    from: "elsewhere",
    to: cap,
  };
  f.data.edges.push(other);
  const base = f.out.get(JSON.stringify([cap]))![0],
    origin = JSON.stringify([other.from]);
  f.out.set(origin, [
    {
      ...base,
      from: origin,
      to: JSON.stringify([cap]),
      sourceFrom: other.from,
      sourceTo: cap,
      link: { ...base.link, to: cap, edge: other },
    },
  ]);
  assert.deepEqual(f.arcs(), []);
  // Holding that other flight restores the verified approach to the first.
  other.enabled = false;
  assert.equal(f.arcs().length, 2);
});
