import { nativeSourceStairBodyHash } from "../../app/indoor-project/native-source-stair-body";
import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  nativeStairRouteQualified,
  nativeStairQualificationIssues,
  validNativeSourceStairBinding,
} from "../../app/indoor-project/native-source-stair";
import {
  nativeSourceStairMaterialHash,
  nativeSourceStairPlacementHash,
  validNativeSourceStairMaterial,
  validateNativeSourceStairMaterials,
} from "../../app/indoor-project/native-source-stair-material";
import { validateNativePhysicalLevels } from "../../app/indoor-project/native-physical-levels";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import {
  nativeCirculationCells,
  nativeCellSharedFloorAlias,
  nativeCirculationGeometryKey,
  validateNativeCirculationGeometry,
} from "../../app/indoor-project/native-circulation";
import {
  prepareNativeCirculationGeometry,
  nativeCirculationGeometryKey as sourceKey,
} from "../../../reviter/lib/reviter/native-circulation-geometry";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
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
async function fixture() {
  const sha = "a".repeat(64),
    points: [number, number, number][] = [
      [1, -0.1, 0],
      [1, 0.5, 0.5],
      [1, 1.5, 1],
      [1, 2.5, 1.5],
      [1, 3.1, 2],
    ],
    treads = [0, 1, 2].map((i) => ({
      runElementId: 201,
      elevationFeet: (i + 1) * 0.5,
      ringFeet: rect(0, i, 2, 1),
    })),
    floors = [
      {
        nativeElementId: 300,
        elevationFeet: 0,
        ringsFeet: [rect(-5, -5, 15, 5)],
      },
      {
        nativeElementId: 301,
        elevationFeet: 2,
        ringsFeet: [rect(-5, 3, 15, 7)],
      },
    ],
    materialRaw = {
      version: 1 as const,
      sourceModelSha256: sha,
      evidenceSha256: "b".repeat(64),
      sourceWallPositionRepairsSha256:
        nativeSourceStairPlacementHash(undefined),
      nativeStairId: 200,
      widthFeet: 2 as const,
      pointsFeet: points,
      sourceElementIds: [],
      bands: points.slice(1).map((b, i) => ({
        segmentIndex: i,
        minimumElevationFeet: points[i]![2],
        maximumElevationFeet: b[2] + 0.1,
        unclassifiedSourceElementIds: [],
        sections: [],
      })),
    },
    material = {
      ...materialRaw,
      geometrySha256: nativeSourceStairMaterialHash(materialRaw),
    },
    bodyRaw = {
      version: 1 as const,
      sourceModelSha256: sha,
      evidenceSha256: "c".repeat(64),
      nativeStairId: 200,
      nativeRunIds: [201],
      completeOriginalBody: true as const,
      unclassifiedSourceElementIds: [],
      treads,
      landings: [],
    },
    body = { ...bodyRaw, geometrySha256: nativeSourceStairBodyHash(bodyRaw) },
    receipt = {
      version: 1 as const,
      sourceModelSha256: sha,
      nativeStairId: 200,
      nativeRunIds: [201],
      levelIds: [1, 2] as [number, number],
      nativeFloorElementIds: [300, 301] as [number, number],
      widthFeet: 2 as const,
      pointsFeet: points,
      treads,
      landings: [],
      foreignMaterial: material,
      walkingBody: body,
      terminalCaps: [
        {
          pointFeet: points[0]!,
          capFeet: [
            [0, 0, 0.5],
            [2, 0, 0.5],
          ],
          levelId: 1,
          nativeFloorElementId: 300,
          originalRunElementId: 201,
        },
        {
          pointFeet: points.at(-1)!,
          capFeet: [
            [0, 3, 1.5],
            [2, 3, 1.5],
          ],
          levelId: 2,
          nativeFloorElementId: 301,
          originalRunElementId: 201,
        },
      ],
    },
    nativeLevels = [
      { id: 1, name: "Floor 1", elevationFeet: 0 },
      { id: 2, name: "Floor 1.5", elevationFeet: 2 },
    ],
    envelopeRaw = {
      version: 1 as const,
      sourceModelSha256: sha,
      levels: floors.map((f, i) => ({
        levelId: i + 1,
        elevationFeet: f.elevationFeet,
        partsFeet: [f.ringsFeet],
        sourceElementIds: [f.nativeElementId, 200],
        cutElevationsFeet: [f.elevationFeet + 4, f.elevationFeet + 8],
        evidenceSha256: "b".repeat(64),
      })),
    };
  const data = {
    source: { modelSha256: sha },
    records: [],
    nativeLevels,
    floors: [{ id: "1", name: "Floor 1", levelIds: [1, 2], elevationFeet: 0 }],
    nativePhysicalLevels: {
      version: 1,
      sourceModelSha256: sha,
      levels: nativeLevels.map((l, i) => ({
        nativeLevelId: l.id,
        sourceName: l.name,
        elevationFeet: l.elevationFeet,
        nativeFloorElementIds: [300 + i],
        nativeStairElementIds: [200],
        annotationLevel: false,
      })),
      displayAliases: [
        {
          nativeLevelId: 2,
          displayFloorId: "1",
          sourceName: "Floor 1.5",
          elevationFeet: 2,
          evidence: "original-fractional-level-name",
          provisional: true,
        },
      ],
    },
    nodes: [0, 1].map((i) => ({
      id: "cap" + i,
      roomKey: "",
      levelId: i + 1,
      building: "B",
      surfaceId: "native:" + (i + 1),
      pointFeet: points[i ? points.length - 1 : 0],
      geographic: [0, 0],
      kind: "stair",
    })),
    edges: [
      {
        id: "original-stair",
        nativeElementId: 200,
        from: "cap0",
        to: "cap1",
        kind: "stairs",
        roomKeys: [],
        pointsFeet: points,
        enabled: true,
        accessible: "no",
        lengthMetres: 2,
        nativeSourceStair: receipt,
      },
    ],
    stairDisplay: {
      version: 1,
      generator: "reviter/native-stair-display-1",
      sourceModelSha256: sha,
      flights: [],
      sourceFlights: [
        {
          stairElementId: 200,
          levelIds: [1, 2],
          buildings: ["B"],
          floorElevationFeet: 0,
          sourceGeometry: "native-cache",
          treads,
          runs: [
            {
              runElementId: 201,
              bottomElevationFeet: 0,
              topElevationFeet: 2,
              beginWithRiser: true,
              endWithRiser: true,
            },
          ],
          landings: [],
        },
      ],
    },
    walls: [],
    doors: [],
    alignment: { horizontalMetresPerFoot: 0.3048 },
    walkingSupport: { version: 1, sourceModelSha256: sha, floors },
    nativeIndoorEnvelopes: {
      ...envelopeRaw,
      geometrySha256: await nativeIndoorEnvelopeHash(envelopeRaw),
    },
  } as unknown as IndoorDataset;
  const model = {
    levels: nativeLevels.map((l) => ({
      levelId: l.id,
      elevation: l.elevationFeet,
    })),
    elementBounds: [
      ...floors.map((f) => ({
        elementId: f.nativeElementId,
        categoryId: -2000032,
        boundsFeet: {
          min: { x: -5, y: f.ringsFeet[0]![0]![1], z: f.elevationFeet - 0.5 },
          max: { x: 10, y: f.ringsFeet[0]![2]![1], z: f.elevationFeet },
        },
        loops: f.ringsFeet.map((r) => r.map((p) => [...p, f.elevationFeet])),
      })),
      {
        elementId: 200,
        categoryId: -2000120,
        boundsFeet: { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 3, z: 2 } },
      },
    ],
    nativeAssociatedLevelRelations: [],
  } as any;
  return { data, model };
}
test("native intermediate landings have exact source-only cells without invented room identities", async () => {
  const { data, model } = await fixture();
  assert.equal(validNativeSourceStairBinding(data, data.edges[0]!), true);
  validateNativePhysicalLevels(data);
  data.circulationGeometry = prepareNativeCirculationGeometry(
    model,
    data,
  ).geometry;
  assert.equal(data.circulationGeometry.cells.length, 2);
  assert.ok(
    data.circulationGeometry.cells.every(
      (c) => c.roomKeys.length === 0 && c.connectorAnchors?.length === 1,
    ),
  );
  validateNativeCirculationGeometry(data);
  assert.equal(nativeCirculationCells(data).length, 2);
  assert.equal(nativeCirculationGeometryKey(data), sourceKey(data));
  const projected = routeWorkerDataset(data);
  assert.equal(
    validNativeSourceStairBinding(projected, projected.edges[0]!),
    true,
  );
  validateNativePhysicalLevels(projected);
  data.edges[0]!.enabled = false;
  assert.equal(nativeCirculationCells(data).length, 0);
});
test("source stair receipts reject altered owners, missing original treads, foreign overlap and unknown bodies", async () => {
  const { data } = await fixture();
  for (const edit of [
    (d: IndoorDataset) => {
      delete (d.edges[0]!.nativeSourceStair as any).walkingBody;
    },
    (d: IndoorDataset) => {
      d.stairDisplay!.sourceFlights![0]!.treads.pop();
    },
    (d: IndoorDataset) => {
      d.edges[0]!.pointsFeet[2]![0] += 0.1;
    },
    (d: IndoorDataset) => {
      d.edges[0]!.accessible = "yes";
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.floors[0]!.ringsFeet.push(rect(0, -1, 2, 1));
    },
  ]) {
    const changed = structuredClone(data);
    edit(changed);
    assert.equal(
      validNativeSourceStairBinding(changed, changed.edges[0]!),
      false,
    );
  }
  const proof = structuredClone(
    data.edges[0]!.nativeSourceStair!.foreignMaterial,
  );
  proof.sourceElementIds = [900];
  proof.bands[0]!.sections = [
    { nativeElementId: 900, partsFeet: [[rect(0.5, -0.1, 1, 0.4)]] },
  ];
  proof.geometrySha256 = nativeSourceStairMaterialHash(proof);
  assert.equal(
    validNativeSourceStairMaterial(
      proof,
      data.source.modelSha256,
      200,
      data.edges[0]!.pointsFeet,
    ),
    false,
  );
  proof.bands[0]!.sections = [];
  proof.bands[0]!.unclassifiedSourceElementIds = [900];
  proof.geometrySha256 = nativeSourceStairMaterialHash(proof);
  assert.equal(
    validNativeSourceStairMaterial(
      proof,
      data.source.modelSha256,
      200,
      data.edges[0]!.pointsFeet,
    ),
    false,
  );
});
test("physical aliases reject stale slabs, unrelated display membership and duplicate aliases", async () => {
  const { data } = await fixture();
  for (const edit of [
    (d: IndoorDataset) => {
      d.nativePhysicalLevels!.levels[1]!.nativeFloorElementIds = [999];
    },
    (d: IndoorDataset) => {
      d.floors[0]!.levelIds = [2];
    },
    (d: IndoorDataset) => {
      d.nativePhysicalLevels!.displayAliases.push(
        d.nativePhysicalLevels!.displayAliases[0]!,
      );
    },
  ]) {
    const changed = structuredClone(data);
    edit(changed);
    assert.throws(
      () => validateNativePhysicalLevels(changed),
      /physical levels/,
    );
  }
});

