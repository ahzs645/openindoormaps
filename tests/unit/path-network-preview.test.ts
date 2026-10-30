import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { hallwayPathView } from "../../app/indoor-project/hallway-path-view";
import { pathConnections } from "../../app/indoor-project/path-connections";
import { pathNetworkView } from "../../app/indoor-project/path-network-view";
import {
  preparedRoutingKey,
  ROUTING_GUIDE_VERSION,
  type PreparedRouting,
} from "../../app/indoor-project/prepared-routing";
import {
  installPreviewGuides,
  pathwayPreviewInventory,
  pathwayPreviewLevel,
} from "../../scripts/indoor/lib/pathway-preview";

function fixture() {
  const data = JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  ) as IndoorDataset;
  for (const record of data.records) record.circulation = true;
  return data;
}

function guides(data: IndoorDataset): PreparedRouting {
  return {
    version: 1,
    resolverVersion: ROUTING_GUIDE_VERSION,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: preparedRoutingKey(data),
    guides: data.edges
      .filter((edge) => edge.kind === "walk")
      .map((edge) => ({
        edgeId: edge.id,
        kind: "shared-corridor",
        pointsFeet: structuredClone(edge.pointsFeet),
      })),
  };
}

test("shared composition preserves the original production floor layers by default", () => {
  const data = fixture();
  const before = JSON.stringify(data);
  const walks = hallwayPathView(data, [1], "all");
  const shown = new Set<string>(
    walks.features.flatMap(
      (feature) => feature.properties?.edgeIds ?? [feature.properties?.edgeId],
    ),
  );
  assert.deepEqual(pathNetworkView(data, [1], "all"), {
    hallwayPaths: walks,
    pathConnections: pathConnections(data, [1], "all", shown),
  });
  assert.equal(JSON.stringify(data), before);
});

test("source inspection includes the real passage beside guide ink and retains its exact XYZ and identities", () => {
  const source = fixture();
  const data = installPreviewGuides(source, guides(source));
  const view = pathNetworkView(data, [1], "all", { includeSourceFeet: true });
  assert(
    view.hallwayPaths.features.some(
      (feature) => feature.properties?.source === "shared-guide",
    ),
  );
  const crossing = view.pathConnections.features.find(
    (feature) => feature.properties?.edgeId === "door",
  );
  assert(crossing);
  assert.equal(crossing.geometry.type, "LineString");
  assert.equal(crossing.properties?.role, "passage");
  assert.deepEqual(
    crossing.properties?.pointsFeet,
    source.edges.find((edge) => edge.id === "door")?.pointsFeet,
  );
  assert.equal(crossing.properties?.fromNodeId, "door-a");
  assert.equal(crossing.properties?.toNodeId, "door-b");
  assert.equal(
    pathNetworkView(data, [1], "all").pathConnections.features[0].properties
      ?.pointsFeet,
    undefined,
  );
});

test("zero-XY vertical stops retain source elevation and disabled stairs remain held", () => {
  const data = fixture();
  const a = data.nodes[0];
  data.records[1].levelId = 2;
  data.nodes[1] = {
    ...a,
    id: "upper",
    levelId: 2,
    roomKey: data.records[1].key,
    pointFeet: [a.pointFeet[0], a.pointFeet[1], 10],
  };
  data.edges = [
    {
      ...data.edges[0],
      id: "held-stair",
      kind: "stairs",
      enabled: false,
      from: a.id,
      to: "upper",
      roomKeys: data.records.map((record) => record.key),
      pointsFeet: [a.pointFeet, data.nodes[1].pointFeet],
    },
  ];
  const view = pathNetworkView(data, [1, 2], "all", {
    includeSourceFeet: true,
  });
  assert.equal(view.pathConnections.features.length, 2);
  assert(
    view.pathConnections.features.every(
      (feature) =>
        feature.geometry.type === "Point" &&
        feature.properties?.role === "held" &&
        feature.properties?.enabled === false,
    ),
  );
  assert.deepEqual(
    view.pathConnections.features.map(
      (feature) => feature.properties?.pointFeet[2],
    ),
    [0, 10],
  );
});

