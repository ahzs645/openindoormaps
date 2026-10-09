import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { fixture, project } from "../fixtures/native-area-project";
import {
  exportCampusViewer,
  readIndoorProject,
} from "../../app/indoor-project/package";
import { editorVisitorDataset } from "../../app/indoor-project/map-edits";
import { preparedDisplayDatasetSha256 } from "../../app/indoor-project/prepared-display-assets";
import { loadPreparedDisplayAsset } from "../../app/indoor-project/prepared-display-loader";
import { visitorDisplayDefaultOptions } from "../../app/indoor-project/prepared-display-preparation";
import { nativeMaterialSectionsHash } from "../../app/indoor-project/native-material-sections";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import {
  compileNativeExploreMapping,
  nativeExploreDatasetGeometrySha256,
  validatePublishedNativeExploreMapping,
} from "../../app/indoor-project/native-explore-mapping";
import { deriveNativeExplore } from "../../app/indoor-project/native-explore";
import { validateNativeCachedDrawing as validate } from "../../app/indoor-project/native-prepared-drawing-validation";
const rect = (
  a: number,
  b: number,
  c: number,
  d: number,
): [number, number][] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
async function strictData(gap = 0, d = fixture()) {
  d.records = d.records.slice(0, 2);
  d.records[0].ringsFeet = [rect(0, 0, 1, 1)];
  d.records[1].ringsFeet = [rect(1.1, 0, 1.5, 1)];
  d.nativeLevels = d.nativeLevels.filter((l) => l.id === 1);
  d.doors = [];
  d.walls = [];
  d.edges = [];
  d.nodes = [];
  delete d.circulationGeometry;
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 1.5, 1), rect(0.1, 0.1, 0.2, 0.2)],
      },
    ],
  };
  const sections = [
    {
      nativeElementId: 200,
      categoryId: -2000011,
      kind: "wall" as const,
      baseElevationFeet: 0,
      topElevationFeet: 10,
      partsFeet: [[rect(1, 0, 1.1, 0.5)]],
    },
    {
      nativeElementId: 201,
      categoryId: -2000011,
      kind: "wall" as const,
      baseElevationFeet: 0,
      topElevationFeet: 10,
      partsFeet: [[rect(1, 0.5 + gap, 1.1, 1)]],
    },
  ];
  const raw = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [0.1, 4].map((cut) => ({
      levelId: 1,
      elevationFeet: 0,
      cutElevationFeet: cut,
      evidenceSha256: "b".repeat(64),
      sourceElementIds: [200, 201],
      sections,
    })),
  };
  d.nativeMaterialSections = {
    ...raw,
    geometrySha256: await nativeMaterialSectionsHash(raw),
  };
  const envelope = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[rect(0, 0, 1.5, 1)]],
        sourceElementIds: [100],
        cutElevationsFeet: [4],
        evidenceSha256: "c".repeat(64),
      },
    ],
  };
  d.nativeIndoorEnvelopes = {
    ...envelope,
    geometrySha256: await nativeIndoorEnvelopeHash(envelope),
  };
  return d;
}