test("metadata building aliases require one unchanged original slab and complete native face", async () => {
  const { data, model } = await fixture();
  data.nodes.push({
    ...structuredClone(data.nodes[0]!),
    id: "other-building",
    surfaceId: "B2:1",
    pointFeet: [-1, -1, 0],
  });
  data.circulationGeometry = prepareNativeCirculationGeometry(
    model,
    data,
  ).geometry;
  const cell = data.circulationGeometry.cells.find(
    (c) => c.elevationFeet === 0,
  )!;
  const edge = {
    id: "alias-walk",
    evidence: "Same-original-slab fixture alias",
    from: "cap0",
    to: "other-building",
    kind: "walk" as const,
    roomKeys: [],
    enabled: true,
    accessible: "unknown" as const,
    lengthMetres: 1,
    pointsFeet: [data.nodes[0]!.pointFeet, data.nodes[2]!.pointFeet],
    nativeCellId: cell.id,
  };
  assert.equal(nativeCellSharedFloorAlias(data, edge), true);
  data.walkingSupport!.floors[0]!.ringsFeet.push(rect(-1.5, -1.5, 1, 1));
  assert.equal(
    nativeCellSharedFloorAlias(data, edge),
    false,
    "an edited original slab invalidates the complete prepared carrier; rebinding only its label is forbidden",
  );
});
test("portable original stair source packets retain unresolved facts without approving routes", async () => {
  const { data } = await fixture();
  const proof = structuredClone(
    data.edges[0]!.nativeSourceStair!.foreignMaterial,
  );
  proof.sourceElementIds = [900];
  proof.bands[0]!.unclassifiedSourceElementIds = [900];
  proof.geometrySha256 = nativeSourceStairMaterialHash(proof);
  const packet = {
    version: 1 as const,
    sourceModelSha256: data.source.modelSha256,
    flights: [proof],
  };
  validateNativeSourceStairMaterials(packet, data.source.modelSha256);
  assert.equal(
    validNativeSourceStairMaterial(
      proof,
      data.source.modelSha256,
      200,
      proof.pointsFeet,
    ),
    false,
  );
  proof.bands[0]!.minimumElevationFeet += 0.01;
  assert.throws(
    () => validateNativeSourceStairMaterials(packet, data.source.modelSha256),
    /source material evidence/,
  );
});