test("native inner rings and repeated level membership remain exact without double-counting cell identities", () => {
  const data = fixture();
  data.nativeLevels.push({ id: 2, name: "Split level", elevationFeet: 0 });
  const rings: [number, number][][] = [
    [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ],
    [
      [5, 5],
      [5, 7],
      [7, 7],
      [7, 5],
    ],
  ];
  data.circulationGeometry = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: "fixture",
    cells: [
      {
        id: "cell",
        levelIds: [1, 2],
        elevationFeet: 0,
        roomKeys: ["a"],
        nativeFloorIds: [10],
        ringsFeet: rings,
        sourceCoverage: 1,
      },
    ],
  };
  const before = JSON.stringify(data);
  const first = pathwayPreviewLevel(data, 1),
    second = pathwayPreviewLevel(data, 2);
  assert.deepEqual(first.cells[0].ringsFeet, rings);
  assert.deepEqual(second.cells[0].ringsFeet, rings);
  assert.equal(first.summary.innerRingsCountedPerCellOccurrence, 1);
  assert.equal(second.summary.innerRingsCountedPerCellOccurrence, 1);
  const inventory = pathwayPreviewInventory(data);
  assert.equal(inventory.uniqueNativeCells, 1);
  assert.equal(inventory.innerRingsCountedOncePerCell, 1);
  assert.equal(JSON.stringify(data), before);
});

test("declared empty levels are exported and unknown level IDs refuse", () => {
  const data = fixture();
  data.nativeLevels.push({
    id: 3,
    name: "Empty native level",
    elevationFeet: 50,
  });
  const level = pathwayPreviewLevel(data, 3);
  assert.equal(level.summary.sourceEdges, 0);
  assert.equal(level.rooms.length, 0);
  assert.equal(level.boundsFeet, null);
  assert.equal(pathwayPreviewInventory(data).nativeLevels, 2);
  assert.throws(() => pathwayPreviewLevel(data, 999), /Unknown native level/);
});

test("unmatched doors remain source XY diagnostics with original candidate owners and no new edge", () => {
  const data = fixture();
  data.doors = [
    {
      id: "native-door",
      nativeElementId: 123,
      levelId: 1,
      state: "unmatched",
      pointFeet: [4.125, 7.625],
      roomKeys: ["a"],
    },
  ];
  const before = JSON.stringify(data);
  const level = pathwayPreviewLevel(data, 1);
  assert.deepEqual(level.doorDiagnostics, data.doors);
  assert.equal(level.summary.unresolvedDoorMarkers, 1);
  assert.equal(
    level.sourceEdges.some((edge) => edge.nativeElementId === 123),
    false,
  );
  assert.equal(level.navigationAuthority, false);
  assert.equal(JSON.stringify(data), before);
});

test("guide installation refuses a stale source model, resolver, and any changed original endpoint", () => {
  for (const kind of ["model", "resolver", "endpoint", "plane"] as const) {
    const data = fixture(),
      metadata = guides(data);
    if (kind === "model") metadata.sourceModelSha256 = "other";
    if (kind === "resolver") metadata.resolverVersion = "old";
    if (kind === "endpoint") metadata.guides[0].pointsFeet[0][0] += 1e-9;
    if (kind === "plane") metadata.guides[0].pointsFeet[1][2] += 1e-9;
    assert.throws(
      () => installPreviewGuides(data, metadata),
      /Preview guide|preview guide/,
    );
  }
});

test("the preview binds the complete source including unrelated levels and access policy", () => {
  const source = fixture(),
    metadata = guides(source);
  const changedPolicy = structuredClone(source);
  changedPolicy.records[1].access = "staff";
  assert.throws(
    () => installPreviewGuides(changedPolicy, metadata),
    /complete source geometry and policy/,
  );
  const changedOtherFloor = structuredClone(source);
  changedOtherFloor.walls.push({
    nativeElementId: 987,
    levelId: 99,
    ringsFeet: [
      [
        [100, 100],
        [100, 105],
        [105, 105],
        [105, 100],
      ],
    ],
  });
  assert.throws(
    () => installPreviewGuides(changedOtherFloor, metadata),
    /complete source geometry and policy/,
  );
});

test("the complete network does not grant a staff owner public passage or invent a proximity join", () => {
  const data = fixture();
  data.records[1].access = "staff";
  const view = pathwayPreviewLevel(data, 1);
  assert.equal(
    view.network.pathConnections.features.some(
      (feature) => feature.properties?.edgeId === "door",
    ),
    false,
  );
  assert.equal(data.edges.length, fixture().edges.length);
});
