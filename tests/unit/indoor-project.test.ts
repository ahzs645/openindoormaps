import { prepareRouting } from "../../app/indoor-project/prepare-routing";
import {
  encodeNativeExactTopology,
  nativeRationalPoint,
} from "../../app/indoor-project/native-exact-planar-topology";
import { NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION } from "../../app/indoor-project/native-rational-overlay";
function bindFixtureExactCells(data: IndoorDataset) {
  const geometry = data.circulationGeometry!;
  for (const cell of geometry.cells) cell.exactFaceId = cell.id;
  geometry.exactTopology = encodeNativeExactTopology(
    {
      sourceModelSha256: data.source.modelSha256,
      sourceGeometryKey: geometry.sourceGeometryKey,
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    geometry.cells.map((cell) => ({
      id: cell.id,
      parts: [cell.ringsFeet.map((ring) => ring.map(nativeRationalPoint))],
    })),
  );
}
import { nativeMaterialSectionsHash } from "../../app/indoor-project/native-material-sections";
import {
  exportPreparedRoutingProject,
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
  isViewerProject,
  reviewArea,
  reviewEdge,
  reviewVisitorMetadata,
} from "../../app/indoor-project/package";
import { createProjectRouteDiagnostics } from "../../app/indoor-project/route-diagnostics";
import {
  setMapAnnotations,
  setBasemapBuildings,
  setMapLocations,
  setFloorDisplayName,
  locationAnnotations,
  editorVisitorDataset,
  shapePoints,
  type MapLocation,
  validateMapEdits,
  nativeEditPoint,
  moveMapAnnotation,
  type MapAnnotation,
} from "../../app/indoor-project/map-edits";
import test from "node:test";
import assert from "node:assert/strict";
import { combineProjectFloors } from "../../app/indoor-project/campus-floors";
import { zipSync, strToU8, strFromU8, unzipSync } from "fflate";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import {
  findProjectRoute,
  validateIndoorDataset,
  geographicPoint,
  projectRouteFailure,
} from "../../app/indoor-project/routing";

import {
  projectRoutingGraph,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";
import { routeProgressPositions } from "../../app/utils/route-progress-layout";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import {
  connectionName,
  connectionAreaName,
  connectionLevelChange,
} from "../../app/indoor-project/connection-presentation";

import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";
import { createFloorPresentationCache } from "../../app/indoor-project/floor-presentation";
import {
  basemapExclusionAreas,
  type BasemapBuildingSettings,
} from "../../app/indoor-project/basemap-buildings";
import { wallRoomBoundaries } from "../../app/indoor-project/wall-room-boundaries";
import {
  projectBuildingName,
  projectPlaceCategory,
  projectPlaceDisplayName,
  validateVisitorMetadata,
} from "../../app/indoor-project/visitor-metadata";
import {
  projectConnectorMarkers,
  sourceModelConnectorMarkers,
  stairDisplayPoint,
} from "../../app/indoor-project/connector-markers";
import {
  reviewConnector,
  sourceConnectorReview,
} from "../../app/indoor-project/connector-review";
import { visitorWallGeometry } from "../../app/indoor-project/visitor-wall-geometry";
import { validateConnectorBinding } from "../../app/indoor-project/connector-binding";
import {
  projectStairDisplay,
  validateSharedStairBinding,
} from "../../app/indoor-project/stair-display";

test("native stair selection keeps actual tread shapes outside the source outline without extending routes", () => {
  const data = fixture();
  const r = data.records[0];
  r.stair = true;
  r.arrivalNodeId = undefined;
  data.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: data.source.modelSha256,
    flights: [
      {
        roomKey: r.key,
        levelId: r.levelId,
        floorElevationFeet: r.elevationFeet,
        sourceGeometryKey: JSON.stringify([
          r.levelId,
          r.elevationFeet,
          r.ringsFeet,
        ]),
        stairElementId: 100,
        treads: [
          {
            runElementId: 101,
            elevationFeet: 8,
            thicknessFeet: 0.164_041_994_750_656_17,
            ringFeet: [
              [11, 2],
              [13, 2],
              [13, 3],
              [11, 3],
            ],
          },
        ],
      },
    ],
  };
  const before = structuredClone(data);
  validateIndoorDataset(data);
  const projected = projectStairDisplay(data, [1], "01");
  assert.equal(projected.features.length, 1);
  assert.equal(projected.features[0].properties?.height, 8 * 0.3048);
  assert.equal(projected.features[0].properties?.overhead, true);
  assert.ok(
    Math.abs(projected.features[0].properties!.base - (8 * 0.3048 - 0.05)) <
      1e-9,
  );
  assert.ok(projected.features[0].properties!.base > 1.8); // Floor below is not occupied by a column.
  data.stairDisplay.flights[0].treads[0].thicknessFeet = -1;
  assert.throws(() => validateIndoorDataset(data), /stair tread/);
  data.stairDisplay.flights[0].treads[0].thicknessFeet = 0.164_041_994_750_656_17;

  assert.deepEqual(
    projected.features[0].geometry.coordinates[0][0],
    geographicPoint(data, [11, 2]),
  );
  assert.equal(projectStairDisplay(data, [2], "all").features.length, 0);
  assert.equal(projectStairDisplay(data, [1], "02").features.length, 0);
  assert.equal(findProjectRoute(data, "a", "b"), null);
  assert.deepEqual(data, before);
  data.stairDisplay.sourceModelSha256 = "different-model";
  assert.throws(() => validateIndoorDataset(data), /stair display/);
  assert.equal(projectStairDisplay(data, [1], "all").features.length, 0);
  data.stairDisplay.sourceModelSha256 = data.source.modelSha256;
  r.ringsFeet[0][0] = [-1, -1];
  assert.throws(() => validateIndoorDataset(data), /stair binding/);
  assert.equal(projectStairDisplay(data, [1], "all").features.length, 0);
});

function fixture(): IndoorDataset {
  const records: IndoorRecord[] = ["a", "b", "c", "upper"].map((key, i) => ({
    key,
    number: key,
    name: key,
    levelId: i === 3 ? 2 : 1,
    elevationFeet: i === 3 ? 10 : 0,
    elevationEvidence: "fixture",
    building: i === 2 ? "02" : "01",
    surfaceId: i === 3 ? "upper" : "lower",
    circulation: true,
    stair: false,
    access: "public",
    walkable: true,
    confidence: 1,
    ringsFeet: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    ],
    properties: {},
    arrivalNodeId: key,
  }));
  return {
    format: "reviter-indoor",
    version: 1,
    generator: "reviter/indoor-pipeline-1",
    source: { modelFileName: "fixture.rvt", modelSha256: "", roomsSha256: "" },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
      rmsMetres: 0,
      referenceCount: 2,
    },
    floors: [
      { id: "first", name: "First", levelIds: [1], elevationFeet: 0 },
      { id: "second", name: "Second", levelIds: [2], elevationFeet: 10 },
    ],
    nativeLevels: [
      { id: 1, name: "First", elevationFeet: 0 },
      { id: 2, name: "Second", elevationFeet: 10 },
    ],
    records,
    nodes: records.map((r, i) => ({
      id: r.key,
      roomKey: r.key,
      kind: "arrival",
      levelId: r.levelId,
      building: r.building,
      surfaceId: r.surfaceId,
      pointFeet: [i === 3 ? 0 : i * 10, 0, r.elevationFeet],
      geographic: [-122, 53],
    })),
    edges: [
      {
        id: "ab",
        from: "a",
        to: "b",
        kind: "walk",
        pointsFeet: [
          [0, 0, 0],
          [10, 0, 0],
        ],
        lengthMetres: 3.048,
        roomKeys: ["a", "b"],
        evidence: "fixture",
        accessible: "unknown",
        enabled: true,
      },
      {
        id: "bc",
        from: "b",
        to: "c",
        kind: "door",
        pointsFeet: [
          [10, 0, 0],
          [20, 0, 0],
        ],
        lengthMetres: 3.048,
        roomKeys: ["b", "c"],
        evidence: "native-door",
        nativeElementId: 123,
        accessible: "yes",
        enabled: true,
      },
    ],
    walls: [],
    issues: [],
    report: {
      recordCount: 4,
      routableArrivals: 3,
      components: 2,
      largestComponentArrivals: 3,
      unmatchedDoors: 0,
      cellSizeFeet: 0.6,
      omittedSourceLabels: 0,
    },
  };
}
const hash = async (b: Uint8Array) =>
  Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array(b).buffer as ArrayBuffer,
    ),
  ).toString("hex");

test("basemap exclusion areas survive master and viewer exports without changing source geometry or routing", async () => {
  const original = await readIndoorProject(await archive());
  const settings: BasemapBuildingSettings = {
    mode: "areas",
    marginMetres: 15,
    areas: [
      {
        id: "campus",
        name: "Campus",
        pointsFeet: [
          [-1, -1],
          [20, -1],
          [20, 8],
          [8, 8],
          [8, 20],
          [-1, 20],
        ],
      },
    ],
  };
  const edited = setBasemapBuildings(original, settings);
  assert.strictEqual(edited.dataset, original.dataset);
  assert.equal(original.rooms.mapEdits, undefined);
  assert.notStrictEqual(edited.rooms.mapEdits!.basemapBuildings, settings);
  for (const bytes of [
    await exportIndoorProject(edited),
    await exportCampusViewer(edited),
  ]) {
    const restored = await readIndoorProject(bytes);
    assert.deepEqual(restored.rooms.mapEdits?.basemapBuildings, settings);
    for (const field of [
      "records",
      "walls",
      "doors",
      "nodes",
      "edges",
      "floors",
      "alignment",
    ] as const)
      assert.deepEqual(restored.dataset[field], original.dataset[field]);
  }
  const master = await readIndoorProject(await exportIndoorProject(edited));
  assert.deepEqual(
    master.files["model/fixture.rvt"],
    original.files["model/fixture.rvt"],
  );
});

test("automatic campus exclusions cover all source floors and respect the geographic alignment", () => {
  const d = fixture();
  d.records[3].ringsFeet = [
    [
      [20, 20],
      [30, 20],
      [30, 30],
      [20, 30],
    ],
  ];
  const areas = basemapExclusionAreas(d, {
    mode: "campus",
    marginMetres: 3.048,
    areas: [],
  });
  assert.equal(areas.features.length, 2);
  assert.deepEqual(
    areas.features[0].geometry.coordinates[0],
    [
      [-10, -10],
      [40, -10],
      [40, 40],
      [-10, 40],
      [-10, -10],
    ].map((p) => geographicPoint(d, p as [number, number])),
  );
  assert.equal(
    basemapExclusionAreas(d, { mode: "show", marginMetres: 15, areas: [] })
      .features.length,
    0,
  );
});

test("floor presentation reuses revisited floors and invalidates edits and display options", () => {
  const data = fixture();
  const before = structuredClone(data);
  const cached = createFloorPresentationCache();
  const options = {
    showPillars: false,
    showPassThroughPlaces: false,
    showVestibuleDoors: false,
    showStructures: false,
  };
  const first = cached(data, [1], "all", options);
  assert.deepEqual(first.display, projectDisplayGeometry(data, [1], "all"));
  const second = cached(data, [2], "all", options);
  assert.notStrictEqual(first, second);
  assert.strictEqual(cached(data, [1, 1], "all", { ...options }), first);
  assert.notStrictEqual(cached(data, [1], "01", options), first);
  for (const option of Object.keys(options))
    assert.notStrictEqual(
      cached(data, [1], "all", { ...options, [option]: true }),
      first,
    );
  const edited = structuredClone(data);
  edited.records[0].ringsFeet[0][1][0] = 12;
  const refreshed = cached(edited, [1], "all", options);
  assert.notStrictEqual(refreshed, first);
  assert.deepEqual(
    refreshed.display,
    projectDisplayGeometry(edited, [1], "all"),
  );
  assert.deepEqual(data, before);
});

test("floor presentation limits retained floors and refreshes recently used entries", () => {
  const data = fixture();
  const cached = createFloorPresentationCache(2);
  const options = {
    showPillars: false,
    showPassThroughPlaces: false,
    showVestibuleDoors: false,
    showStructures: false,
  };
  const first = cached(data, [1], "all", options);
  const second = cached(data, [2], "all", options);
  assert.strictEqual(cached(data, [1], "all", options), first);
  cached(data, [1], "01", options);
  assert.strictEqual(cached(data, [1], "all", options), first);
  assert.notStrictEqual(cached(data, [2], "all", options), second);
});