test("derived frame material invalidates an older full-flight foreign receipt without changing legacy placement bytes", async () => {
  const { data } = await fixture();
  const proof = data.edges[0]!.nativeSourceStair!.foreignMaterial;
  const derived = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    members: [
      {
        nativeElementId: 900,
        ringsFeet: [rect(20, 20, 2, 1)],
        baseElevationFeet: 0,
        topElevationFeet: 0.164,
      },
    ],
  };
  assert.equal(
    nativeSourceStairPlacementHash(undefined),
    proof.sourceWallPositionRepairsSha256,
  );
  assert.equal(
    validNativeSourceStairMaterial(
      proof,
      data.source.modelSha256,
      200,
      data.edges[0]!.pointsFeet,
      undefined,
      derived,
    ),
    false,
    "original-only material proof cannot approve newly derived material",
  );
  const originalHash = nativeSourceStairPlacementHash(undefined, derived);
  derived.members[0].ringsFeet[0][0][0] += 0.01;
  assert.notEqual(
    nativeSourceStairPlacementHash(undefined, derived),
    originalHash,
    "complete current coordinates, not a declared digest, bind the receipt",
  );
  assert.equal(
    validNativeSourceStairMaterial(
      proof,
      data.source.modelSha256,
      200,
      data.edges[0]!.pointsFeet,
    ),
    true,
    "legacy absent-descriptor proof remains byte compatible",
  );
});

