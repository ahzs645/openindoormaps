import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/native-area-project";
import { createIndoorExclusionQuery } from "../../app/indoor-project/indoor-exclusions";
import { createIndoorExclusionQuery as compilerQuery } from "../../../reviter/lib/reviter/indoor-exclusions.ts";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { createProjectRouteDiagnostics } from "../../app/indoor-project/route-diagnostics";
import {
  projectRoutingGraph,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";

function lift() {
  const d = fixture();
  d.nativeLevels = [0, 10, 20].map((z, i) => ({
    id: i + 1,
    name: `Floor ${i + 1}`,
    elevationFeet: z,
  }));
  d.records = d.records.slice(0, 3);
  d.records.forEach((r, i) => {
    r.levelId = i + 1;
    r.elevationFeet = i * 10;
    r.circulation = true;
    r.access = "public";
    r.arrivalNodeId = `lift:${i}`;
  });
  d.nodes = [0, 10, 20].map((z, i) => ({
    id: `lift:${i}`,
    roomKey: String(i),
    building: "01",
    levelId: i + 1,
    surfaceId: "first",
    pointFeet: [i === 2 ? 20 : 0, 5, z] as [number, number, number],
    geographic: [0, 0] as [number, number],
    kind: "connector" as const,
  }));
  d.connectors = [
    {
      id: "lift",
      kind: "elevator",
      nativeElementId: 101,
      sourceModelSha256: d.source.modelSha256,
      reviewedShaft: {
        pinId: "reviewed-shaft",
        pointFeet: [10, 5],
        wallElementIds: [101, 102, 103],
      },
      evidence: "Measured source shaft and served lobby anchors",
      accessible: "unknown",
      direction: "both",
      entrances: d.nodes.map((n) => ({
        nodeId: n.id,
        roomKey: n.roomKey,
        levelId: n.levelId,
      })),
    },
  ];
  d.edges = [
    {
      id: "lift:0:2",
      from: "lift:0",
      to: "lift:2",
      kind: "elevator",
      nativeElementId: 101,
      connectorId: "lift",
      enabled: true,
      accessible: "unknown",
      direction: "both",
      lengthMetres: 10,
      pointsFeet: [d.nodes[0].pointFeet, d.nodes[2].pointFeet],
      roomKeys: [],
      evidence: "Measured source shaft and served lobby anchors",
    },
  ];
  d.indoorExclusions = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    areas: [
      {
        id: "shaft:2",
        label: "Non-walkable shaft",
        levelId: 2,
        elevationFeet: 10,
        nativeFloorIds: [100],
        reason: "off-limits",
        connectorId: "lift",
        partsFeet: [
          [
            [
              [9, 4],
              [11, 4],
              [11, 6],
              [9, 6],
            ],
          ],
        ],
      },
    ],
  };
  return d;
}

test("exact reviewed lift transit bypasses only its own intermediate shaft in runtime and compiler", () => {
  const d = lift(),
    edge = d.edges[0];
  for (const make of [createIndoorExclusionQuery, compilerQuery]) {
    const q = make(d);
    assert.deepEqual(
      q(edge.pointsFeet),
      ["shaft:2"],
      "ordinary walking query remains blocked",
    );
    assert.deepEqual(q.forEdge(edge.pointsFeet, edge), []);
    assert.deepEqual(q.forEdge([...edge.pointsFeet].reverse(), edge), []);
    assert.deepEqual(
      q.forEdge(edge.pointsFeet, { ...edge }),
      ["shaft:2"],
      "unregistered context is rejected",
    );
    assert.deepEqual(
      q.forEdge([edge.pointsFeet[0], [10, 5, 10], edge.pointsFeet[1]], edge),
      ["shaft:2"],
      "different path cannot borrow context",
    );
  }
});

