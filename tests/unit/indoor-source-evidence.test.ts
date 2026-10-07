import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";

function fixture(): IndoorDataset {
  const rings: [number, number][][] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
  ];
  return {
    format: "reviter-indoor",
    version: 1,
    generator: "reviter/indoor-pipeline-1",
    source: {
      modelFileName: "sample.rvt",
      modelSha256: "a".repeat(64),
      roomsSha256: "b".repeat(64),
    },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-123, 49],
      projectionLatitude: 49,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
      rmsMetres: 0,
      referenceCount: 2,
    },
    floors: [{ id: "floor", name: "Level 1", levelIds: [1], elevationFeet: 0 }],
    nativeLevels: [{ id: 1, name: "Level 1", elevationFeet: 0 }],
    records: [
      {
        key: "room",
        number: "101",
        name: "Meeting",
        building: "A",
        levelId: 1,
        elevationFeet: 0,
        elevationEvidence: "native",
        surfaceId: "floor",
        circulation: false,
        stair: false,
        access: "public",
        walkable: true,
        confidence: 1,
        ringsFeet: rings,
        properties: {},
      },
    ],
    nodes: [],
    edges: [],
    walls: [],
    issues: [],
    report: {
      recordCount: 1,
      routableArrivals: 0,
      components: 0,
      largestComponentArrivals: 0,
      unmatchedDoors: 0,
      cellSizeFeet: 0.6,
      omittedSourceLabels: 0,
    },
    walkingSupport: {
      version: 1,
      sourceModelSha256: "a".repeat(64),
      floors: [{ nativeElementId: 1, elevationFeet: 0, ringsFeet: rings }],
    },
    presentation: {
      version: 1,
      generator: "reviter/native-room-presentation-2",
      sourceModelSha256: "a".repeat(64),
      junctionToleranceFeet: 0.08,
      diagnostics: [],
      rooms: [
        {
          roomKey: "room",
          levelId: 1,
          sourceGeometryKey: JSON.stringify([1, rings]),
          interiorRingsFeet: rings,
          blockPartsFeet: [rings],
          boundarySource: "registered-source-wall-enclosure",
          boundaryElementIds: [1, 2],
          sourceCoverage: 1,
          cellCoverage: 1,
          sourceProof: {
            sourceSha256: "c".repeat(64),
            sectionId: "registered section",
            registrationErrorFeet: 0.01,
            wallSegmentIndices: [0, 1, 2, 3],
            doorSegmentIndices: [],
            nativeFloorCoveredSquareFeet: 100,
          },
        },
      ],
    },
  };
}

test("source drawing room evidence keeps distinct display provenance and never adds routing links", () => {
  const d = fixture(),
    before = JSON.stringify([d.records, d.nodes, d.edges]);
  validateIndoorDataset(d);
  const display = projectDisplayGeometry(d, [1], "all");
  assert.equal(
    display.roomBlocks.features[0].properties?.boundarySource,
    "prepared-registered-source-walls",
  );
  assert.equal(JSON.stringify([d.records, d.nodes, d.edges]), before);
  d.presentation!.rooms[0].boundarySource =
    "source-backed-native-wall-enclosure";
  d.presentation!.rooms[0].sourceProof!.jointRepairs = [
    {
      nativeWallElementId: 1,
      supportingElementId: 2,
      gapFeet: 0.164,
      toleranceFeet: 0.5,
      wallSegmentIndices: [0, 1],
    },
  ];
  validateIndoorDataset(d);
  assert.equal(
    projectDisplayGeometry(d, [1], "all").roomBlocks.features[0].properties
      ?.boundarySource,
    "prepared-source-backed-native-walls",
  );
});

test("source room proof rejects missing provenance, imprecise registration and unbounded wall repairs", () => {
  const mutations: ((d: IndoorDataset) => void)[] = [
    (d) => {
      delete d.presentation!.rooms[0].sourceProof;
    },
    (d) => {
      d.presentation!.rooms[0].sourceProof!.registrationErrorFeet = 0.051;
    },
    (d) => {
      d.presentation!.rooms[0].sourceProof!.sourceSha256 = "stale";
    },
    (d) => {
      d.presentation!.rooms[0].sourceProof!.wallSegmentIndices = [0, 0, 1];
    },
    (d) => {
      d.presentation!.rooms[0].sourceProof!.nativeFloorCoveredSquareFeet = 0;
    },
    (d) => {
      d.presentation!.rooms[0].sourceProof!.jointRepairs = [
        {
          nativeWallElementId: 1,
          supportingElementId: 2,
          gapFeet: 0.501,
          toleranceFeet: 0.05,
          wallSegmentIndices: [0, 1],
        },
      ];
    },
  ];
  for (const mutate of mutations) {
    const d = fixture();
    mutate(d);
    assert.throws(() => validateIndoorDataset(d), /prepared room/);
  }
});