import { projectRoutingGraph } from "../../app/indoor-project/routing-graph";
import {
  nativeStairRouteQualified as sourceStairQualified,
  nativeStairQualificationIssues as sourceStairIssues,
  validNativeSourceStairBinding as sourceStairBinding,
} from "../../../reviter/lib/reviter/native-source-stair";
import { validateNativeSourceStairWidth } from "../../app/indoor-project/native-source-stair-width";

for (const check of [
  {
    name: "runtime",
    qualified: nativeStairRouteQualified,
    valid: validNativeSourceStairBinding,
    issues: nativeStairQualificationIssues,
  },
  {
    name: "source",
    qualified: sourceStairQualified,
    valid: sourceStairBinding,
    issues: sourceStairIssues,
  },
]) {
  test(`${check.name}: strict local steps cannot route without original stair evidence; legacy behavior remains`, async () => {
    const { data } = await fixture();
    const edge = data.edges[0]!;
    edge.kind = "local-steps";
    delete edge.nativeSourceStair;
    const original = JSON.stringify(data);
    assert.equal(check.qualified(data, edge), false);
    assert.deepEqual(
      check.issues(data).map((i) => i.edgeId),
      [edge.id],
    );
    assert.equal(JSON.stringify(data), original);
    if (check.name === "runtime") {
      const graph = projectRoutingGraph(data, "public");
      assert.equal(graph.adjacency.get("cap0")?.length ?? 0, 0);
      assert.ok(
        graph.allAdjacency
          .get("cap0")?.[0]
          ?.blockers.some((b) => b.kind === "source-proof"),
      );
    }
    delete data.nativeIndoorEnvelopes;
    assert.equal(check.qualified(data, edge), true);
    assert.equal(check.issues(data).length, 0);
  });

  test(`${check.name}: complete local-step receipts preserve original terminals, body, material and access checks`, async () => {
    const { data } = await fixture();
    const edge = data.edges[0]!;
    edge.kind = "local-steps";
    const original = JSON.stringify(data);
    assert.equal(check.valid(data, edge), true);
    assert.equal(check.qualified(data, edge), true);
    assert.equal(JSON.stringify(data), original);
    const edits: ((d: IndoorDataset) => void)[] = [
      (d) => {
        delete (d.edges[0]!.nativeSourceStair as any).walkingBody;
      },
      (d) => {
        delete (d.edges[0]!.nativeSourceStair as any).foreignMaterial;
      },
      (d) => {
        d.nodes[0]!.pointFeet[0] += 0.01;
      },
      (d) => {
        d.edges[0]!.pointsFeet[1]![0] += 0.01;
      },
      (d) => {
        d.edges[0]!.accessible = "yes";
      },
      (d) => {
        d.edges[0]!.nativeSourceStair!.nativeRunIds = [999];
      },
      (d) => {
        d.walkingSupport!.floors[0]!.ringsFeet.push(rect(0, -1, 2, 1));
      },
      (d) => {
        d.stairDisplay!.sourceFlights![0]!.context = "tiered-seating";
      },
      (d) => {
        d.stairDisplay!.sourceFlights![0]!.context = "outdoor";
      },
    ];
    for (const edit of edits) {
      const changed = structuredClone(data);
      edit(changed);
      assert.equal(check.qualified(changed, changed.edges[0]!), false);
    }
  });

  test(`${check.name}: ordinary stairs and unrelated edge types keep their evidence policy`, async () => {
    const { data } = await fixture();
    const edge = data.edges[0]!;
    assert.equal(check.qualified(data, edge), true);
    delete edge.nativeSourceStair;
    assert.equal(check.qualified(data, edge), false);
    edge.kind = "walk";
    assert.equal(check.qualified(data, edge), true);
  });
}