test("a reviewed internal door remains closed for implicit walking crossings after ZIP export and re-import", async () => {
  const d = fixture(),
    door = d.edges.find((e) => e.id === "bc")!;
  d.doors = [
    {
      id: door.id,
      levelId: 1,
      nativeElementId: 123,
      pointFeet: [15, 0],
      footprintFeet: [
        [14, -1],
        [16, -1],
        [16, 1],
        [14, 1],
      ],
      roomKeys: ["b", "c"],
      state: "connected",
    },
  ];
  d.edges.push({
    ...door,
    id: "walk-bc",
    kind: "walk",
    pointsFeet: structuredClone(door.pointsFeet),
  });
  door.lengthMetres = 30;
  const project = await readIndoorProject(await archive(d));
  const original = findProjectRoute(project.dataset, "a", "c")!;
  assert.ok(original.edges.some((e) => e.id === "walk-bc"));
  const closed = reviewEdge(project, door.id, {
    enabled: false,
    notes: "Closed entrance",
  });
  assert.equal(findProjectRoute(closed.dataset, "a", "c"), null);
  const blocked = createProjectRouteDiagnostics(closed.dataset).inspect(
    "a",
    "c",
  );
  assert.deepEqual(
    [...new Set(blocked.blockers.map((b) => b.kind))],
    ["disabled"],
  );
  assert.ok(blocked.blockers.some((b) => b.edgeId === door.id));
  assert.match(blocked.message, /element 123/);
  const restored = await readIndoorProject(await exportIndoorProject(closed));
  assert.equal(findProjectRoute(restored.dataset, "a", "c"), null);
  assert.ok(
    !reachableProjectDestinations(
      projectRoutingGraph(restored.dataset),
      "a",
    ).has("c"),
  );
  const reopened = reviewEdge(restored, door.id, { enabled: true });
  assert.ok(findProjectRoute(reopened.dataset, "a", "c"));
  assert.equal(reopened.manifest.model.sha256, project.manifest.model.sha256);
});
async function archive(d = fixture()) {
  const rooms = {
      format: "reviter-room-annotations",
      version: 1,
      coordinateSystem: "revit-model-feet",
      model: { fileName: "fixture.rvt" },
      annotations: d.records.map((r) => ({
        key: r.key,
        name: r.name,
        unknownField: { keep: true },
      })),
      georeference: {
        points: [
          { modelFeet: [0, 0], geographic: { longitude: -122, latitude: 53 } },
        ],
      },
      custom: { keep: true },
    },
    model = strToU8("original rvt bytes"),
    roomBytes = strToU8(JSON.stringify(rooms)),
    gis = strToU8(JSON.stringify(rooms.georeference));
  d.source.modelSha256 = await hash(model);
  d.source.roomsSha256 = await hash(roomBytes);
  const indoor = strToU8(JSON.stringify(d)),
    entry = async (path: string, bytes: Uint8Array) => ({
      path,
      bytes: bytes.length,
      sha256: await hash(bytes),
    }),
    manifest = {
      format: "reviter-project",
      version: 2,
      createdAt: "2026-10-01",
      model: {
        ...(await entry("model/fixture.rvt", model)),
        fileName: "fixture.rvt",
        lastModified: 1,
      },
      floors: await entry("floors/rooms.json", roomBytes),
      georeference: await entry("gis/reference-points.json", gis),
      indoor: await entry("viewer/indoor.json", indoor),
    };
  return zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "model/fixture.rvt": model,
    "floors/rooms.json": roomBytes,
    "gis/reference-points.json": gis,
    "viewer/indoor.json": indoor,
  });
}
test("campus viewer keeps exact geometry and routes without model bytes or authoring room copies", async () => {
  const master = await readIndoorProject(await archive());
  const originalFiles = structuredClone(master.files);
  const viewerBytes = await exportCampusViewer(master);
  const files = unzipSync(viewerBytes);
  assert.deepEqual(Object.keys(files).sort(), [
    "gis/reference-points.json",
    "manifest.json",
    "viewer/indoor.json",
    "viewer/metadata.json",
  ]);
  const viewer = await readIndoorProject(viewerBytes);
  assert.ok(isViewerProject(viewer));
  assert.equal(viewer.scene, undefined);
  assert.deepEqual(viewer.dataset, master.dataset);
  assert.deepEqual(
    findProjectRoute(viewer.dataset, "a", "c"),
    findProjectRoute(master.dataset, "a", "c"),
  );
  assert.equal(findProjectRoute(viewer.dataset, "a", "upper"), null);
  assert.deepEqual(viewer.rooms.annotations, []);
  assert.equal(viewer.rooms.custom, undefined);
  assert.deepEqual(master.files, originalFiles);
  assert.deepEqual(
    (await readIndoorProject(await exportCampusViewer(viewer))).dataset,
    master.dataset,
  );
  await assert.rejects(exportIndoorProject(viewer), /full reviewed master ZIP/);
});
test("viewer exports pack large exact native materials within the existing metadata limit", async () => {
  const master = await readIndoorProject(await archive());
  const level = master.dataset.nativeLevels[0];
  const descriptor = {
    version: 1 as const,
    sourceModelSha256: master.dataset.source.modelSha256,
    geometrySha256: "",
    levels: [
      {
        levelId: level.id,
        elevationFeet: level.elevationFeet,
        cutElevationFeet: level.elevationFeet + 0.1,
        evidenceSha256: "b".repeat(64),
        sourceElementIds: [7],
        sections: [
          {
            nativeElementId: 7,
            categoryId: -2000011,
            kind: "wall" as const,
            baseElevationFeet: level.elevationFeet,
            topElevationFeet: level.elevationFeet + 9,
            partsFeet: [
              [
                [
                  [0.123456789012345, 0],
                  [2, 0],
                  [2, 1],
                  [0.123456789012345, 1],
                ],
              ],
            ] as [number, number][][][],
          },
        ],
      },
    ],
    sourceEvidence: "original source provenance\n".repeat(700000),
  };
  descriptor.geometrySha256 = await nativeMaterialSectionsHash(descriptor);
  master.rooms.nativeMaterialSections = descriptor;
  master.dataset.nativeMaterialSections = descriptor;
  const exported = await exportCampusViewer(master);
  const files = unzipSync(exported);
  assert(files["viewer/metadata.json"].length < 16 * 1024 * 1024);
  const wire = JSON.parse(strFromU8(files["viewer/metadata.json"]));
  assert.equal(wire.format, "openindoormaps-viewer-metadata-wire");
  const viewer = await readIndoorProject(exported);
  assert.deepEqual(viewer.rooms.nativeMaterialSections, descriptor);
  assert.deepEqual(viewer.dataset.nativeMaterialSections, descriptor);
  assert.equal(viewer.rooms.reviewBundle, undefined);
  assert.deepEqual(master.rooms.nativeMaterialSections, descriptor);
});
test("viewer export preserves combined campus floor selections without joining routing levels", async () => {
  const master = await readIndoorProject(await archive());
  const combined = combineProjectFloors(
    master,
    master.dataset.floors.map((f) => f.id),
    "Combined campus floor",
  );
  const viewer = await readIndoorProject(await exportCampusViewer(combined));
  assert.deepEqual(viewer.rooms.campusStoreys, combined.rooms.campusStoreys);
  assert.deepEqual(viewer.dataset, combined.dataset);
  assert.deepEqual(viewer.dataset.nodes, master.dataset.nodes);
  assert.deepEqual(viewer.dataset.edges, master.dataset.edges);
  assert.equal(findProjectRoute(viewer.dataset, "a", "upper"), null);
});
test("viewer export preserves disabled connections and rejects altered payloads and bundled models", async () => {
  const master = await readIndoorProject(await archive());
  const door = master.dataset.edges.find((e) => e.kind === "door")!;
  const closed = reviewEdge(master, door.id, { enabled: false });
  const bytes = await exportCampusViewer(closed);
  const viewer = await readIndoorProject(bytes);
  assert.equal(findProjectRoute(viewer.dataset, "a", "c"), null);
  const files = unzipSync(bytes);
  files["viewer/indoor.json"] = strToU8(
    strFromU8(files["viewer/indoor.json"]).replace(
      '"enabled":false',
      '"enabled":true',
    ),
  );
  await assert.rejects(
    readIndoorProject(zipSync(files)),
    /Damaged viewer entry/,
  );
  const extra = unzipSync(bytes);
  extra["model/fixture.rvt"] = strToU8("source model");
  await assert.rejects(
    readIndoorProject(zipSync(extra)),
    /unexpected source assets/,
  );
});
test("explicit node identity keeps identical XY on another floor disconnected", () => {
  const d = fixture();
  validateIndoorDataset(d);
  assert.equal(findProjectRoute(d, "a", "upper"), null);
  assert.equal(findProjectRoute(d, "a", "c")?.distanceMetres, 6.096);
});
test("visitor metadata survives export without changing room geometry, source names, graph or access", async () => {
  const source = await readIndoorProject(await archive());
  const graph = JSON.stringify([
    source.dataset.nodes,
    source.dataset.edges,
    source.dataset.records,
  ]);
  const next = reviewVisitorMetadata(
    source,
    "a",
    {
      displayName: "Learning Commons",
      description: "Study and reading spaces",
      category: "study",
      color: "#b8d5a5",
      landmark: true,
    },
    { name: "Library", shortName: "LIB" },
  );
  const restored = await readIndoorProject(await exportIndoorProject(next));
  assert.equal(
    JSON.stringify([
      restored.dataset.nodes,
      restored.dataset.edges,
      restored.dataset.records,
    ]),
    graph,
  );
  assert.equal(restored.manifest.model.sha256, source.manifest.model.sha256);
  assert.deepEqual(restored.rooms.visitorMetadata, restored.dataset.visitor);
  assert.equal(projectBuildingName(restored.dataset, "01"), "Library");
  assert.equal(
    projectPlaceDisplayName(restored.dataset, restored.dataset.records[0]),
    "Learning Commons",
  );
  assert.equal(
    projectPlaceCategory(restored.dataset, restored.dataset.records[0]),
    "study",
  );
  assert.equal(source.dataset.visitor, undefined);
});
test("visitor metadata rejects unknown identities and malformed palette fields", () => {
  const data = fixture();
  for (const metadata of [
    { version: 1, buildings: { unknown: { name: "Missing" } }, places: {} },
    {
      version: 1,
      buildings: {},
      places: { unknown: { displayName: "Missing" } },
    },
    { version: 1, buildings: {}, places: { a: { color: "red" } } },
    { version: 1, buildings: {}, places: { a: { category: "arbitrary" } } },
    { version: 1, buildings: {}, places: { a: { landmark: "yes" } } },
  ])
    assert.throws(() => validateVisitorMetadata(metadata, data.records));
});
test("public routes block staff and voids while permitting physically linked ordinary rooms", () => {
  const d = fixture();
  d.records[1].access = "staff";
  assert.equal(findProjectRoute(d, "a", "c"), null);
  d.records[1].access = "public";
  d.records[1].walkable = false;
  assert.equal(findProjectRoute(d, "a", "c"), null);
  d.records[1].walkable = true;
  d.records[1].circulation = false;
  assert.ok(findProjectRoute(d, "a", "c"));
  assert.ok(findProjectRoute(d, "a", "b"));
});
test("step-free routes require confirmation on every edge and never infer elevators", () => {
  const d = fixture();
  assert.equal(findProjectRoute(d, "a", "c", "accessible"), null);
  d.edges[0].accessible = "yes";
  assert.ok(findProjectRoute(d, "a", "c", "accessible"));
  d.edges[0].enabled = false;
  assert.equal(findProjectRoute(d, "a", "c"), null);
});
test("malformed nodes, graph references and nonfinite registration are rejected", () => {
  for (const corrupt of [
    (d: IndoorDataset) => {
      d.nodes[0].id = d.nodes[1].id;
    },
    (d: IndoorDataset) => {
      d.edges[0].to = "missing";
    },
    (d: IndoorDataset) => {
      d.alignment.projectionLatitude = Number.NaN;
    },
  ]) {
    const d = fixture();
    corrupt(d);
    assert.throws(() => validateIndoorDataset(d));
  }
});
test("project round-trip preserves original model, GIS and unknown source fields while applying restrictions", async () => {
  const p = await readIndoorProject(await archive()),
    before = p.manifest.model.sha256;
  const edited = reviewArea(p, "c", {
    name: "Reviewed destination",
    access: "staff",
    notes: "Checked locally",
  });
  assert.equal(findProjectRoute(edited.dataset, "a", "c"), null);
  const q = await readIndoorProject(await exportIndoorProject(edited));
  assert.equal(q.manifest.model.sha256, before);
  assert.deepEqual(q.rooms.georeference, p.rooms.georeference);
  assert.deepEqual(q.rooms.custom, { keep: true });
  assert.deepEqual(q.rooms.annotations[2].unknownField, { keep: true });
  assert.equal(q.rooms.annotations[2].name, "c");
  assert.equal(q.dataset.records[2].name, "Reviewed destination");
  assert.equal(findProjectRoute(q.dataset, "a", "c"), null);
  assert.notEqual(q.manifest.floors.sha256, p.manifest.floors.sha256);
});
test("connection reviews survive export; stairs cannot be declared step-free", async () => {
  const p = await readIndoorProject(await archive()),
    q = reviewEdge(p, "ab", { enabled: false, notes: "Closed" }),
    r = await readIndoorProject(await exportIndoorProject(q));
  assert.equal(findProjectRoute(r.dataset, "a", "c"), null);
  p.dataset.edges[0].kind = "stairs";
  assert.throws(
    () => reviewEdge(p, "ab", { accessible: "yes" }),
    /Steps cannot/,
  );
});
test("tampered entries, traversal paths and stale prepared graphs fail before import", async () => {
  const original = await archive();
  const files = unzipSync(original);
  files["model/fixture.rvt"][0] ^= 1;
  await assert.rejects(readIndoorProject(zipSync(files)), /Damaged/);
  const extra = unzipSync(original);
  extra["../escape.json"] = strToU8("{}");
  await assert.rejects(readIndoorProject(zipSync(extra)), /Unexpected/);
  const stale = unzipSync(original);
  const d = JSON.parse(new TextDecoder().decode(stale["viewer/indoor.json"]));
  d.source.roomsSha256 = "0".repeat(64);
  stale["viewer/indoor.json"] = strToU8(JSON.stringify(d));
  const m = JSON.parse(new TextDecoder().decode(stale["manifest.json"]));
  m.indoor.bytes = stale["viewer/indoor.json"].length;
  m.indoor.sha256 = await hash(stale["viewer/indoor.json"]);
  stale["manifest.json"] = strToU8(JSON.stringify(m));
  await assert.rejects(readIndoorProject(zipSync(stale)), /source identity/);
});
test("source feet registration uses longitude latitude order and retains vertical datum", () => {
  const d = fixture(),
    p = geographicPoint(d, [10, 0, 100]);
  assert.equal(p[1], 53);
  assert.ok(p[0] > -122);
  assert.deepEqual(geographicPoint(d, [0, 0, 200]), [-122, 53]);
});
test("route failure distinguishes source gaps from access and step-free restrictions", () => {
  const d = fixture();
  assert.match(
    projectRouteFailure(d, "a", "c", "accessible"),
    /No confirmed step-free/,
  );
  d.edges[1].enabled = false;
  assert.equal(findProjectRoute(d, "a", "c"), null);
  assert.match(
    projectRouteFailure(d, "a", "c", "public"),
    /disabled entrances/,
  );
  d.edges.pop();
  assert.match(
    projectRouteFailure(d, "a", "c", "public"),
    /missing a connection between Building 01 and Building 02/,
  );
  delete d.records[2].arrivalNodeId;
  assert.match(
    projectRouteFailure(d, "a", "c", "public"),
    /no prepared entrance/,
  );
});

