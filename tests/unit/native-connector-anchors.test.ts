import { NATIVE_BARRIER_TOPOLOGY_VERSION } from "../../app/indoor-project/native-barrier-topology.ts";
import {
  nativeRoomIdentityRings,
  validateNativeFloorOpeningOwnership,
  validateNativeFloorOpeningOwnershipBinding,
} from "../../app/indoor-project/native-floor-opening-ownership.ts";
import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract.ts";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes.ts";
import {
  nativeCirculationCells,
  nativeCirculationGeometryKey,
  nativeCirculationWalkBlockers,
  validateNativeCirculationGeometry,
} from "../../app/indoor-project/native-circulation.ts";
import {
  prepareNativeCirculationGeometry,
  attachNativeCirculationCellRoutes,
  prepareNativeCirculationPlaneDraft,
  mergeNativeCirculationPlaneDrafts,
} from "../../../reviter/lib/reviter/native-circulation-geometry.ts";
import { supportedWalkingPath } from "../../../reviter/lib/reviter/native-circulation-links.ts";
const rect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
async function setup() {
  const floor = (id: number, z: number) => ({
    elementId: id,
    categoryId: -2000032,
    boundsFeet: { min: { x: 0, y: 0, z: z - 0.5 }, max: { x: 20, y: 10, z } },
    loops: [rect(0, 0, 20, 10).map((p) => [...p, z])],
  });
  const records = [0, 10].map((z, i) => ({
    key: "stair" + i,
    number: "stair" + i,
    name: "Stair",
    building: "B",
    levelId: i + 1,
    elevationFeet: z,
    elevationEvidence: "native",
    surfaceId: "B:" + z,
    circulation: false,
    stair: true,
    walkable: true,
    access: "unknown",
    confidence: 1,
    ringsFeet: [rect(30, 30, 40, 40)],
    properties: {},
  }));
  const points: [[number, number, number], [number, number, number]] = [
      [5, 5, 0],
      [5, 5, 10],
    ],
    nodes = records.flatMap((r, i) => [
      {
        id: "cap" + i,
        roomKey: r.key,
        levelId: r.levelId,
        building: "B",
        surfaceId: r.surfaceId,
        pointFeet: points[i],
        geographic: [0, 0],
        kind: "stair",
      },
      {
        id: "arrival" + i,
        roomKey: r.key,
        levelId: r.levelId,
        building: "B",
        surfaceId: r.surfaceId,
        pointFeet: points[i],
        geographic: [0, 0],
        kind: "arrival",
      },
    ]);
  const sourceModelSha256 = "a".repeat(64),
    raw = {
      version: 1 as const,
      sourceModelSha256,
      levels: [0, 10].map((z, i) => ({
        levelId: i + 1,
        elevationFeet: z,
        partsFeet: [[rect(0, 0, 20, 10)]],
        sourceElementIds: [100 + i, 200],
        cutElevationsFeet: [z + 4, z + 8],
        evidenceSha256: "b".repeat(64),
      })),
    };
  const data = {
    source: { modelSha256: sourceModelSha256 },
    records,
    nodes,
    edges: [
      {
        id: "native-stair",
        nativeElementId: 200,
        from: "cap0",
        to: "cap1",
        kind: "stairs",
        roomKeys: records.map((r) => r.key),
        pointsFeet: points,
        lengthMetres: 3.048,
        enabled: true,
        accessible: "no",
      },
    ],
    nativeLevels: [
      { id: 1, name: "Floor1", elevationFeet: 0 },
      { id: 2, name: "Floor2", elevationFeet: 10 },
    ],
    walls: [],
    doors: [],
    alignment: { horizontalMetresPerFoot: 0.3048 },
    report: { components: 0, largestComponentArrivals: 0 },
    walkingSupport: {
      version: 1,
      sourceModelSha256,
      floors: [0, 10].map((z, i) => ({
        nativeElementId: 100 + i,
        elevationFeet: z,
        ringsFeet: [rect(0, 0, 20, 10)],
      })),
    },
    nativeIndoorEnvelopes: {
      ...raw,
      geometrySha256: await nativeIndoorEnvelopeHash(raw),
    },
  } as unknown as IndoorDataset;
  const model = {
    elementBounds: [
      floor(100, 0),
      floor(101, 10),
      {
        elementId: 200,
        categoryId: -2000120,
        boundsFeet: { min: { x: 5, y: 5, z: 0 }, max: { x: 5, y: 5, z: 10 } },
      },
    ],
    levels: [
      { levelId: 1, elevation: 0 },
      { levelId: 2, elevation: 10 },
    ],
    nativeAssociatedLevelRelations: [],
  } as any;
  return { data, model };
}
test("an original native connector identifies its complete unclaimed landing and coincident arrival alias", async () => {
  const { data, model } = await setup();
  data.circulationGeometry = prepareNativeCirculationGeometry(
    model,
    data,
  ).geometry;
  assert.equal(data.circulationGeometry.cells.length, 2);
  assert.ok(
    data.circulationGeometry.cells.every(
      (c) => c.connectorAnchors?.length === 1 && c.sourceCoverage === 0,
    ),
  );
  assert.equal(attachNativeCirculationCellRoutes(data), 2);
  validateNativeCirculationGeometry(data);
  assert.equal(nativeCirculationCells(data).length, 2);
  assert.equal(nativeCirculationWalkBlockers(data).size, 0);
  data.records[0]!.properties.floorOpeningsFeet = [rect(0, 0, 20, 10)];
  const strictHoles = prepareNativeCirculationGeometry(model, data);
  assert.equal(strictHoles.geometry.cells.length, 2);
  data.circulationGeometry = strictHoles.geometry;
  attachNativeCirculationCellRoutes(data);
  const before = nativeCirculationGeometryKey(data);
  data.edges[0]!.kind = "local-steps";
  assert.notEqual(nativeCirculationGeometryKey(data), before);
  data.edges[0]!.kind = "stairs";
  const proof = data.circulationGeometry.cells[0]!.connectorAnchors![0]!;
  proof.nativeElementId = 201;
  assert.throws(() => validateNativeCirculationGeometry(data));
  assert.equal(nativeCirculationCells(data).length, 1);
  proof.nativeElementId = 200;
  data.edges[0]!.enabled = false;
  assert.notEqual(nativeCirculationGeometryKey(data), before);
  assert.equal(nativeCirculationCells(data).length, 0);
  assert.equal(nativeCirculationWalkBlockers(data).size, 2);
});
test("ordinary labels, disabled connectors, conflicting named rooms and native holes cannot acquire landing ownership", async () => {
  for (const edit of [
    (d: IndoorDataset) => {
      d.edges = [];
    },
    (d: IndoorDataset) => {
      d.edges[0]!.enabled = false;
    },
    (d: IndoorDataset) => {
      d.records[0]!.access = "staff";
    },
    (d: IndoorDataset) => {
      d.nativeIndoorEnvelopes!.levels[0]!.partsFeet[0]!.push(rect(4, 4, 6, 6));
    },
  ]) {
    const { data, model } = await setup();
    edit(data);
    const result = prepareNativeCirculationGeometry(model, data);
    assert.equal(
      result.geometry.cells.some((c) => c.roomKeys.includes("stair0")),
      false,
    );
  }
  const { data, model } = await setup();
  data.records.push({
    ...data.records[0]!,
    key: "office",
    stair: false,
    name: "Office",
    ringsFeet: [rect(0, 0, 20, 10)],
  });
  const result = prepareNativeCirculationGeometry(model, data);
  assert.equal(
    result.geometry.cells.find((c) => c.elevationFeet === 0)!.connectorAnchors,
    undefined,
  );
  assert.deepEqual(
    result.geometry.cells.find((c) => c.elevationFeet === 0)!.roomKeys,
    ["office"],
  );
});
test("a zero-length alias requires an exact supported own-cell point, not vacuous strip clearance", async () => {
  const { data, model } = await setup();
  data.circulationGeometry = prepareNativeCirculationGeometry(
    model,
    data,
  ).geometry;
  attachNativeCirculationCellRoutes(data);
  const alias = data.edges.find((e) => e.kind === "walk")!;
  alias.pointsFeet = [
    [35, 35, 0],
    [35, 35, 0],
  ];
  assert.ok(nativeCirculationWalkBlockers(data).has(alias.id));
  const region = {
    elevationFeet: 0,
    floors: [[rect(0, 0, 20, 10)]],
    barriers: [[rect(4, 4, 6, 6)]],
    masks: [],
    nativeFloorIds: [100],
  };
  assert.equal(
    supportedWalkingPath(region, [
      [5, 5, 0],
      [5, 5, 0],
    ]),
    false,
  );
  assert.equal(
    supportedWalkingPath(region, [
      [35, 35, 0],
      [35, 35, 0],
    ]),
    false,
  );
  assert.equal(
    supportedWalkingPath(region, [
      [2, 2, 0],
      [2, 2, 0],
    ]),
    true,
  );
});

