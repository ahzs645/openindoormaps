import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  captureOriginalSteppedStairGraphDemand,
  inspectOriginalSteppedStairGraphDemand,
  assertOriginalSteppedStairGraphDemandPreserved,
  describeOriginalSteppedTerminalRequests,
  type OriginalSteppedStairGraphDemand,
} from "../../scripts/indoor/proposals/original-stepped-stair-graph-demand.ts";

const bytes = readFileSync(new URL("../fixtures/unbc-1696006-original-held-graph-demand.json", import.meta.url));
const fixture = JSON.parse(bytes.toString("utf8"));
const checksum = createHash("sha256").update(bytes).digest("hex");
const model = fixture.source.modelSha256;
const edgeId = fixture.edges[0].id;
const demand = () => captureOriginalSteppedStairGraphDemand(bytes, checksum, model, edgeId);

test("captures exact old graph nodes as an identity-only demand, detached from caller edits", () => {
  const handle = demand();
  const value = inspectOriginalSteppedStairGraphDemand(handle);
  assert.equal(handle.scope, "original-graph-identity-only");
  assert.equal(value.routeApproved, false);
  assert.deepEqual(value.terminals[0]!.node.pointFeet,
    [2.327728994970098, -320.89781591346036, 24.278215223097114]);
  assert.deepEqual(value.terminals[1]!.node.pointFeet,
    [1.578773765958708, -320.9697773842104, 34.120734908136484]);
  value.terminals[0]!.node.pointFeet[0] = 900;
  assertOriginalSteppedStairGraphDemandPreserved(handle, structuredClone(fixture));
  assert.equal(fixture.edges[0].enabled, false);
});

test("checksum or expected-model mismatch refuses before a demand is captured", () => {
  assert.throws(() => captureOriginalSteppedStairGraphDemand(bytes, "0".repeat(64), model, edgeId), /checksum/);
  assert.throws(() => captureOriginalSteppedStairGraphDemand(bytes, checksum, "0".repeat(64), edgeId), /source model/);
});

test("serialized, copied and symbol-copied handles acquire no original-node authority", () => {
  const original = demand();
  for (const forged of [JSON.parse(JSON.stringify(original)), { ...original }, structuredClone(original)]) {
    assert.throws(() => inspectOriginalSteppedStairGraphDemand(forged as OriginalSteppedStairGraphDemand), /checked-byte handle/);
  }
});

test("every original node field, exact XYZ and served level is preserved", () => {
  for (const mutate of [
    (d: typeof fixture) => { d.nodes[0].pointFeet[0] += 1e-14; },
    (d: typeof fixture) => { d.nodes[0].pointFeet[2] += 1e-14; },
    (d: typeof fixture) => { d.nodes[0].geographic[0] += 1e-8; },
    (d: typeof fixture) => { d.nodes[0].id += "-relabelled"; },
    (d: typeof fixture) => { d.nativeLevels[0].elevationFeet += 1e-14; },
    (d: typeof fixture) => { d.nodes.push(structuredClone(d.nodes[0])); },
  ]) {
    const changed = structuredClone(fixture); mutate(changed);
    assert.throws(() => assertOriginalSteppedStairGraphDemandPreserved(demand(), changed));
  }
});

test("record permissions, original endpoint ownership and edge direction remain unchanged", () => {
  for (const mutate of [
    (d: typeof fixture) => { d.records[0].access = "staff"; },
    (d: typeof fixture) => { d.records[0].walkable = !d.records[0].walkable; },
    (d: typeof fixture) => { d.edges[0].direction = "from-to"; },
    (d: typeof fixture) => { d.edges[0].accessible = "yes"; },
    (d: typeof fixture) => { d.edges[0].roomKeys = [d.edges[0].roomKeys[0]]; },
    (d: typeof fixture) => { d.edges.push(structuredClone(d.edges[0])); },
  ]) {
    const changed = structuredClone(fixture); mutate(changed);
    assert.throws(() => assertOriginalSteppedStairGraphDemandPreserved(demand(), changed));
  }
});

test("derived enabling/path changes do not become geometry approval through an identity check", () => {
  const changed = structuredClone(fixture);
  changed.edges[0].enabled = true;
  changed.edges[0].pointsFeet = [[100, 100, 100], [200, 200, 200]];
  assertOriginalSteppedStairGraphDemandPreserved(demand(), changed);
  assert.equal(inspectOriginalSteppedStairGraphDemand(demand()).routeApproved, false);
});

test("actual source-probe caps cannot be relabelled as original graph terminals", () => {
  const requested = describeOriginalSteppedTerminalRequests(demand(), [
    [0.5148043399884723, -323.3025630530456, 24.27821522309713],
    [-0.9831061180773955, -318.12343176841307, 34.120734908136484],
  ]);
  assert.equal(requested.length, 2);
  for (const cap of requested) {
    assert.equal(cap.relation, "source-supported-physical-approach-required");
    assert.equal(cap.sourceGeometryOrRouteApproved, false);
  }
});

test("distinct same-XY physical height remains an explicit binding demand, without a walking segment", () => {
  const value = inspectOriginalSteppedStairGraphDemand(demand());
  const upper = value.terminals[1]!.node.pointFeet;
  const lower = value.terminals[0]!.node.pointFeet;
  const requested = describeOriginalSteppedTerminalRequests(demand(), [
    [lower[0], lower[1], 24.27821522309713], upper,
  ]);
  assert.equal(requested[0]!.relation, "distinct-logical-to-physical-height-binding-required");
  assert.equal(requested[1]!.relation, "same-requested-point");
  assert.equal(requested[0]!.sourceGeometryOrRouteApproved, false);
});