test("room labels never fabricate a route blocker when physical links are permitted", () => {
  const d = fixture();
  d.records[1].circulation = false;
  d.records[1].access = "unknown";
  d.records[1].name = "Gallery";
  const route = findProjectRoute(d, "a", "c")!;
  assert.ok(route);
  assert.ok(route.preferenceCost! > route.sourceDistanceMetres);
  const result = createProjectRouteDiagnostics(d).inspect("a", "c");
  assert.equal(result.kind, "connected");
  assert.deepEqual(result.blockers, []);
  assert.equal(result.message, "");
});

test("route diagnostics explain rejected native circulation evidence", () => {
  const d = fixture();
  d.edges[0].nativeCellId = "stale-native-cell";
  assert.equal(findProjectRoute(d, "a", "c"), null);
  const failure = createProjectRouteDiagnostics(d).inspect("a", "c");
  assert.equal(failure.kind, "blocked");
  assert.ok(
    failure.blockers.some((b) => b.kind === "native-circulation-proof"),
  );
  assert.match(failure.message, /verified native floor boundaries/);
  assert.ok(!failure.message.includes("source path ."));
  delete d.edges[0].nativeCellId;
  assert.ok(
    findProjectRoute(d, "a", "c"),
    "reviewed source edits invalidate failed-route cache",
  );
});

test("route diagnostics identify metadata blockers individually and keep their native evidence", () => {
  const d = fixture();
  d.records[1].access = "staff";
  let failure = createProjectRouteDiagnostics(d).inspect("a", "c");
  assert.match(failure.message, /b · b, marked staff-only in the map/);
  assert.doesNotMatch(failure.message, /disabled/);
  assert.equal(failure.reviewRoomKey, "b");
  d.records[1].access = "public";
  d.edges[1].enabled = false;
  failure = createProjectRouteDiagnostics(d).inspect("a", "c");
  assert.match(failure.message, /disabled entrances.*element 123/);
  assert.equal(failure.blockers[0].nativeElementId, 123);
  assert.doesNotMatch(failure.message, /staff-only/);
  d.edges[1].enabled = true;
  d.records[1].walkable = false;
  assert.match(
    createProjectRouteDiagnostics(d).inspect("a", "c").message,
    /marked not walkable/,
  );
  d.records[1].walkable = true;
  d.edges[1].roomKeys.push("missing");
  assert.match(
    createProjectRouteDiagnostics(d).inspect("a", "c").message,
    /area missing from the prepared map/,
  );
});

test("reverse-only failures report saved travel direction rather than a fabricated source gap", () => {
  const d = fixture();
  d.edges[1].direction = "from-to";
  assert.equal(findProjectRoute(d, "c", "a"), null);
  const failure = createProjectRouteDiagnostics(d).inspect("c", "a");
  assert.match(failure.message, /against its saved travel direction/);
  assert.doesNotMatch(
    failure.message,
    /disabled|staff-only|missing a connection/,
  );
  assert.equal(
    createProjectRouteDiagnostics(d).inspect("a", "c").kind,
    "connected",
  );
});

test("diagnostics prefer an unblocked detour and do not blame unrelated reviewed doors", () => {
  const d = fixture();
  d.edges[1].enabled = false;
  d.edges.push({
    ...d.edges[0],
    id: "ac",
    from: "a",
    to: "c",
    lengthMetres: 100,
    roomKeys: ["a", "c"],
  });
  const failure = createProjectRouteDiagnostics(d).inspect("a", "c");
  assert.equal(failure.kind, "connected");
  assert.deepEqual(failure.blockers, []);
  assert.equal(failure.message, "");
  assert.deepEqual(failure.sourceEdgeIds, ["ac"]);
  assert.ok(findProjectRoute(d, "a", "c"));
});

test("room preferences do not become accessibility blockers or alter data", () => {
  const d = fixture();
  d.records[1].circulation = false;
  const before = JSON.stringify(d);
  const failure = createProjectRouteDiagnostics(d, "accessible").inspect(
    "a",
    "c",
  );
  assert.deepEqual(
    new Set(failure.blockers.map((b) => b.kind)),
    new Set(["step-free"]),
  );
  assert.match(failure.message, /No confirmed step-free route/);
  assert.equal(JSON.stringify(d), before);
});

test("native apertures cut only their own floor and preserve holes, source and routes", () => {
  const d = fixture();
  d.records[0].circulation = false;
  d.records[0].ringsFeet.push([
    [2, 2],
    [3, 2],
    [3, 3],
    [2, 3],
  ]);
  d.walls = [1, 2].map((levelId) => ({
    levelId,
    nativeElementId: 77,
    ringsFeet: [
      [
        [0, 0],
        [10, 0],
        [10, 1],
        [0, 1],
      ],
    ],
  }));
  d.doors = [
    {
      id: "bc",
      levelId: 1,
      nativeElementId: 123,
      pointFeet: [5, 0.5],
      footprintFeet: [
        [4, -1],
        [6, -1],
        [6, 2],
        [4, 2],
      ],
      roomKeys: ["b", "c"],
      state: "connected",
    },
  ];
  const before = JSON.stringify(d),
    route = findProjectRoute(d, "a", "c");
  const lower = projectDisplayGeometry(d, [1], "all");
  assert.equal(
    lower.walls.features[0].geometry.coordinates.length,
    2,
    "native wall split across real aperture",
  );
  assert.equal(
    lower.areas.features[0].geometry.coordinates[0].length,
    2,
    "atrium hole retained",
  );
  assert.equal(lower.areas.features[0].properties!.key, "a");
  assert.ok(
    lower.areas.features.every((f) => !("height" in f.properties!)),
    "source footprints stay separate from display blocks",
  );
  assert.equal(lower.doorFootprints.features.length, 1);
  assert.deepEqual(
    lower.labels.features[0].geometry.coordinates,
    geographicPoint(d, d.nodes[0].pointFeet),
  );
  const upper = projectDisplayGeometry(d, [2], "all");
  assert.equal(
    upper.walls.features[0].geometry.coordinates.length,
    1,
    "same XY on upper floor not cut",
  );
  assert.equal(upper.doorFootprints.features.length, 0);
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(findProjectRoute(d, "a", "c"), route);
});
test("unmatched and position-only doors stay review markers without invented routes or holes", () => {
  const d = fixture();
  d.doors = [
    {
      id: "unmatched",
      levelId: 1,
      nativeElementId: 456,
      pointFeet: [2, 2],
      roomKeys: [],
      state: "unmatched",
    },
  ];
  validateIndoorDataset(d);
  const display = projectDisplayGeometry(d, [1], "01");
  assert.equal(display.doorMarkers.features[0].properties!.review, true);
  assert.equal(display.doorMarkers.features[0].properties!.enabled, false);
  assert.equal(display.doorFootprints.features.length, 0);
  assert.equal(d.edges.length, 2);
  d.doors[0].footprintFeet = [
    [0, 0],
    [1, 0],
    [1, Number.NaN],
  ];
  assert.throws(() => validateIndoorDataset(d), /door geometry/);
});

test("solid room blocks include adjoining walls but leave corridors, apertures and floor holes open", () => {
  const d = fixture();
  d.records[0].circulation = false;
  d.records[0].ringsFeet.push([
    [2, 2],
    [4, 2],
    [4, 4],
    [2, 4],
  ]);
  d.records[1].ringsFeet = [
    [
      [11, 0],
      [16, 0],
      [16, 10],
      [11, 10],
    ],
  ];
  d.records[2].levelId = 2;
  d.walls = [
    {
      levelId: 1,
      kind: "wall",
      nativeElementId: 701,
      ringsFeet: [
        [
          [10, 0],
          [11, 0],
          [11, 10],
          [10, 10],
        ],
      ],
    },
    {
      levelId: 1,
      kind: "wall",
      nativeElementId: 702,
      ringsFeet: [
        [
          [-1, 0],
          [0, 0],
          [0, 10],
          [-1, 10],
        ],
      ],
    },
  ];
  // Wall-top ownership requires an actual closed native enclosure.
  d.walls.push(
    ...[
      [
        [-1, -1],
        [11, -1],
        [11, 0],
        [-1, 0],
      ],
      [
        [-1, 10],
        [11, 10],
        [11, 11],
        [-1, 11],
      ],
    ].map((ring, i) => ({
      levelId: 1,
      kind: "wall" as const,
      nativeElementId: 704 + i,
      ringsFeet: [ring as [number, number][]],
    })),
  );
  d.doors = [
    {
      id: "bc",
      levelId: 1,
      nativeElementId: 703,
      pointFeet: [10.5, 5],
      footprintFeet: [
        [9.5, 4],
        [11.5, 4],
        [11.5, 6],
        [9.5, 6],
      ],
      roomKeys: ["a", "b"],
      state: "connected",
    },
  ];
  const before = JSON.stringify(d);
  const display = projectDisplayGeometry(d, [1], "all");
  assert.equal(display.roomBlocks.features.length, 1);
  const block = display.roomBlocks.features[0];
  const contains = (x: number, y: number) =>
    booleanPointInPolygon(geographicPoint(d, [x, y]), block);
  assert.equal(block.properties!.key, "a");
  assert.equal(block.properties!.height, 0.6);
  assert.ok(contains(5, 5), "room interior is a solid roof");
  assert.ok(
    contains(10.5, 2),
    "roof extends through the actual wall thickness",
  );
  assert.ok(contains(-0.5, 5), "outside perimeter joins the room block");
  assert.equal(contains(13, 5), false, "hallway stays empty");
  assert.equal(contains(10.5, 5), false, "precise doorway remains open");
  assert.equal(contains(3, 3), false, "lower-floor opening remains open");
  assert.ok(
    display.exposedWalls.features.every(
      (wall) => !booleanPointInPolygon(geographicPoint(d, [10.5, 2]), wall),
    ),
    "no duplicate wall shell under the block roof",
  );
  assert.equal(
    JSON.stringify(d),
    before,
    "display changes never alter source geometry or routing",
  );
});
test("native entrance geometry survives review export and re-import", async () => {
  const d = fixture();
  d.doors = [
    {
      id: "bc",
      levelId: 1,
      nativeElementId: 123,
      pointFeet: [5, 0.5],
      normalFeet: [0, 1],
      footprintFeet: [
        [4, 0],
        [6, 0],
        [6, 1],
        [4, 1],
      ],
      roomKeys: ["b", "c"],
      state: "connected",
    },
  ];
  const p = await readIndoorProject(await archive(d));
  const again = await readIndoorProject(
    await exportIndoorProject(reviewEdge(p, "bc", { enabled: false })),
  );
  assert.deepEqual(again.dataset.doors, d.doors);
  assert.equal(
    projectDisplayGeometry(again.dataset, [1], "all").doorMarkers.features[0]
      .properties!.enabled,
    false,
  );
  for (const invalid of [
    [0, 0],
    [2, 0],
    [Number.NaN, 1],
  ]) {
    const bad = structuredClone(d);
    bad.doors![0].normalFeet = invalid as [number, number];
    assert.throws(() => validateIndoorDataset(bad), /door geometry/);
  }
});