async function oracle(
  gap = 0,
  configure?: (d: Awaited<ReturnType<typeof strictData>>) => void,
) {
  const d = await strictData(gap);
  configure?.(d);
  d.nativeMaterialSections!.geometrySha256 = await nativeMaterialSectionsHash(
    d.nativeMaterialSections!,
  );
  d.nativeExploreMapping = await compileNativeExploreMapping(
    d,
    await nativeExploreDatasetGeometrySha256(d),
  );
  await validatePublishedNativeExploreMapping(d);
  const cached = await deriveNativeExplore(d, [1], "all", {
    includeWalls: false,
  });
  return { d, cached };
}
const base = oracle();
test("viewer export independently prepares stripped native dataset with current UI defaults", async () => {
  const p = await project();
  p.dataset = await strictData(0, p.dataset);
  p.rooms.nativeMaterialSections = p.dataset.nativeMaterialSections;
  p.rooms.nativeIndoorEnvelopes = p.dataset.nativeIndoorEnvelopes;
  p.rooms.annotations[0].notes = "PRIVATE_AUTHORING_REVIEW_ONLY";
  p.rooms.mapEdits = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    annotations: [],
    locations: [
      {
        id: "edited-place",
        name: "Public edited room",
        description: "Public description",
        category: "study",
        tags: [],
        color: "#aaccee",
        symbol: "none",
        roomKeys: ["0"],
        website: "",
        logo: "",
        showLabel: true,
        phone: "",
        hours: "",
        links: [],
        photos: [],
      },
    ],
  };
  const original = JSON.stringify(p);
  const uncached = await readIndoorProject(
    await exportCampusViewer(p, { preparedDisplay: false }),
  );
  const cached = await readIndoorProject(
    await exportCampusViewer(p, { preparedDisplay: true }),
  );
  assert.equal(JSON.stringify(p), original);
  assert.deepEqual(cached.dataset, uncached.dataset);
  assert.ok(cached.preparedDisplay);
  assert.equal(uncached.preparedDisplay, undefined);
  assert.equal(
    JSON.stringify(cached.rooms).includes("PRIVATE_AUTHORING_REVIEW_ONLY"),
    false,
  );
  const data = editorVisitorDataset(cached);
  assert.equal(data.visitor?.places["0"].displayName, "Public edited room");
  assert.equal(data.visitor?.places["0"].color, "#aaccee");
  for (const descriptor of cached.preparedDisplay.descriptors) {
    assert.equal(
      descriptor.binding.datasetSha256,
      preparedDisplayDatasetSha256(data),
    );
    const restored = await loadPreparedDisplayAsset(
      data,
      descriptor.binding.levelIds,
      "all",
      {
        descriptor,
        blobs: cached.preparedDisplay.blobs,
      },
      visitorDisplayDefaultOptions,
    );
    assert.ok(restored);
    assert.equal(
      JSON.stringify(restored).includes("PRIVATE_AUTHORING_REVIEW_ONLY"),
      false,
    );
    validate(data, descriptor.binding.levelIds, restored.nativeFaces, "all");
  }
});
test("valid actual strict derived drawing compares directly without rebuilding source", async () => {
  const { d, cached } = await base,
    before = JSON.stringify(d),
    start = performance.now();
  const result = validate(d, [1], cached);
  console.log(
    JSON.stringify({ validationMs: performance.now() - start, ...result }),
  );
  assert.equal(result.regions, 2);
  assert.equal(result.wallsCertified, false);
  assert.equal(result.preparedFloorCertified, false);
  assert.equal(JSON.stringify(d), before);
});
test("outside or omitted/duplicated published display pieces fail even if cached payload is rehashed", async () => {
  const { d, cached } = await base;
  for (const mutate of [
    (r: any) => r.regions[0].displayPartsFeet.push([rect(400, 400, 404, 404)]),
    (r: any) => r.regions[0].visitorPartsFeet.pop(),
    (r: any) =>
      r.regions[0].displayPartsFeet.push(r.regions[0].displayPartsFeet[0]),
    (r: any) => r.regions.pop(),
  ]) {
    const altered = structuredClone(cached);
    mutate(altered);
    assert.throws(() => validate(d, [1], altered), /changed|omitted/);
  }
});
test("direct geographic comparison rejects fabricated/dropped/duplicated paint and moved outline", async () => {
  const { d, cached } = await base;
  for (const key of ["fills", "overview", "outlines"] as const) {
    for (const change of ["outside", "drop", "duplicate"]) {
      const altered = structuredClone(cached),
        features = altered[key].features;
      if (change === "outside")
        features[0].geometry.coordinates[0][0][0] += 0.000001;
      if (change === "drop") features.pop();
      if (change === "duplicate") features.push(structuredClone(features[0]));
      assert.throws(() => validate(d, [1], altered), /source geometry/);
    }
  }
});
test("exact topology, positive tiny source faces, certificate and unchanged anchors cannot be omitted", async () => {
  const { d, cached } = await base;
  for (const mutate of [
    (r: any) => delete r.exactTopologies,
    (r: any) => (r.exactTopologies[0].topology.coordinates[0].x[0] = "999"),
    (r: any) => r.regions[0].containedDisplay.unchangedIEEEAnchorsFeet.pop(),
    (r: any) =>
      (r.regions[0].containedDisplay.certificate.kernelVersion = "stale"),
  ]) {
    const altered = structuredClone(cached);
    mutate(altered);
    assert.throws(() => validate(d, [1], altered), /carrier|changed/);
  }
  assert.ok(
    d.nativeExploreMapping!.levels[0].regions.every(
      (r) => r.areaSquareFeet < 1,
    ),
  );
  const narrow = await oracle(1e-12);
  assert.equal(validate(narrow.d, [1], narrow.cached).regions, 1);
});
test("wall and prepared floor geometry are explicitly outside the claimed validation", async () => {
  const { d, cached } = await base,
    altered = structuredClone(cached);
  altered.walls = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [400, 400],
              [401, 400],
              [401, 401],
              [400, 400],
            ],
          ],
        },
      },
    ],
  };
  assert.equal(validate(d, [1], altered).wallsCertified, false);
});

