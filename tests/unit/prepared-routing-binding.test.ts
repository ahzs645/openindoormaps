import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { prepareRouting } from "../../app/indoor-project/prepare-routing";
import { preparedRoutingKey, preparedWalkingGuides } from "../../app/indoor-project/prepared-routing";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { routingSnapshot, withRoutingCalculation } from "../../app/indoor-project/routing-cache";
const fixture = (): IndoorDataset =>
  JSON.parse(readFileSync(new URL("../fixtures/prepared-walking-corridor.json", import.meta.url), "utf8"));
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const key = (d: IndoorDataset) => withRoutingCalculation(d, () => preparedRoutingKey(d));
/** The pre-patch binding, kept here only to demonstrate the regression it caused. */
const legacyKey = (d: IndoorDataset) => withRoutingCalculation(d, () =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([routingSnapshot(d), d.walls, d.alignment, d.nodes])))));
const withSupport = (d: IndoorDataset) => {
  d.walkingSupport = { version: 1, sourceModelSha256: d.source.modelSha256, floors: [{ nativeElementId: 123, elevationFeet: 0, ringsFeet: [rect(-1, -1, 22, 32)] }] };
  return d;
};
/** Adds exactly the fields that the worker/viewer redact, as authored masters carry them. */
function withRenderAndAuthoringFields(d: IndoorDataset): IndoorDataset {
  const m = structuredClone(d) as IndoorDataset & Record<string, unknown>;
  m.nativePhysicalLevels = { version: 1, sourceModelSha256: m.source.modelSha256, levels: [], displayAliases: [] } as never;
  m.indoorExclusions = { version: 1, sourceModelSha256: m.source.modelSha256, areas: [{ id: "x", levelId: m.records[0]!.levelId, elevationFeet: 0, reason: "off-limits", label: "lip", nativeFloorIds: [123], partsFeet: [[rect(40, 40, 1, 1)]], notes: "authoring note" }] } as never;
  m.stairDisplay = { version: 1, generator: "t", sourceModelSha256: m.source.modelSha256, flights: [{ id: "render" }], sourceFlights: [{ stairElementId: 9, historicalPreparedTreads: [{ old: true }] }] } as never;
  m.circulationGeometry = { version: 1, sourceModelSha256: m.source.modelSha256, sourceGeometryKey: "k", preparedRoomKeys: [], reviewSurfaces: [], fixtures: [],
    displayResidualTopology: { faces: [] }, cells: [{ id: "c", exactFaceId: "f", levelIds: [1], elevationFeet: 0, roomKeys: [], nativeFloorIds: [123], ringsFeet: [rect(0, 0, 1, 1)], sourceCoverage: 1, containedDisplay: { partsFeet: [] } }] } as never;
  return m;
}
const viewerRedaction = (m: IndoorDataset) => {
  const v = structuredClone(m) as IndoorDataset;
  for (const a of v.indoorExclusions?.areas ?? []) delete (a as { notes?: string }).notes;
  for (const f of v.stairDisplay?.sourceFlights ?? []) delete (f as { historicalPreparedTreads?: unknown }).historicalPreparedTreads;
  return v;
};
test("prepared guides keep binding through route-worker and viewer redactions", async () => {
  const master = (await prepareRouting(withSupport(fixture()))).dataset;
  const guides = preparedWalkingGuides(master).size;
  assert.ok(guides > 0);
  for (const v of [routeWorkerDataset(master), viewerRedaction(master)]) {
    assert.equal(key(v), key(master));
    assert.equal(preparedWalkingGuides(v).size, guides);
  }
});
test("render-only and authoring-note redactions no longer change the binding (legacy key did)", () => {
  const master = withRenderAndAuthoringFields(withSupport(fixture()));
  const worker = routeWorkerDataset(master), viewer = viewerRedaction(master);
  assert.notEqual(legacyKey(worker), legacyKey(master), "regression reproduced: worker strips containedDisplay");
  assert.notEqual(legacyKey(viewer), legacyKey(master), "regression reproduced: viewer strips notes/historical treads");
  assert.equal(key(worker), key(master));
  assert.equal(key(viewer), key(master));
  assert.equal(key(routeWorkerDataset(viewer)), key(master), "projection is idempotent");
});
test("every physical and permission input still invalidates the binding", () => {
  const master = withRenderAndAuthoringFields(withSupport(fixture()));
  const k = key(master);
  const variants: [string, (d: IndoorDataset) => void][] = [
    ["room access", (d) => { d.records[0]!.access = "staff"; }],
    ["door/edge enablement", (d) => { d.edges[0]!.enabled = !d.edges[0]!.enabled; }],
    ["node coordinate", (d) => { d.nodes[0]!.pointFeet = [d.nodes[0]!.pointFeet[0] + 1e-6, d.nodes[0]!.pointFeet[1], d.nodes[0]!.pointFeet[2]]; }],
    ["exclusion footprint", (d) => { d.indoorExclusions!.areas[0]!.partsFeet = [[rect(41, 40, 1, 1)]]; }],
    ["exclusion reason", (d) => { (d.indoorExclusions!.areas[0] as { reason: string }).reason = "outdoors"; }],
    ["walking support", (d) => { d.walkingSupport!.floors[0]!.ringsFeet = [rect(-1, -1, 22, 31)]; }],
    ["exact circulation cell", (d) => { d.circulationGeometry!.cells[0]!.roomKeys = ["x"]; }],
    ["stair source flight", (d) => { (d.stairDisplay!.sourceFlights![0] as { stairElementId: number }).stairElementId = 10; }],
    ["wall", (d) => { d.walls = [...d.walls, { ...d.walls[0]!, nativeElementId: 987654 }]; }],
  ];
  for (const [name, edit] of variants) {
    const d = structuredClone(master) as IndoorDataset; edit(d);
    assert.notEqual(key(d), k, name);
  }
});