test("omitted native edge pockets retain finite bounded display provenance without changing routing", () => {
  const data = fixture();
  const proof = data.presentation!.rooms[0].sourceProof!;
  const before = JSON.stringify([data.records, data.nodes, data.edges]);
  proof.omittedNativeEdgeFragments = {
    ringsFeet: [
      [
        [
          [0, 0],
          [1, 0],
          [0, 0.1],
        ],
      ],
    ],
    squareFeet: 0.05,
  };
  validateIndoorDataset(data);
  assert.equal(JSON.stringify([data.records, data.nodes, data.edges]), before);
  for (const invalid of [-1, 2.01, Number.NaN]) {
    proof.omittedNativeEdgeFragments.squareFeet = invalid;
    assert.throws(() => validateIndoorDataset(data), /prepared room/);
  }
  proof.omittedNativeEdgeFragments.squareFeet = 0.05;
  proof.omittedNativeEdgeFragments.ringsFeet[0][0][0][0] = Number.NaN;
  assert.throws(() => validateIndoorDataset(data), /prepared room/);
});

test("exact walking support rejects stale binding, duplicate floors and malformed holes", () => {
  for (const mutate of [
    (d: IndoorDataset) => {
      d.walkingSupport!.sourceModelSha256 = "stale";
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.floors.push(d.walkingSupport!.floors[0]);
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.floors[0].ringsFeet.push([
        [2, 2],
        [3, 2],
      ]);
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.floors[0].elevationFeet = Number.NaN;
    },
  ]) {
    const d = fixture();
    mutate(d);
    assert.throws(
      () => validateIndoorDataset(d),
      /native (walking support|floor profile)/,
    );
  }
});

test("finite opening spans require exact model, floor and native level bindings", () => {
  const prepared = () => {
    const d = fixture();
    d.nodes = [1, 2].map((x) => ({
      id: `n${x}`,
      roomKey: "room",
      levelId: 1,
      building: "A",
      surfaceId: "floor",
      pointFeet: [x, 5, 0] as [number, number, number],
      geographic: [-123, 49],
      kind: "junction",
    }));
    d.edges = [
      {
        id: "seam",
        from: "n1",
        to: "n2",
        kind: "opening",
        lengthMetres: 0.3048,
        pointsFeet: [
          [1, 5, 0],
          [2, 5, 0],
        ],
        roomKeys: ["room"],
        evidence: "exact source seam",
        accessible: "unknown",
        enabled: true,
        openingSpan: {
          version: 1,
          sourceModelSha256: d.source.modelSha256,
          levelId: 1,
          pointsFeet: [
            [1.5, 3, 0],
            [1.5, 7, 0],
          ],
          nativeFloorElementIds: [1],
          walkingStripWidthFeet: 2,
          apertureFeet: [
            [0.5, 2],
            [2.5, 2],
            [2.5, 8],
            [0.5, 8],
          ],
        },
      },
    ];
    return d;
  };
  validateIndoorDataset(prepared());
  for (const mutate of [
    (d: IndoorDataset) => {
      d.edges[0].openingSpan!.sourceModelSha256 = "b".repeat(64);
    },
    (d: IndoorDataset) => {
      d.edges[0].openingSpan!.levelId = 2;
    },
    (d: IndoorDataset) => {
      d.edges[0].openingSpan!.pointsFeet[0][2] = 1;
    },
    (d: IndoorDataset) => {
      d.edges[0].openingSpan!.pointsFeet[1] =
        d.edges[0].openingSpan!.pointsFeet[0];
    },
    (d: IndoorDataset) => {
      d.edges[0].openingSpan!.nativeFloorElementIds = [2];
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.floors[0].elevationFeet = 1;
    },
    (d: IndoorDataset) => {
      d.edges[0].openingSpan!.walkingStripWidthFeet = 1.9;
    },
    (d: IndoorDataset) => {
      d.edges[0].kind = "door";
    },
    (d: IndoorDataset) => {
      d.edges[0].openingSpan!.apertureFeet[0] = [1.5, 3];
    },
  ]) {
    const d = prepared();
    mutate(d);
    assert.throws(() => validateIndoorDataset(d), /opening span/);
  }
});