test("strict ordinary stairs cannot route from a native-flight label or direct room endpoints without a complete native receipt", async () => {
  const { data } = await fixture();
  const original = structuredClone(data.edges[0]!);
  const strict = structuredClone(data);
  delete strict.edges[0]!.nativeSourceStair;
  const points = JSON.stringify(strict.nodes.map((n) => n.pointFeet));
  assert.equal(nativeStairRouteQualified(strict, strict.edges[0]!), false);
  assert.equal(sourceStairQualified(strict, strict.edges[0]!), false);
  const graph = projectRoutingGraph(strict, "public");
  assert.equal(graph.adjacency.get("cap0")?.length ?? 0, 0);
  assert.ok(
    graph.allAdjacency
      .get("cap0")?.[0]!
      .blockers.some((b) => b.kind === "source-proof"),
  );
  assert.deepEqual(
    nativeStairQualificationIssues(strict).map((i) => i.edgeId),
    [original.id],
  );
  assert.equal(
    JSON.stringify(strict.nodes.map((n) => n.pointFeet)),
    points,
    "qualification never relocates original terminals",
  );
  const legacy = structuredClone(strict);
  delete legacy.nativeIndoorEnvelopes;
  assert.equal(nativeStairRouteQualified(legacy, legacy.edges[0]!), true);
  assert.equal(
    projectRoutingGraph(legacy, "public").adjacency.get("cap0")?.length,
    1,
  );
});