test("source-bound shaft context paint is allowed, invented shaft or obsolete level paint is rejected", async () => {
  const { d, cached } = await oracle(0, (d) => {
    d.connectors = [
      {
        id: "lift",
        kind: "elevator",
        nativeElementId: 200,
        sourceModelSha256: d.source.modelSha256,
        evidence: "generic original shaft",
        accessible: "unknown",
        direction: "both",
        reviewedShaft: {
          pinId: "shaft",
          pointFeet: [0.15, 0.15],
          wallElementIds: [200, 201, 202],
        },
        entrances: [
          { roomKey: d.records[0].key, nodeId: "lobby", levelId: 1 },
          { roomKey: "upper", nodeId: "lobby2", levelId: 2 },
        ],
      },
    ];
    d.indoorExclusions = {
      version: 1,
      sourceModelSha256: d.source.modelSha256,
      areas: [
        {
          id: "shaft-mask",
          connectorId: "lift",
          reason: "off-limits",
          levelId: 1,
          elevationFeet: 0,
          label: "Lift shaft",
          nativeFloorIds: [100],
          partsFeet: [[rect(0.1, 0.1, 0.2, 0.2)]],
        },
      ],
    };
  });
  assert.equal(validate(d, [1], cached).regions, 2);
  assert.ok(
    cached.fills.features.some(
      (f) => f.properties?.shaftConnectorId === "lift",
    ),
  );
  for (const change of ["invent", "level", "drop"]) {
    const changed = structuredClone(cached),
      shaft = changed.fills.features.find(
        (f) => f.properties?.shaftConnectorId === "lift",
      )!;
    if (change === "invent") shaft.properties!.shaftConnectorId = "unbound";
    if (change === "level") shaft.properties!.levelId = 2;
    if (change === "drop")
      changed.fills.features.splice(changed.fills.features.indexOf(shaft), 1);
    assert.throws(() => validate(d, [1], changed), /source geometry/);
  }
});
test("mixed native corridor tint matches exact source metadata and cannot fabricate extra paint", async () => {
  const { d, cached } = await oracle(1e-12, (d) => {
    d.records[0].ringsFeet = [rect(0, 0, 0.3, 1)];
    d.records[1].ringsFeet = [rect(0.3, 0, 1.5, 1)];
  });
  validate(d, [1], cached);
  assert.ok(cached.regions[0].roomKeys.length > 1);
  assert.ok(
    cached.fills.features.some((f) => f.properties?.circulation === true),
  );
  const altered = structuredClone(cached);
  altered.fills.features.push(
    structuredClone(
      altered.fills.features.find((f) => f.properties?.circulation === true)!,
    ),
  );
  assert.throws(() => validate(d, [1], altered), /source geometry/);
});
test("generated residual authority remains complete in source while cached pieces are compared directly", async () => {
  const { d, cached } = await oracle(0, (d) => {
    for (const level of d.nativeMaterialSections!.levels) {
      level.sections[0].partsFeet = [
        [
          [
            [0.123, -0.5],
            [1.323, 1.5],
            [1.423, 1.5],
            [0.223, -0.5],
          ],
        ],
      ];
      level.sections[1].partsFeet = [[rect(1.4, 0.2, 1.45, 0.3)]];
    }
  });
  // Descriptor checksum changes must be regenerated before constructing this case.
  assert.equal(
    validate(d, [1], cached).sourceResidualFaces,
    d.nativeExploreMapping!.levels[0].displayResidualTopology?.faces.length ??
      0,
  );
});