test("registered source doorways retain drawing identity without a native door ID", () => {
  const prepared = () => {
    const d = fixture();
    delete d.presentation;
    const sourceSha256 = "c".repeat(64),
      sectionId = "registered section";
    d.records[0].ringsFeet = [
      [
        [0, 0],
        [5, 0],
        [5, 10],
        [0, 10],
      ],
    ];
    d.records[0].properties = { dwg: { sha256: sourceSha256, sectionId } };
    d.records.push({
      ...d.records[0],
      key: "peer",
      number: "102",
      ringsFeet: [
        [
          [5, 0],
          [10, 0],
          [10, 10],
          [5, 10],
        ],
      ],
    });
    d.nodes = [4, 6].map((x, i) => ({
      id: `n${i}`,
      roomKey: i ? "peer" : "room",
      levelId: 1,
      building: "A",
      surfaceId: "floor",
      pointFeet: [x, 5, 0],
      geographic: [-123, 49],
      kind: "portal",
    }));
    d.edges = [
      {
        id: "source-door:test",
        from: "n0",
        to: "n1",
        kind: "door",
        lengthMetres: 0.6096,
        pointsFeet: [
          [4, 5, 0],
          [6, 5, 0],
        ],
        roomKeys: ["room", "peer"],
        evidence: "registered swing/leaf/jamb aperture",
        accessible: "unknown",
        enabled: true,
        sourceDoorProof: {
          version: 1,
          sourceModelSha256: d.source.modelSha256,
          sourceSha256,
          sectionId,
          registrationErrorFeet: 0.01,
          levelId: 1,
          elevationFeet: 0,
          nativeFloorElementIds: [1],
          wallSegmentIndices: [0, 1],
          doorSymbolSegmentIndices: [2, 3],
          doorSymbolCollection: "wallSegments",
          apertureFeet: [
            [4.8, 4],
            [5.2, 4],
            [5.2, 6],
            [4.8, 6],
          ],
          walkingStripWidthFeet: 2,
        },
      },
    ];
    return d;
  };
  validateIndoorDataset(prepared());
  for (const mutate of [
    (d: IndoorDataset) => {
      d.edges[0].nativeElementId = 123;
    },
    (d: IndoorDataset) => {
      d.edges[0].sourceDoorProof!.sourceModelSha256 = "b".repeat(64);
    },
    (d: IndoorDataset) => {
      d.records[1].properties.dwg = {
        sha256: "d".repeat(64),
        sectionId: "registered section",
      };
    },
    (d: IndoorDataset) => {
      d.edges[0].sourceDoorProof!.registrationErrorFeet = 0.051;
    },
    (d: IndoorDataset) => {
      d.edges[0].sourceDoorProof!.nativeFloorElementIds = [999];
    },
    (d: IndoorDataset) => {
      d.edges[0].sourceDoorProof!.doorSymbolSegmentIndices = [];
    },
    (d: IndoorDataset) => {
      d.edges[0].sourceDoorProof!.doorSymbolCollection =
        "doorSegments" as "wallSegments";
    },
    (d: IndoorDataset) => {
      d.edges[0].sourceDoorProof!.apertureFeet[0] = [5, 5];
    },
  ]) {
    const d = prepared();
    mutate(d);
    assert.throws(() => validateIndoorDataset(d), /registered source doorway/);
  }
});

test("registered display swing proof requires finite measured thresholds and both jamb wall supports", () => {
  const d = fixture(),
    room = d.presentation!.rooms[0],
    proof = room.sourceProof!;
  proof.closedDoorSwings = [
    {
      arcSegmentIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      leafSegmentIndices: [8],
      supportingWallSegmentIndices: [9, 10],
      hingeFeet: [0, 0],
      radiusFeet: 3,
      closedLeafFeet: [
        [0, 0],
        [3, 0],
      ],
      thresholdSegments: [
        [
          [0, 0],
          [3, 0],
        ],
      ],
    },
  ];
  validateIndoorDataset(d);
  const bad = structuredClone(d);
  bad.presentation!.rooms[0].sourceProof!.closedDoorSwings![0].thresholdSegments[0][0][0] =
    Number.NaN;
  assert.throws(() => validateIndoorDataset(bad));
  const unsupported = structuredClone(d);
  unsupported.presentation!.rooms[0].sourceProof!.closedDoorSwings![0].supportingWallSegmentIndices =
    [9];
  assert.throws(() => validateIndoorDataset(unsupported));
  assert.deepEqual(d.nodes, []);
  assert.deepEqual(d.edges, []);
});