test("a complete current source receipt permits keyed original terminals while preserving access and forbidding endpoint substitution", async () => {
  const { data } = await fixture();
  data.records = data.nodes.map((n, i) => ({
    key: "landing" + i,
    number: "landing" + i,
    name: "Stair",
    building: "B",
    levelId: n.levelId,
    elevationFeet: n.pointFeet[2],
    elevationEvidence: "native",
    surfaceId: n.surfaceId,
    circulation: true,
    stair: true,
    walkable: true,
    access: "unknown",
    confidence: 1,
    ringsFeet: [rect(100, 100, 1, 1)],
    properties: {},
  })) as IndoorDataset["records"];
  data.nodes.forEach((n, i) => (n.roomKey = data.records[i]!.key));
  data.edges[0]!.roomKeys = data.records.map((r) => r.key);
  assert.equal(
    validNativeSourceStairBinding(data, data.edges[0]!),
    true,
    "remote old outlines only supply identity/access, never flight or cap support",
  );
  assert.equal(sourceStairQualified(data, data.edges[0]!), true);
  assert.equal(
    projectRoutingGraph(data, "public").adjacency.get("cap0")?.length,
    1,
  );
  assert.equal(
    projectRoutingGraph(data, "accessible").adjacency.get("cap0")?.length ?? 0,
    0,
  );
  const privateData = structuredClone(data);
  privateData.records[0]!.access = "staff";
  assert.equal(
    projectRoutingGraph(privateData, "public").adjacency.get("cap0")?.length ??
      0,
    0,
  );
  const moved = structuredClone(data);
  moved.nodes[0]!.pointFeet[0] += 0.01;
  assert.equal(validNativeSourceStairBinding(moved, moved.edges[0]!), false);
  const foreignIdentity = structuredClone(data);
  foreignIdentity.edges[0]!.roomKeys = ["unrelated"];
  assert.equal(
    validNativeSourceStairBinding(foreignIdentity, foreignIdentity.edges[0]!),
    false,
  );
});

test("strict flight clearance retains a genuine microscopic native slab hole and positive foreign material", async () => {
  const { data } = await fixture();
  const r = data.edges[0]!.nativeSourceStair!;
  assert.equal(
    validateNativeSourceStairWidth(r, data.walkingSupport!.floors, true),
    true,
  );
  const changed = structuredClone(data);
  changed.walkingSupport!.floors[0]!.ringsFeet.push(
    rect(0.9, -0.11, 1e-10, 0.02),
  );
  assert.equal(
    validateNativeSourceStairWidth(r, changed.walkingSupport!.floors, false),
    true,
    "legacy area allowance is exercised by this negative fixture",
  );
  assert.equal(
    validateNativeSourceStairWidth(r, changed.walkingSupport!.floors, true),
    false,
  );
  assert.equal(
    validNativeSourceStairBinding(changed, changed.edges[0]!),
    false,
  );
  const raised = structuredClone(data);
  raised.walkingSupport!.floors[0]!.elevationFeet = 0.001;
  assert.equal(
    validNativeSourceStairBinding(raised, raised.edges[0]!),
    false,
    "a nearby raised slab cannot support a different exact native cap datum",
  );
  const foreign = structuredClone(r.foreignMaterial);
  foreign.sourceElementIds = [900];
  foreign.bands[0]!.sections = [
    { nativeElementId: 900, partsFeet: [[rect(0.9, -0.09, 1e-12, 0.01)]] },
  ];
  foreign.geometrySha256 = nativeSourceStairMaterialHash(foreign);
  assert.equal(
    validNativeSourceStairMaterial(
      foreign,
      data.source.modelSha256,
      200,
      r.pointsFeet,
      undefined,
      undefined,
      undefined,
      true,
    ),
    false,
  );
});