test("a void identity may bind only to the unchanged original native slab hole, never its oversized old contour", async () => {
  const { data, model } = await setup();
  const hole = rect(12, 3, 15, 6);
  model.elementBounds[0].loops.push(hole.map((p) => [...p, 0]));
  data.walkingSupport!.floors[0]!.ringsFeet.push(hole);
  const record = {
    ...data.records[0]!,
    key: "void",
    name: "Open drop",
    walkable: false,
    stair: false,
    ringsFeet: [rect(0, 0, 20, 10)],
    properties: {
      nativeFloorOpeningOwnership: {
        version: 1,
        sourceModelSha256: data.source.modelSha256,
        nativeFloorElementId: 100,
        elevationFeet: 0,
        holeFeet: hole.slice().reverse(),
      },
    },
  };
  data.records.push(record);
  validateNativeFloorOpeningOwnership(data);
  assert.deepEqual(nativeRoomIdentityRings(data, record), [hole]);
  const source = {
    key: record.key,
    walkability: "void",
    nativeFloorOpeningOwnership: structuredClone(
      record.properties.nativeFloorOpeningOwnership,
    ),
  };
  validateNativeFloorOpeningOwnershipBinding(data, [source]);
  assert.throws(() =>
    validateNativeFloorOpeningOwnershipBinding(data, [
      { ...source, access: { kind: "public" } },
    ]),
  );
  assert.throws(() =>
    validateNativeFloorOpeningOwnershipBinding(data, [
      { ...source, nativeFloorOpeningOwnership: undefined },
    ]),
  );
  assert.throws(() =>
    validateNativeFloorOpeningOwnershipBinding(data, [
      { ...source, walkability: "walkable" },
    ]),
  );
  const result = prepareNativeCirculationGeometry(model, data);
  assert.ok(result.geometry.cells.some((c) => c.roomKeys.includes("stair0")));
  assert.ok(result.geometry.cells.every((c) => !c.roomKeys.includes("void")));
  data.circulationGeometry = result.geometry;
  validateNativeCirculationGeometry(data);
  const before = nativeCirculationGeometryKey(data);
  record.properties.nativeFloorOpeningOwnership.holeFeet[0] = [12.001, 3];
  assert.notEqual(nativeCirculationGeometryKey(data), before);
  assert.throws(() => validateNativeFloorOpeningOwnership(data));
  assert.equal(nativeRoomIdentityRings(data, record), record.ringsFeet);
  assert.equal(
    prepareNativeCirculationGeometry(model, data).geometry.cells.some((c) =>
      c.roomKeys.includes("stair0"),
    ),
    false,
  );
  record.properties.nativeFloorOpeningOwnership.holeFeet = hole;
  record.walkable = true;
  assert.throws(() => validateNativeFloorOpeningOwnership(data));
});