test("native walls define a room enclosure using its source identity, including a door threshold", () => {
  const d = fixture();
  d.records[0].circulation = false;
  d.records[0].ringsFeet = [
    [
      [0.4, 0.4],
      [9.6, 0.4],
      [9.6, 9.6],
      [0.4, 9.6],
    ],
    [
      [2, 2],
      [3, 2],
      [3, 3],
      [2, 3],
    ],
  ];
  d.records[1].ringsFeet = [
    [
      [11, 0],
      [16, 0],
      [16, 10],
      [11, 10],
    ],
  ];
  d.records[2].levelId = 2;
  d.walls = [
    [
      [-0.5, -0.5],
      [10.5, -0.5],
      [10.5, 0],
      [-0.5, 0],
    ],
    [
      [10, 0],
      [10.5, 0],
      [10.5, 10],
      [10, 10],
    ],
    [
      [-0.5, 10],
      [10.5, 10],
      [10.5, 10.5],
      [-0.5, 10.5],
    ],
    [
      [-0.5, 0],
      [0, 0],
      [0, 4],
      [-0.5, 4],
    ],
    [
      [-0.5, 6],
      [0, 6],
      [0, 10],
      [-0.5, 10],
    ],
  ].map((ring, i) => ({
    kind: "wall" as const,
    nativeElementId: 900 + i,
    levelId: 1,
    ringsFeet: [ring as [number, number][]],
  }));
  d.doors = [
    {
      id: "bc",
      nativeElementId: 999,
      levelId: 1,
      pointFeet: [-0.25, 5],
      footprintFeet: [
        [-0.5, 4],
        [0, 4],
        [0, 6],
        [-0.5, 6],
      ],
      roomKeys: ["a", "b"],
      state: "connected",
    },
  ];
  const before = JSON.stringify(d);
  const resolved = wallRoomBoundaries(d, d.records);
  const room = resolved.get("a")!;
  assert.ok(room, "door threshold completes an actual wall enclosure");
  assert.equal(
    Math.min(...room[0].map((p) => p[0])),
    0,
    "wall face replaces inset annotation edge",
  );
  assert.equal(Math.max(...room[0].map((p) => p[0])), 10);
  assert.equal(room.length, 2, "source floor opening survives");
  const display = projectDisplayGeometry(d, [1], "all");
  assert.equal(
    display.areas.features[0].properties!.boundarySource,
    "native-walls",
  );
  assert.equal(
    display.roomBlocks.features[0].properties!.boundarySource,
    "native-walls",
  );
  assert.equal(JSON.stringify(d), before);
  assert.equal(
    wallRoomBoundaries(d, [{ ...d.records[0], key: "other-floor", levelId: 2 }])
      .size,
    0,
  );
  d.walls = d.walls.filter((w) => w.nativeElementId !== 902);
  assert.equal(
    wallRoomBoundaries(d, d.records).has("a"),
    false,
    "missing wall cannot be supplied by the annotation",
  );
  assert.equal(
    projectDisplayGeometry(d, [1], "all").roomBlocks.features[0].properties!
      .boundarySource,
    "source-footprint",
  );
});

test("tiny rotated native wall junction gaps resolve inset rooms without swallowing a hall or door", () => {
  for (const angle of [0, Math.PI / 5]) {
    const d = fixture();
    const point = ([x, y]: [number, number]): [number, number] => [
      100 + x * Math.cos(angle) - y * Math.sin(angle),
      250 + x * Math.sin(angle) + y * Math.cos(angle),
    ];
    const rect = (
      x: number,
      y: number,
      w: number,
      h: number,
    ): [number, number][] =>
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ].map((p) => point(p as [number, number]));
    d.records[0].circulation = false;
    d.records[0].ringsFeet = [
      [
        [1, 0.3],
        [9, 0.3],
        [9.7, 1],
        [9.7, 9],
        [9, 9.7],
        [1, 9.7],
        [0.3, 9],
        [0.3, 1],
      ].map((p) => point(p as [number, number])),
    ];
    d.records[1].ringsFeet = [rect(-5, 0, 4.5, 10)];
    d.records[2].levelId = 2;
    d.walls = [
      rect(-0.5, -1, 0.5, 12),
      rect(10, -1, 0.5, 12),
      rect(0.0125, -0.5, 9.975, 0.5),
      rect(0.0125, 10, 9.975, 0.5),
    ].map((ring, i) => ({
      levelId: 1,
      kind: "wall" as const,
      nativeElementId: 1000 + i,
      ringsFeet: [ring],
    }));
    d.doors = [
      {
        id: "door",
        levelId: 1,
        nativeElementId: 1010,
        pointFeet: point([-0.25, 5]),
        footprintFeet: rect(-0.6, 4, 0.8, 2),
        roomKeys: ["a", "b"],
        state: "connected",
      },
    ];
    const before = JSON.stringify(d);
    const display = projectDisplayGeometry(d, [1], "all");
    const block = display.roomBlocks.features[0];
    const contains = (x: number, y: number) =>
      booleanPointInPolygon(geographicPoint(d, point([x, y])), block);
    assert.equal(block.properties!.boundarySource, "native-walls");
    assert.ok(
      contains(0.1, 0.1),
      "beveled annotation corner fills out to actual walls",
    );
    assert.ok(contains(-0.25, 2), "native wall becomes part of the room block");
    assert.equal(contains(-0.25, 5), false, "doorway remains open");
    assert.equal(contains(-2, 5), false, "hallway remains flat");
    assert.ok(
      display.exposedWalls.features.every(
        (wall) =>
          !booleanPointInPolygon(geographicPoint(d, point([-0.25, 2])), wall),
      ),
      "no grey wall shell around resolved room",
    );
    assert.equal(JSON.stringify(d), before);
    d.walls[2].ringsFeet = [rect(0.1, -0.5, 9.8, 0.5)];
    assert.equal(
      wallRoomBoundaries(d, d.records).has("a"),
      false,
      "larger gaps remain unresolved",
    );
  }
});

test("lower rooms appear only inside upper polygon openings with no new connectivity", () => {
  const d = fixture();
  d.records[3].ringsFeet.push([
    [2, 2],
    [4, 2],
    [4, 4],
    [2, 4],
  ]);
  const display = projectDisplayGeometry(d, [2], "01");
  assert.equal(display.lowerRooms.features.length, 2);
  for (const feature of display.lowerRooms.features) {
    assert.equal(feature.properties!.levelId, 1);
    for (const point of feature.geometry.coordinates.flat(2)) {
      const min = geographicPoint(d, [2, 2]),
        max = geographicPoint(d, [4, 4]);
      assert.ok(point[0] >= min[0] && point[0] <= max[0]);
      assert.ok(point[1] >= min[1] && point[1] <= max[1]);
    }
  }
  assert.equal(findProjectRoute(d, "a", "upper"), null);
  d.records[3].ringsFeet = [d.records[3].ringsFeet[0]];
  d.records[3].walkable = false;
  assert.equal(
    projectDisplayGeometry(d, [2], "01").lowerRooms.features.length,
    0,
    "access restriction does not imply an atrium",
  );
  d.records[3].properties.notes = "Confirmed open drop to lower floors";
  assert.equal(
    projectDisplayGeometry(d, [2], "01").lowerRooms.features.length,
    2,
  );
});

test("pillars hide without changing routing and overlapping wall faces merge before door cuts", () => {
  const d = fixture();
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
  ): [number, number][] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  d.walls = [
    {
      levelId: 1,
      nativeElementId: 1,
      kind: "wall",
      ringsFeet: [rect(0, 0, 6, 1)],
    },
    {
      levelId: 1,
      nativeElementId: 2,
      kind: "wall",
      ringsFeet: [rect(5, 0, 5, 1)],
    },
    {
      levelId: 1,
      nativeElementId: 3,
      kind: "column",
      ringsFeet: [rect(4, 3, 1, 1)],
    },
  ];
  d.doors = [
    {
      id: "native-entrance",
      levelId: 1,
      nativeElementId: 4,
      pointFeet: [7, 0.5],
      footprintFeet: rect(6.5, -1, 1, 3),
      roomKeys: ["a"],
      state: "unmatched",
    },
  ];
  const before = JSON.stringify(d);
  const hidden = projectDisplayGeometry(d, [1], "all");
  const shown = projectDisplayGeometry(d, [1], "all", "", true);
  assert.equal(hidden.walls.features.length, 1);
  assert.equal(
    hidden.walls.features[0].geometry.coordinates.length,
    2,
    "Door remains a break in the merged wall",
  );
  assert.equal(
    shown.walls.features.filter((f) => f.properties?.kind === "column").length,
    1,
  );
  assert.deepEqual(
    shown.walls.features.filter((f) => f.properties?.kind === "wall"),
    hidden.walls.features,
  );
  assert.equal(JSON.stringify(d), before);
  validateIndoorDataset(d);
  assert.throws(() =>
    validateIndoorDataset({ ...d, walls: [{ ...d.walls[0], kind: "guess" }] }),
  );
  // Legacy unclassified geometry is preserved; don't guess which pieces are pillars.
  delete d.walls[2].kind;
  assert.equal(
    projectDisplayGeometry(d, [1], "all").walls.features[0].geometry.coordinates
      .length,
    3,
  );
});

test("hiding a wall pillar continues the wall at its own thickness and retains the doorway", () => {
  const d = fixture();
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
  ): [number, number][] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  d.walls = [
    {
      levelId: 1,
      nativeElementId: 1,
      kind: "wall",
      ringsFeet: [rect(0, 0, 4, 1)],
    },
    {
      levelId: 1,
      nativeElementId: 2,
      kind: "wall",
      ringsFeet: [rect(6, 0, 4, 1)],
    },
    {
      levelId: 1,
      nativeElementId: 3,
      kind: "column",
      ringsFeet: [rect(4, -1, 2, 3)],
    },
  ];
  const before = JSON.stringify(d);
  const hidden = projectDisplayGeometry(d, [1], "all");
  assert.equal(
    hidden.walls.features[0].geometry.coordinates.length,
    1,
    "Hidden pillar must not leave a gap in a straight wall",
  );
  const coordinates = hidden.walls.features[0].geometry.coordinates.flat(2);
  const bottom = geographicPoint(d, [0, 0])[1],
    top = geographicPoint(d, [0, 1])[1];
  assert.ok(
    coordinates.every((p) => p[1] >= bottom - 1e-10 && p[1] <= top + 1e-10),
    "Pillar must not create a bump in the wall",
  );
  assert.equal(JSON.stringify(d), before);
  d.doors = [
    {
      id: "door",
      levelId: 1,
      nativeElementId: 4,
      pointFeet: [5, 0.5],
      footprintFeet: rect(4.5, -2, 1, 5),
      roomKeys: ["a"],
      state: "unmatched",
    },
  ];
  assert.equal(
    projectDisplayGeometry(d, [1], "all").walls.features[0].geometry.coordinates
      .length,
    2,
    "Precise door cut survives wall continuation",
  );
});

test("every destination coverage agrees with corridor-preferred routing", () => {
  // A public room can connect two corridor components; type affects cost, not reachability.
  const d = fixture();
  d.records[1].circulation = false;
  d.edges.push({
    ...d.edges[1],
    id: "b-upper",
    from: "b",
    to: "upper",
    kind: "stairs",
    accessible: "no",
    roomKeys: ["b", "upper"],
    pointsFeet: [d.nodes[1].pointFeet, d.nodes[3].pointFeet],
  });
  for (const mode of ["public", "accessible"] as const) {
    const graph = projectRoutingGraph(d, mode);
    for (const start of d.records) {
      const reachable = reachableProjectDestinations(graph, start.key);
      for (const end of d.records)
        assert.equal(
          reachable.has(end.key),
          !!findProjectRoute(d, start.key, end.key, mode),
          `${mode}: ${start.key} → ${end.key}`,
        );
    }
  }
  assert.ok(
    reachableProjectDestinations(projectRoutingGraph(d), "upper").has("b"),
  );
  assert.ok(
    reachableProjectDestinations(projectRoutingGraph(d), "upper").has("a"),
  );
});

