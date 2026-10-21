import test from "node:test";
import assert from "node:assert/strict";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import { nativeAccessZoneBinding } from "../../app/indoor-project/native-access-zones";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import { NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION } from "../../app/indoor-project/native-rational-overlay";
import {
  hydratePublishedAccessZones,
  type PublishedAccessZoneBinding,
} from "../../app/indoor-project/published-routing-hydration";
function fixture(publicMember = false) {
  const data = progressiveRoutingFixture();
  for (const r of data.records) r.access = "staff";
  if (publicMember) data.records[0].access = "public";
  const level = data.records[0].levelId,
    z = data.records[0].elevationFeet;
  data.nativeLevels = [{ id: level, elevationFeet: z, name: "synthetic" }];
  const zone = {
    id: "original-restriction",
    levelId: level,
    elevationFeet: z,
    access: "staff" as const,
    memberRoomKeys: data.records.map((r) => r.key),
    partsFeet: [
      [
        [
          [0, 0],
          [30, 0],
          [30, 10],
          [0, 10],
        ],
      ],
    ] as [number, number][][][],
    decision: {
      source: "synthetic",
      id: "review",
      summary: "Synthetic restriction, no campus approval",
    },
  };
  data.nativeAccessZones = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    zones: [zone, { ...zone, id: "overlapping-refusal" }],
  };
  const original = nativeAccessZoneBinding(data),
    binding = {
      sourceModelSha256: data.source.modelSha256,
      sourceGeometryKey: "synthetic-exact-source",
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    value: PublishedAccessZoneBinding = {
      zoneIds: original.zones.map((v) => v.zone.id),
      issues: original.issues,
      topology: encodeNativeExactTopology(
        binding,
        original.zones.map((v) => ({ id: v.zone.id, parts: v.parts })),
      ),
    };
  return { data, original, binding, value };
}
const wire = (v: ReturnType<typeof nativeAccessZoneBinding>) => ({
  issues: v.issues,
  zones: v.zones.map(({ zone, parts }) => ({
    zone,
    parts: parts.map((p) =>
      p.map((r) => r.map((v) => v.map((q) => [String(q.n), String(q.d)]))),
    ),
  })),
});
test("normal accepted restrictions and overlap/public refusals restore exactly with original source owners", () => {
  for (const publicMember of [false, true]) {
    const { data, original, binding, value } = fixture(publicMember),
      before = JSON.stringify(data),
      restored = hydratePublishedAccessZones(data, value, binding);
    assert.equal(original.zones.length, publicMember ? 0 : 1);
    assert(original.issues.length > 0);
    assert.deepEqual(wire(restored), wire(original));
    if (restored.zones.length > 0)
      assert.equal(restored.zones[0].zone, data.nativeAccessZones!.zones[0]);
    assert.equal(JSON.stringify(data), before);
  }
});
test("changed source binding, foreign/duplicate owners and missing/extraneous zone geometry refuse", () => {
  const { data, binding, value } = fixture(),
    clone = () => structuredClone(value);
  let bad = clone();
  bad.topology.sourceGeometryKey = "foreign";
  assert.throws(
    () => hydratePublishedAccessZones(data, bad, binding),
    /binding/,
  );
  bad = clone();
  bad.zoneIds = ["foreign"];
  assert.throws(
    () => hydratePublishedAccessZones(data, bad, binding),
    /source/,
  );
  bad = clone();
  bad.zoneIds.push(bad.zoneIds[0]);
  assert.throws(
    () => hydratePublishedAccessZones(data, bad, binding),
    /binding/,
  );
  bad = clone();
  bad.topology.faces = [];
  assert.throws(
    () => hydratePublishedAccessZones(data, bad, binding),
    /source/,
  );
  bad = clone();
  bad.zoneIds = [];
  assert.throws(
    () => hydratePublishedAccessZones(data, bad, binding),
    /Unlisted/,
  );
});
