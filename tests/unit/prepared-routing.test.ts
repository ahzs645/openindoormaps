import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { prepareRouting } from "../../app/indoor-project/prepare-routing";
import {
  preparedWalkingGuides,
  validatePreparedRouting,
  type PreparedRouting,
} from "../../app/indoor-project/prepared-routing";
const fixture = (): IndoorDataset =>
  JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  );
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

test("prepared walking guides retain graph anchors and work in both directions", async () => {
  const d = fixture();
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 123,
        elevationFeet: 0,
        ringsFeet: [rect(-1, -1, 22, 32)],
      },
    ],
  };
  const source = JSON.stringify(d);
  const prepared = await prepareRouting(d);
  assert.equal(JSON.stringify(d), source);
  assert.deepEqual(prepared.dataset.edges, d.edges);
  assert.deepEqual(prepared.dataset.nodes, d.nodes);
  assert.ok(prepared.report.compiledWalkingEdges > 0);
  assert.equal(prepared.report.newGraphConnections, 0);
  const guides = preparedWalkingGuides(prepared.dataset);
  assert.equal(guides.size, prepared.report.compiledWalkingEdges);
  for (const [id, points] of guides) {
    const edge = d.edges.find((e) => e.id === id)!;
    assert.deepEqual(points[0], edge.pointsFeet[0]);
    assert.deepEqual(points.at(-1), edge.pointsFeet.at(-1));
  }
  for (const [from, to] of [
    ["a", "b"],
    ["b", "a"],
  ]) {
    const route = findProjectRoute(prepared.dataset, from, to)!;
    assert.ok(route.paths.some((p) => p.preparedGuideUsed));
    assert.deepEqual(
      route.edges.map((e) => e.id),
      findProjectRoute(d, from, to)!.edges.map((e) => e.id),
    );
    assert.ok(
      route.paths
        .filter((p) => p.centered)
        .every((p) => p.nativeFloorSupported),
    );
  }
  assert.ok(
    findProjectRoute(prepared.dataset, "a", "b", "accessible")!.paths.every(
      (p) => !p.preparedGuideUsed,
    ),
  );
});

test("prepared geometry is invalidated by in-place floor, wall and door reviews", async () => {
  const d = fixture();
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 123,
        elevationFeet: 0,
        ringsFeet: [rect(-1, -1, 22, 32)],
      },
    ],
  };
  const { dataset } = await prepareRouting(d);
  assert.ok(preparedWalkingGuides(dataset).size > 0);
  for (const change of [
    (copy: IndoorDataset) =>
      copy.walkingSupport!.floors[0].ringsFeet.push(
        rect(2.5, 15.013, 3, 0.007),
      ),
    (copy: IndoorDataset) => (copy.walls[0].ringsFeet[0][0][0] -= 0.5),
    (copy: IndoorDataset) => {
      copy.edges.find((e) => e.id === "door")!.enabled = false;
    },
    (copy: IndoorDataset) => {
      copy.edges[0].direction = "from-to";
    },
    (copy: IndoorDataset) => {
      copy.nodes[0].kind = "portal";
    },
    (copy: IndoorDataset) => {
      copy.records[1].access = "staff";
    },
    (copy: IndoorDataset) => {
      copy.source.modelSha256 = "new-source";
    },
  ]) {
    const copy = structuredClone(dataset);
    assert.ok(preparedWalkingGuides(copy).size > 0);
    change(copy);
    assert.equal(preparedWalkingGuides(copy).size, 0);
    const route = findProjectRoute(copy, "a", "b");
    assert.ok(!route || route.paths.every((p) => !p.preparedGuideUsed));
  }
});

test("malformed and unsafe prepared guides cannot bypass native clearance", async () => {
  const d = fixture();
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 123,
        elevationFeet: 0,
        ringsFeet: [rect(-1, -1, 22, 32)],
      },
    ],
  };
  const { dataset } = await prepareRouting(d);
  const baseline = findProjectRoute(d, "a", "b")!;
  const prepared = (
    dataset as IndoorDataset & { preparedRouting: PreparedRouting }
  ).preparedRouting;
  assert.ok(
    findProjectRoute(dataset, "a", "b")!.paths.some((p) => p.preparedGuideUsed),
  );
  // A current binding does not authorize an arbitrary guide: runtime checks
  // must still reject a branch crossing the exact physical floor boundary.
  for (const guide of prepared.guides) {
    const first = guide.pointsFeet[0],
      last = guide.pointsFeet.at(-1)!;
    guide.pointsFeet = [
      first,
      guide.edgeId === "walk-a"
        ? [8, 8.1, 0]
        : [8.1, (first[1] + last[1]) / 2, 0],
      last,
    ];
  }
  const route = findProjectRoute(dataset, "a", "b")!;
  assert.deepEqual(
    route.paths.map((p) => p.pointsFeet),
    baseline.paths.map((p) => p.pointsFeet),
  );
  assert.ok(route.paths.every((p) => !p.preparedGuideUsed));
  prepared.resolverVersion = "future-algorithm";
  assert.equal(preparedWalkingGuides(dataset).size, 0);
  prepared.guides[0].pointsFeet[0][0] = Number.NaN;
  assert.throws(() => validatePreparedRouting(dataset), /Invalid prepared/);
});

test("coincident landing anchors keep their graph link without a one-point compiled guide", async () => {
  const d = fixture();
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 123,
        elevationFeet: 0,
        ringsFeet: [rect(-1, -1, 22, 32)],
      },
    ],
  };
  const anchor = d.nodes[0];
  d.nodes.push({
    ...structuredClone(anchor),
    id: "coincident-landing",
    kind: "junction",
  });
  d.edges.push({
    ...structuredClone(d.edges[0]),
    id: "zero-walk",
    from: anchor.id,
    to: "coincident-landing",
    pointsFeet: [[...anchor.pointFeet], [...anchor.pointFeet]],
    lengthMetres: 0,
  });
  const source = JSON.stringify(d);
  const result = await prepareRouting(d, { edgeIds: new Set(["zero-walk"]) });
  assert.equal(result.report.compiledWalkingEdges, 0);
  assert.equal(result.report.fallbackWalkingEdges, 1);
  assert.equal(JSON.stringify(d), source);
  assert.deepEqual(result.dataset.edges, d.edges);
  validatePreparedRouting(result.dataset);
});