test("all-room coverage matches an independent pair-by-pair flood across mixed graphs", () => {
  let seed = 9381;
  const random = () =>
    (seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0) / 2 ** 32;
  for (let sample = 0; sample < 60; sample++) {
    const d = fixture();
    d.records = Array.from({ length: 9 }, (_, i) => ({
      ...d.records[0],
      key: `r${i}`,
      arrivalNodeId: `n${i}`,
      circulation: random() < 0.35,
      stair: random() < 0.15,
      walkable: random() > 0.08,
      access: random() < 0.1 ? "staff" : "unknown",
    }));
    d.nodes = d.records.map((r, i) => ({
      ...d.nodes[0],
      id: r.arrivalNodeId!,
      roomKey: r.key,
      pointFeet: [i, 0, 0],
    }));
    d.edges = [];
    for (let a = 0; a < 9; a++)
      for (let b = a + 1; b < 9; b++) {
        if (random() > 0.25) continue;
        const rooms = [d.records[a].key, d.records[b].key];
        if (random() < 0.2) rooms.push(d.records[Math.floor(random() * 9)].key);
        d.edges.push({
          ...fixture().edges[0],
          id: `${a}-${b}`,
          from: `n${a}`,
          to: `n${b}`,
          roomKeys: rooms,
          enabled: random() > 0.1,
          accessible: random() < 0.5 ? "yes" : "unknown",
        });
      }
    for (const mode of ["public", "accessible"] as const) {
      const graph = projectRoutingGraph(d, mode);
      for (const start of d.records) {
        const actual = reachableProjectDestinations(graph, start.key);
        for (const end of d.records) {
          const permitted = (r: IndoorRecord) =>
            r.walkable && r.access !== "staff";
          const queue =
            start.walkable && start.access !== "staff"
              ? [start.arrivalNodeId!]
              : [];
          const reached = new Set(queue);
          for (let i = 0; i < queue.length; i++)
            for (const edge of d.edges) {
              if (
                !edge.enabled ||
                (mode === "accessible" && edge.accessible !== "yes") ||
                edge.roomKeys.some(
                  (key) => !permitted(d.records.find((r) => r.key === key)!),
                )
              )
                continue;
              const next =
                edge.from === queue[i]
                  ? edge.to
                  : edge.to === queue[i]
                    ? edge.from
                    : undefined;
              if (next && !reached.has(next)) {
                reached.add(next);
                queue.push(next);
              }
            }
          const expected =
            end.walkable &&
            end.access !== "staff" &&
            reached.has(end.arrivalNodeId!);
          assert.equal(
            actual.has(end.key),
            expected,
            `sample ${sample}: ${mode} ${start.key} → ${end.key}`,
          );
        }
      }
    }
  }
});

test("room-to-room navigation preserves consecutive flights and arrival floor in both directions", () => {
  const d = fixture();
  d.records[0].circulation = false;
  d.records[2].circulation = false;
  d.records[2].levelId = 3;
  d.records[2].elevationFeet = 20;
  d.nodes[2].levelId = 3;
  d.nodes[2].pointFeet = [20, 0, 20];
  d.edges = [
    {
      ...d.edges[0],
      to: "upper",
      kind: "stairs",
      accessible: "no",
      roomKeys: ["a", "upper"],
      pointsFeet: [d.nodes[0].pointFeet, d.nodes[3].pointFeet],
    },
    {
      ...d.edges[1],
      from: "upper",
      kind: "stairs",
      accessible: "no",
      roomKeys: ["upper", "c"],
      pointsFeet: [d.nodes[3].pointFeet, d.nodes[2].pointFeet],
    },
  ];
  d.floors.push({
    id: "third",
    name: "Third",
    elevationFeet: 20,
    levelIds: [3],
  });
  for (const [start, end, levels, verb] of [
    ["a", "c", [2, 3], "up"],
    ["c", "a", [2, 1], "down"],
  ] as const) {
    const route = findProjectRoute(d, start, end)!;
    const steps = projectNavigationSteps(d, route, start, end);
    const changes = steps.filter((s) => s.type === "floor-change");
    assert.deepEqual(
      changes.map((s) => s.toLevel),
      levels,
    );
    assert.ok(changes.every((s) => s.message.includes(verb)));
    assert.equal(
      steps.at(-1)?.levelId,
      d.records.find((r) => r.key === end)!.levelId,
    );
    assert.equal(findProjectRoute(d, start, end, "accessible"), null);
  }
});

function withPresentation(): IndoorDataset {
  const d = fixture(),
    record = d.records[0];
  record.circulation = false;
  const interior: [number, number][][] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
  ];
  const block: [number, number][][] = [
    [
      [-1, -1],
      [11, -1],
      [11, 11],
      [-1, 11],
    ],
  ];
  d.presentation = {
    version: 1,
    generator: "reviter/native-room-presentation-1",
    sourceModelSha256: d.source.modelSha256,
    junctionToleranceFeet: 0.04,
    rooms: [
      {
        roomKey: record.key,
        levelId: record.levelId,
        sourceGeometryKey: JSON.stringify([record.levelId, record.ringsFeet]),
        interiorRingsFeet: interior,
        blockPartsFeet: [block],
        boundarySource: "native-wall-enclosure",
        boundaryElementIds: [1, 2],
        sourceCoverage: 1,
        cellCoverage: 1,
      },
    ],
    diagnostics: [],
  };
  return d;
}

test("prepared presentation rejects stale source geometry, wrong floors and malformed parts", () => {
  const d = withPresentation();
  validateIndoorDataset(d);
  for (const mutate of [
    (p: NonNullable<IndoorDataset["presentation"]>) => {
      p.sourceModelSha256 = "wrong";
    },
    (p: NonNullable<IndoorDataset["presentation"]>) => {
      p.rooms[0].levelId = 2;
    },
    (p: NonNullable<IndoorDataset["presentation"]>) => {
      p.rooms[0].sourceGeometryKey = "stale";
    },
    (p: NonNullable<IndoorDataset["presentation"]>) => {
      p.rooms[0].blockPartsFeet[0][0][0][0] = Number.NaN;
    },
    (p: NonNullable<IndoorDataset["presentation"]>) => {
      p.rooms.push(p.rooms[0]);
    },
  ]) {
    const copy = structuredClone(d);
    mutate(copy.presentation!);
    assert.throws(() => validateIndoorDataset(copy), /prepared room/);
  }
});

test("supported junction preparation version 2 accepts its measured cap tolerance and rejects unbounded expansion", () => {
  const d = withPresentation();
  d.presentation!.generator = "reviter/native-room-presentation-2";
  d.presentation!.junctionToleranceFeet = 0.08;
  validateIndoorDataset(d);
  d.presentation!.junctionToleranceFeet = 0.081;
  assert.throws(() => validateIndoorDataset(d), /prepared room/);
  d.presentation!.generator = "reviter/native-room-presentation-1";
  d.presentation!.junctionToleranceFeet = 0.08;
  assert.throws(() => validateIndoorDataset(d), /prepared room/);
});

test("prepared wall blocks survive metadata review and preserve graph and source footprints", async () => {
  const d = withPresentation();
  d.source.modelSha256 = await hash(strToU8("original rvt bytes"));
  d.presentation!.sourceModelSha256 = d.source.modelSha256;
  const project = await readIndoorProject(await archive(d));
  const source = JSON.stringify([
    project.dataset.records.map((r) => r.ringsFeet),
    project.dataset.nodes,
    project.dataset.edges,
  ]);
  const display = projectDisplayGeometry(project.dataset, [1], "01");
  const block = display.roomBlocks.features.find(
    (f) => f.properties?.key === "a",
  )!;
  assert.equal(block.properties?.boundarySource, "prepared-native-walls");
  assert.deepEqual(
    block.geometry.coordinates[0][0][0],
    geographicPoint(d, [-1, -1]),
  );
  assert.equal(
    JSON.stringify([
      project.dataset.records.map((r) => r.ringsFeet),
      project.dataset.nodes,
      project.dataset.edges,
    ]),
    source,
  );
  const reviewed = reviewArea(project, "a", { name: "Reviewed display name" });
  const restored = await readIndoorProject(await exportIndoorProject(reviewed));
  assert.equal(restored.dataset.records[0].name, "Reviewed display name");
  assert.deepEqual(restored.dataset.presentation, project.dataset.presentation);
  const disabled = reviewArea(reviewed, "a", { walkable: false });
  const blocked = await readIndoorProject(await exportIndoorProject(disabled));
  assert.equal(blocked.dataset.presentation!.rooms.length, 0);
  assert.equal(blocked.dataset.records[0].walkable, false);
  assert.equal(project.dataset.presentation!.rooms.length, 1);
  assert.equal(
    JSON.stringify([
      restored.dataset.records.map((r) => r.ringsFeet),
      restored.dataset.nodes,
      restored.dataset.edges,
    ]),
    source,
  );
});

test("three consecutive stair milestones remain clickable and aligned with progress on mobile and desktop", () => {
  const instructions = Array.from({ length: 53 }, (_, index) => ({
    type:
      index >= 16 && index <= 18
        ? ("floor-change" as const)
        : ("turn" as const),
  }));
  for (const width of [300, 326, 190]) {
    const positions = routeProgressPositions(instructions, width);
    assert.equal(positions[0], 0);
    assert.equal(positions.at(-1), 1);
    for (let i = 1; i < positions.length; i++)
      assert.ok(positions[i] >= positions[i - 1]);
    for (const [from, to] of [
      [0, 16],
      [16, 17],
      [17, 18],
      [18, 52],
    ])
      assert.ok((positions[to] - positions[from]) * width >= 28 - 1e-8);
  }
  const crowded = routeProgressPositions(
    Array.from({ length: 20 }, () => ({ type: "floor-change" })),
    200,
  );
  assert.ok(
    crowded.every(
      (p, i) => p >= 0 && p <= 1 && (i === 0 || p > crowded[i - 1]),
    ),
  );
});

function connectorFixture(
  kind: "elevator" | "escalator",
  direction: "both" | "from-to" | "to-from",
) {
  const d = fixture();
  d.source.modelSha256 = "a".repeat(64);
  d.connectors = [
    {
      id: "vertical",
      kind,
      direction,
      nativeElementId: 900,
      sourceModelSha256: d.source.modelSha256,
      evidence: "reviewed native entrance identities",
      accessible: kind === "elevator" ? "yes" : "no",
      entrances: [
        { nodeId: "a", roomKey: "a", levelId: 1 },
        { nodeId: "upper", roomKey: "upper", levelId: 2 },
      ],
    },
  ];
  d.edges = [
    {
      id: "vertical",
      from: "a",
      to: "upper",
      kind,
      direction,
      connectorId: "vertical",
      nativeElementId: 900,
      evidence: d.connectors[0].evidence,
      accessible: d.connectors[0].accessible,
      enabled: true,
      lengthMetres: 3.048,
      pointsFeet: [
        [0, 0, 0],
        [0, 0, 10],
      ],
      roomKeys: ["a", "upper"],
    },
  ];
  return d;
}
test("explicit served-floor elevators retain vertical paths and matching instruction type", () => {
  const d = connectorFixture("elevator", "both");
  validateIndoorDataset(d);
  const route = findProjectRoute(d, "a", "upper", "accessible");
  assert.ok(route);
  assert.equal(route.paths[0].centered, false);
  assert.deepEqual(route.paths[0].levelIds, [1, 2]);
  const step = projectNavigationSteps(d, route, "Lobby", "Upper")[0];
  assert.equal(step.networkType, "elevator");
  assert.match(step.message, /elevator up to Second/);
  assert.ok(findProjectRoute(d, "upper", "a", "accessible"));
});
test("vertical movement within a combined campus floor retains the native transition", () => {
  const d = connectorFixture("elevator", "both");
  const route = findProjectRoute(d, "a", "upper", "accessible")!;
  d.floors = [
    {
      id: "storey:1+2",
      name: "Campus Floor 3",
      levelIds: [1, 2],
      elevationFeet: 0,
    },
  ];
  const step = projectNavigationSteps(d, route, "Lobby", "Upper")[0];
  assert.match(step.message, /elevator up within Campus Floor 3/);
  assert.equal(step.floorsTraversed, 0);
  assert.equal(step.fromLevel, 1);
  assert.equal(step.toLevel, 2);
  assert.deepEqual(step.pointsFeet, route.paths[0].pointsFeet);
});
test("source connector binding rejects guessed links and stale individual accessibility reviews", () => {
  const d = connectorFixture("elevator", "both");
  for (const [index, entry] of d.connectors![0].entrances.entries()) {
    const previous = entry.nodeId,
      next = `connector:vertical:${index}`;
    d.nodes.find((n) => n.id === previous)!.id = next;
    d.records.find((r) => r.arrivalNodeId === previous)!.arrivalNodeId = next;
    entry.nodeId = next;
    for (const e of d.edges) {
      if (e.from === previous) e.from = next;
      if (e.to === previous) e.to = next;
    }
  }
  const source = {
    version: 1,
    modelSha256: d.source.modelSha256,
    connectors: [
      {
        ...d.connectors![0],
        entrances: d.connectors![0].entrances.map((entry) => ({
          ...entry,
          pointFeet: d.nodes
            .find((n) => n.id === entry.nodeId)!
            .pointFeet.slice(0, 2),
        })),
      },
    ],
  };
  validateConnectorBinding(d, source);
  assert.throws(
    () => validateConnectorBinding(d, undefined as never),
    /matching source/,
  );
  const wrong = structuredClone(source);
  wrong.connectors[0].entrances[0].levelId = 2;
  assert.throws(() => validateConnectorBinding(d, wrong), /served entrances/);
  d.edges[0].accessible = "unknown";
  assert.throws(
    () => validateConnectorBinding(d, source),
    /accessibility review/,
  );
  const geometryKey = JSON.stringify([
    d.source.modelSha256,
    d.edges[0].from,
    d.edges[0].to,
    d.edges[0].roomKeys,
    d.edges[0].pointsFeet,
  ]);
  validateConnectorBinding(d, source, {
    edges: { vertical: { accessible: "unknown", geometryKey } },
  });
  assert.throws(
    () =>
      validateConnectorBinding(d, source, {
        edges: { vertical: { accessible: "unknown", geometryKey: "old" } },
      }),
    /accessibility review/,
  );
});
test("one-way escalators prohibit reversed public routes and every step-free route", () => {
  const d = connectorFixture("escalator", "from-to");
  validateIndoorDataset(d);
  assert.ok(findProjectRoute(d, "a", "upper"));
  assert.equal(findProjectRoute(d, "upper", "a"), null);
  assert.equal(findProjectRoute(d, "a", "upper", "accessible"), null);
  assert.match(
    projectRouteFailure(d, "upper", "a", "public"),
    /against its saved travel direction/,
  );
  const reversed = connectorFixture("escalator", "to-from");
  validateIndoorDataset(reversed);
  assert.ok(findProjectRoute(reversed, "upper", "a"));
  assert.equal(findProjectRoute(reversed, "a", "upper"), null);
});
test("vertical connector metadata cannot authorize missing floors, stale bytes or mismatched edges", () => {
  const stale = connectorFixture("elevator", "both");
  stale.connectors![0].sourceModelSha256 = "b".repeat(64);
  assert.throws(() => validateIndoorDataset(stale), /model-bound/);
  const mismatch = connectorFixture("escalator", "from-to");
  mismatch.edges[0].direction = "both";
  assert.throws(() => validateIndoorDataset(mismatch), /reviewed served/);
  const missing = connectorFixture("elevator", "both");
  delete missing.connectors;
  assert.throws(() => validateIndoorDataset(missing), /reviewed served/);
});

