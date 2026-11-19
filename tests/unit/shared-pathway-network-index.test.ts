import test from "node:test";
import assert from "node:assert/strict";
import { indexCellGuides } from "../../scripts/indoor/shared-pathway-network-index";
import type { IndoorEdge } from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";

type Point = [number, number, number];
function walk(id: string, pointsFeet: Point[], joins: [number, number]) {
  const edge = {
    id,
    from: id + "-start",
    to: id + "-end",
    direction: "from-to",
    accessible: "unknown",
    roomKeys: [id],
  } as IndoorEdge;
  const guide: PreparedRouting["guides"][number] = {
    edgeId: id,
    kind: "shared-corridor",
    pointsFeet,
    hallwayJoins: joins,
  };
  return { edge, guide };
}
test("overlapping opposite walks share the same stored pieces and retain separate directed source chains", () => {
  const p = (x: number, y = 0): Point => [x, y, 3];
  const rows = [
    walk("whole", [p(0), p(2), p(8), p(10)], [1, 2]),
    walk("part", [p(7), p(4), p(2)], [0, 2]),
    walk("near", [p(2, 1e-9), p(8, 1e-9)], [0, 1]),
  ];
  const n = indexCellGuides("cell", rows);
  const [a, b, c] = n.walks;
  const core = a.chain.slice(...(a.hallwayRange as [number, number]));
  assert.deepEqual(
    b.chain,
    core
      .slice(0, 2)
      .reverse()
      .map((id) => -id),
  );
  assert(c.chain.every((s) => !core.includes(s)));
  assert.equal(a.direction, "from-to");
  assert.equal(a.from, "whole-start");
  assert.equal(b.to, "part-end");
});
