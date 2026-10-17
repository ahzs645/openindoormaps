/** Unimported release QA only. Exact visual-review applicability never grants
 * room classification, walking support, access, connectivity or route approval. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import type { PreparedDisplayPayload } from "../../app/indoor-project/prepared-display-assets";
import type {
  ProgressiveManifest,
  ProgressiveOverview,
  ProgressiveScope,
} from "../../app/indoor-project/progressive-delivery";
import {
  Rational,
  rational,
} from "../../app/indoor-project/native-rational-overlay";
import { geographicPoint } from "../../app/indoor-project/routing";
import { PUBLISHED_CIRCULATION_PAINT_REVIEW } from "../../app/indoor-project/published-circulation-paint-reviews";
import {
  applyPublishedCirculationPaint,
  applyPublishedOverviewCirculationPaint,
} from "../../app/indoor-project/published-circulation-paint";
import { overviewConnectorSurfaces } from "./overview-connector-surfaces";

export const visualJsonSha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type PaintReview = Omit<
  NonNullable<Parameters<typeof applyPublishedCirculationPaint>[3]>,
  "decisions"
> & {
  decisions: readonly {
    nativeRegionId: string;
    levelId: number;
    roomKeys: readonly string[];
    color: string;
    sourceRoomKeys?: readonly string[];
    evidence?: string;
  }[];
};
export const UNBC_GREEN_TARGETS = [
  {
    label: "04-122",
    recordKey: "rm-311-204072ddb841",
    levelId: 311,
    pointFeet: [-23.749058351814362, 333.94506256072896],
  },
  {
    label: "07-163 corridor",
    recordKey: "rm-311-399064f64ec1",
    levelId: 311,
    pointFeet: [0.6109416481856265, 316.70506256072895],
  },
  {
    label: "04-124 rotunda",
    recordKey: "rm-311-2054e6ddb852",
    levelId: 1487816,
    pointFeet: [-52.229058351814366, 339.90506256072905],
  },
  {
    label: "08-S101 stairs",
    recordKey: "rm-1487816-1a09473066a2",
    levelId: 1487816,
    pointFeet: [79.47661511978546, 478.755786324475],
  },
  {
    label: "08-S101 native ramp upper landing",
    recordKey: "landing:ramp:1622190:upper",
    levelId: 1487816,
    pointFeet: [57.1, 468.1],
  },
  {
    label: "04-124 native ramp lower approach",
    recordKey: "landing:ramp:1586431:lower",
    levelId: 311,
    pointFeet: [-34.11485653513041, 339.41218787064315],
  },
  {
    label: "04-124 native ramp upper approach",
    recordKey: "landing:ramp:1586431:upper",
    levelId: 1487816,
    pointFeet: [-62.80463371698697, 355.48880061775196],
  },
  {
    label: "04-126 native ramp lower approach",
    recordKey: "landing:ramp:1587605:lower",
    levelId: 311,
    pointFeet: [-86.7104292514623, 321.50281684004585],
  },
] as const;
const scalar = (value: number | readonly string[]) => {
  const q =
    typeof value === "number"
      ? rational(value)
      : new Rational(BigInt(value[0]), BigInt(value[1]));
  assert(q.d > 0n);
  return `${q.n}/${q.d}`;
};
/** Rotation/reversal and polygon order only. No snapping, rounding, collinear
 * deletion, tolerance or filled-hole/area-equivalence shortcut. */
