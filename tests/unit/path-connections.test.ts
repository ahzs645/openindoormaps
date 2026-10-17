import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { pathConnections } from "../../app/indoor-project/path-connections";
function fixture() {
  const d = JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  ) as IndoorDataset;
  const record = d.records[0],
    node = d.nodes[0],
    edge = d.edges[0];
  d.records = [1, 2].map((i) => ({
    ...record,
    key: `r${i}`,
    building: `0${i}`,
    levelId: i,
    walkable: true,
    circulation: true,
    access: "public",
  }));
  d.nodes = d.records.map((r, i) => ({
    ...node,
    id: `n${i}`,
    roomKey: r.key,
    building: r.building,
    levelId: r.levelId,
    pointFeet: [10, 10, i * 10],
  }));
  d.floors = [
    { id: "1", name: "Floor 1", levelIds: [1] },
    { id: "2", name: "Floor 2", levelIds: [2] },
  ] as IndoorDataset["floors"];
  d.edges = [
    {
      ...edge,
      id: "lift",
      from: "n0",
      to: "n1",
      enabled: true,
      kind: "elevator",
      direction: "from-to",
      pointsFeet: d.nodes.map((n) => n.pointFeet),
      roomKeys: d.records.map((r) => r.key),
    },
  ];
  return d;
}
test("zero-XY lift retains floor-specific stop and original direction without drawing an invented line", () => {
  const d = fixture(),
    before = JSON.stringify(d),
    view = pathConnections(d, [1], "01");
  assert.equal(view.features.length, 1);
  assert.equal(view.features[0].geometry.type, "Point");
  assert.equal(view.features[0].properties?.label, "Lift · Floor 2");
  assert.equal(JSON.stringify(d), before);
  assert.equal(pathConnections(d, [3], "all").features.length, 0);
});
test("ramps, held stairs and building links retain source geometry; disabled stairs never become enabled", () => {
  const d = fixture();
  d.edges[0].kind = "ramp";
  d.edges[0].pointsFeet = [
    [10, 10, 0],
    [12, 11, 5],
    [10, 10, 10],
  ];
  let view = pathConnections(d, [1], "all");
  assert.equal(view.features[0].geometry.type, "LineString");
  assert.equal(view.features[0].properties?.direction, "from-to");
  assert.equal(view.features[0].properties?.role, "transition");
  d.edges[0].kind = "stairs";
  d.edges[0].enabled = false;
  view = pathConnections(d, [1, 2], "all");
  assert.ok(
    view.features.every(
      (f) => f.properties?.role === "held" && f.properties.enabled === false,
    ),
  );
  assert.equal(d.edges[0].enabled, false);
  d.edges[0].kind = "opening";
  d.edges[0].enabled = true;
  assert.equal(
    pathConnections(d, [1], "all").features[0].properties?.role,
    "transition",
  );
});
test("nonwalkable/staff owners and disabled non-stair links stay out of source inspection", () => {
  const d = fixture();
  d.records[0].access = "staff";
  assert.equal(pathConnections(d, [1], "all").features.length, 0);
  d.records[0].access = "public";
  d.records[1].walkable = false;
  assert.equal(pathConnections(d, [1], "all").features.length, 0);
  d.records[1].walkable = true;
  d.edges[0].enabled = false;
  assert.equal(pathConnections(d, [1], "all").features.length, 0);
});
