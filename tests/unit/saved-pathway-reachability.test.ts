import assert from "node:assert/strict";
import test from "node:test";
import type {
  IndoorDataset,
  IndoorEdge,
  IndoorNode,
} from "../../app/indoor-project/contract";
import { savedPathwayReachability } from "../../scripts/indoor/lib/saved-pathway-reachability";

const node = (id: string, levelId = 3) =>
  ({ id, levelId, pointFeet: [0, 0, levelId], roomKey: id }) as IndoorNode;
const edge = (from: string, to: string, extra: Partial<IndoorEdge> = {}) =>
  ({
    id: `${from}:${to}`,
    from,
    to,
    kind: "walk",
    enabled: true,
    ...extra,
  }) as IndoorEdge;
const data = (nodes: IndoorNode[], edges: IndoorEdge[]) =>
  ({ nodes, edges }) as Pick<IndoorDataset, "nodes" | "edges">;

test("a connected building gateway and link arrival do not prove an onward hallway connection", () => {
  const d = data(
    [
      node("building04"),
      node("threshold04"),
      node("threshold08"),
      node("link08"),
      node("hall08"),
    ],
    [
      edge("building04", "threshold04"),
      edge("threshold04", "threshold08", { kind: "door" }),
      edge("threshold08", "link08"),
    ],
  );
  assert.equal(
    savedPathwayReachability(d, "building04", "link08", [3]).connected,
    true,
  );
  assert.equal(
    savedPathwayReachability(d, "building04", "hall08", [3]).connected,
    false,
  );
  assert.equal(
    savedPathwayReachability(d, "hall08", "building04", [3]).connected,
    false,
  );
  d.edges.push(edge("link08", "hall08", { kind: "door" }));
  assert.deepEqual(
    savedPathwayReachability(d, "building04", "hall08", [3]).edgeIds,
    [
      "building04:threshold04",
      "threshold04:threshold08",
      "threshold08:link08",
      "link08:hall08",
    ],
  );
});

test("coincident XY nodes and held stairs cannot supply a missing connection", () => {
  const d = data(
    [node("a"), node("b")],
    [edge("a", "b", { kind: "stairs", enabled: false })],
  );
  assert.equal(savedPathwayReachability(d, "a", "b", [3]).connected, false);
});

test("directed source links remain directed", () => {
  const d = data(
    [node("a"), node("b")],
    [edge("a", "b", { direction: "from-to" })],
  );
  assert.equal(savedPathwayReachability(d, "a", "b", [3]).connected, true);
  assert.equal(savedPathwayReachability(d, "b", "a", [3]).connected, false);
  d.edges[0].direction = "to-from";
  assert.equal(savedPathwayReachability(d, "a", "b", [3]).connected, false);
  assert.equal(savedPathwayReachability(d, "b", "a", [3]).connected, true);
});

test("a detour through another campus floor does not certify the selected floor; native split levels are explicit", () => {
  const d = data(
    [node("a"), node("other", 2), node("b")],
    [edge("a", "other"), edge("other", "b")],
  );
  assert.equal(savedPathwayReachability(d, "a", "b", [3]).connected, false);
  assert.equal(savedPathwayReachability(d, "a", "b", [3, 2]).connected, true);
  assert.equal(
    savedPathwayReachability(d, "missing", "missing", [3]).connected,
    false,
  );
});
