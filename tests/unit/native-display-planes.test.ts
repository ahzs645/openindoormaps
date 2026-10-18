import assert from "node:assert/strict";
import test from "node:test";
import { publishedDefaultScopeCoverage } from "../../scripts/indoor/published-default-scope-coverage";
import { preparedDisplayOptions } from "../../app/indoor-project/prepared-display-registry";
import type { ProgressiveManifest } from "../../app/indoor-project/progressive-delivery";
import { fixture } from "../fixtures/native-area-project";
import {
  nativePhysicalDisplayPlanes,
  nativePhysicalDisplayPlaneForLevel,
  nativePhysicalDisplayPlaneLevelIds,
} from "../../app/indoor-project/native-display-planes";

function physicalProject() {
  const data = fixture();
  data.nativeLevels.push(
    { id: 2, name: "Floor 1.25", elevationFeet: 3 },
    { id: 3, name: "Floor 1.5", elevationFeet: 9 },
  );
  data.floors[0].levelIds = [1, 2, 3];
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 9,
        ringsFeet: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
        ],
      },
    ],
  };
  data.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: data.source.modelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 200,
        levelIds: [1, 3],
        buildings: [],
        floorElevationFeet: 0,
        sourceGeometry: "native-brep",
        treads: [],
      },
    ],
  };
  data.nativePhysicalLevels = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    levels: data.nativeLevels.map((level) => ({
      nativeLevelId: level.id,
      sourceName: level.name,
      elevationFeet: level.elevationFeet,
      nativeFloorElementIds: level.id === 3 ? [100] : [],
      nativeStairElementIds: level.id === 3 ? [200] : [],
      annotationLevel: level.id === 1,
    })),
    displayAliases: [
      {
        nativeLevelId: 3,
        displayFloorId: "first",
        sourceName: "Floor 1.5",
        elevationFeet: 9,
        evidence: "original-fractional-level-name",
        provisional: true,
      },
    ],
  };
  return data;
}

test("publication coverage checks the real Main floor subset and each source plane", () => {
  const data = physicalProject();
  data.nativeIndoorEnvelopes = {} as NonNullable<
    typeof data.nativeIndoorEnvelopes
  >;
  const options = preparedDisplayOptions(data, {
    relativeHeights: false,
    showPillars: true,
    showPassThroughPlaces: false,
    showVestibuleDoors: false,
    showStructures: false,
    showDoorwayRecesses: false,
    review: false,
    simplifyGeometry: false,
  });
  const scope = (id: string, levelIds: number[]) => ({
    id,
    building: "all",
    levelIds,
    display: { descriptor: { binding: { options, windowMode: "none" } } },
  });
  const manifest = {
    provenance: { source: data.source },
    scopes: [scope("combined", [1, 2, 3])],
  } as unknown as ProgressiveManifest;
  const before = publishedDefaultScopeCoverage(data, manifest);
  assert.equal(
    before.find((r) => r.planeId === "combined")?.scopeId,
    "combined",
  );
  assert.equal(
    before.find((r) => r.planeId === "main")?.scopeId,
    undefined,
    "a combined floor cannot certify a missing Main-plane artifact",
  );
  assert.equal(
    before.find((r) => r.planeId === "native:3")?.scopeId,
    undefined,
  );
  manifest.scopes.push(
    scope("main", [1, 2]) as unknown as ProgressiveManifest["scopes"][number],
  );
  manifest.scopes.push(
    scope("fractional", [
      3,
    ]) as unknown as ProgressiveManifest["scopes"][number],
  );
  assert(publishedDefaultScopeCoverage(data, manifest).every((r) => r.scopeId));
});

test("source-only fractional plane is explicit while existing planes stay in Main floor", () => {
  const data = physicalProject(),
    before = JSON.stringify(data);
  assert.deepEqual(nativePhysicalDisplayPlanes(data, "first"), [
    {
      id: "main",
      label: "Main floor",
      kind: "main",
      levelIds: [1, 2],
      provisional: false,
    },
    {
      id: "native:3",
      label: "Floor 1.5",
      kind: "source-level",
      levelIds: [3],
      elevationFeet: 9,
      provisional: true,
    },
  ]);
  assert.deepEqual(nativePhysicalDisplayPlaneLevelIds(data, "first"), [1, 2]);
  assert.deepEqual(
    nativePhysicalDisplayPlaneLevelIds(data, "first", "native:3"),
    [3],
  );
  assert.deepEqual(
    nativePhysicalDisplayPlaneLevelIds(data, "first", "stale"),
    [1, 2],
  );
  assert.equal(
    JSON.stringify(data),
    before,
    "IDs/heights/contours/routes remain unchanged",
  );
});

test("actual target level chooses its plane without nearest-height or identity inference", () => {
  const data = physicalProject();
  assert.equal(
    nativePhysicalDisplayPlaneForLevel(data, "first", 3),
    "native:3",
  );
  assert.equal(nativePhysicalDisplayPlaneForLevel(data, "first", 2), "main");
  assert.equal(nativePhysicalDisplayPlaneForLevel(data, "first", 999), "main");
  assert.deepEqual(
    nativePhysicalDisplayPlaneLevelIds(data, "missing", "native:3"),
    [],
  );
  data.records[0].ringsFeet = [
    [
      [100, 100],
      [101, 100],
      [101, 101],
      [100, 101],
    ],
  ];
  assert.deepEqual(
    nativePhysicalDisplayPlaneLevelIds(data, "first", "native:3"),
    [3],
  );
});

test("legacy floors stay composite and stale alias source evidence is rejected", () => {
  const legacy = fixture();
  assert.deepEqual(nativePhysicalDisplayPlaneLevelIds(legacy, "first"), [1]);
  const data = physicalProject();
  data.nativePhysicalLevels!.sourceModelSha256 = "c".repeat(64);
  assert.throws(
    () => nativePhysicalDisplayPlanes(data, "first"),
    /Invalid or stale/,
  );
});
