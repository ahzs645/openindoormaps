import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorEdge } from "../../app/indoor-project/contract";
import type { PathwayArc } from "../../app/indoor-project/shared-pathway-routing";
import {
  corridorGuideLength,
  type SharedGuidePoint as Point,
} from "../../app/indoor-project/shared-corridor-guides";
import { trimSharedGuideRetraces } from "../../app/indoor-project/shared-guide-retrace";
function arc(id: string, points: Point[], cell = "a"): PathwayArc {
  const from = id + "-from",
    to = id + "-to";
  return {
    from,
    to,
    sourceFrom: from,
    sourceTo: to,
    points,
    metres: corridorGuideLength(points),
    link: {
      to,
      edge: { id, nativeCellId: cell, kind: "walk" } as IndoorEdge,
      passages: [],
      requiredRooms: [],
      blockers: [],
    },
  };
}
const yes = () => true;
test("a same-level through trip drops the exact lift spur while its own connection retains the spur", () => {
  const a: Point = [-3, 0, 0],
    b: Point = [0, 0, 0],
    c: Point = [0, 4, 0],
    d: Point = [3, 1, 0];
  const input = [arc("before", [a, b, c]), arc("after", [c, b, d])],
    before = structuredClone(input);
  const out = trimSharedGuideRetraces(input, yes, yes, 1);
  assert.equal(out.removedMetres, 8);
  assert.deepEqual(
    out.arcs.map((v) => v.points),
    [
      [a, b],
      [b, d],
    ],
  );
  assert.deepEqual(
    out.arcs.map((v) => v.link),
    input.map((v) => v.link),
  );
  assert.deepEqual(input, before);
  assert.deepEqual(
    trimSharedGuideRetraces(input.slice(0, 1), yes, yes, 1).arcs[0].points,
    [a, b, c],
  );
  const change = arc("transfer", [c, [0, 4, 9]]);
  assert.deepEqual(
    trimSharedGuideRetraces([input[0], change], (a) => a !== change, yes, 1)
      .arcs,
    [input[0], change],
  );
});
test("partially retraced segments retain the walked subsections and equal costs in reverse", () => {
  const a: Point = [0, 0, 0],
    b: Point = [1, 0, 0],
    c: Point = [2, 0, 0],
    d: Point = [5, 0, 0],
    e: Point = [4, 2, 0];
  const run = [arc("1", [a, c, d]), arc("2", [d, b]), arc("3", [b, e])];
  const result = trimSharedGuideRetraces(run, yes, yes, 1);
  assert.equal(result.removedMetres, 8);
  assert.deepEqual(
    result.arcs.map((x) => x.points),
    [[a, b], [b], [b, e]],
  );
  const reversed = trimSharedGuideRetraces(
    run.toReversed().map((x) => ({ ...x, points: x.points.toReversed() })),
    yes,
    yes,
    1,
  );
  assert.equal(reversed.removedMetres, 8);
  assert.deepEqual(
    reversed.arcs
      .flatMap((x) => x.points)
      .filter((p, i, all) => i === 0 || p !== all[i - 1]),
    [e, b, a],
  );
});
test("policy, physical passages, different cells and small real turns retain the original walk", () => {
  const p: Point = [0, 0, 0],
    q: Point = [2, 0, 0],
    r: Point = [1, 1e-12, 0];
  const x = arc("x", [p, q]),
    y = arc("y", [q, p]);
  for (const testRun of [
    trimSharedGuideRetraces([x, y], (a) => a !== y, yes, 1),
    trimSharedGuideRetraces([x, y], yes, (a) => a !== x, 1),
    trimSharedGuideRetraces([x, arc("b", [q, p], "b")], yes, yes, 1),
    trimSharedGuideRetraces([x, arc("bend", [q, r])], yes, yes, 1),
    trimSharedGuideRetraces([arc("slope", [p, [2, 0, 1], p])], yes, yes, 1),
  ])
    assert.equal(testRun.removedMetres, 0);
});
