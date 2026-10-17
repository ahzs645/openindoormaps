import test from "node:test";
import assert from "node:assert/strict";
import {
  captureAuthorizedBaselineVisualReview,
  checkedVisualReviewRebind,
  canonicalVisualParts,
  assertVisualOnlyDecoration,
  UNBC_GREEN_TARGETS,
  inspectGreenVisualTargets,
  inspectConnectorOverviewParity,
} from "../../scripts/indoor/candidate-visual-data-checks";
import { overviewConnectorSurfaces } from "../../scripts/indoor/overview-connector-surfaces";
import review from "../fixtures/unbc-historical-circulation-paint.json";
import { applyPublishedCirculationPaint } from "../../app/indoor-project/published-circulation-paint";
import { geographicPoint } from "../../app/indoor-project/routing";
const square = (x: number, y: number, w = 1) => [
  [x, y],
  [x + w, y],
  [x + w, y + w],
  [x, y + w],
];
const empty = () => ({ type: "FeatureCollection", features: [] });
function fixture() {
  const keys = [
    ...new Set([
      ...review.decisions.flatMap((d) => [...d.roomKeys, ...d.sourceRoomKeys]),
      ...UNBC_GREEN_TARGETS.map((t) => t.recordKey),
    ]),
  ];
  const data: any = {
    source: { modelSha256: "a".repeat(64) },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      rotationRadians: 0,
      projectionLatitude: 53,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    nativeLevels: [
      { id: 311, elevationFeet: 0 },
      { id: 1487816, elevationFeet: 3.28 },
    ],
    records: keys.map((key, i) => ({
      key,
      number: key,
      name: "Corridor",
      building: "04",
      levelId: 311,
      elevationFeet: 0,
      ringsFeet: [square(i, 0)],
      circulation: true,
      stair: false,
      walkable: true,
      access: "unknown",
      properties: {},
    })),
  };
  const regions = review.decisions.map((d, i) => ({
    id: d.nativeRegionId,
    levelId: d.levelId,
    roomKeys: [...d.roomKeys],
    ringsFeet: [square(i * 10, 10)],
    exactFaceId: "face-" + i,
  }));
  const exactTopologies = [311, 1487816].map((levelId) => {
    const coordinates: any[] = [],
      faces = regions
        .filter((r) => r.levelId === levelId)
        .map((r) => ({
          id: r.exactFaceId,
          parts: [
            r.ringsFeet.map((ring) =>
              ring.map((p) => {
                coordinates.push({
                  x: [String(p[0]), "1"],
                  y: [String(p[1]), "1"],
                });
                return coordinates.length - 1;
              }),
            ),
          ],
        }));
    return { levelId, topology: { coordinates, faces } };
  });
  const payload: any = {
    nativeFaces: {
      regions,
      exactTopologies,
      fills: empty(),
      overview: empty(),
    },
    preparedFloor: { presentation: { overviewGeometry: empty() } },
  };
  const scope: any = {
    id: review.scopeId,
    display: {
      descriptor: { logicalJsonSha256: review.preparedLogicalSha256 },
    },
  };
  const manifest: any = {
    revisionSha256: review.revisionSha256,
    provenance: {
      datasetSha256: review.datasetSha256,
      enginePreparationSha256: review.engineSha256,
      source: data.source,
    },
  };
  return { data, payload, scope, manifest };
}
function candidate(f: ReturnType<typeof fixture>) {
  const c = structuredClone(f);
  c.manifest.provenance.datasetSha256 = "2".repeat(64);
  c.manifest.provenance.enginePreparationSha256 = "3".repeat(64);
  c.manifest.revisionSha256 = "4".repeat(64);
  c.scope.id = "fresh-scope";
  c.scope.display.descriptor.logicalJsonSha256 = "5".repeat(64);
  c.payload.nativeFaces.regions.forEach(
    (r: any, i: number) => (r.id = "fresh-region-" + i),
  );
  return c;
}

