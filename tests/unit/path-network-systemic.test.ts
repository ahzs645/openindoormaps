import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { hallwayPathView } from "../../app/indoor-project/hallway-path-view";
import { pathConnections } from "../../app/indoor-project/path-connections";
import { pathNetworkCoverage } from "../../app/indoor-project/path-network-coverage";
import {
  uniquePathDisplaySegments,
  type PathDisplaySegment,
} from "../../app/indoor-project/path-display-segments";
const segment = (
  id: string,
  a: [number, number, number],
  b: [number, number, number],
  scope = "cell",
): PathDisplaySegment => ({
  edgeId: id,
  edgeIds: [id],
  scope,
  pointsFeet: [a, b],
  role: "hallway",
  source: "shared-guide",
});
test("partial overlapping lines draw their union once and retain both edge identities", () => {
  const input = [
    segment("a", [0, 0, 0], [10, 0, 0]),
    segment("b", [5, 0, 0], [15, 0, 0]),
  ];
  const before = JSON.stringify(input),
    result = uniquePathDisplaySegments(input);
  assert.equal(
    result.reduce(
      (n, s) =>
        n +
        Math.hypot(
          s.pointsFeet[1][0] - s.pointsFeet[0][0],
          s.pointsFeet[1][1] - s.pointsFeet[0][1],
        ),
      0,
    ),
    15,
  );
  assert.ok(
    result.some((s) => s.edgeIds.includes("a") && s.edgeIds.includes("b")),
  );
  assert.equal(JSON.stringify(input), before);
});
test("a shared original endpoint permits ulp cleanup; nearby parallel paths, crossings, cells and floors stay separate", () => {
  assert.equal(
    uniquePathDisplaySegments([
      segment("a", [0, 0, 0], [20, 20, 0]),
      segment("b", [10, 10 + 1e-14, 0], [20, 20, 0]),
    ]).length,
    1,
  );
  const inputs = [
    segment("a", [0, 0, 0], [20, 20, 0]),
    segment("parallel", [0, 1e-12, 0], [20, 20 + 1e-12, 0]),
    segment("cross", [0, 20, 0], [20, 0, 0]),
    segment("cell", [0, 0, 0], [20, 20, 0], "other-cell"),
    segment("floor", [0, 0, 10], [20, 20, 10]),
  ];
  assert.equal(uniquePathDisplaySegments(inputs).length, inputs.length);
});
test("trunks take precedence over coincident room-door ink without erasing provenance", () => {
  const trunk = segment("trunk", [0, 0, 0], [10, 0, 0]),
    spur = {
      ...segment("door", [2, 0, 0], [8, 0, 0]),
      role: "approach" as const,
    };
  const result = uniquePathDisplaySegments([spur, trunk]);
  assert.equal(result.length, 1);
  assert.equal(result[0].role, "hallway");
  assert.ok(result[0].edgeIds.includes("door"));
});

test("interval trimming retains original connected-network provenance for later partial overlaps", () => {
  const input = [
    segment("a", [0, 0, 0], [10, 10, 0]),
    segment("b", [5, 5 + 1e-14, 0], [10, 10, 0]),
    segment("c", [5, 5 + 1e-14, 0], [15, 15, 0]),
  ];
  const result = uniquePathDisplaySegments(input);
  const total = result.reduce(
    (n, s) =>
      n +
      Math.hypot(
        s.pointsFeet[1][0] - s.pointsFeet[0][0],
        s.pointsFeet[1][1] - s.pointsFeet[0][1],
      ),
    0,
  );
  assert.ok(Math.abs(total - Math.hypot(15, 15)) < 1e-11);
});

test("hidden spur removal retains the original edge identity without joining independent parallel paths", () => {
  const a = segment("saved", [0, 0, 0], [10, 10, 0]);
  const b = segment("saved", [5, 5 + 1e-14, 0], [15, 15, 0]);
  const result = uniquePathDisplaySegments([a, b]);
  const total = result.reduce(
    (n, s) =>
      n +
      Math.hypot(
        s.pointsFeet[1][0] - s.pointsFeet[0][0],
        s.pointsFeet[1][1] - s.pointsFeet[0][1],
      ),
    0,
  );
  assert.ok(Math.abs(total - Math.hypot(15, 15)) < 1e-11);
  const independent = { ...b, edgeId: "other", edgeIds: ["other"] };
  assert.equal(uniquePathDisplaySegments([a, independent]).length, 2);
});

