import assert from "node:assert/strict";
import test from "node:test";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import {
  nativeAccessZoneBinding,
  nativeAccessZonesAt,
  type NativeAccessZones,
} from "../../app/indoor-project/native-access-zones";
import {
  nativeRoutingAccessZoneBinding,
  nativeRoutingAccessZonesAt,
} from "../../app/indoor-project/native-routing-access-zones";
import {
  createImmutableRoutingSession,
  withRoutingCalculation,
} from "../../app/indoor-project/routing-cache";

type P = [number, number];
const rect = (a: number, b: number, c: number, d: number): P[] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
// Synthetic multi-plane access fixture, never source approval for UNBC.
function fixture() {
  const model = "a".repeat(64);
  const records: IndoorRecord[] = [];
  const zones: NativeAccessZones = {
    version: 1,
    sourceModelSha256: model,
    zones: [],
  };
  const record = (
    key: string,
    z: number,
    ringsFeet: P[][],
    access: IndoorRecord["access"] = "staff",
  ): IndoorRecord => ({
    key,
    number: key,
    name: key,
    building: "synthetic",
    levelId: z + 1,
    elevationFeet: z * 10,
    elevationEvidence: "synthetic",
    surfaceId: "synthetic",
    circulation: false,
    stair: false,
    access,
    walkable: true,
    confidence: 1,
    ringsFeet,
    properties: {},
  });
  for (let z = 0; z < 8; z++) {
    records.push(
      record(`a${z}`, z, [rect(0, 0, 4, 4)], z === 5 ? "public" : "staff"),
      record(`b${z}`, z, [rect(4, 0, 8, 4)]),
    );
    zones.zones.push({
      id: `z${z}`,
      levelId: z + 1,
      elevationFeet: z * 10,
      access: "staff",
      memberRoomKeys: [`a${z}`, `b${z}`],
      partsFeet: [[rect(0, 0, 8, 4)]],
      decision: {
        source: "synthetic",
        id: `review${z}`,
        summary: "Synthetic checked staff zone",
      },
    });
  }
  records.push(record("unlisted", 3, [rect(1, 1, 2, 2)]));
  const data = {
    source: { modelSha256: model },
    nativeLevels: Array.from({ length: 8 }, (_, z) => ({
      id: z + 1,
      elevationFeet: z * 10,
    })),
    records,
    nativeAccessZones: zones,
  } as unknown as IndoorDataset;
  return data;
}

test("one complete access binding serves eight planes without changing positive or refused zones", () => {
  for (const privateWorker of [false, true]) {
    const data = fixture();
    const original = JSON.stringify(data);
    const expected = Array.from({ length: 8 }, (_, z) =>
      nativeAccessZonesAt(data, z * 10),
    );
    const expectedIssues = nativeAccessZoneBinding(data).issues;
    assert.deepEqual(
      expected.map((z) => z.map((v) => v.zone.id)),
      [["z0"], ["z1"], ["z2"], [], ["z4"], [], ["z6"], ["z7"]],
    );
    const value = data.nativeAccessZones;
    let reads = 0;
    Object.defineProperty(data, "nativeAccessZones", {
      enumerable: true,
      configurable: true,
      get() {
        reads++;
        return value;
      },
    });
    const run = createImmutableRoutingSession(data);
    const query = (z: number) => nativeRoutingAccessZonesAt(data, z * 10);
    if (privateWorker) {
      for (let z = 0; z < 8; z++)
        assert.deepEqual(
          run(() => query(z)),
          expected[z],
        );
      assert.deepEqual(
        run(() => nativeRoutingAccessZoneBinding(data).issues),
        expectedIssues,
      );
    } else {
      withRoutingCalculation(data, () => {
        for (let z = 0; z < 8; z++) assert.deepEqual(query(z), expected[z]);
        assert.deepEqual(
          nativeRoutingAccessZoneBinding(data).issues,
          expectedIssues,
        );
      });
    }
    assert.equal(
      reads,
      1,
      "All original zone/member overlays are checked once, rather than once per plane",
    );
    assert.equal(
      JSON.stringify(data),
      original,
      "Binding never changes source records, zones or geometry",
    );
  }
});

test("later authoring operations recheck changed permissions, membership, geometry and model binding", () => {
  const data = fixture();
  const query = () =>
    withRoutingCalculation(data, () => nativeRoutingAccessZonesAt(data, 0));
  assert.equal(query().length, 1);
  data.records[0].access = "public";
  assert.equal(
    query().length,
    0,
    "A newly reviewed public member cannot stay in a cached staff zone",
  );
  data.records[0].access = "staff";
  assert.equal(query().length, 1);
  data.nativeAccessZones!.zones[0].memberRoomKeys = ["a0"];
  assert.equal(
    query().length,
    0,
    "A now-unlisted original member revokes the zone",
  );
  data.nativeAccessZones!.zones[0].memberRoomKeys = ["a0", "b0"];
  data.nativeAccessZones!.zones[0].partsFeet = [[rect(20, 0, 28, 4)]];
  assert.equal(
    query().length,
    0,
    "Changed exact zone geometry must still contain its members",
  );
  data.nativeAccessZones!.zones[0].partsFeet = [[rect(0, 0, 8, 4)]];
  assert.equal(query().length, 1);
  data.source.modelSha256 = "b".repeat(64);
  assert.equal(
    query().length,
    0,
    "A changed original model cannot reuse the old zone binding",
  );
});

test("calls outside a calculation never reuse mutable dataset identity", () => {
  const data = fixture();
  assert.equal(nativeRoutingAccessZonesAt(data, 0).length, 1);
  data.records[0].access = "public";
  assert.equal(nativeRoutingAccessZonesAt(data, 0).length, 0);
  data.records[0].access = "staff";
  data.nativeAccessZones!.zones[0].memberRoomKeys = [];
  assert.equal(
    nativeRoutingAccessZonesAt(data, 0).length,
    0,
    "Malformed descriptors retain the original fail-closed result",
  );
});