test("a complete sub-quarter-square-foot native face cannot be dropped", async () => {
  const { d, cached } = await oracle(0, (d) => {
    d.walkingSupport!.floors[0].ringsFeet = [rect(0, 0, 0.1, 1)];
    d.records[0].ringsFeet = [rect(0, 0, 0.1, 1)];
    d.records[1].ringsFeet = [rect(0.4, 0, 0.5, 1)];
  });
  assert.equal(cached.regions.length, 1);
  assert.ok(cached.regions[0].areaSquareFeet < 0.25);
  validate(d, [1], cached);
  const altered = structuredClone(cached);
  altered.regions = [];
  assert.throws(() => validate(d, [1], altered), /positive region/);
});

test("tiered multi-piece outline is the same source-only deterministic stroke union", async () => {
  const d = await strictData();
  d.records = [d.records[0]];
  d.records[0].name = "Lecture Theatre";
  d.records[0].ringsFeet = [rect(0, 0, 2, 1)];
  d.nativeLevels.push({ id: 2, name: "Native tier", elevationFeet: 1 });
  d.floors[0].levelIds.push(2);
  d.walkingSupport!.floors = [
    { nativeElementId: 100, elevationFeet: 0, ringsFeet: [rect(0, 0, 1, 1)] },
    { nativeElementId: 101, elevationFeet: 1, ringsFeet: [rect(1, 0, 2, 1)] },
  ];
  d.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: d.source.modelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 700,
        levelIds: [1, 2],
        buildings: [d.records[0].building],
        floorElevationFeet: 0,
        sourceGeometry: "native-cache",
        context: "tiered-seating",
        treads: [
          { runElementId: 701, elevationFeet: 0, ringFeet: rect(0, 0, 1, 1) },
          { runElementId: 701, elevationFeet: 1, ringFeet: rect(1, 0, 2, 1) },
        ],
      },
    ],
  };
  const oldSections = structuredClone(
    d.nativeMaterialSections!.levels[0].sections,
  );
  for (const section of oldSections)
    section.partsFeet = [[rect(10, 10, 11, 11)]];
  d.nativeMaterialSections!.levels = [0, 1].flatMap((z, i) =>
    [0.1, 4].map((cut) => ({
      levelId: i + 1,
      elevationFeet: z,
      cutElevationFeet: z + cut,
      evidenceSha256: "b".repeat(64),
      sourceElementIds: [200, 201],
      sections: structuredClone(oldSections),
    })),
  );
  d.nativeMaterialSections!.geometrySha256 = await nativeMaterialSectionsHash(
    d.nativeMaterialSections!,
  );
  const envelope = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [0, 1].map((z, i) => ({
      levelId: i + 1,
      elevationFeet: z,
      partsFeet: [[rect(i, 0, i + 1, 1)]],
      sourceElementIds: [100 + i],
      cutElevationsFeet: [z + 4],
      evidenceSha256: "c".repeat(64),
    })),
  };
  d.nativeIndoorEnvelopes = {
    ...envelope,
    geometrySha256: await nativeIndoorEnvelopeHash(envelope),
  };
  d.nativeExploreMapping = await compileNativeExploreMapping(
    d,
    await nativeExploreDatasetGeometrySha256(d),
  );
  await validatePublishedNativeExploreMapping(d);
  const cached = await deriveNativeExplore(d, [1, 2], "all", {
    includeWalls: false,
  });
  assert.equal(cached.regions.length, 2);
  assert.ok(cached.regions.some((r) => r.lectureRoomKey));
  assert.equal(cached.outlines.features.length, 1);
  const before = JSON.stringify(d);
  validate(d, [1, 2], cached);
  assert.equal(JSON.stringify(d), before);
  const altered = structuredClone(cached);
  altered.outlines.features[0].geometry.coordinates[0][0][0] += 0.000001;
  assert.throws(() => validate(d, [1, 2], altered), /source geometry/);
});