test("local steps show once on a combined campus floor with direction and keep separate native endpoints", () => {
  const d = fixture();
  d.edges = [
    {
      id: "local:test",
      from: "a",
      to: "upper",
      kind: "local-steps",
      pointsFeet: [
        [0, 0, 0],
        [0, 0, 10],
      ],
      lengthMetres: 3.048,
      roomKeys: ["a", "upper"],
      nativeElementId: 456,
      evidence: "user-reported + native-supported",
      accessible: "no",
      enabled: true,
    },
  ];
  d.floors = [
    {
      id: "campus",
      name: "Campus Floor 1",
      levelIds: [1, 2],
      elevationFeet: 0,
    },
  ];
  const before = JSON.stringify(d);
  const combined = projectConnectorMarkers(d, [1, 2], "all");
  assert.equal(combined.features.length, 1);
  assert.equal(
    combined.features[0].properties?.name,
    "Steps up · local level change",
  );
  assert.deepEqual(
    combined.features[0].geometry.coordinates,
    geographicPoint(d, d.nodes[0].pointFeet),
  );
  assert.equal(
    projectConnectorMarkers(d, [2], "all").features[0].properties?.name,
    "Steps down · local level change",
  );
  assert.equal(connectionName(d.edges[0]), "Local steps");
  const source = sourceModelConnectorMarkers(d, combined, [1, 2]);
  assert.equal(source.features[0].properties?.heightMetres, 0.15);
  assert.equal(combined.features[0].properties?.heightMetres, 0.65);
  const upper = sourceModelConnectorMarkers(
    d,
    projectConnectorMarkers(d, [2], "all"),
    [1, 2],
  );
  assert.ok(
    Math.abs(Number(upper.features[0].properties?.heightMetres) - 3.198) < 1e-9,
  );
  assert.match(
    connectionLevelChange(d, d.edges[0]),
    /3.05 m elevation change within Campus Floor 1/,
  );
  assert.equal(JSON.stringify(d), before);
});
test("ramps retain their route geometry and need independent step-free verification", () => {
  const d = fixture();
  d.edges = [
    {
      id: "ramp:test",
      from: "a",
      to: "upper",
      kind: "ramp",
      pointsFeet: [
        [0, 0, 0],
        [0, 0, 10],
      ],
      lengthMetres: 3.048,
      roomKeys: ["a", "upper"],
      evidence: "reviewed ramp",
      accessible: "unknown",
      enabled: true,
    },
  ];
  validateIndoorDataset(d);
  assert.ok(findProjectRoute(d, "a", "upper"));
  assert.equal(findProjectRoute(d, "a", "upper", "accessible"), null);
  assert.equal(
    projectConnectorMarkers(d, [1], "all").features[0].properties?.kind,
    "ramp",
  );
  assert.equal(
    projectConnectorMarkers(d, [2], "all").features[0].properties?.name,
    "Ramp down · local level change",
  );
  d.edges[0].accessible = "yes";
  validateIndoorDataset(d);
  const route = findProjectRoute(d, "a", "upper", "accessible")!;
  assert.ok(route);
  assert.deepEqual(route.paths[0].pointsFeet, d.edges[0].pointsFeet);
  const instruction = projectNavigationSteps(d, route, "A", "Upper")[0];
  assert.equal(instruction.networkType, "ramp");
  assert.match(instruction.message, /Take the ramp up/);
  const landing = {
    ...d.records[3],
    key: "landing:test",
    number: "",
    name: "Native connection landing",
    building: "08",
  };
  d.records.push(landing);
  assert.match(
    connectionAreaName(d, landing.key),
    /Building 08 landing \(generated; no source room outline\)/,
  );
});
test("source stair markers include unresolved stairs and use the actual served floor endpoint", () => {
  const d = fixture();
  d.records[0].stair = true;
  delete d.records[0].arrivalNodeId;
  const before = JSON.stringify(d);
  const source = projectConnectorMarkers(d, [1], "01");
  assert.equal(source.features.length, 1);
  assert.equal(source.features[0].properties?.review, true);
  assert.ok(
    booleanPointInPolygon(stairDisplayPoint(d, d.records[0])!, {
      type: "Polygon",
      coordinates: d.records[0].ringsFeet.map((ring) => [...ring, ring[0]]),
    }),
  );
  assert.equal(JSON.stringify(d), before);
  const lift = connectorFixture("elevator", "both");
  lift.nodes[0].pointFeet = [1, 2, 0];
  lift.nodes[3].pointFeet = [8, 9, 10];
  const lower = projectConnectorMarkers(lift, [1], "01"),
    upper = projectConnectorMarkers(lift, [2], "01");
  assert.equal(lower.features.length, 1);
  assert.equal(upper.features.length, 1);
  assert.deepEqual(
    lower.features[0].geometry.coordinates,
    geographicPoint(lift, [1, 2]),
  );
  assert.deepEqual(
    upper.features[0].geometry.coordinates,
    geographicPoint(lift, [8, 9]),
  );
});
test("elevator reviews survive ZIP export without authorizing invented graph connections", async () => {
  const p = await readIndoorProject(await archive());
  const review = {
    id: "Library lift",
    kind: "elevator" as const,
    nativeElementId: 900,
    evidence: "Verified native lift and entrances",
    accessible: "unknown" as const,
    direction: "both" as const,
    entrances: [
      {
        roomKey: "a",
        levelId: 1,
        nativeElementId: 901,
        pointFeet: [3, 3] as [number, number],
      },
      {
        roomKey: "upper",
        levelId: 2,
        nativeElementId: 902,
        pointFeet: [4, 4] as [number, number],
      },
    ],
  };
  const next = reviewConnector(p, review);
  assert.equal(next.dataset, p.dataset);
  assert.equal(findProjectRoute(next.dataset, "a", "upper"), null);
  const restored = await readIndoorProject(await exportIndoorProject(next));
  assert.deepEqual(sourceConnectorReview(restored).connectors, [review]);
  assert.equal(restored.manifest.model.sha256, p.manifest.model.sha256);
  assert.equal(
    projectConnectorMarkers(
      restored.dataset,
      [2],
      "01",
      sourceConnectorReview(restored),
    ).features[0].properties?.review,
    true,
  );
  assert.throws(
    () =>
      reviewConnector(p, {
        ...review,
        entrances: [
          review.entrances[0],
          { ...review.entrances[1], pointFeet: [30, 30] },
        ],
      }),
    /inside a walkable/,
  );
  assert.throws(
    () =>
      reviewConnector(p, {
        ...review,
        entrances: [
          review.entrances[0],
          { ...review.entrances[1], levelId: 1 },
        ],
      }),
    /distinct served floors/,
  );
  assert.throws(
    () =>
      reviewConnector(p, {
        ...review,
        entrances: [
          review.entrances[0],
          { ...review.entrances[1], roomKey: "c", levelId: 1 },
        ],
      }),
    /distinct served floors/,
  );
});
test("native connector reviews require current owned floor faces rather than old label outlines", async () => {
  const p = await readIndoorProject(await archive());
  const { nativeCirculationGeometryKey } = await import(
    "../../app/indoor-project/native-circulation"
  );
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
  const envelope = {
    version: 1 as const,
    sourceModelSha256: p.dataset.source.modelSha256,
    geometrySha256: "a".repeat(64),
    levels: [],
  };
  p.dataset.nativeIndoorEnvelopes = envelope;
  p.dataset.circulationGeometry = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    sourceGeometryKey: nativeCirculationGeometryKey(p.dataset),
    cells: [
      {
        id: "lower",
        roomKeys: ["a"],
        levelIds: [1],
        elevationFeet: 0,
        nativeFloorIds: [100],
        sourceCoverage: 1,
        ringsFeet: [rect(0, 0, 5, 5), rect(1, 1, 2, 2)],
      },
      {
        id: "upper",
        roomKeys: ["upper"],
        levelIds: [2],
        elevationFeet: 10,
        nativeFloorIds: [101],
        sourceCoverage: 1,
        ringsFeet: [rect(0, 0, 15, 5)],
      },
    ],
  };
  const review = {
    id: "Native lift",
    kind: "elevator" as const,
    nativeElementId: 900,
    evidence: "Checked native lobby faces",
    accessible: "unknown" as const,
    direction: "both" as const,
    entrances: [
      {
        roomKey: "a",
        levelId: 1,
        nativeElementId: 901,
        pointFeet: [3, 3] as [number, number],
      },
      {
        roomKey: "upper",
        levelId: 2,
        nativeElementId: 902,
        pointFeet: [12, 3] as [number, number],
      },
    ],
  };
  bindFixtureExactCells(p.dataset);
  const graphBefore = JSON.stringify([p.dataset.nodes, p.dataset.edges]);
  assert.equal(
    sourceConnectorReview(reviewConnector(p, review)).connectors.length,
    1,
  );
  assert.equal(JSON.stringify([p.dataset.nodes, p.dataset.edges]), graphBefore);
  for (const pointFeet of [
    [8, 3],
    [1.5, 1.5],
  ] as [number, number][]) {
    assert.throws(
      () =>
        reviewConnector(p, {
          ...review,
          entrances: [
            { ...review.entrances[0], pointFeet },
            review.entrances[1],
          ],
        }),
      /current native floor face/,
    );
  }
  const wrongOwner = structuredClone(p);
  wrongOwner.dataset.circulationGeometry!.cells[0].roomKeys = ["b"];
  assert.throws(
    () => reviewConnector(wrongOwner, review),
    /current native floor face/,
  );
  const stale = structuredClone(p);
  stale.dataset.walls.push({
    nativeElementId: 999,
    levelId: 1,
    kind: "wall",
    ringsFeet: [rect(4, 0, 5, 5)],
  });
  assert.throws(
    () => reviewConnector(stale, review),
    /current native floor face/,
  );
});
test("visitor presentation hides isolated unmapped wall components while preserving actual room walls and holes", () => {
  const d = fixture(),
    r = d.records[0];
  r.ringsFeet = [
    [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ],
    [
      [6, 6],
      [14, 6],
      [14, 14],
      [6, 14],
    ],
  ];
  const parts = [
    [
      [
        [-1, -1],
        [21, -1],
        [21, 0],
        [-1, 0],
        [-1, -1],
      ],
    ],
    [
      [
        [100, 100],
        [120, 100],
        [120, 101],
        [100, 101],
        [100, 100],
      ],
    ],
    [
      [
        [9.5, 9.5],
        [10.5, 9.5],
        [10.5, 10.5],
        [9.5, 10.5],
        [9.5, 9.5],
      ],
    ],
  ] as [number, number][][][];
  const walls = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { levelId: 1 },
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: parts.map((p) =>
            p.map((r) => r.map((q) => geographicPoint(d, q))),
          ),
        },
      },
    ],
  };
  const snapshot = JSON.stringify(walls);
  const visitor = visitorWallGeometry(d, walls, [r]);
  assert.equal(visitor.features[0].geometry.coordinates.length, 1);
  assert.equal(JSON.stringify(walls), snapshot);
  assert.equal(
    visitor.features[0].geometry.coordinates[0],
    walls.features[0].geometry.coordinates[0],
  );
});

