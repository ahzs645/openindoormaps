import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorEdge } from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
import { sampledCorridorRun } from "../../app/indoor-project/sampled-corridor-run";

type XY = [number, number];
type Guide = PreparedRouting["guides"][number];
const walk = (id: string, from: string, to: string, points: XY[]) =>
  ({
    id,
    from,
    to,
    pointsFeet: points.map(([x, y]) => [x, y, 0]),
    nativeCellId: "cell",
    enabled: true,
    kind: "walk",
  }) as IndoorEdge;
const source = walk("edge", "door", "arrival", [
    [0, 0],
    [10, 0],
  ]),
  continuation = walk("next", "arrival", "third", [
    [10, 0],
    [20, 0],
  ]);
const existing: Guide = {
  edgeId: "next",
  kind: "shared-corridor",
  pointsFeet: [
    [10, 0, 0],
    [9, 0, 0],
    [9, 1, 0],
    [19, 1, 0],
    [20, 0, 0],
  ],
  hallwayJoins: [1, 3],
};
const sample: [XY[], XY[]] = [
  [
    [0, 0],
    [1, 1],
  ],
  [
    [10, 0],
    [9, 0.5],
  ],
];
test("a sampled gap keeps the existing arrival approach and both original source endpoints", () => {
  let n = 0;
  const g = sampledCorridorRun(
    source,
    [existing],
    new Map([[continuation.id, continuation]]),
    sample,
    (e, candidate) => {
      n++;
      assert.equal(e, source);
      return candidate.pointsFeet.length === 4;
    },
  );
  assert.deepEqual(g?.pointsFeet, [
    [0, 0, 0],
    [1, 1, 0],
    [9, 0, 0],
    [10, 0, 0],
  ]);
  assert.deepEqual(g?.hallwayJoins, [1, 2]);
  assert.equal(n, 1);
});
test("unchecked strips, moved terminals, ambiguous directory stops and new crossings stay refused", () => {
  const other = walk("other", "a", "b", [
    [5, -2],
    [5, 2],
  ]);
  const crossing: Guide = {
    edgeId: "other",
    pointsFeet: other.pointsFeet,
    hallwayJoins: [0, 1],
    kind: "shared-corridor",
  };
  const es = new Map([
    [continuation.id, continuation],
    [other.id, other],
  ]);
  assert.ok(!sampledCorridorRun(source, [existing], es, sample, () => false));
  assert.ok(
    !sampledCorridorRun(source, [existing, crossing], es, sample, () => true),
  );
  assert.ok(
    !sampledCorridorRun(
      source,
      [],
      es,
      [
        [
          [1, 0],
          [1, 1],
        ],
        sample[1],
      ],
      () => true,
    ),
  );
  const alt: Guide = {
    ...existing,
    pointsFeet: [
      [10, 0, 0],
      [8.5, 1, 0],
      [9, 1, 0],
      [19, 1, 0],
      [20, 0, 0],
    ],
  };
  assert.ok(
    !sampledCorridorRun(source, [existing, alt], es, sample, () => true),
  );
});
