import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  classifyWalkingTurns,
  NAVIGATION_STEP_RULES,
  projectNavigationSteps,
  type WalkingLeg,
} from "../../app/indoor-project/navigation-steps";
import type { ProjectRoute } from "../../app/indoor-project/viewer-routing";

// One project foot is one metre in these fixtures.
const leg = (degrees: number, metres: number): WalkingLeg => ({
  dx: Math.cos((degrees * Math.PI) / 180) * metres,
  dy: Math.sin((degrees * Math.PI) / 180) * metres,
  metres,
});
const turns = (legs: WalkingLeg[]) =>
  classifyWalkingTurns(legs).turns.map((t) => [
    t.leg,
    Math.round(t.degrees),
    t.kind,
  ]);

test("a real corner is one turn; its heading is the smoothed net change", () => {
  assert.deepEqual(turns([leg(0, 10), leg(90, 10)]), [[1, 90, "turn"]]);
  assert.deepEqual(turns([leg(0, 10), leg(-90, 10)]), [[1, -90, "turn"]]);
  // A chamfered corner (two 45 degree bends 3 m apart) is one turn.
  assert.deepEqual(turns([leg(0, 10), leg(45, 3), leg(90, 10)]), [
    [1, 90, "turn"],
  ]);
  // A 150+ degree change is a turn around.
  assert.deepEqual(turns([leg(0, 10), leg(170, 10)]), [[1, 170, "around"]]);
});

test("legs shorter than 2 m never set the heading", () => {
  // A sideways jog through a short connector is no step at all.
  assert.deepEqual(turns([leg(0, 10), leg(90, 1.5), leg(0, 10)]), []);
  // A hook (short out-and-back) before a corner leaves one net turn, and the
  // new step starts at the hook.
  assert.deepEqual(
    turns([leg(0, 10), leg(180, 1), leg(90, 0.8), leg(90, 12)]),
    [[1, 90, "turn"]],
  );
  // A zigzag of short legs whose net change is small is no step.
  assert.deepEqual(
    turns([leg(0, 10), leg(40, 1), leg(-40, 1), leg(30, 1), leg(5, 10)]),
    [],
  );
});

test("no Bear step below 30 degrees; consecutive slight bends merge", () => {
  assert.equal(NAVIGATION_STEP_RULES.minimumTurnDegrees, 30);
  assert.deepEqual(turns([leg(0, 10), leg(25, 10)]), []);
  assert.deepEqual(turns([leg(0, 10), leg(35, 10)]), [[1, 35, "slight"]]);
  // Two 20 degree bends 3 m apart add up to a 40 degree bear.
  assert.deepEqual(turns([leg(0, 10), leg(20, 3), leg(40, 10)]), [
    [1, 40, "slight"],
  ]);
  // A left/right jog of slight bends cancels.
  assert.deepEqual(turns([leg(0, 10), leg(40, 3), leg(0, 10)]), []);
  // Bends further apart than the merge distance stay separate.
  assert.deepEqual(turns([leg(0, 10), leg(40, 6), leg(0, 10)]), [
    [1, 40, "slight"],
    [2, -40, "slight"],
  ]);
  // Two real turns close together are not merged into a turn around.
  assert.deepEqual(turns([leg(0, 10), leg(90, 3), leg(180, 10)]), [
    [1, 90, "turn"],
    [2, 90, "turn"],
  ]);
});

test("a barrier (door, building, curve) stops bend merging", () => {
  const legs = [leg(0, 10), leg(20, 3), leg(40, 10)];
  legs[2].barrier = true;
  assert.deepEqual(
    classifyWalkingTurns(legs).turns.map((t) => Math.round(t.degrees)),
    [],
  );
  legs[1] = leg(35, 3);
  legs[2] = { ...leg(70, 10), barrier: true };
  assert.deepEqual(
    classifyWalkingTurns(legs).turns.map((t) => Math.round(t.degrees)),
    [35, 35],
  );
});

test("a short first leg still gives the turn into the corridor", () => {
  assert.deepEqual(turns([leg(90, 1.2), leg(0, 20)]), [[1, -90, "turn"]]);
  // Below the first-heading length, the first heading waits for a longer leg.
  assert.deepEqual(turns([leg(90, 0.3), leg(0, 20)]), []);
});