test("the broad phase cannot hide near-vertical roundoff overlaps from the provenance check", () => {
  const input = [
    segment("saved", [1, 0, 0], [1, 10, 0]),
    segment("saved", [1 + 1e-15, 5, 0], [1 + 1e-15, 15, 0]),
  ];
  const result = uniquePathDisplaySegments(input);
  assert.equal(
    result.reduce(
      (n, s) => n + Math.abs(s.pointsFeet[1][1] - s.pointsFeet[0][1]),
      0,
    ),
    15,
  );
  assert.equal(
    uniquePathDisplaySegments([
      input[0],
      { ...input[1], edgeId: "other", edgeIds: ["other"] },
    ]).length,
    2,
  );
});
function fixture() {
  const d = JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  ) as IndoorDataset;
  const room = d.records[0],
    node = d.nodes[0],
    edge = d.edges[0];
  d.records = [];
  d.nodes = [];
  d.edges = [];
  d.floors = [];
  delete (d as IndoorDataset & { preparedRouting?: unknown }).preparedRouting;
  for (let level = 1; level <= 4; level++) {
    d.floors.push({
      id: `floor${level}`,
      name: `Floor ${level}`,
      levelIds: [level],
    } as IndoorDataset["floors"][number]);
    for (const [kind, x, y] of [
      ["hall", 0, 0],
      ["stair", 10, 0],
      ["ramp", 0, 10],
    ] as const) {
      const key = `${kind}${level}`;
      d.records.push({
        ...room,
        key,
        number: key,
        name: kind,
        arrivalNodeId: kind === "hall" ? key : undefined,
        levelId: level,
        elevationFeet: level * 10,
        building: "01",
        walkable: true,
        access: "public",
        circulation: kind === "hall",
        stair: kind === "stair",
        properties: kind === "ramp" ? { generatedLanding: true } : {},
      });
      d.nodes.push({
        ...node,
        id: key,
        roomKey: key,
        levelId: level,
        building: "01",
        pointFeet: [x, y, level * 10],
        kind: kind === "hall" ? "arrival" : "connector",
      });
    }
    for (const kind of ["stair", "ramp"]) {
      const a = d.nodes.find((n) => n.id === `hall${level}`)!,
        b = d.nodes.find((n) => n.id === `${kind}${level}`)!;
      d.edges.push({
        ...edge,
        id: `walk-${kind}${level}`,
        nativeCellId: `cell${level}`,
        from: a.id,
        to: b.id,
        kind: "walk",
        enabled: true,
        pointsFeet: [a.pointFeet, b.pointFeet],
        roomKeys: [a.roomKey, b.roomKey],
      });
    }
  }
  for (const [kind, from, to, enabled] of [
    ["stairs", "stair1", "stair2", true],
    ["ramp", "ramp2", "ramp3", true],
    ["stairs", "stair3", "stair4", false],
  ] as const) {
    const a = d.nodes.find((n) => n.id === from)!,
      b = d.nodes.find((n) => n.id === to)!;
    d.edges.push({
      ...edge,
      id: `${kind}:${from}`,
      kind,
      from,
      to,
      enabled,
      roomKeys: [a.roomKey, b.roomKey],
      pointsFeet: [a.pointFeet, b.pointFeet],
    });
  }
  return d;
}
test("every defined floor includes original lateral approaches to stair and ramp landings; held stairs remain held", () => {
  const d = fixture(),
    before = JSON.stringify(d);
  for (let floor = 1; floor <= 4; floor++) {
    const paths = hallwayPathView(d, [floor], "all");
    assert.equal(paths.features.length, 2);
    assert.ok(
      paths.features.every(
        (f) =>
          f.properties?.role === "fallback" &&
          f.properties.source === "saved-walk",
      ),
    );
    const report = pathNetworkCoverage(d, [floor], "all");
    for (const s of report.stops.filter((s) => !s.held))
      assert.equal(s.status, "saved-approach");
  }
  const held = pathNetworkCoverage(d, [3, 4], "all").stops.filter(
    (s) => s.held,
  );
  assert.equal(held.length, 2);
  assert.ok(held.every((s) => s.status === "held"));
  assert.equal(JSON.stringify(d), before);
});
test("a missing landing approach is detected in its own floor and cannot borrow another floor or vertical edge", () => {
  const d = fixture();
  d.edges = d.edges.filter((e) => e.id !== "walk-stair2");
  const report = pathNetworkCoverage(d, [2], "all");
  assert.equal(
    report.stops.find((s) => s.nodeId === "stair2")?.status,
    "missing-walking-approach",
  );
  assert.equal(
    pathNetworkCoverage(d, [1], "all").stops.find((s) => s.nodeId === "stair1")
      ?.status,
    "saved-approach",
  );
});
test("direction, staff restrictions and ordinary-room requirements are retained in the common approach audit", () => {
  const d = fixture();
  d.edges.find((e) => e.id === "walk-stair1")!.direction = "from-to";
  assert.equal(
    pathNetworkCoverage(d, [1], "all").stops.find((s) => s.nodeId === "stair1")
      ?.status,
    "one-way-approach",
  );
  d.records.find((r) => r.key === "hall1")!.access = "staff";
  assert.equal(hallwayPathView(d, [1], "all").features.length, 0);
});
test("a displayed cross-building walking edge is not drawn twice as a separate connection", () => {
  const d = fixture();
  d.nodes.find((n) => n.id === "ramp1")!.building = "02";
  d.records.find((r) => r.key === "ramp1")!.building = "02";
  assert.ok(
    pathConnections(d, [1], "all").features.some(
      (f) => f.properties?.edgeId === "walk-ramp1",
    ),
  );
  assert.ok(
    !pathConnections(d, [1], "all", new Set(["walk-ramp1"])).features.some(
      (f) => f.properties?.edgeId === "walk-ramp1",
    ),
  );
});

test("a missing doorway-side approach cannot borrow a walking edge through that same doorway", () => {
  const d = fixture(),
    a = d.nodes.find((n) => n.id === "hall1")!,
    b = d.nodes.find((n) => n.id === "stair1")!;
  const door = {
    ...d.edges[0],
    id: "threshold",
    kind: "door" as const,
    from: a.id,
    to: b.id,
    pointsFeet: [a.pointFeet, b.pointFeet],
    roomKeys: [a.roomKey, b.roomKey],
  };
  d.edges = d.edges.filter((e) => e.id !== "walk-stair1");
  d.edges.push(door);
  const report = pathNetworkCoverage(d, [1], "all");
  assert.equal(
    report.stops.find((s) => s.nodeId === b.id && !s.held)?.status,
    "missing-walking-approach",
  );
  assert.equal(
    report.stops.find((s) => s.nodeId === a.id && !s.held)?.status,
    "saved-approach",
  );
});
