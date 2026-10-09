import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures/native-area-project";
import {
  nativeRampHeightDatum,
  floorHeightDatum,
} from "../../app/indoor-project/relative-heights";

test("ordinary native ramp shares the physical floor datum across offset storeys", () => {
  const data = fixture();
  data.nativeLevels = [
    { id: 1, name: "Lower", elevationFeet: -3.2808398950131235 },
    { id: 2, name: "Main", elevationFeet: 0 },
    { id: 3, name: "Upper", elevationFeet: 3.2808398950131235 },
  ];
  data.nodes = [
    {
      id: "a",
      levelId: 2,
      pointFeet: [0, 0, 0],
      roomKey: "0",
      building: "01",
      surfaceId: "first",
      geographic: [-122, 53],
      kind: "connector",
    },
    {
      id: "b",
      levelId: 3,
      pointFeet: [10, 0, 3.2808398950131235],
      roomKey: "1",
      building: "01",
      surfaceId: "first",
      geographic: [-122, 53],
      kind: "connector",
    },
  ];
  data.edges = [
    {
      id: "ramp",
      from: "a",
      to: "b",
      kind: "ramp",
      enabled: true,
      accessible: "yes",
      lengthMetres: 4,
      evidence: "Synthetic display regression only",
      roomKeys: [],
      pointsFeet: [
        [0, 0, 0],
        [10, 0, 3.2808398950131235],
      ],
    },
  ];
  // This tests display alignment only; an envelope marker does not certify access.
  data.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    geometrySha256: "c".repeat(64),
    levels: [],
  };
  const before = JSON.stringify(data),
    scope = [1, 2, 3];
  assert.equal(
    nativeRampHeightDatum(data, scope, "ramp"),
    floorHeightDatum(data, scope),
  );
  assert.equal(nativeRampHeightDatum(data, scope, "ramp"), -3.2808398950131235);
  assert.equal(
    nativeRampHeightDatum(data, scope, "ramp"),
    nativeRampHeightDatum(data, scope, "ramp", false, true),
  );
  assert.equal(
    nativeRampHeightDatum(data, scope.toReversed(), "ramp"),
    -3.2808398950131235,
  );
  assert.equal(JSON.stringify(data), before);
  const datum = nativeRampHeightDatum(data, scope, "ramp");
  const tops = data.nodes.map(
    (n) => (n.pointFeet[2] - datum) * data.alignment.verticalMetresPerFoot,
  );
  assert.ok(Math.abs(tops[0] - 1) < 1e-12);
  assert.ok(Math.abs(tops[1] - 2) < 1e-12);
  delete data.nativeIndoorEnvelopes;
  assert.equal(nativeRampHeightDatum(data, scope, "ramp"), 0);
  assert.equal(
    nativeRampHeightDatum(data, scope, "missing"),
    floorHeightDatum(data, scope),
  );
});
