import test from "node:test";
import assert from "node:assert/strict";
import { recoverCorridorRuns } from "../../app/indoor-project/corridor-run-recovery";
import type { IndoorEdge } from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
type P = [number, number, number];
const a: P = [0, 2, 0],
  b: P = [10, 2, 0],
  m: P = [4, -2, 0],
  left: P = [-4, 0, 0],
  right: P = [14, 0, 0];
const edge = (from: string, to: string, pointsFeet: P[]): IndoorEdge => ({
  id: from + "-" + to,
  from,
  to,
  pointsFeet,
  kind: "walk",
  enabled: true,
  accessible: "unknown",
  roomKeys: [],
  evidence: "fixture",
  lengthMetres: 10,
  nativeCellId: "cell",
});
const edges = [
  edge("L", "A", [left, a]),
  edge("B", "R", [b, right]),
  edge("A", "M", [a, m]),
  edge("M", "B", [m, b]),
];
const guides: PreparedRouting["guides"] = [
  {
    edgeId: "L-A",
    kind: "shared-corridor",
    pointsFeet: [left, [0, 0, 0], a],
    hallwayJoins: [0, 1],
  },
  {
    edgeId: "B-R",
    kind: "shared-corridor",
    pointsFeet: [b, [10, 0, 0], right],
    hallwayJoins: [1, 2],
  },
];
const missing = new Set(["A-M", "M-B"]);
test("a pair of existing walks continues two corridor ends and meets at one normal doorway station", () => {
  const r = recoverCorridorRuns(
    edges,
    guides,
    missing,
    () => [0, 1],
    () => true,
  );
  assert.deepEqual(
    r.map((g) => g.edgeId),
    ["A-M", "M-B"],
  );
  assert.deepEqual(
    r.map((g) => g.pointsFeet),
    [
      [a, [0, 0, 0], [4, 0, 0], m],
      [m, [4, 0, 0], [10, 0, 0], b],
    ],
  );
  assert.deepEqual(
    r.map((g) => g.hallwayJoins),
    [
      [1, 2],
      [1, 2],
    ],
  );
});
test("a failed strip, incomplete source link or missing doorway normal leaves the pair held", () => {
  for (const r of [
    recoverCorridorRuns(
      edges,
      guides,
      missing,
      () => [0, 1],
      (e) => e.id !== "M-B",
    ),
    recoverCorridorRuns(
      edges,
      guides,
      new Set(["A-M"]),
      () => [0, 1],
      () => true,
    ),
    recoverCorridorRuns(
      edges,
      guides,
      missing,
      () => undefined,
      () => true,
    ),
  ])
    assert.deepEqual(r, []);
});
test("nearby dead ends pointing across a corner do not imply a straight continuation", () => {
  const rotated: PreparedRouting["guides"] = [
    { ...guides[0], pointsFeet: [[0, -4, 0], [0, 0, 0], a] },
    guides[1],
  ];
  assert.deepEqual(
    recoverCorridorRuns(
      edges,
      rotated,
      missing,
      () => [0, 1],
      () => true,
    ),
    [],
  );
});

test("two guides at one doorway use a single verified hallway junction for through walks", () => {
  const terminal: P = [4, -2, 0];
  const source = [
    edge("L", "M", [left, terminal]),
    edge("M", "R", [terminal, right]),
  ];
  const saved: PreparedRouting["guides"] = [
    {
      edgeId: "L-M",
      kind: "shared-corridor",
      pointsFeet: [left, [0, 0, 0], terminal],
      hallwayJoins: [0, 1],
    },
    {
      edgeId: "M-R",
      kind: "shared-corridor",
      pointsFeet: [terminal, [10, 0, 0], right],
      hallwayJoins: [1, 2],
    },
  ];
  const repair = (deny: string) =>
    recoverCorridorRuns(
      source,
      saved,
      new Set(),
      () => [0, 1],
      (e) => e.id !== deny,
    );
  const corrected = repair("");
  assert.deepEqual(
    corrected.map((g) => g.pointsFeet),
    [
      [left, [0, 0, 0], [4, 0, 0], terminal],
      [terminal, [4, 0, 0], [10, 0, 0], right],
    ],
  );
  assert.deepEqual(
    corrected.map((g) => g.hallwayJoins),
    [
      [0, 2],
      [1, 3],
    ],
  );
  assert.deepEqual(repair("M-R"), []);
});