test("map annotations retain floor/model identity and original geometry through ZIP export", async () => {
  const original = await readIndoorProject(await archive());
  const label: MapAnnotation = {
    id: "label-1",
    kind: "label",
    levelId: 1,
    text: "Help desk",
    notes: "By the entrance",
    color: "#007d8a",
    fontSize: 16,
    pointsFeet: [[4, 5]],
  };
  const area: MapAnnotation = {
    ...label,
    id: "area-1",
    kind: "area",
    levelId: 2,
    text: "Study area",
    pointsFeet: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
  };
  const edited = setMapAnnotations(original, [label, area]);
  assert.equal(edited.dataset, original.dataset);
  assert.equal(original.rooms.mapEdits, undefined);
  const restored = await readIndoorProject(await exportIndoorProject(edited));
  assert.deepEqual(restored.rooms.mapEdits?.annotations, [label, area]);
  for (const key of [
    "records",
    "nodes",
    "edges",
    "walls",
    "alignment",
  ] as const)
    assert.deepEqual(restored.dataset[key], original.dataset[key]);
  assert.deepEqual(
    restored.files["model/fixture.rvt"],
    original.files["model/fixture.rvt"],
  );
  assert.deepEqual(
    restored.files["gis/reference-points.json"],
    original.files["gis/reference-points.json"],
  );
  assert.deepEqual(restored.rooms.annotations, original.rooms.annotations);
  assert.equal(restored.manifest.model.sha256, original.manifest.model.sha256);
});

test("map annotation validation rejects invalid geometry, duplicate IDs and foreign model/floor data", async () => {
  const project = await readIndoorProject(await archive());
  const item: MapAnnotation = {
    id: "label",
    kind: "label",
    levelId: 1,
    text: "Desk",
    notes: "",
    color: "#007d8a",
    fontSize: 16,
    pointsFeet: [[4, 5]],
  };
  const validate = (annotations: MapAnnotation[]) =>
    setMapAnnotations(project, annotations);
  assert.throws(() => validate([item, item]), /Invalid map annotation/);
  assert.throws(
    () => validate([{ ...item, levelId: 99 }]),
    /Invalid map annotation/,
  );
  assert.throws(
    () => validate([{ ...item, text: " " }]),
    /Invalid map annotation/,
  );
  assert.throws(
    () => validate([{ ...item, pointsFeet: [[Number.NaN, 5]] }]),
    /Invalid map annotation/,
  );
  assert.throws(
    () =>
      validate([
        {
          ...item,
          kind: "area",
          pointsFeet: [
            [0, 0],
            [10, 10],
            [0, 10],
            [10, 0],
          ],
        },
      ]),
    /cannot cross/,
  );
  assert.throws(
    () =>
      validate([
        {
          ...item,
          kind: "area",
          pointsFeet: [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
        },
      ]),
    /non-collinear/,
  );
  assert.throws(
    () =>
      validateMapEdits(
        { version: 1, sourceModelSha256: "another-model", annotations: [item] },
        project.dataset,
      ),
    /match this model/,
  );
  const invalid = {
    ...project,
    rooms: {
      ...project.rooms,
      mapEdits: {
        version: 1 as const,
        sourceModelSha256: project.dataset.source.modelSha256,
        annotations: [{ ...item, levelId: 99 }],
      },
    },
  };
  await assert.rejects(
    () => exportIndoorProject(invalid),
    /Invalid map annotation/,
  );
});

test("map placement inverts rotated GIS alignment and moves all area corners equally", () => {
  const data = fixture();
  data.alignment.rotationRadians = 0.7;
  data.alignment.originFeet = [125, -340, 0];
  for (const p of [
    [100, 200],
    [-2000, 1100],
    [125, -340],
  ] as [number, number][]) {
    const result = nativeEditPoint(data, geographicPoint(data, p));
    assert.ok(Math.hypot(result[0] - p[0], result[1] - p[1]) < 0.000_001);
  }
  const area: MapAnnotation = {
    id: "a",
    kind: "area",
    levelId: 1,
    text: "Area",
    notes: "",
    color: "#007d8a",
    fontSize: 16,
    pointsFeet: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
  };
  const moved = moveMapAnnotation(area, [5, 7]);
  assert.deepEqual(moved.pointsFeet, [
    [5, 7],
    [15, 7],
    [15, 17],
  ]);
  assert.deepEqual(area.pointsFeet, [
    [0, 0],
    [10, 0],
    [10, 10],
  ]);
});

test("managed locations, linked labels, floor names and objects survive ZIP round trip without changing routing", async () => {
  const original = await readIndoorProject(await archive());
  const room = original.dataset.records[0];
  const location: MapLocation = {
    id: "help",
    name: "Student support",
    description: "Registration help",
    category: "department",
    tags: ["advising"],
    color: "#007d8a",
    symbol: "information",
    roomKeys: [room.key],
    website: "https://example.org/help",
    phone: "250-555-0100",
    hours: "Mon–Fri 9–5",
    links: [{ title: "Contact", url: "https://example.org/contact" }],
    photos: ["https://example.org/photo.jpg"],
    logo: "",
    showLabel: true,
  };
  let next = setMapLocations(original, [location]);
  next = setFloorDisplayName(
    next,
    original.dataset.floors[0].id,
    "Ground floor",
  );
  next = setMapAnnotations(next, [
    {
      id: "rectangle",
      kind: "area",
      shape: "rectangle",
      levelId: room.levelId,
      text: "Study zone",
      notes: "",
      color: "#007d8a",
      fontSize: 16,
      symbol: "study",
      rotation: 15,
      pointsFeet: shapePoints("rectangle", [
        [1, 1],
        [8, 5],
      ]),
    },
    {
      id: "distance",
      kind: "line",
      shape: "measure",
      levelId: room.levelId,
      text: "Desk span",
      notes: "",
      color: "#007d8a",
      fontSize: 16,
      pointsFeet: [
        [1, 1],
        [5, 1],
      ],
    },
  ]);
  const restored = await readIndoorProject(await exportIndoorProject(next));
  assert.deepEqual(restored.rooms.mapEdits, next.rooms.mapEdits);
  assert.deepEqual(restored.dataset.nodes, original.dataset.nodes);
  assert.deepEqual(restored.dataset.edges, original.dataset.edges);
  assert.deepEqual(restored.dataset.records, original.dataset.records);
  assert.deepEqual(
    restored.files["model/fixture.rvt"],
    original.files["model/fixture.rvt"],
  );
  assert.equal(locationAnnotations(restored)[0].levelId, room.levelId);
  assert.equal(
    editorVisitorDataset(restored).visitor?.places[room.key].displayName,
    location.name,
  );
  assert.equal(editorVisitorDataset(restored).floors[0].name, "Ground floor");
  assert.equal(original.rooms.mapEdits, undefined);
  assert.equal(
    shapePoints("circle", [
      [0, 0],
      [2, 0],
    ]).length,
    48,
  );
  assert.throws(
    () =>
      setMapLocations(original, [
        { ...location, website: "javascript:alert(1)" },
      ]),
    /Invalid location/,
  );
  assert.throws(
    () =>
      setMapLocations(original, [location, { ...location, id: "duplicate" }]),
    /only one/,
  );
  assert.throws(
    () => setMapLocations(original, [{ ...location, symbol: "constructor" }]),
    /Invalid location/,
  );
  assert.throws(
    () => setFloorDisplayName(original, "unknown", "Bad"),
    /Invalid floor/,
  );
});

test("reviewed native shafts can span building labels while retaining source identity", () => {
  const d = connectorFixture("elevator", "both");
  d.records.find((r) => r.key === "upper")!.building = "02";
  d.nodes.find((n) => n.id === "upper")!.building = "02";
  assert.throws(() => validateIndoorDataset(d), /connector/);
  const c = d.connectors![0];
  c.reviewedShaft = {
    pinId: "user-pin",
    pointFeet: [0, 0],
    wallElementIds: [900, 901, 902],
  };
  validateIndoorDataset(d);
  assert.ok(findProjectRoute(d, "a", "upper"));
  c.reviewedShaft.wallElementIds = [900, 901];
  assert.throws(() => validateIndoorDataset(d), /connector/);
});
test("shared-room native stair display requires review and never adds a stair route", () => {
  const d = fixture(),
    r = d.records[0];
  const before = JSON.stringify([d.nodes, d.edges, r]);
  d.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: d.source.modelSha256,
    flights: [
      {
        roomKey: r.key,
        levelId: r.levelId,
        floorElevationFeet: r.elevationFeet,
        sourceGeometryKey: JSON.stringify([
          r.levelId,
          r.elevationFeet,
          r.ringsFeet,
        ]),
        stairElementId: 900,
        displayOnly: true,
        treads: [
          {
            runElementId: 901,
            elevationFeet: 3,
            ringFeet: [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
            ],
          },
        ],
      },
    ],
  };
  validateIndoorDataset(d);
  assert.equal(
    projectStairDisplay(d, [r.levelId], r.building).features.length,
    1,
  );
  assert.throws(
    () => validateSharedStairBinding(d, [{ key: r.key }]),
    /source review/,
  );
  validateSharedStairBinding(d, [
    { key: r.key, stairDisplayOnlyFlightIds: [900] },
  ]);
  assert.equal(JSON.stringify([d.nodes, d.edges, r]), before);
  assert.ok(
    projectConnectorMarkers(d, [r.levelId], r.building).features.some(
      (f) => f.properties?.name === "Stairs · native flight #900",
    ),
  );
});

test("rounding does not split a direct lift ride into intermediate floor stops", () => {
  const d = connectorFixture("elevator", "both"),
    c = d.connectors![0],
    upper = d.records.find((r) => r.key === "upper")!,
    un = d.nodes.find((n) => n.id === "upper")!;
  d.records.push({
    ...upper,
    key: "mid",
    levelId: 3,
    circulation: true,
    arrivalNodeId: "mid",
    elevationFeet: 4.4 / 0.3048,
  });
  d.nodes.push({
    ...un,
    id: "mid",
    roomKey: "mid",
    levelId: 3,
    pointFeet: [0, 0, 4.4 / 0.3048],
  });
  d.nativeLevels.push({ id: 3, name: "Middle", elevationFeet: 4.4 / 0.3048 });
  d.floors.push({
    id: "middle",
    name: "Middle",
    levelIds: [3],
    elevationFeet: 4.4 / 0.3048,
  });
  c.entrances.splice(1, 0, { nodeId: "mid", roomKey: "mid", levelId: 3 });
  const direct = d.edges[0];
  direct.lengthMetres = 9.100_000_000_000_001;
  upper.elevationFeet = direct.lengthMetres / 0.3048;
  un.pointFeet = [0, 0, upper.elevationFeet];
  d.nativeLevels.find((l) => l.id === 2)!.elevationFeet = upper.elevationFeet;
  d.floors.find((f) => f.levelIds.includes(2))!.elevationFeet =
    upper.elevationFeet;
  direct.pointsFeet = [
    d.nodes.find((n) => n.id === direct.from)!.pointFeet,
    un.pointFeet,
  ];
  d.edges.push(
    {
      ...direct,
      id: "first-ride",
      to: "mid",
      roomKeys: ["a", "mid"],
      lengthMetres: 4.4,
      pointsFeet: [
        direct.pointsFeet[0],
        d.nodes.find((n) => n.id === "mid")!.pointFeet,
      ],
    },
    {
      ...direct,
      id: "second-ride",
      from: "mid",
      roomKeys: ["mid", "upper"],
      lengthMetres: 4.7,
      pointsFeet: [
        d.nodes.find((n) => n.id === "mid")!.pointFeet,
        un.pointFeet,
      ],
    },
  );
  for (const edge of d.edges)
    edge.pointsFeet = [
      d.nodes.find((n) => n.id === edge.from)!.pointFeet,
      d.nodes.find((n) => n.id === edge.to)!.pointFeet,
    ];
  validateIndoorDataset(d);
  const route = findProjectRoute(d, "a", "upper")!;
  assert.deepEqual(
    route.edges.map((e) => e.id),
    ["vertical"],
  );
  assert.equal(
    projectNavigationSteps(d, route, "A", "B").filter(
      (s) => s.networkType === "elevator",
    ).length,
    1,
  );
});

