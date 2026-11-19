import assert from "node:assert/strict";
import test from "node:test";
import type {
  IndoorDataset,
  IndoorEdge,
  IndoorNode,
} from "../../app/indoor-project/contract";
import type {
  ProjectRoutingGraph,
  ProjectRoutingLink,
} from "../../app/indoor-project/routing-graph";
import { auditedCorridorSpans } from "../../app/indoor-project/audited-corridor-spans";

const cell = "native-cell:0.000000:71";
const from = "door:311:1763104:0",
  to = "arrival:rm-311-935a520f9690";
const id = cell + ":walk:" + to + "|" + from;
const data = {
  source: {
    modelSha256:
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
    roomsSha256:
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9",
  },
  alignment: { horizontalMetresPerFoot: 0.3048 },
} as IndoorDataset;
const node = { levelId: 311 } as IndoorNode;
const nodes = new Map([
  [from, node],
  [to, node],
]);
const edge = {
  id,
  from,
  to,
  enabled: true,
  kind: "walk",
  nativeCellId: cell,
  pointsFeet: [
    [0, 0, 0],
    [2, 2, 0],
  ],
} as IndoorEdge;
const link = {
  edge,
  to,
  requiredRooms: [],
  blockers: [],
  passages: [],
} as ProjectRoutingLink;
type Station = Parameters<typeof auditedCorridorSpans>[5];
const matched: Station = (terminal, cell, p) => ({
  vertex: JSON.stringify([terminal, cell, p]),
  admitted: () => true,
});
function build(
  links: ProjectRoutingLink[],
  station: Station = matched,
  input = data,
) {
  const graph = {
    adjacency: new Map([
      [from, links],
      [to, [{ ...link, to: from }]],
    ]),
  } as ProjectRoutingGraph;
  return auditedCorridorSpans(
    input,
    graph,
    nodes,
    new Set([id]),
    new Map(),
    station,
  );
}
test("a corridor repair preserves original direction, stations and dependencies", () => {
  const [out, back] = build([link]);
  assert.equal(out.link, link);
  assert.equal(out.sourceFrom, from);
  assert.deepEqual(out.points, [
    [-42.504_689_964_065_55, 131.543_771_522_681_5, 0],
    [-43.204_994_565_794_91, 83.763_184_994_867_17, 0],
  ]);
  assert.deepEqual(back.points, out.points.toReversed());
  assert.equal(back.to, out.from);
  assert.equal(back.from, out.to);
  assert.ok(out.metres > 14 && out.metres < 15);
  // This fixture has no original native cell and slab to verify.
  assert.equal(out.validateReviewedRun?.(), false);
  for (const l of [
    { ...link, requiredRooms: ["office"] },
    { ...link, blockers: [{ kind: "staff" }] },
    { ...link, passages: [{ edge, forward: true }] },
    { ...link, edge: { ...edge, enabled: false } },
  ] as ProjectRoutingLink[])
    assert.deepEqual(
      build([l]).map((a) => a.sourceFrom),
      [to],
    );
  assert.deepEqual(
    build([]).map((a) => a.sourceFrom),
    [to],
  );
});
test("a missing station, different model, or missing donor holds the trial", () => {
  const emptyStations = new Map<string, NonNullable<ReturnType<Station>>>();
  assert.deepEqual(
    build([link], (terminal) => emptyStations.get(terminal)),
    [],
  );
  assert.deepEqual(
    build([link], matched, {
      ...data,
      source: { ...data.source, modelSha256: "changed" },
    }),
    [],
  );
  assert.equal(
    build([link], (t, c, p) => ({
      ...matched(t, c, p, true)!,
      admitted: () => false,
    }))[0].validateReviewedRun?.(),
    false,
  );
});
test("a bent Agora span resolves the two real corridor stations in both directions", () => {
  const upper = "door:311:1751583:0",
    lower = "door:311:1752168:0";
  const id = cell + ":walk:" + upper + "|" + lower;
  const upperPoint = [-64.870_653_480_322_15, 54.882_311_018_497_58, 0];
  const lowerPoint = [-50.849_547_737_300_33, 24.893_896_881_004_3, 0];
  const sourceEdge = { ...edge, id, from: upper, to: lower };
  const graph = {
    adjacency: new Map([
      [upper, [{ ...link, edge: sourceEdge, to: lower }]],
      [lower, [{ ...link, edge: sourceEdge, to: upper }]],
    ]),
  } as ProjectRoutingGraph;
  const arcs = auditedCorridorSpans(
    data,
    graph,
    new Map([
      [upper, node],
      [lower, node],
    ]),
    new Set([id]),
    new Map(),
    (terminal, _cell, point) => {
      assert.deepEqual(point, terminal === upper ? upperPoint : lowerPoint);
      return { vertex: terminal, admitted: () => true };
    },
  );
  assert.equal(arcs.length, 2);
  assert.deepEqual(arcs[0].points, [upperPoint, [-50, 60, 0], lowerPoint]);
  assert.deepEqual(arcs[1].points, arcs[0].points.toReversed());
  assert.ok(arcs[0].metres > 15.4 && arcs[0].metres < 15.6);
});