export function canonicalVisualParts(
  parts: readonly (readonly (readonly (readonly (
    | number
    | readonly string[]
  )[])[])[])[],
): string {
  const ring = (
    input: readonly (readonly (number | readonly string[])[])[],
  ) => {
    const points = input.map((p) => {
      assert.equal(p.length, 2);
      return p.map(scalar).join(",");
    });
    if (points.length > 1 && points[0] === points.at(-1)) points.pop();
    assert(points.length >= 3);
    assert(points.length <= 500000);
    assert.equal(
      new Set(points).size,
      points.length,
      "Repeated nonclosing ring vertex; visual rebind refuses",
    );
    const index = points.reduce(
        (best, p, i) => (p < points[best] ? i : best),
        0,
      ),
      minimum = points[index];
    const forward = [...points.slice(index), ...points.slice(0, index)].join(
      ";",
    );
    const reverse = points.toReversed(),
      ri = reverse.indexOf(minimum),
      backward = [...reverse.slice(ri), ...reverse.slice(0, ri)].join(";");
    return forward < backward ? forward : backward;
  };
  return JSON.stringify(
    parts
      .map((p) => {
        assert(p.length > 0);
        return [ring(p[0]), ...p.slice(1).map(ring).sort()];
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}
function exactRegionGeometry(
  payload: PreparedDisplayPayload,
  region: PreparedDisplayPayload["nativeFaces"]["regions"][number],
) {
  assert(
    region.exactFaceId,
    "No exact native face evidence; automatic visual rebind refused",
  );
  const candidates = (payload.nativeFaces.exactTopologies ?? []).filter(
    (t) =>
      t.levelId === region.levelId &&
      t.topology.faces.some((f) => f.id === region.exactFaceId),
  );
  assert.equal(candidates.length, 1, "Ambiguous/missing exact prepared face");
  const topology = candidates[0].topology,
    face = topology.faces.find((f) => f.id === region.exactFaceId)!;
  return canonicalVisualParts(
    face.parts.map((p) =>
      p.map((r) =>
        r.map((i) => {
          assert(
            Number.isSafeInteger(i) &&
              i >= 0 &&
              i < topology.coordinates.length,
          );
          const c = topology.coordinates[i];
          return [c.x, c.y];
        }),
      ),
    ),
  );
}
function recordSignature(r: IndoorRecord) {
  return visualJsonSha256({
    key: r.key,
    number: r.number,
    name: r.name,
    building: r.building,
    levelId: r.levelId,
    elevationFeet: r.elevationFeet,
    geometry: canonicalVisualParts([r.ringsFeet]),
    circulation: r.circulation,
    stair: r.stair,
    walkable: r.walkable,
    access: r.access,
    spaceUse: r.properties?.spaceUse ?? null,
  });
}
const reviewMatches = (
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  review: PaintReview,
) =>
  review?.format === "openindoormaps-published-circulation-paint-v1" &&
  review.datasetSha256 === manifest.provenance.datasetSha256 &&
  review.engineSha256 === manifest.provenance.enginePreparationSha256 &&
  review.revisionSha256 === manifest.revisionSha256 &&
  [review, ...(review.additionalScopes ?? [])].some(
    (r) =>
      r.scopeId === scope.id &&
      r.preparedLogicalSha256 === scope.display.descriptor.logicalJsonSha256,
  );
export function captureAuthorizedBaselineVisualReview(
  data: IndoorDataset,
  payload: PreparedDisplayPayload,
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  review: PaintReview,
) {
  assert(
    reviewMatches(manifest, scope, review),
    "Historical review does not bind baseline assets",
  );
  assert(
    [
      "c2a275a008cf4c578da9f9f7ec547afa82241ed0a2f0d9220a95697c18c5a3d1",
      "ce04f9a8f556d5383968d68b25b52a3ba1bd72d8877d09f1275756aefa5057c3",
    ].includes(review.revisionSha256),
    "Unrecognized historical review revision",
  );
  assert.equal(data.source.modelSha256, manifest.provenance.source.modelSha256);
  // Preserve the exact previously authorized decisions independently of a later
  // production registry update. This hash is evidence identification, never
  // source geometry or navigation authority; all old/new local facts are checked.
  const ordered = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(ordered)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [
                key,
                ordered((value as Record<string, unknown>)[key]),
              ]),
          )
        : value;
  assert.equal(
    visualJsonSha256(
      ordered({
        datasetSha256: review.datasetSha256,
        engineSha256: review.engineSha256,
        decisions: review.decisions,
      }),
    ),
    "d9957e52ccd04bd0457bd442cdfa496443a2266fef74e1d825661034f3eac8e0",
    "Different user paint decisions require separate evidence",
  );
  const keys = new Set([
    ...review.decisions.flatMap((d) => [
      ...d.roomKeys,
      ...(d.sourceRoomKeys ?? []),
    ]),
    ...UNBC_GREEN_TARGETS.map((t) => t.recordKey),
  ]);
  const records = Object.fromEntries(
    [...keys].map((key) => {
      const rows = data.records.filter((r) => r.key === key);
      assert.equal(rows.length, 1);
      return [key, recordSignature(rows[0])];
    }),
  );
  return {
    format: "unbc-prior-visual-review-local-evidence-v1",
    modelSha256: data.source.modelSha256,
    alignmentSha256: visualJsonSha256(data.alignment),
    levelElevations: Object.fromEntries(
      data.nativeLevels.map((l) => [l.id, l.elevationFeet]),
    ),
    records,
    decisions: review.decisions.map((d) => {
      const rows = payload.nativeFaces.regions.filter(
        (r) => r.id === d.nativeRegionId,
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].levelId, d.levelId);
      assert.deepEqual(rows[0].roomKeys, d.roomKeys);
      return {
        decision: d,
        exactGeometry: exactRegionGeometry(payload, rows[0]),
      };
    }),
    baselineBinding: {
      datasetSha256: manifest.provenance.datasetSha256,
      revisionSha256: manifest.revisionSha256,
      scopeId: scope.id,
      preparedLogicalSha256: scope.display.descriptor.logicalJsonSha256,
    },
  };
}
export function checkedVisualReviewRebind(
  baseline: ReturnType<typeof captureAuthorizedBaselineVisualReview>,
  data: IndoorDataset,
  payload: PreparedDisplayPayload,
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
) {
  const failures: string[] = [],
    mapped: any[] = [];
  if (data.source.modelSha256 !== baseline.modelSha256)
    failures.push("Original model changed");
  if (visualJsonSha256(data.alignment) !== baseline.alignmentSha256)
    failures.push("Original map alignment changed");
  for (const [id, z] of Object.entries(baseline.levelElevations)) {
    const now = data.nativeLevels.find((l) => l.id === Number(id));
    if (!now || now.elevationFeet !== z)
      failures.push(`Native level/elevation changed:${id}`);
  }
  for (const [key, hash] of Object.entries(baseline.records)) {
    const rows = data.records.filter((r) => r.key === key);
    if (rows.length !== 1 || recordSignature(rows[0]) !== hash)
      failures.push(`Source place geometry/classification changed:${key}`);
  }
  for (const old of baseline.decisions) {
    const possible = payload.nativeFaces.regions.filter(
      (r) =>
        r.levelId === old.decision.levelId &&
        JSON.stringify(r.roomKeys) === JSON.stringify(old.decision.roomKeys),
    );
    const matches = possible.filter((r) => {
      try {
        return exactRegionGeometry(payload, r) === old.exactGeometry;
      } catch {
        return false;
      }
    });
    if (matches.length !== 1) {
      failures.push(
        `No unique unchanged exact native face for:${old.decision.nativeRegionId}`,
      );
      continue;
    }
    mapped.push({
      ...old.decision,
      nativeRegionId: matches[0].id,
      levelId: matches[0].levelId,
      roomKeys: matches[0].roomKeys,
    });
  }
  return {
    eligible: failures.length === 0,
    failures,
    sourceGeometryAndClassificationChecked: true,
    navigationApprovalGranted: false,
    proposedDisplayOnlyReview: failures.length
      ? undefined
      : {
          format: "openindoormaps-published-circulation-paint-v1",
          datasetSha256: manifest.provenance.datasetSha256,
          engineSha256: manifest.provenance.enginePreparationSha256,
          revisionSha256: manifest.revisionSha256,
          scopeId: scope.id,
          preparedLogicalSha256: scope.display.descriptor.logicalJsonSha256,
          decisions: mapped,
        },
  };
}
/** Decorator must preserve every geometry object and all non-paint fields,
 * including exact topology, room associations, heights and restrictions. */