test("confirmed passage preference survives both exports without changing display or bypassing door rules", async () => {
  const d = fixture();
  d.records[1].circulation = false;
  const project = await readIndoorProject(await archive(d));
  const before = JSON.stringify(project.dataset.records[1].ringsFeet);
  const initialRoute = findProjectRoute(project.dataset, "a", "c")!;
  assert.ok(initialRoute);
  assert.throws(
    () => reviewArea(project, "b", { throughNavigation: true }),
    /note describing/,
  );
  const reviewed = reviewArea(project, "b", {
    throughNavigation: true,
    notes: "Confirmed public passage through reception to the washrooms.",
  });
  assert.equal(reviewed.dataset.records[1].circulation, false);
  assert.equal(JSON.stringify(reviewed.dataset.records[1].ringsFeet), before);
  assert.ok(
    findProjectRoute(reviewed.dataset, "a", "c")!.preferenceCost! <
      initialRoute.preferenceCost!,
  );
  assert.ok(
    reachableProjectDestinations(
      projectRoutingGraph(reviewed.dataset),
      "a",
    ).has("c"),
  );
  assert.equal(
    createProjectRouteDiagnostics(reviewed.dataset).inspect("a", "c").kind,
    "connected",
  );
  for (const bytes of [
    await exportIndoorProject(reviewed),
    await exportCampusViewer(reviewed),
  ]) {
    const restored = await readIndoorProject(bytes);
    assert.ok(findProjectRoute(restored.dataset, "a", "c"));
    assert.equal(restored.dataset.records[1].circulation, false);
  }
  const revoked = reviewArea(reviewed, "b", { throughNavigation: false });
  assert.equal(
    findProjectRoute(revoked.dataset, "a", "c")!.preferenceCost,
    initialRoute.preferenceCost,
  );
  const closed = reviewEdge(reviewed, "bc", { enabled: false });
  assert.equal(findProjectRoute(closed.dataset, "a", "c"), null);
  const staff = reviewArea(reviewed, "b", { access: "staff" });
  assert.equal(findProjectRoute(staff.dataset, "a", "c"), null);
  assert.throws(
    () => reviewArea(staff, "b", { throughNavigation: true, notes: "Passage" }),
    /non-staff/,
  );
  const stale = structuredClone(reviewed.dataset);
  stale.records[1].ringsFeet[0][0][0] += 0.01;
  assert.equal(
    findProjectRoute(stale, "a", "c")!.preferenceCost,
    initialRoute.preferenceCost,
  );
});

test("corridor preference chooses a reasonable detour and permits an ordinary-room fallback", () => {
  const d = fixture();
  d.records[1].circulation = false;
  d.edges.push({
    ...d.edges[0],
    id: "corridor-ac",
    from: "a",
    to: "c",
    lengthMetres: 15,
    roomKeys: ["a", "c"],
  });
  let route = findProjectRoute(d, "a", "c")!;
  assert.deepEqual(
    route.edges.map((e) => e.id),
    ["corridor-ac"],
  );
  assert.equal(route.sourceDistanceMetres, 15);
  d.edges.pop();
  route = findProjectRoute(d, "a", "c")!;
  assert.deepEqual(
    route.edges.map((e) => e.id),
    ["ab", "bc"],
  );
  assert.equal(route.sourceDistanceMetres, 6.096);
  assert.ok(route.preferenceCost! > route.sourceDistanceMetres);
});

test("routing preparation preserves every source asset in master and viewer packages", async () => {
  const bytes = await archive();
  const raw = unzipSync(bytes);
  // Preserve authored formatting too, rather than only equivalent room JSON.
  raw["floors/rooms.json"] = strToU8(
    JSON.stringify(JSON.parse(strFromU8(raw["floors/rooms.json"])), null, 2),
  );
  const manifest = JSON.parse(strFromU8(raw["manifest.json"]));
  manifest.floors.bytes = raw["floors/rooms.json"].length;
  manifest.floors.sha256 = await hash(raw["floors/rooms.json"]);
  const data = JSON.parse(strFromU8(raw["viewer/indoor.json"]));
  data.source.roomsSha256 = manifest.floors.sha256;
  raw["viewer/indoor.json"] = strToU8(JSON.stringify(data));
  manifest.indoor.bytes = raw["viewer/indoor.json"].length;
  manifest.indoor.sha256 = await hash(raw["viewer/indoor.json"]);
  raw["manifest.json"] = strToU8(JSON.stringify(manifest));
  const master = await readIndoorProject(zipSync(raw));
  const viewer = await readIndoorProject(await exportCampusViewer(master));
  for (const project of [master, viewer]) {
    const prepared = await prepareRouting(project.dataset);
    const result = await readIndoorProject(
      await exportPreparedRoutingProject(project, prepared.dataset),
    );
    assert.deepEqual(result.dataset, prepared.dataset);
    for (const [path, asset] of Object.entries(project.files))
      if (!["manifest.json", "viewer/indoor.json"].includes(path))
        assert.deepEqual(result.files[path], asset, path);
    const edited = structuredClone(prepared.dataset);
    edited.records[0].name = "Changed room";
    await assert.rejects(
      exportPreparedRoutingProject(project, edited),
      /cannot modify source/,
    );
  }
});

test("strict visitor physical bindings preserve native cells and routes while stripping private notes", async () => {
  const p = await readIndoorProject(await archive()),
    d = p.dataset;
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const { nativeMaterialSectionsHash } = await import(
    "../../app/indoor-project/native-material-sections"
  );
  const { nativeCirculationGeometryKey, nativeCirculationCells } = await import(
    "../../app/indoor-project/native-circulation"
  );
  const { nativeSourceStairPlacementHash } = await import(
    "../../app/indoor-project/native-source-stair-material"
  );
  const pc = (await import("polygon-clipping")).default;
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
  ): [number, number][][] => [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
  ];
  const original = rect(0, 10.002, 10, 0.3),
    corrected = rect(0, 9.9998, 10, 0.3),
    support = rect(0, 9, 10, 1),
    floor = rect(-2, -2, 24, 15);
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [0, 10].map((z, i) => ({
      nativeElementId: 1000 + i,
      elevationFeet: z,
      ringsFeet: floor,
    })),
  };
  const env = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [0, 10].map((z, i) => ({
      levelId: i + 1,
      elevationFeet: z,
      partsFeet: [floor],
      sourceElementIds: [1000 + i, 10, 11],
      cutElevationsFeet: [z + 4],
      evidenceSha256: "a".repeat(64),
    })),
  };
  d.nativeIndoorEnvelopes = {
    ...env,
    geometrySha256: await nativeIndoorEnvelopeHash(env),
  };
  d.walls = [
    { levelId: 1, nativeElementId: 10, kind: "wall", ringsFeet: original },
    { levelId: 1, nativeElementId: 11, kind: "wall", ringsFeet: support },
  ];
  d.nativeWallPositionRepairs = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    walls: [
      {
        id: "placement",
        levelId: 1,
        nativeElementId: 10,
        originalRingsFeet: original,
        ringsFeet: corrected,
        supportEvidence: { nativeElementId: 11, ringsFeet: support },
        evidenceSha256: "a".repeat(64),
        notes: "Private authoring conversation",
      },
    ],
  };
  const mats = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [0.1, 4].map((cut) => ({
      levelId: 1,
      elevationFeet: 0,
      cutElevationFeet: cut,
      evidenceSha256: "b".repeat(64),
      sourceElementIds: [10, 11],
      sections: [original, support].map((r, i) => ({
        nativeElementId: 10 + i,
        categoryId: -2000011,
        kind: "wall" as const,
        baseElevationFeet: 0,
        topElevationFeet: 8,
        partsFeet: [r],
      })),
    })),
  };
  d.nativeMaterialSections = {
    ...mats,
    geometrySha256: await nativeMaterialSectionsHash(mats),
  };
  d.doorAperturePatchState = {
    regenerated: true,
    sourceGeometryKey: "[]",
  };
  const parts = pc.difference(floor, corrected, support) as [
    number,
    number,
  ][][][];
  d.circulationGeometry = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    sourceGeometryKey: nativeCirculationGeometryKey(d),
    cells: [
      {
        id: "native-lower",
        levelIds: [1],
        elevationFeet: 0,
        roomKeys: ["a", "b", "c"],
        nativeFloorIds: [1000],
        ringsFeet: parts[0]!,
        sourceCoverage: 1,
      },
      {
        id: "native-upper",
        levelIds: [2],
        elevationFeet: 10,
        roomKeys: ["upper"],
        nativeFloorIds: [1001],
        ringsFeet: floor,
        sourceCoverage: 1,
      },
    ],
    preparedRoomKeys: d.records.map((r) => r.key),
  };
  bindFixtureExactCells(d);
  d.edges[0]!.nativeCellId = "native-lower";
  const beforeKey = nativeCirculationGeometryKey(d),
    beforeRoute = findProjectRoute(d, "a", "b");
  assert.ok(beforeRoute);
  const viewer = await readIndoorProject(await exportCampusViewer(p));
  assert.equal(
    viewer.dataset.nativeWallPositionRepairs!.walls[0]!.notes,
    "Source-bound physical wall placement.",
  );
  assert.deepEqual(
    viewer.dataset.doorAperturePatchState,
    d.doorAperturePatchState,
  );
  assert.equal(viewer.rooms.nativeWallPositionRepairs, undefined);
  assert.equal(
    nativeSourceStairPlacementHash(viewer.dataset.nativeWallPositionRepairs),
    nativeSourceStairPlacementHash(d.nativeWallPositionRepairs),
  );
  assert.equal(nativeCirculationGeometryKey(viewer.dataset), beforeKey);
  assert.equal(nativeCirculationCells(viewer.dataset).length, 2);
  assert.deepEqual(findProjectRoute(viewer.dataset, "a", "b"), beforeRoute);
  assert.equal(
    JSON.stringify(viewer.dataset).includes("Private authoring conversation"),
    false,
  );
  assert.equal(
    d.nativeWallPositionRepairs.walls[0]!.notes,
    "Private authoring conversation",
  );
});

test("visitor exports retain exact authored physical tread evidence and omit cached authoring history", async () => {
  const { nativeAuthoredStairRoleFixture } = await import(
    "../fixtures/native-authored-stair-role"
  );
  const { nativeAuthoredStairTreadRolesHash, nativeAuthoredStairTreads } =
    await import("../../app/indoor-project/native-authored-stair-treads");
  const { nativeCirculationGeometryKey } = await import(
    "../../app/indoor-project/native-circulation"
  );
  const { routeWorkerDataset } = await import(
    "../../app/indoor-project/route-worker-dataset"
  );
  const p = await readIndoorProject(await archive()),
    roles = nativeAuthoredStairRoleFixture();
  roles.sourceModelSha256 = p.dataset.source.modelSha256;
  roles.geometrySha256 = nativeAuthoredStairTreadRolesHash(roles);
  p.dataset.nativeSourceStairMaterials = {
    version: 1,
    sourceModelSha256: roles.sourceModelSha256,
    flights: [],
    authoredTreadRoles: roles,
  };
  p.rooms.nativeSourceStairMaterials = structuredClone(
    p.dataset.nativeSourceStairMaterials,
  );
  const treads = nativeAuthoredStairTreads(roles, roles.sourceModelSha256).get(
    10,
  )!;
  p.dataset.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: roles.sourceModelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 20,
        levelIds: [1],
        buildings: ["01"],
        floorElevationFeet: 0,
        sourceGeometry: "native-cache",
        authoredTreadRolesSha256: roles.geometrySha256,
        treads,
        historicalPreparedTreads: [
          { ...structuredClone(treads[0]), elevationFeet: 1.000001 },
        ],
      },
    ],
  };
  const before = structuredClone(p.dataset),
    key = nativeCirculationGeometryKey(p.dataset),
    master = await readIndoorProject(await exportIndoorProject(p));
  assert.deepEqual(
    master.dataset.stairDisplay?.sourceFlights?.[0].historicalPreparedTreads,
    before.stairDisplay!.sourceFlights![0].historicalPreparedTreads,
  );
  const bytes = await exportCampusViewer(master),
    viewer = await readIndoorProject(bytes);
  assert.deepEqual(
    viewer.rooms.nativeSourceStairMaterials,
    viewer.dataset.nativeSourceStairMaterials,
  );
  assert.deepEqual(
    viewer.dataset.nativeSourceStairMaterials?.authoredTreadRoles,
    roles,
  );
  assert.deepEqual(
    viewer.dataset.stairDisplay?.sourceFlights?.[0].treads,
    treads,
  );
  assert.equal(
    viewer.dataset.stairDisplay?.sourceFlights?.[0].authoredTreadRolesSha256,
    roles.geometrySha256,
  );
  assert.equal(
    viewer.dataset.stairDisplay?.sourceFlights?.[0].historicalPreparedTreads,
    undefined,
  );
  assert.deepEqual(p.dataset, before);
  assert.deepEqual(viewer.dataset.nodes, before.nodes);
  assert.deepEqual(viewer.dataset.edges, before.edges);
  assert.equal(nativeCirculationGeometryKey(viewer.dataset), key);
  assert.equal(
    nativeCirculationGeometryKey(routeWorkerDataset(viewer.dataset)),
    key,
  );
  for (const mutate of [
    (d: IndoorDataset) => {
      d.nativeSourceStairMaterials!.authoredTreadRoles!.runs[0].faces[0].originalTrianglesFeet[0][0][0] += 0.01;
    },
    (d: IndoorDataset) => {
      delete d.nativeSourceStairMaterials;
    },
  ]) {
    const raw = unzipSync(bytes),
      manifest = JSON.parse(strFromU8(raw["manifest.json"])),
      d = JSON.parse(strFromU8(raw["viewer/indoor.json"]));
    mutate(d);
    raw["viewer/indoor.json"] = strToU8(JSON.stringify(d));
    manifest.indoor.bytes = raw["viewer/indoor.json"].length;
    manifest.indoor.sha256 = await hash(raw["viewer/indoor.json"]);
    raw["manifest.json"] = strToU8(JSON.stringify(manifest));
    await assert.rejects(
      () => readIndoorProject(zipSync(raw)),
      /stair|material|match|source/i,
    );
  }
});
