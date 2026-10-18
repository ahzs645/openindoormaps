/** Source-only recovery review; never edits geometry or approves a connection.
 * node --import tsx scripts/indoor/review-unbc-source-recovery.ts RVT indoor.json output.json
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  validNativeRampSurfaceBinding,
  validatedNativeRampSurface,
} from "../../app/indoor-project/native-ramp-surface";
import {
  createOriginalNativeStairPhysicalContext,
  inspectOriginalNativeStairPhysicalInventory,
} from "../../../reviter/lib/reviter/native-source-stair-physical-inventory.ts";
const [rvtPath, indoorPath, output] = process.argv.slice(2);
assert(
  rvtPath && indoorPath && output,
  "Usage: review-unbc-source-recovery.ts original.rvt indoor.json output.json",
);
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const read = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../docs/continuation/unbc-20261015/stair-physical-source-evidence/${name}`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
type SourceRequest = {
  nativeStairId: number;
  nativeRunId: number;
  nativeDefinitionId: number;
};
const historical = read("all38-source-inventory-summary.v2.json") as {
    sourceContext: { model: string };
    runs: (SourceRequest & Record<string, unknown>)[];
  },
  stations = read("remaining24-source-station-contract-audit.json");
const requests = historical.runs.map(
  (r: {
    nativeStairId: number;
    nativeRunId: number;
    nativeDefinitionId: number;
  }) => ({
    nativeStairId: r.nativeStairId,
    nativeRunId: r.nativeRunId,
    nativeDefinitionId: r.nativeDefinitionId,
  }),
);
const original = readFileSync(rvtPath),
  sourceBytes = readFileSync(indoorPath),
  data = JSON.parse(sourceBytes.toString()) as IndoorDataset;
assert.equal(
  hash(original),
  historical.sourceContext.model,
  "Original model identity changed",
);
assert.equal(data.source.modelSha256, hash(original));
const context = createOriginalNativeStairPhysicalContext(
  original,
  historical.sourceContext.model,
  requests,
);
assert.deepEqual(context.missingOriginalRecords, []);
assert.equal(context.completeSourcePages, 3666);
const runs = requests
  .map((r: { nativeRunId: number }) =>
    inspectOriginalNativeStairPhysicalInventory(context, r.nativeRunId),
  )
  .map((r) => {
    const { treads, ...rest } = r;
    return {
      ...rest,
      boundPhysicalTreads: treads.length,
      typedHeightDifferences: treads.filter((t) => !t.exactHeightMatchesTyped)
        .length,
      nonidenticalOriginalUVCoedgeEnds: treads.filter(
        (t) => !t.exactUVCoedgeContinuity,
      ).length,
    };
  });
const mismatches: string[] = [];
for (const row of runs) {
  const old = historical.runs.find(
    (r: { nativeRunId: number }) => r.nativeRunId === row.nativeRunId,
  );
  assert(old, "Historical original run identity is missing");
  for (const key of [
    "sourceFrameSha256s",
    "sourceFaceCount",
    "sourceTypedTreadCount",
    "treadHistoryBindingComplete",
    "typedHeightDifferences",
    "nonidenticalOriginalUVCoedgeEnds",
  ] as const)
    if (JSON.stringify(old[key]) !== JSON.stringify(row[key]))
      mismatches.push(`${row.nativeRunId}:${key}`);
}
const rooms = new Map(data.records.map((r) => [r.key, r])),
  nodes = new Map(data.nodes.map((n) => [n.id, n]));
const label = (nodeId: string) => {
  const n = nodes.get(nodeId);
  const r = n && rooms.get(n.roomKey);
  return {
    nodeId,
    roomKey: r?.key,
    number: r?.number,
    name: r?.name,
    levelId: n?.levelId,
    building: n?.building,
  };
};
const held = data.edges.filter((e) => e.kind === "stairs" && !e.enabled);
assert.equal(held.length, 28);
assert.equal(new Set(held.map((e) => e.nativeElementId)).size, 28);
const stairs = held.map((edge) => {
  const station = stations.rows.find(
    (r: { nativeStairId: number }) => r.nativeStairId === edge.nativeElementId,
  );
  const originalRuns = runs.filter(
    (r) => r.nativeStairId === edge.nativeElementId,
  );
  assert(originalRuns.length > 0);
  const special =
    edge.nativeElementId === 1_696_006
      ? {
          group: "priority-source-proof-and-current-policy-integration",
          firstUnsupportedCondition:
            "Saved source-only body/headroom diagnostics do not resolve the current full landing/cell policy; retain ordinary owners and rerun current approaches before admission.",
        }
      : edge.nativeElementId === 1_298_202
        ? {
            group: "curved-physical-source-consumer-required",
            firstUnsupportedCondition:
              "126 original cylindrical/nonplanar face tokens and 62 multi-control walking edges need a supported source consumer; straight chords cannot substitute.",
          }
        : {
            group: "flags6-vertical-side-consumer-required",
            firstUnsupportedCondition:
              "Original reversed-side flags6 plane handling and retained coedge discrepancies remain unsupported; changing this side mode alone cannot approve the body or route.",
          };
  return {
    id: edge.id,
    nativeStairId: edge.nativeElementId,
    from: label(edge.from),
    to: label(edge.to),
    enabled: edge.enabled,
    accessible: edge.accessible,
    originalRuns,
    recordedRepairGroup: station?.group ?? special.group,
    recordedFirstUnsupportedCondition:
      station?.firstUnsupportedCondition ?? special.firstUnsupportedCondition,
    recordedDiagnosticIsFresh: false,
    currentSourceRereadIsFresh: true,
    nextGates: [
      "Current full original body and riser/turning correspondence",
      "Named lower/upper floor support and complete doorway/landing approaches",
      "Complete own/foreign body clearance and original holes/obstacles",
      "Current circulation cells, access, direction and ordinary-room policy",
      "Regeneration preserves existing admitted arrivals",
      "Actual routes in both directions and desktop/mobile inspection",
    ],
    routeApproved: false,
  };
});
const ramps = data.edges
  .filter((e) => e.kind === "ramp")
  .map((e) => ({
    id: e.id,
    nativeRampId: e.nativeElementId,
    enabled: e.enabled,
    accessible: e.accessible,
    from: label(e.from),
    to: label(e.to),
    bindingPassed: validNativeRampSurfaceBinding(data, e),
    savedGeometryProfileRecalculationPassed: validatedNativeRampSurface(
      data,
      e,
    ),
    freshOriginalRvtProfileReconstructed: false,
    fullNavigationVerified: false,
  }));
const exclusions = [
  1_842_431, 1_460_777, 1_821_194, 1_523_099, 1_844_188, 1_728_649, 1_727_059,
].map((id) => ({
  nativeStairId: id,
  savedStairEdges: data.edges
    .filter((e) => e.kind === "stairs" && e.nativeElementId === id)
    .map((e) => e.id),
  heldLink: data.edges.some(
    (e) => e.kind === "stairs" && !e.enabled && e.nativeElementId === id,
  ),
}));
const report = {
  format: "unbc-all-held-stairs-source-recovery-review-v1",
  createdAt: new Date().toISOString(),
  sourceModelSha256: hash(original),
  sourceIndoorSha256: hash(sourceBytes),
  sourceSchemaSha256: context.sourceSchemaSha256,
  completeOriginalPages: context.completeSourcePages,
  missingOriginalRecords: context.missingOriginalRecords,
  heldStairLinks: stairs.length,
  originalRuns: runs.length,
  typedTreads: runs.reduce((sum, r) => sum + r.sourceTypedTreadCount, 0),
  sourceFaceCount: runs.reduce((sum, r) => sum + r.sourceFaceCount, 0),
  historicalComparisonMismatches: mismatches,
  recordedRepairGroups: stairs.reduce(
    (s, r) => {
      s[r.recordedRepairGroup] = (s[r.recordedRepairGroup] ?? 0) + 1;
      return s;
    },
    {} as Record<string, number>,
  ),
  stairs,
  ramps,
  excludedSourceStairs: exclusions,
  graphChanged: false,
  approvalsAdded: 0,
  limitations: [
    "Fresh original source census and saved ramp-profile recalculation only; not complete physical navigation.",
    "Repair groups come from recorded historical diagnostics and require current targeted replay.",
    "No original endpoint was moved, no gap was filled, and no source owner, access restriction or clearance check was removed.",
  ],
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    ...report,
    stairs: undefined,
    ramps: ramps.map((r) => ({
      id: r.id,
      bindingPassed: r.bindingPassed,
      profilePassed: r.savedGeometryProfileRecalculationPassed,
    })),
    excludedSourceStairs: undefined,
  }),
);