test("fresh hashes do not activate old paint; exact source/local geometry rebind can rename face IDs without navigation changes", () => {
  const old = fixture(),
    baseline = captureAuthorizedBaselineVisualReview(
      old.data,
      old.payload,
      old.manifest,
      old.scope,
      review,
    ),
    c = candidate(old);
  assert.equal(
    applyPublishedCirculationPaint(c.payload, c.manifest, c.scope),
    c.payload,
  );
  const bound = checkedVisualReviewRebind(
    baseline,
    c.data,
    c.payload,
    c.manifest,
    c.scope,
  );
  assert.equal(bound.eligible, true);
  assert.equal(bound.navigationApprovalGranted, false);
  assert.equal(bound.proposedDisplayOnlyReview?.decisions.length, 4);
  assert.equal(
    bound.proposedDisplayOnlyReview?.decisions[0].nativeRegionId,
    "fresh-region-0",
  );
  assert.equal(c.data.records[0].access, "unknown");
});
test("historical authorization cannot be replaced by a different recolour decision", () => {
  const old = fixture(),
    forged = structuredClone(review) as any;
  forged.decisions[0].color = "#ffffff";
  assert.throws(
    () =>
      captureAuthorizedBaselineVisualReview(
        old.data,
        old.payload,
        old.manifest,
        old.scope,
        forged,
      ),
    /Different user paint decisions/,
  );
});
test("overview connector parity refuses omitted ramp/stair surfaces, changed geometry and an added overhead stair", () => {
  const f = fixture();
  f.data.edges = [];
  f.data.rampDisplay = {
    sourceModelSha256: f.data.source.modelSha256,
    ramps: [
      {
        nativeElementId: 7,
        levelIds: [311],
        circulation: true,
        trianglesFeet: [
          [
            [0, 0, 0],
            [2, 0, 0],
            [0, 1, 1],
          ],
        ],
      },
    ],
  };
  const surface = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
    properties: {
      id: "stair",
      stairElementId: 8,
      runElementId: 9,
      surfaceKind: "tread",
      levelId: 311,
      color: "#bdd5c9",
    },
  };
  f.payload.preparedFloor.nativeStairs = {
    type: "FeatureCollection",
    features: [
      surface,
      {
        ...surface,
        properties: { ...surface.properties, id: "overhead", overhead: true },
      },
    ],
  };
  const scope: any = { levelIds: [311], building: "all" },
    geometry = overviewConnectorSurfaces(f.data, f.payload, [311], "all");
  assert.equal(geometry.features.length, 2);
  assert.equal(
    inspectConnectorOverviewParity(
      f.data,
      f.payload,
      { geometry } as any,
      scope,
    ).actual,
    2,
  );
  for (const mutate of [
    (o: any) => o.geometry.features.pop(),
    (o: any) => o.geometry.features.shift(),
    (o: any) => (o.geometry.features[0].geometry.coordinates[0][1][0] += 0.01),
    (o: any) =>
      o.geometry.features.push({
        ...o.geometry.features[0],
        properties: { ...o.geometry.features[0].properties, id: "overhead" },
      }),
  ]) {
    const o = structuredClone({ geometry });
    mutate(o);
    assert.throws(
      () => inspectConnectorOverviewParity(f.data, f.payload, o as any, scope),
      /omitted or changed/,
    );
  }
});
test("changed source room geometry/access, alignment or level never receives a new-hash-only rebind", () => {
  const old = fixture(),
    baseline = captureAuthorizedBaselineVisualReview(
      old.data,
      old.payload,
      old.manifest,
      old.scope,
      review,
    );
  for (const mutate of [
    (c: any) => (c.data.records[0].access = "staff"),
    (c: any) => (c.data.records[0].ringsFeet[0][0][0] += 0.01),
    (c: any) => (c.data.alignment.rotationRadians = 0.1),
    (c: any) => (c.data.nativeLevels[0].elevationFeet = 0.01),
  ]) {
    const c = candidate(old);
    mutate(c);
    assert.equal(
      checkedVisualReviewRebind(
        baseline,
        c.data,
        c.payload,
        c.manifest,
        c.scope,
      ).eligible,
      false,
    );
  }
});
test("sub-IEEE exact coordinate changes, an added tiny positive hole, changed ownership and ambiguous faces refuse", () => {
  const old = fixture(),
    baseline = captureAuthorizedBaselineVisualReview(
      old.data,
      old.payload,
      old.manifest,
      old.scope,
      review,
    );
  for (const mutate of [
    (c: any) => {
      const q =
        c.payload.nativeFaces.exactTopologies[0].topology.coordinates[1].x;
      q[0] = String((1n << 200n) + 1n);
      q[1] = String(1n << 200n);
    },
    (c: any) => {
      const t = c.payload.nativeFaces.exactTopologies[0].topology,
        start = t.coordinates.length,
        den = 1n << 200n,
        base = 1n << 199n;
      for (const p of [
        [1n, 1n],
        [2n, 1n],
        [2n, 2n],
        [1n, 2n],
      ])
        t.coordinates.push({
          x: [String(base + p[0]), String(den)],
          y: [String(10n * den + base + p[1]), String(den)],
        });
      t.faces[0].parts[0].push([start, start + 1, start + 2, start + 3]);
    },
    (c: any) => (c.payload.nativeFaces.regions[0].roomKeys = ["borrowed"]),
    (c: any) =>
      c.payload.nativeFaces.regions.push({
        ...c.payload.nativeFaces.regions[0],
        id: "duplicate",
      }),
  ]) {
    const c = candidate(old);
    mutate(c);
    assert.equal(
      checkedVisualReviewRebind(
        baseline,
        c.data,
        c.payload,
        c.manifest,
        c.scope,
      ).eligible,
      false,
    );
  }
});
test("canonical visual equality preserves holes and positive coordinate differences while allowing ring rotation/reversal", () => {
  const a = [[square(0, 0, 4), square(1, 1, 0.1)]];
  const b = [
    [
      square(0, 0, 4).toReversed(),
      [...square(1, 1, 0.1).slice(2), ...square(1, 1, 0.1).slice(0, 2)],
    ],
  ];
  assert.equal(canonicalVisualParts(a), canonicalVisualParts(b));
  assert.notEqual(
    canonicalVisualParts(a),
    canonicalVisualParts([[square(0, 0, 4)]]),
  );
});
test("visual decoration permits only Feature colour/circulation and preserves geometry, restrictions, associations and heights", () => {
  const geometry = { type: "Polygon", coordinates: [square(0, 0)] },
    before = {
      a: {
        type: "Feature",
        geometry,
        properties: {
          color: "#e9edef",
          circulation: false,
          restricted: false,
          roomKeys: ["room"],
          height: 3,
        },
      },
    };
  const valid = {
    a: {
      ...before.a,
      properties: {
        ...before.a.properties,
        color: "#bdd5c9",
        circulation: true,
      },
    },
  };
  assert.doesNotThrow(() => assertVisualOnlyDecoration(before, valid));
  for (const change of [
    { height: 4 },
    { restricted: true },
    { roomKeys: ["borrowed"] },
  ])
    assert.throws(() =>
      assertVisualOnlyDecoration(before, {
        a: { ...valid.a, properties: { ...valid.a.properties, ...change } },
      }),
    );
  assert.throws(() =>
    assertVisualOnlyDecoration(before, {
      a: { ...valid.a, geometry: structuredClone(geometry) },
    }),
  );
});
test("detail and each cached/small overview must all stay green at actual user-reported map anchors", () => {
  const f = fixture();
  const features = UNBC_GREEN_TARGETS.map((t) => ({
    type: "Feature",
    properties: {
      nativeRegionId: t.recordKey,
      levelId: t.levelId,
      color: "#bdd5c9",
      circulation: true,
      restricted: false,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        square(t.pointFeet[0] - 0.1, t.pointFeet[1] - 0.1, 0.2).map((p) =>
          geographicPoint(f.data, p as [number, number]),
        ),
      ],
    },
  }));
  f.payload.nativeFaces.fills.features = features;
  f.payload.nativeFaces.overview.features = features;
  f.payload.preparedFloor.presentation.overviewGeometry.features = features;
  const overview: any = { geometry: { type: "FeatureCollection", features } };
  assert(
    inspectGreenVisualTargets(f.data, f.payload, overview).every(
      (t) => t.passed,
    ),
  );
  overview.geometry = {
    type: "FeatureCollection",
    features: features.map((f, i) =>
      i ? f : { ...f, properties: { ...f.properties, circulation: false } },
    ),
  };
  const results = inspectGreenVisualTargets(f.data, f.payload, overview);
  assert.equal(results[0].passed, false);
  assert.equal(
    results[0].views.find((v) => v.name === "small-overview")?.passed,
    false,
  );
});
