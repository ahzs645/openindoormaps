import test from "node:test";
import assert from "node:assert/strict";
import {
  proposeCorridorBackbone,
  type CorridorRun,
  type CorridorTerminal,
} from "../../scripts/indoor/lib/corridor-backbone-proposal";
import {
  freezeNativeRationalParts,
  nativeRationalPathSupported,
} from "../../app/indoor-project/native-exact-planar-topology";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";

const run: CorridorRun = {
  id: "hall-centre",
  levelId: 1,
  roomKeys: ["hall"],
  pointsFeet: [
    [0, 5, 0],
    [40, 5, 0],
  ],
};
const door = (id: string, x: number, y: number): CorridorTerminal => ({
  nodeId: id,
  entranceEdgeId: `door:${id}`,
  roomKey: "hall",
  levelId: 1,
  pointFeet: [x, y, 0],
});
const rect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const exact = freezeNativeRationalParts(
  nativeRationalOverlay("union", [[rect(-1, 0, 41, 10)]]),
);
const supported = (path: number[][]) =>
  nativeRationalPathSupported(path, exact);

test("opposite doors share one centre run with perpendicular, fixed door branches", () => {
  const terminals = [door("A", 4, 1), door("B", 20, 9), door("C", 36, 1)];
  const before = JSON.stringify([run, terminals]);
  const proposal = proposeCorridorBackbone([run], terminals, supported);
  assert.equal(proposal.status, "proposal-only");
  assert.equal(proposal.graphChanged, false);
  assert.equal(proposal.runs.length, 1);
  assert.equal(proposal.unattached.length, 0);
  assert.deepEqual(
    proposal.branches.map((b) => b.pointsFeet[1]),
    [
      [4, 5, 0],
      [20, 5, 0],
      [36, 5, 0],
    ],
  );
  assert.deepEqual(
    proposal.branches.map((b) => b.pointsFeet[0]),
    terminals.map((d) => d.pointFeet),
  );
  assert.deepEqual(
    proposal.branches.map((b) => b.entranceEdgeId),
    terminals.map((d) => d.entranceEdgeId),
  );
  proposal.runs[0].pointsFeet[0][0] = 999;
  assert.equal(JSON.stringify([run, terminals]), before);
});

test("a genuine hole vetoes a centre run even with both endpoints supported", () => {
  const parts = freezeNativeRationalParts(
    nativeRationalOverlay("union", [[rect(-1, 0, 41, 10), rect(19, 4, 21, 6)]]),
  );
  assert.ok(
    nativeRationalPathSupported(
      [
        [0, 5],
        [0, 5],
      ],
      parts,
    ),
  );
  assert.ok(
    nativeRationalPathSupported(
      [
        [40, 5],
        [40, 5],
      ],
      parts,
    ),
  );
  const proposal = proposeCorridorBackbone([run], [door("A", 4, 1)], (path) =>
    nativeRationalPathSupported(path, parts),
  );
  assert.deepEqual(proposal.refusedRunIds, [run.id]);
  assert.equal(proposal.branches.length, 0);
});

test("a blocked nearest projection uses a farther supported segment around the island", () => {
  const parts = freezeNativeRationalParts(
    nativeRationalOverlay("union", [[rect(-1, 0, 41, 12), rect(18, 3, 22, 5)]]),
  );
  const candidate: CorridorRun = {
    ...run,
    pointsFeet: [
      [0, 2, 0],
      [40, 2, 0],
      [40, 10, 0],
      [0, 10, 0],
    ],
  };
  const proposal = proposeCorridorBackbone(
    [candidate],
    [door("A", 20, 6)],
    (path) => nativeRationalPathSupported(path, parts),
  );
  assert.equal(proposal.unattached.length, 0);
  assert.deepEqual(proposal.branches[0].pointsFeet, [
    [20, 6, 0],
    [20, 10, 0],
  ]);
});

test("a branch cannot cross a thin wall or use another owner, elevation or level", () => {
  const parts = freezeNativeRationalParts(
    nativeRationalOverlay("union", [
      [rect(-1, 0, 41, 10), rect(1, 2, 39, 2.001)],
    ]),
  );
  const terminals = [
    door("wall", 4, 1),
    { ...door("foreign", 4, 1), roomKey: "staff-room" },
    { ...door("floor", 4, 1), levelId: 2 },
    {
      ...door("split-height", 4, 1),
      pointFeet: [4, 1, 0.01] as [number, number, number],
    },
  ];
  const proposal = proposeCorridorBackbone([run], terminals, (path) =>
    nativeRationalPathSupported(path, parts),
  );
  assert.equal(proposal.runs.length, 1);
  assert.equal(proposal.branches.length, 0);
  assert.deepEqual(
    proposal.unattached.map((r) => r.reason),
    [
      "unsupported-door-approach",
      "no-compatible-run",
      "no-compatible-run",
      "no-compatible-run",
    ],
  );
});

test("unsupported and nonplanar runs remain refused; duplicate identities are not merged by coordinates", () => {
  assert.equal(proposeCorridorBackbone([run], [], () => false).runs.length, 0);
  assert.equal(
    proposeCorridorBackbone(
      [
        {
          ...run,
          pointsFeet: [
            [0, 5, 0],
            [40, 5, 1],
          ],
        },
      ],
      [],
      supported,
    ).runs.length,
    0,
  );
  assert.throws(
    () => proposeCorridorBackbone([run, run], [], supported),
    /Duplicate corridor run/,
  );
  const samePoint = [door("A", 4, 1), door("B", 4, 1)];
  const result = proposeCorridorBackbone([run], samePoint, supported);
  assert.equal(result.branches.length, 2);
  assert.notEqual(
    result.branches[0].entranceEdgeId,
    result.branches[1].entranceEdgeId,
  );
});