test("walking, stale reviews, unsafe lobby endpoints and other masks cannot borrow a lift exemption", () => {
  const changes = [
    (d: ReturnType<typeof lift>) => {
      d.edges[0].kind = "walk";
    },
    (d: ReturnType<typeof lift>) => {
      d.edges[0].enabled = false;
    },
    (d: ReturnType<typeof lift>) => {
      d.edges[0].nativeElementId = 999;
    },
    (d: ReturnType<typeof lift>) => {
      d.connectors![0].sourceModelSha256 = "c".repeat(64);
    },
    (d: ReturnType<typeof lift>) => {
      d.connectors![0].reviewedShaft!.wallElementIds = [102, 103, 104];
    },
    (d: ReturnType<typeof lift>) => {
      d.connectors![0].entrances[0].roomKey = "wrong-room";
    },
    (d: ReturnType<typeof lift>) => {
      d.nodes[0].kind = "arrival";
    },
    (d: ReturnType<typeof lift>) => {
      d.connectors![0].direction = "from-to";
    },
    (d: ReturnType<typeof lift>) => {
      d.connectors![0].evidence = "Different reviewed source";
    },
    (d: ReturnType<typeof lift>) => {
      d.indoorExclusions!.areas[0].connectorId = "other-lift";
    },
    (d: ReturnType<typeof lift>) => {
      d.indoorExclusions!.areas[0].reason = "outdoor";
      delete d.indoorExclusions!.areas[0].connectorId;
    },
    (d: ReturnType<typeof lift>) => {
      d.indoorExclusions!.areas.push({
        ...d.indoorExclusions!.areas[0],
        id: "blocked-lobby",
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [
          [
            [
              [-1, 4],
              [1, 4],
              [1, 6],
              [-1, 6],
            ],
          ],
        ],
      });
    },
    (d: ReturnType<typeof lift>) => {
      d.indoorExclusions!.areas.push({
        ...d.indoorExclusions!.areas[0],
        id: "other-mask",
        connectorId: "other-lift",
      });
    },
  ];
  for (const mutate of changes) {
    const d = lift();
    mutate(d);
    const edge = d.edges[0],
      app = createIndoorExclusionQuery(d).forEdge(edge.pointsFeet, edge),
      compiler = compilerQuery(d).forEdge(edge.pointsFeet, edge);
    assert.ok(app.length, "invalid transit stays blocked");
    assert.deepEqual(app, compiler);
  }
});

test("routing, post-route checks, retained diagnostics and caches respect source lift review edits", () => {
  const d = lift(),
    retained = projectRoutingGraph(d),
    diagnostics = createProjectRouteDiagnostics(d);
  for (const [a, b] of [
    ["0", "2"],
    ["2", "0"],
  ]) {
    const route = findProjectRoute(d, a, b);
    assert.deepEqual(
      route?.edges.map((e) => e.id),
      ["lift:0:2"],
    );
    assert.equal(route?.paths.length, 1);
    assert.equal(
      findProjectRoute(d, a, b, "accessible"),
      null,
      "unknown lift accessibility remains unknown",
    );
  }
  const accessible = createProjectRouteDiagnostics(d, "accessible").inspect(
    "0",
    "2",
  );
  assert.ok(accessible.blockers.some((b) => b.kind === "step-free"));
  assert.ok(!accessible.blockers.some((b) => b.kind === "off-limits"));
  assert.ok(reachableProjectDestinations(retained, "0").has("2"));
  d.connectors![0].sourceModelSha256 = "c".repeat(64);
  assert.equal(findProjectRoute(d, "0", "2"), null);
  assert.ok(!reachableProjectDestinations(retained, "0").has("2"));
  assert.ok(
    diagnostics.inspect("0", "2").blockers.some((b) => b.kind === "off-limits"),
  );
  d.connectors![0].sourceModelSha256 = d.source.modelSha256;
  assert.ok(findProjectRoute(d, "0", "2"));
  d.connectors![0].reviewedShaft!.pointFeet = [100, 100];
  assert.equal(findProjectRoute(d, "0", "2"), null);
  d.connectors![0].reviewedShaft!.pointFeet = [10, 5];
  assert.ok(findProjectRoute(d, "0", "2"));
  d.nodes[0].roomKey = "wrong-room";
  assert.equal(findProjectRoute(d, "0", "2"), null);
});