export function assertVisualOnlyDecoration(before: any, after: any) {
  const visited = new WeakMap<object, WeakSet<object>>();
  function walk(a: any, b: any) {
    if (a === b) return;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") {
      assert.deepEqual(a, b);
      return;
    }
    const seen = visited.get(a) ?? new WeakSet<object>();
    if (seen.has(b)) return;
    seen.add(b);
    visited.set(a, seen);
    if (a.type === "Feature") {
      assert.equal(b.type, "Feature");
      assert.equal(a.geometry, b.geometry, "Paint changed feature geometry");
      const strip = (p: any) => {
        const { color: _, circulation: __, ...rest } = p ?? {};
        return rest;
      };
      assert.deepEqual(strip(a.properties), strip(b.properties));
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
      for (const k of Object.keys(a))
        if (!["properties", "geometry"].includes(k)) walk(a[k], b[k]);
      return;
    }
    assert.equal(Array.isArray(a), Array.isArray(b));
    if (Array.isArray(a)) assert.equal(a.length, b.length);
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    for (const k of Object.keys(a)) walk(a[k], b[k]);
  }
  walk(before, after);
}
function insideRing(p: number[], ring: number[][]) {
  let yes = false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
function covers(geometry: any, p: number[]) {
  const parts =
    geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  return parts.some(
    (part: number[][][]) =>
      part.length &&
      insideRing(p, part[0]) &&
      !part.slice(1).some((h) => insideRing(p, h)),
  );
}
export function inspectGreenVisualTargets(
  data: IndoorDataset,
  payload: PreparedDisplayPayload,
  overview: ProgressiveOverview,
) {
  const collections = [
    ["detail", payload.nativeFaces.fills],
    ["cached-native-overview", payload.nativeFaces.overview],
    [
      "cached-floor-overview",
      payload.preparedFloor.presentation.overviewGeometry,
    ],
    ["small-overview", overview.geometry],
  ] as const;
  return UNBC_GREEN_TARGETS.map((target) => {
    assert.equal(
      data.records.filter((r) => r.key === target.recordKey).length,
      1,
    );
    const p = geographicPoint(data, [...target.pointFeet]);
    const views = collections.map(([name, collection]) => {
      const hits = collection.features.filter(
        (f) =>
          f.properties?.levelId === target.levelId &&
          typeof f.properties?.nativeRegionId === "string" &&
          covers(f.geometry, p),
      );
      const bad = hits.filter(
        (f) =>
          f.properties?.color !== "#bdd5c9" ||
          f.properties.circulation !== true ||
          f.properties.restricted === true,
      );
      return {
        name,
        features: hits.length,
        passed: hits.length > 0 && !bad.length,
        bad: bad.map((f) => ({
          nativeRegionId: f.properties?.nativeRegionId,
          color: f.properties?.color,
          circulation: f.properties?.circulation,
          restricted: f.properties?.restricted,
        })),
      };
    });
    return {
      label: target.label,
      recordKey: target.recordKey,
      levelId: target.levelId,
      pointFeet: target.pointFeet,
      views,
      passed: views.every((v) => v.passed),
    };
  });
}
export function inspectConnectorOverviewParity(
  data: IndoorDataset,
  payload: PreparedDisplayPayload,
  overview: ProgressiveOverview,
  scope: ProgressiveScope,
) {
  const expected = overviewConnectorSurfaces(
      data,
      payload,
      scope.levelIds,
      scope.building,
    ).features,
    actual = overview.geometry.features.filter(
      (f) => f.properties?.connectorPlan,
    );
  const keys = (a: readonly unknown[]) => a.map(visualJsonSha256).sort();
  assert.deepEqual(
    keys(actual),
    keys(expected),
    "Original connector plan surfaces were omitted or changed",
  );
  return {
    expected: expected.length,
    actual: actual.length,
    exactFeatureMultisetEqual: true,
    sourceModelSha256: data.source.modelSha256,
    navigationApprovalGranted: false,
  };
}
export function applyAndInspectCandidateVisualData(
  data: IndoorDataset,
  payload: PreparedDisplayPayload,
  overview: ProgressiveOverview,
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  review: PaintReview = PUBLISHED_CIRCULATION_PAINT_REVIEW,
) {
  const decorated = applyPublishedCirculationPaint(
      payload,
      manifest,
      scope,
      review,
    ),
    paintedOverview = applyPublishedOverviewCirculationPaint(
      overview,
      manifest,
      scope,
      review,
    );
  assertVisualOnlyDecoration(payload, decorated);
  assertVisualOnlyDecoration(overview, paintedOverview);
  const targets = inspectGreenVisualTargets(data, decorated, paintedOverview),
    connectors = inspectConnectorOverviewParity(data, payload, overview, scope);
  return {
    reviewMatchesCurrentAssets: reviewMatches(manifest, scope, review),
    targets,
    connectors,
    passed: targets.every((t) => t.passed),
    geometryAndNonPaintFieldsPreserved: true,
    sourceAndNavigationUnchanged: true,
    browserProof: false,
  };
}