test("legacy circulation bindings retain their exact original serialized fields when no void proof exists", async () => {
  const { data } = await setup();
  delete data.nativeIndoorEnvelopes;
  const original = JSON.stringify([
    data.source.modelSha256,
    NATIVE_BARRIER_TOPOLOGY_VERSION,
    data.records.map((r) => [
      r.key,
      r.levelId,
      r.elevationFeet,
      r.circulation,
      r.stair,
      r.walkable,
      r.access,
      r.ringsFeet,
      r.properties.floorOpeningsFeet,
      r.properties.spaceUse,
      r.properties.stairAccess,
    ]),
    data.walls,
    data.doors,
    data.walkingSupport,
  ]);
  assert.equal(nativeCirculationGeometryKey(data), original);
});

test("strict private policy bindings stay compact and authoring snapshots detect actual in-place geometry and access changes", async () => {
  const {
    routingSnapshot,
    withRoutingCalculation,
    createImmutableRoutingSession,
  } = await import("../../app/indoor-project/routing-cache");
  const { data } = await setup();
  const before = withRoutingCalculation(data, () => routingSnapshot(data));
  assert.match(before, /^native-circulation-sha256-v1:[a-f0-9]{64}$/);
  assert.equal(before.length, 93);
  const declared = data.nativeIndoorEnvelopes!.geometrySha256;
  data.nativeIndoorEnvelopes!.levels[0]!.partsFeet[0]![0]![0]![0] += 0.001;
  assert.equal(data.nativeIndoorEnvelopes!.geometrySha256, declared);
  const edited = withRoutingCalculation(data, () => routingSnapshot(data));
  assert.notEqual(
    edited,
    before,
    "unchanged declared evidence cannot conceal an actual point edit",
  );
  data.records[0]!.access = "staff";
  const restricted = withRoutingCalculation(data, () => routingSnapshot(data));
  assert.notEqual(restricted, edited);
  const snapshot = structuredClone(data),
    privateSession = createImmutableRoutingSession(snapshot);
  assert.equal(
    privateSession(() => routingSnapshot(snapshot)),
    privateSession(() => routingSnapshot(snapshot)),
    "private immutable worker choices reuse their full binding",
  );
  const imported = structuredClone(snapshot);
  imported.records[0]!.access = "unknown";
  assert.notEqual(
    createImmutableRoutingSession(imported)(() => routingSnapshot(imported)),
    restricted,
    "new imported snapshots cannot inherit a previous restricted/private binding",
  );
});

test("parallel planes preserve an original upper connector landing owned by its lower stair record", async () => {
  const { data, model } = await setup();
  data.nodes
    .filter((n) => n.id === "cap1" || n.id === "arrival1")
    .forEach((n) => {
      n.roomKey = "stair0";
    });
  data.edges[0]!.roomKeys = ["stair0"];
  const before = JSON.stringify([model, data]),
    sequential = prepareNativeCirculationGeometry(model, data),
    upper = sequential.geometry.cells.find((c) => c.elevationFeet === 10);
  if (!upper) throw Error("Original upper native cell missing");
  assert.ok(upper.roomKeys.includes("stair0"));
  assert.ok(
    upper.connectorAnchors?.some(
      (a) => a.nodeId === "cap1" && a.roomKey === "stair0",
    ),
  );
  const drafts = [10, 0].map((z) =>
    prepareNativeCirculationPlaneDraft(model, data, z),
  );
  assert.equal(
    JSON.stringify(mergeNativeCirculationPlaneDrafts(data, drafts)),
    JSON.stringify(sequential),
  );
  assert.equal(JSON.stringify([model, data]), before);
});