type XYZ = [number, number, number];
function fixture(
  pieces: {
    id: string;
    kind?: "walk" | "door" | "stairs";
    to: { id: string; room: string; building?: string; level?: number };
    points: XYZ[];
  }[],
) {
  const start = { id: "s", room: "start" };
  const nodes = [
    {
      id: start.id,
      roomKey: start.room,
      levelId: 1,
      building: "A",
      surfaceId: "",
      pointFeet: pieces[0].points[0],
      geographic: [0, 0],
      kind: "arrival",
    },
    ...pieces.map((p) => ({
      id: p.to.id,
      roomKey: p.to.room,
      levelId: p.to.level ?? 1,
      building: p.to.building ?? "A",
      surfaceId: "",
      pointFeet: p.points.at(-1)!,
      geographic: [0, 0],
      kind: "junction",
    })),
  ];
  const records = [...new Set(nodes.map((n) => n.roomKey))].map((key) => ({
    key,
    number: key.toUpperCase(),
    name: key,
    circulation: key.startsWith("hall"),
    stair: false,
  }));
  const edges = pieces.map((p, i) => ({
    id: p.id,
    from: nodes[i].id,
    to: nodes[i + 1].id,
    kind: p.kind ?? "walk",
    lengthMetres: p.points
      .slice(1)
      .reduce(
        (s, q, j) =>
          s + Math.hypot(q[0] - p.points[j][0], q[1] - p.points[j][1]),
        0,
      ),
    pointsFeet: p.points,
    roomKeys: [],
    evidence: "",
    accessible: "unknown",
    enabled: true,
  }));
  const data = {
    nodes,
    records,
    edges,
    floors: [],
    nativeLevels: [],
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [0, 0],
      projectionLatitude: 0,
      rotationRadians: 0,
      horizontalMetresPerFoot: 1,
      verticalMetresPerFoot: 1,
      rmsMetres: 0,
      referenceCount: 0,
    },
  } as unknown as IndoorDataset;
  const route = {
    edges,
    nodeIds: nodes.map((n) => n.id),
    paths: pieces.map((p, i) => ({
      edgeIds: [p.id],
      levelIds: [...new Set([nodes[i].levelId, nodes[i + 1].levelId])],
      pointsFeet: p.points,
      centered: true,
    })),
    distanceMetres: edges.reduce((s, e) => s + e.lengthMetres, 0),
    sourceDistanceMetres: 0,
    unknownAccessAreas: [],
    unknownAccessibilityEdges: 0,
  } as unknown as ProjectRoute;
  return { data, route };
}

test("a hooked, zigzagging walk gives only its two real corners", () => {
  const { data, route } = fixture([
    {
      id: "w1",
      to: { id: "end", room: "end" },
      points: [
        [0, 0, 0],
        [0, 1, 0], // out of the room
        [0, 1.6, 0], // short threshold leg
        [10, 1.6, 0],
        [10.4, 2.2, 0], // jog
        [10.8, 1.6, 0],
        [30, 1.6, 0],
        [31, 1.6, 0], // overshoot of the join (hook)
        [30.2, 1.7, 0],
        [30.2, 25, 0],
      ],
    },
  ]);
  const steps = projectNavigationSteps(data, route, "Start", "End");
  assert.deepEqual(
    steps.map((s) => s.message),
    [
      "Leave Start and head straight",
      "Turn right",
      "Turn left",
      "Arrive at End",
    ],
  );
  const total = steps.reduce((s, x) => s + x.distanceMeters, 0);
  assert.ok(Math.abs(total - route.distanceMetres) < 1e-9);
  // The steps still cover every walked point, in order.
  assert.equal(
    steps.slice(0, -1).reduce((n, s) => n + s.pointsFeet.length - 1, 0),
    9,
  );
});

test("floor changes, transit rooms and building changes stay steps", () => {
  const { data, route } = fixture([
    {
      id: "w1",
      to: { id: "d0", room: "hall" },
      points: [
        [0, 0, 0],
        [10, 0, 0],
      ],
    },
    {
      id: "door1",
      kind: "door",
      to: { id: "d1", room: "office" },
      points: [
        [10, 0, 0],
        [11, 0, 0],
      ],
    },
    {
      id: "w2",
      to: { id: "d2", room: "office" },
      points: [
        [11, 0, 0],
        [20, 0, 0],
      ],
    },
    {
      id: "door2",
      kind: "door",
      to: { id: "d3", room: "hall2", building: "B" },
      points: [
        [20, 0, 0],
        [21, 0, 0],
      ],
    },
    {
      id: "w3",
      to: { id: "st", room: "hall2", building: "B" },
      points: [
        [21, 0, 0],
        [30, 0, 0],
      ],
    },
    {
      id: "stair",
      kind: "stairs",
      to: { id: "up", room: "hall3", building: "B", level: 2 },
      points: [
        [30, 0, 0],
        [34, 0, 10],
      ],
    },
    {
      id: "w4",
      to: { id: "e", room: "end", building: "B", level: 2 },
      points: [
        [34, 0, 10],
        [40, 0, 10],
      ],
    },
  ]);
  const steps = projectNavigationSteps(data, route, "Start", "End");
  assert.deepEqual(
    steps.map((s) => [s.type, s.message]),
    [
      ["depart", "Leave Start and head straight"],
      ["straight", "Continue through OFFICE"],
      ["building-change", "Continue into building B"],
      ["floor-change", "Take stairs up to Floor"],
      ["straight", "Head straight"],
      ["arrive", "Arrive at End"],
    ],
  );
  assert.equal(steps[2].buildingName, "B");
});
