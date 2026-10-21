/** Read-only source/candidate regression audit. No published receipt/cache is accepted here.
 * Usage is printed with --help. Expensive native validation deliberately runs before coverage. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { unzipSync, gunzipSync, gzipSync } from "fflate";
import { readIndoorProject } from "../../app/indoor-project/package";
import { editorVisitorDataset } from "../../app/indoor-project/map-edits";
import { prepareOneSelectedDisplayScope } from "./selected-display-scope";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import {
  createImmutableRoutingSession,
  routingCalculationValue,
} from "../../app/indoor-project/routing-cache";
import { nativeCirculationWalkBlockers } from "../../app/indoor-project/native-circulation";
import { nativeDoorFloorBlockers } from "../../app/indoor-project/native-door-floor-support";
import { nativeStairRouteQualified } from "../../app/indoor-project/native-source-stair";
import { validatedNativeRampSurface } from "../../app/indoor-project/native-ramp-surface";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { isProjectDestination } from "../../app/indoor-project/routing-graph";
import {
  collectFreshCandidateRoutingCache,
  writeFreshCandidateRoutingCache,
} from "./candidate-routing-cache";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { fileURLToPath } from "node:url";
import { strictOriginalBlockedArrivalEvidence } from "./candidate-arrival-loss";
import { assertExactSteppedOutcomeInventory } from "./postcompile-stepped-stair-artifacts";
import { postcompileDeclinedRouteCases } from "./postcompile-stepped-stair-candidate-scope";
import {
  sha256,
  jsonSha256,
  profiles,
  safetySnapshot,
  compareSafety,
  auditCoverage,
  compareCoverage,
  connectorCases,
  checkRouteResult,
  checkedStationaryNativeAliasChanges,
  masterVisitorPhysicalAuthoritySha256,
  available,
  type Matrix,
  type Endpoint,
  type RouteCase,
} from "./pathway-candidate-audit";

import { retainDistinctActualRouteCase } from "./pathway-route-case-identity";

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  if (i === -1) return;
  if (!args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error(`Missing value for ${name}`);
  return args[i + 1];
};
const usage =
  "node --max-old-space-size=8192 --expose-gc --import tsx scripts/indoor/audit-pathway-candidate.ts --baseline VERIFIED-VISITOR.zip --candidate CANDIDATE.zip --source-baseline ORIGINAL-MASTER.zip [--source-candidate NEW-MASTER.zip] --baseline-audit VERIFIED-AUDIT-DIRECTORY --out NEW-DIRECTORY [--review-scope source-bound-review.json] [--cases actual-route-cases.json] [--prepare-selected-scope LEVEL_ID,...]";
if (args.includes("--help")) {
  console.log(usage);
  // This standalone CLI exits successfully after printing its requested usage.
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}
assert.equal(
  preparedDisplayEngineBinding(
    fileURLToPath(new URL("../../", import.meta.url)),
  ).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
  "Refresh the generated preparation-engine binding after source changes, before fresh candidate QA/cache capture",
);
const baselinePath = option("--baseline"),
  candidatePath = option("--candidate"),
  out = option("--out"),
  baselineAudit = option("--baseline-audit"),
  sourceBaselinePath = option("--source-baseline");
const sourceCandidatePath = option("--source-candidate");
if (
  !baselinePath ||
  !candidatePath ||
  !out ||
  !baselineAudit ||
  !sourceBaselinePath
)
  throw new Error(usage);
if (path.resolve(baselinePath) === path.resolve(candidatePath))
  throw new Error("Use separate immutable baseline and candidate archives.");
await fs.mkdir(out, { recursive: true });
if ((await fs.readdir(out)).length > 0)
  throw new Error(
    "Choose an empty QA output directory; prior evidence must not be overwritten.",
  );
const started = performance.now(),
  failures: string[] = [];
const write = async (name: string, value: unknown) =>
  fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2));
const log = (stage: string, extra: unknown = {}) =>
  console.log(
    JSON.stringify({
      stage,
      elapsedMs: Math.round(performance.now() - started),
      ...(extra as object),
    }),
  );
type Entry = { path: string; bytes: number; sha256: string };
type ArchiveManifest = {
  format: string;
  version: number;
  model: Entry & { fileName: string };
  indoor: Entry;
  floors: Entry;
  georeference: Entry;
  scene?: Entry;
  reviewBundle?: Entry;
  sourceRoomsSha256?: string;
};

/** Baseline is already validated evidence. Independently rehash its real ZIP entries,
 * without repeating minutes of source geometry checks. Candidate uses the full importer below. */
async function archiveSnapshot(file: string, withDataset = false) {
  const bytes = new Uint8Array(await fs.readFile(file)),
    archiveSha256 = sha256(bytes),
    manifestFiles = unzipSync(bytes, {
      filter: (entry) => entry.name === "manifest.json",
    });
  if (!manifestFiles["manifest.json"])
    throw new Error(`Missing manifest in ${file}`);
  const manifest = JSON.parse(
    new TextDecoder().decode(manifestFiles["manifest.json"]),
  ) as ArchiveManifest;
  if (!["reviter-project", "openindoormaps-viewer"].includes(manifest.format))
    throw new Error(`Unsupported QA source archive ${file}`);
  const declared = [
    manifest.indoor,
    manifest.floors,
    manifest.georeference,
    ...(manifest.model.path ? [manifest.model] : []),
    ...(manifest.scene ? [manifest.scene] : []),
    ...(manifest.reviewBundle ? [manifest.reviewBundle] : []),
  ];
  for (const entry of declared) {
    if (
      !entry ||
      !Number.isSafeInteger(entry.bytes) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error(`Invalid manifest entry in ${file}`);
    const one = unzipSync(bytes, { filter: (e) => e.name === entry.path })[
      entry.path
    ];
    if (!one || one.length !== entry.bytes || sha256(one) !== entry.sha256)
      throw new Error(`Baseline/checksum mismatch ${file}:${entry.path}`);
  }
  const sourceHashes = {
    modelSha256: manifest.model.sha256,
    modelFileName: manifest.model.fileName,
    actualRvtBytesPresentAndVerified: !!manifest.model.path,
    georeferenceSha256: manifest.georeference.sha256,
    sceneSha256: manifest.scene?.sha256,
  };
  let dataset: IndoorDataset | undefined;
  if (withDataset) {
    const json = unzipSync(bytes, {
      filter: (entry) => entry.name === manifest.indoor.path,
    })[manifest.indoor.path];
    dataset = JSON.parse(new TextDecoder().decode(json)) as IndoorDataset;
  }
  return {
    file: path.resolve(file),
    archiveSha256,
    manifest,
    sourceHashes,
    dataset,
  };
}

log("baseline-checksums");
let base = await archiveSnapshot(baselinePath, true);
assert(base.dataset);
let baselineProjection: IndoorDataset | undefined = routeWorkerDataset(
  base.dataset,
);
const baselineProjectionSha256 = jsonSha256(baselineProjection),
  baselineSafety = safetySnapshot(baselineProjection),
  source = await archiveSnapshot(sourceBaselinePath);
assert.equal(source.sourceHashes.modelSha256, base.sourceHashes.modelSha256);
assert.equal(
  source.sourceHashes.georeferenceSha256,
  base.sourceHashes.georeferenceSha256,
);
const oldReportNames = [
  "all-pairs-full-oracle-audit.json",
  "all-pairs-audit.json",
];
let oldReport:
  | {
      sourceRoutingDatasetSha256: string;
      profiles: {
        mode: string;
        oracleChecks: number;
        blockers?: { kind: string; edgeId: string }[];
      }[];
      places: number;
      matrixFiles: { mode: string; logicalBytes: number; sha256: string }[];
    }
  | undefined;
for (const name of oldReportNames) {
  try {
    oldReport = JSON.parse(
      await fs.readFile(path.join(baselineAudit, name), "utf8"),
    );
    break;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
assert(oldReport, "No complete baseline audit found");
assert.equal(
  oldReport.sourceRoutingDatasetSha256,
  baselineProjectionSha256,
  "Baseline coverage does not bind these exact routing bytes",
);
const oldEndpoints = JSON.parse(
    await fs.readFile(
      path.join(baselineAudit, "endpoint-inventory.json"),
      "utf8",
    ),
  ) as Endpoint[],
  oldMatrices = new Map<string, Matrix>();
assert.equal(oldReport.places, oldEndpoints.length);
assert.deepEqual(
  oldEndpoints.map(({ key, number, levelId, arrivalNodeId }) => ({
    key,
    number,
    levelId,
    arrivalNodeId,
  })),
  baselineProjection.records
    .filter(isProjectDestination)
    .map(({ key, number, levelId, arrivalNodeId }) => ({
      key,
      number,
      levelId,
      arrivalNodeId,
    })),
  "Baseline matrix endpoint order/identity differs from its source dataset",
);
for (const mode of profiles) {
  assert.equal(
    oldReport.profiles.find((p) => p.mode === mode)?.oracleChecks,
    oldEndpoints.length,
    "Baseline was not oracle-checked at every origin",
  );
  const bytes: Uint8Array = new Uint8Array(
      await fs.readFile(
        path.join(baselineAudit, `all-pairs-${mode}.bitset.gz`),
      ),
    ),
    descriptor: (typeof oldReport.matrixFiles)[number] | undefined =
      oldReport.matrixFiles.find((f) => f.mode === mode);
  assert(descriptor);
  assert.equal(sha256(bytes), descriptor.sha256);
  const matrix = gunzipSync(bytes),
    rowBytes = Math.ceil(oldEndpoints.length / 8);
  assert.equal(matrix.length, oldEndpoints.length * rowBytes);
  assert.equal(matrix.length, descriptor.logicalBytes);
  oldMatrices.set(mode, { endpoints: oldEndpoints, rowBytes, matrix });
}
await write("baseline-binding.json", {
  visitor: { ...base, dataset: undefined },
  authoring: source,
  routingProjectionSha256: baselineProjectionSha256,
  coverageSource: path.resolve(baselineAudit),
});
// The raw candidate chooses which old approaches require replay; it grants no
// admission. Candidate data still undergoes the complete original importer.
let candidateSnapshot = await archiveSnapshot(candidatePath, true);
assert(candidateSnapshot.dataset);
const rawCandidateArrivals = new Map(
    candidateSnapshot.dataset.records.map((record) => [
      record.key,
      record.arrivalNodeId,
    ]),
  ),
  removedDeclaredArrivalRecords = baselineProjection.records.filter(
    (record) => record.arrivalNodeId && !rawCandidateArrivals.get(record.key),
  ),
  removedArrivalNodeIds = new Set(
    removedDeclaredArrivalRecords.map((record) => record.arrivalNodeId),
  ),
  originalIncidentEdges = baselineProjection.edges.filter(
    (edge) =>
      edge.enabled &&
      (removedArrivalNodeIds.has(edge.from) ||
        removedArrivalNodeIds.has(edge.to)),
  );
let originalPhysicalWalkBlockers = new Set<string>();
if (originalIncidentEdges.length > 0) {
  await initializeNativeExactGeosOverlay();
  log("fresh-original-lost-arrival-physical-replay", {
    arrivals: removedDeclaredArrivalRecords.length,
    incidentEdges: originalIncidentEdges.length,
  });
  const originalData = baselineProjection;
  originalPhysicalWalkBlockers = createImmutableRoutingSession(originalData)(
    () => nativeCirculationWalkBlockers(originalData, originalIncidentEdges),
  );
}
const originalArrivalRefusals = new Map(
  removedDeclaredArrivalRecords.map((r) => [
    r.key,
    strictOriginalBlockedArrivalEvidence(
      baselineProjection!,
      r.key,
      originalPhysicalWalkBlockers,
    ),
  ]),
);
await write("original-lost-arrival-physical-replay.json", {
  baselinePackageSha256: base.archiveSha256,
  baselineRoutingProjectionSha256: baselineProjectionSha256,
  sourceModelSha256: baselineProjection.source.modelSha256,
  candidatePackageSha256: candidateSnapshot.archiveSha256,
  originalValidator: "nativeCirculationWalkBlockers",
  freshOriginalCalculation: true,
  historicalPublisherCacheUsed: false,
  checkedIncidentEdgeIds: originalIncidentEdges.map((edge) => edge.id),
  blockedIncidentEdgeIds: [...originalPhysicalWalkBlockers],
  arrivalEvidence: [...originalArrivalRefusals.values()],
});
candidateSnapshot = { ...candidateSnapshot, dataset: undefined };
base = { ...base, dataset: undefined }; // Release large baseline, retain only explicit identities/policies.
baselineProjection = undefined;
globalThis.gc?.();

if (
  candidateSnapshot.manifest.format === "openindoormaps-viewer" &&
  !sourceCandidatePath
)
  throw new Error(
    "A visitor candidate requires --source-candidate NEW-MASTER.zip for independent actual source-byte and exact master/visitor physical authority checks",
  );
await write("candidate-binding.json", candidateSnapshot);
if (
  candidateSnapshot.sourceHashes.modelSha256 !==
    source.sourceHashes.modelSha256 ||
  candidateSnapshot.sourceHashes.modelFileName !==
    source.sourceHashes.modelFileName
)
  failures.push("Original RVT identity/bytes changed");
if (
  candidateSnapshot.sourceHashes.georeferenceSha256 !==
  source.sourceHashes.georeferenceSha256
)
  failures.push("Original GIS reference bytes changed");
if (
  candidateSnapshot.manifest.format === "reviter-project" &&
  !candidateSnapshot.sourceHashes.actualRvtBytesPresentAndVerified
)
  failures.push("Candidate authoring archive lacks the original RVT bytes");

await initializeNativeExactGeosOverlay();
log("candidate-original-import-begins");
let candidateBytes = new Uint8Array(await fs.readFile(candidatePath));
let project = await readIndoorProject(candidateBytes, (progress) =>
  log("candidate-original-import", { progress }),
);
candidateBytes = new Uint8Array();
const data = routeWorkerDataset(project.dataset),
  projectionSha256 = jsonSha256(data),
  candidateSafety = safetySnapshot(data);
let selectedDisplayPreparation:
  | Awaited<ReturnType<typeof prepareOneSelectedDisplayScope>>
  | undefined;
const requestedDisplayScope = option("--prepare-selected-scope");
if (requestedDisplayScope) {
  assert(
    /^\d+(?:,\d+)*$/.test(requestedDisplayScope),
    "Invalid selected display scope",
  );
  log("one-selected-display-scope-preparation", {
    levelIds: requestedDisplayScope,
  });
  selectedDisplayPreparation = await prepareOneSelectedDisplayScope(
    editorVisitorDataset(project),
    requestedDisplayScope.split(",").map(Number),
    path.join(out, "selected-display-scope"),
  );
  assert.equal(
    jsonSha256(data),
    projectionSha256,
    "Display preparation changed routing inputs",
  );
}
let safety = compareSafety(baselineSafety, candidateSafety);
// Imported source/scene/authoring buffers are not needed for routing QA after complete validation.
project = undefined as unknown as typeof project;
globalThis.gc?.();
let candidateAuthoringBinding:
  | Omit<Awaited<ReturnType<typeof archiveSnapshot>>, "dataset">
  | undefined;
if (sourceCandidatePath) {
  let actualSource = await archiveSnapshot(sourceCandidatePath, true);
  assert.equal(actualSource.manifest.format, "reviter-project");
  assert.equal(actualSource.manifest.version, 2);
  assert.equal(
    actualSource.sourceHashes.modelSha256,
    source.sourceHashes.modelSha256,
  );
  assert.equal(
    actualSource.sourceHashes.georeferenceSha256,
    source.sourceHashes.georeferenceSha256,
  );
  assert.equal(
    actualSource.sourceHashes.sceneSha256,
    source.sourceHashes.sceneSha256,
    "Original scene bytes changed",
  );
  assert(actualSource.sourceHashes.actualRvtBytesPresentAndVerified);
  assert(actualSource.dataset);
  if (candidateSnapshot.manifest.format === "openindoormaps-viewer")
    assert.equal(
      candidateSnapshot.manifest.sourceRoomsSha256,
      actualSource.manifest.floors.sha256,
      "Candidate visitor does not bind the exact new authoring room bytes",
    );
  assert.equal(
    masterVisitorPhysicalAuthoritySha256(
      routeWorkerDataset(actualSource.dataset),
    ),
    masterVisitorPhysicalAuthoritySha256(data),
    "Candidate master/visitor physical routing/source authority differs",
  );
  const { dataset: _, ...binding } = actualSource;
  candidateAuthoringBinding = binding;
  actualSource = { ...actualSource, dataset: undefined };
  globalThis.gc?.();
  await write("candidate-authoring-binding.json", {
    ...candidateAuthoringBinding,
    actualOriginalRvtGisScenePreserved: true,
    masterVisitorPhysicalAuthorityMatched: true,
  });
}
if (safety.missingSourceFloorIds.length > 0)
  failures.push(
    `Original floor element identities removed: ${safety.missingSourceFloorIds.join(",")}`,
  );
await write("safety-delta.json", safety);

type ReviewScope = {
  format: "openindoormaps-pathway-candidate-review";
  version: 1;
  sourceModelSha256: string;
  baselinePackageSha256: string;
  candidatePackageSha256: string;
  evidence: { id: string; path: string; sha256: string }[];
  records: {
    key: string;
    fields: string[];
    evidenceIds: string[];
    reason?: "withhold-unsupported-original-arrival";
  }[];
  edges: {
    id: string;
    fields: string[];
    evidenceIds: string[];
    reason?: "certify-stationary-native-alias";
  }[];
  postcompileSteppedOutcomes?: {
    requestedEdgeIds: string[];
    qualifiedEdgeIds: string[];
    declinedEdgeIds: string[];
    evidenceIds: string[];
  };
};
const scopePath = option("--review-scope");
let scope: ReviewScope | undefined;
if (scopePath) {
  scope = JSON.parse(await fs.readFile(scopePath, "utf8")) as ReviewScope;
  assert.equal(scope.format, "openindoormaps-pathway-candidate-review");
  assert.equal(scope.version, 1);
  assert.equal(scope.sourceModelSha256, data.source.modelSha256);
  assert.equal(scope.baselinePackageSha256, base.archiveSha256);
  assert.equal(scope.candidatePackageSha256, candidateSnapshot.archiveSha256);
  for (const evidence of scope.evidence) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(
      path.resolve(path.dirname(scopePath), evidence.path),
    ))
      hash.update(chunk);
    assert.equal(
      hash.digest("hex"),
      evidence.sha256,
      `Review evidence changed: ${evidence.id}`,
    );
  }
  for (const item of [...scope.records, ...scope.edges])
    assert(
      item.evidenceIds.length > 0 &&
        item.evidenceIds.every((id) =>
          scope!.evidence.some((e) => e.id === id),
        ),
      "Review item lacks bound evidence",
    );
  const outcomes = scope.postcompileSteppedOutcomes;
  if (outcomes) {
    assertExactSteppedOutcomeInventory(
      outcomes.requestedEdgeIds,
      outcomes.qualifiedEdgeIds,
      outcomes.declinedEdgeIds,
    );
    assert(
      outcomes.evidenceIds.length > 0 &&
        outcomes.evidenceIds.every((id) =>
          scope!.evidence.some((row) => row.id === id),
        ),
      "Postcompile outcome inventory lacks its independently bound replay evidence",
    );
    assert.deepEqual(
      data.edges
        .filter((edge) => edge.nativeSteppedStairV2)
        .map((edge) => edge.id)
        .sort(),
      [...outcomes.qualifiedEdgeIds].sort(),
    );
    assert.equal(
      data.nativeSteppedStairV2SourceIndices?.length ?? 0,
      outcomes.qualifiedEdgeIds.length,
    );
    for (const id of outcomes.declinedEdgeIds) {
      const matches = data.edges.filter((edge) => edge.id === id);
      assert.equal(matches.length, 1);
      assert.equal(matches[0]!.enabled, false);
      assert.equal(matches[0]!.nativeSteppedStairV2, undefined);
    }
  }
  await write("review-scope.json", scope);
}
for (const change of safety.changes) {
  if (
    change.target === "edge" &&
    change.field === "direction" &&
    (change.before ?? "both") === (change.after ?? "both")
  )
    continue;
  const items =
    change.target === "record"
      ? scope?.records.map((r) => ({ ...r, id: r.key }))
      : scope?.edges;
  if (
    !items?.some(
      (item) => item.id === change.id && item.fields.includes(change.field),
    )
  )
    failures.push(
      `Unscoped ${change.target} ${change.field} change: ${change.id}`,
    );
}
log("fresh-physical-and-graph-validation-begins");
const run = createImmutableRoutingSession(data),
  coverage: ReturnType<typeof auditCoverage>[] = [];
let physical: unknown;
let stationaryAliasCertifications: ReturnType<
  typeof checkedStationaryNativeAliasChanges
> = [];
run(() => {
  const walking = routingCalculationValue(
      data,
      "routing-native-walk-blockers",
      () => nativeCirculationWalkBlockers(data),
    ),
    doors = routingCalculationValue(data, "native-door-floor-blockers", () =>
      nativeDoorFloorBlockers(data),
    ),
    stairs = data.edges
      .filter((e) => e.kind === "stairs" || e.kind === "local-steps")
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        enabled: e.enabled,
        qualified: nativeStairRouteQualified(data, e),
        nativeElementId: e.nativeElementId,
      })),
    ramps = data.edges
      .filter((e) => e.kind === "ramp")
      .map((e) => ({
        id: e.id,
        enabled: e.enabled,
        qualified: !!validatedNativeRampSurface(data, e),
        accessible: e.accessible,
      }));
  const requestedStationaryAliases = new Set(
    scope?.edges
      .filter(
        (item) =>
          item.reason === "certify-stationary-native-alias" &&
          item.fields.includes("accessible"),
      )
      .map((item) => item.id) ?? [],
  );
  stationaryAliasCertifications = checkedStationaryNativeAliasChanges(
    data,
    baselineSafety,
    requestedStationaryAliases,
    walking,
  );
  const acceptedAliases = new Set(
    stationaryAliasCertifications
      .filter((proof) => proof.accepted)
      .map((proof) => proof.edgeId),
  );
  for (const refused of stationaryAliasCertifications.filter(
    (proof) => !proof.accepted,
  ))
    failures.push(
      `Stationary identity proof refused: ${refused.edgeId}: ${refused.reasons.join("; ")}`,
    );
  safety = compareSafety(baselineSafety, candidateSafety, acceptedAliases);
  failures.push(...safety.violations);
  for (const stair of stairs)
    if (stair.enabled && !stair.qualified)
      failures.push(`Enabled stair lacks original qualification: ${stair.id}`);
  for (const ramp of ramps)
    if (ramp.enabled && !ramp.qualified)
      failures.push(`Enabled ramp lacks original qualification: ${ramp.id}`);
  physical = {
    walkingEdgesChecked: data.edges.filter((e) => e.kind === "walk").length,
    doorEdgesChecked: data.edges.filter((e) => e.kind === "door").length,
    walkingBlockers: [...walking],
    doorBlockers: [...doors],
    stairs,
    ramps,
  };
  for (const mode of profiles) {
    log("full-origin-coverage", { mode });
    coverage.push(auditCoverage(data, mode));
    log("full-origin-coverage-complete", {
      mode,
      reachable: coverage.at(-1)!.reachable,
    });
  }
});
await write(
  "stationary-native-alias-certifications.json",
  stationaryAliasCertifications,
);
await write("safety-delta.json", safety);
await write("fresh-physical-validation.json", physical);
for (const profile of coverage) {
  const { matrix, endpoints, ...report } = profile;
  await fs.writeFile(
    path.join(out, `all-pairs-${profile.mode}.bitset.gz`),
    gzipSync(matrix, { level: 9, mtime: 0 }),
  );
  await write(`all-pairs-${profile.mode}.json`, report);
  await write("endpoint-inventory.json", endpoints);
}
const changes = coverage.map((profile) => ({
  mode: profile.mode,
  ...compareCoverage(oldMatrices.get(profile.mode)!, profile),
}));
await write("reachability-delta.json", changes);
const withheldUnsupportedOriginalArrivals: unknown[] = [];
for (const change of changes) {
  if (change.comparableLossCount)
    failures.push(
      `${change.mode}: ${change.comparableLossCount} formerly available directed pairs lost`,
    );
  for (const roomKey of change.lostArrivals) {
    const evidence = originalArrivalRefusals.get(roomKey),
      reviewed = scope?.records.some(
        (item) =>
          item.key === roomKey &&
          item.reason === "withhold-unsupported-original-arrival" &&
          item.fields.includes("arrivalNodeId"),
      ),
      candidateWithholds = !data.records.find(
        (record) => record.key === roomKey,
      )?.arrivalNodeId,
      isolatedInBothOriginalProfiles = profiles.every((mode) => {
        const matrix = oldMatrices.get(mode)!,
          index = matrix.endpoints.findIndex((r) => r.key === roomKey);
        return (
          index !== -1 &&
          matrix.endpoints.every(
            (_r, j) =>
              !available(matrix, index, j) && !available(matrix, j, index),
          )
        );
      });
    if (
      reviewed &&
      candidateWithholds &&
      isolatedInBothOriginalProfiles &&
      evidence?.allOriginalApproachesPhysicallyRefused
    ) {
      withheldUnsupportedOriginalArrivals.push({
        mode: change.mode,
        ...evidence,
        isolatedInBothOriginalProfiles,
        reviewScopeBound: true,
      });
    } else
      failures.push(
        `${change.mode}: originally valid arrival lost without complete original physical-refusal and isolated-pair evidence: ${roomKey}`,
      );
  }
}
await write(
  "withheld-original-arrival-evidence.json",
  withheldUnsupportedOriginalArrivals,
);

const generated = connectorCases(data),
  declinedCases = scope?.postcompileSteppedOutcomes
    ? postcompileDeclinedRouteCases(
        data,
        scope.postcompileSteppedOutcomes.declinedEdgeIds,
      )
    : [],
  explicitCases: RouteCase[] = option("--cases")
    ? JSON.parse(await fs.readFile(option("--cases")!, "utf8"))
    : [],
  affectedCases: RouteCase[] = [];
for (const profile of coverage) {
  const delta = changes.find((change) => change.mode === profile.mode)!;
  for (const key of delta.recoveredArrivals) {
    const i = profile.endpoints.findIndex((record) => record.key === key),
      j = profile.endpoints.findIndex((_r, index) =>
        available(profile, i, index),
      );
    if (j !== -1)
      for (const reverse of [false, true])
        affectedCases.push({
          name: `recovered-arrival:${key}:${reverse ? "return" : "depart"}:${profile.mode}`,
          start: profile.endpoints[reverse ? j : i].key,
          end: profile.endpoints[reverse ? i : j].key,
          mode: profile.mode,
        });
  }
  // At least one real newly connected pair per origin represented in the comparable gains.
  const origins = new Set<string>();
  for (const pair of delta.comparableGainExamples)
    if (!origins.has(pair.start) && origins.size < 24) {
      origins.add(pair.start);
      affectedCases.push({
        ...pair,
        mode: profile.mode,
        name: `pair-gain:${pair.start}→${pair.end}:${profile.mode}`,
      });
    }
}
const seenCases = new Set<string>(),
  cases = [
    ...generated.cases,
    ...declinedCases,
    ...affectedCases,
    ...explicitCases,
  ].filter((test) => {
    if (
      !profiles.includes(test.mode) ||
      !data.records.some((r) => r.key === test.start) ||
      !data.records.some((r) => r.key === test.end)
    )
      throw new Error(`Invalid actual route case ${test.name}`);
    return retainDistinctActualRouteCase(test, seenCases);
  });
for (const unmapped of generated.unresolved)
  failures.push(
    `Enabled connector has no original selectable approach pair: ${unmapped.edgeId}`,
  );
await write("actual-route-cases.json", {
  cases,
  unresolved: generated.unresolved,
});
const calculate = createWorkerRouteCalculator(data),
  routeResults: unknown[] = [],
  routeGeometries: unknown[] = [],
  routeGeometryReport = {
    format: "openindoormaps-actual-calculated-route-geometries-v1",
    candidatePackageSha256: candidateSnapshot.archiveSha256,
    candidateRoutingProjectionSha256: projectionSha256,
    sourceModelSha256: data.source.modelSha256,
    authority:
      "Paths copied directly from fresh original calculator outputs. Map-data renders are not browser screenshots.",
    rows: routeGeometries,
  };
await write("actual-route-geometries.json", routeGeometryReport);
for (const test of cases) {
  log("actual-route-case", {
    index: routeResults.length + 1,
    total: cases.length,
    name: test.name,
  });
  const startedCase = performance.now();
  let calculation: ReturnType<typeof calculate> | undefined;
  const result = run(() => {
    calculation = calculate(test.start, test.end, test.mode);
    return checkRouteResult(data, test, calculation);
  });
  const route = calculation!.route;
  routeGeometries.push(
    structuredClone({
      ...test,
      route: route
        ? {
            nodeIds: route.nodeIds,
            edgeIds: route.edges.map((edge) => edge.id),
            edges: route.edges.map((edge) => ({
              id: edge.id,
              kind: edge.kind,
              from: edge.from,
              to: edge.to,
              roomKeys: edge.roomKeys,
            })),
            paths: route.paths,
            distanceMetres: route.distanceMetres,
            unknownAccessAreas: route.unknownAccessAreas,
            unknownAccessibilityEdges: route.unknownAccessibilityEdges,
          }
        : null,
      diagnostic: calculation!.diagnostic ?? null,
      errors: result.errors,
    }),
  );
  await write("actual-route-geometries.json", routeGeometryReport);
  routeResults.push({
    ...test,
    ...result,
    elapsedMs: Math.round(performance.now() - startedCase),
  });
  failures.push(...result.errors.map((error) => `${test.name}: ${error}`));
  await write("actual-route-results.json", routeResults);
}
log("fresh-candidate-route-cache");
const freshRoutingCache = await writeFreshCandidateRoutingCache(
  run(() => collectFreshCandidateRoutingCache(data)),
  path.join(out, "fresh-routing-cache"),
);
assert.equal(
  jsonSha256(data),
  projectionSha256,
  "QA changed the candidate's routing projection",
);
assert.equal(
  sha256(new Uint8Array(await fs.readFile(candidatePath))),
  candidateSnapshot.archiveSha256,
  "Candidate archive changed while QA was running",
);
assert.equal(
  sha256(new Uint8Array(await fs.readFile(baselinePath))),
  base.archiveSha256,
  "Baseline archive changed while QA was running",
);
assert.equal(
  sha256(new Uint8Array(await fs.readFile(sourceBaselinePath))),
  source.archiveSha256,
  "Original source authoring archive changed while QA was running",
);
if (sourceCandidatePath && candidateAuthoringBinding)
  assert.equal(
    sha256(new Uint8Array(await fs.readFile(sourceCandidatePath))),
    candidateAuthoringBinding.archiveSha256,
    "Candidate authoring archive changed while QA was running",
  );
const result = {
  sourceDatasetUnchanged: true,
  candidatePackageSha256: candidateSnapshot.archiveSha256,
  candidateAuthoringPackageSha256: candidateAuthoringBinding?.archiveSha256,
  freshRoutingCache,
  selectedDisplayPreparation,
  candidateRoutingProjectionSha256: projectionSha256,
  baselineRoutingProjectionSha256: baselineProjectionSha256,
  physical,
  safety,
  stationaryAliasCertifications,
  withheldUnsupportedOriginalArrivals,
  reachabilityChanges: changes.map(
    ({
      comparableGainExamples: _comparableGainExamples,
      comparableLossExamples: _comparableLossExamples,
      ...rest
    }) => rest,
  ),
  coverage: coverage.map(
    ({
      matrix: _matrix,
      endpoints: _endpoints,
      blockers: _blockers,
      rows: _rows,
      ...rest
    }) => rest,
  ),
  actualRouteCalculations: routeResults.length,
  actualRouteCasesFileSha256: sha256(
    new Uint8Array(
      await fs.readFile(path.join(out, "actual-route-cases.json")),
    ),
  ),
  actualRouteResultsFileSha256: sha256(
    new Uint8Array(
      await fs.readFile(path.join(out, "actual-route-results.json")),
    ),
  ),
  actualRouteGeometriesFileSha256: sha256(
    new Uint8Array(
      await fs.readFile(path.join(out, "actual-route-geometries.json")),
    ),
  ),
  unmappedConnectors: generated.unresolved,
  failures,
  passed: failures.length === 0,
  elapsedMs: Math.round(performance.now() - started),
  limits:
    "Full original candidate importer, exact native physical validators, every-origin original reachability oracle and selected actual production worker calculator functions. No publisher cache/receipt was installed. Graph coverage is not all-pairs path centering, browser/WebGL/memory or mobile QA. Review-scope documents bind evidence and changed identities but do not themselves certify physical clearance or public/step-free access.",
};
await write("candidate-regression-report.json", result);
log("complete", {
  passed: result.passed,
  failures: failures.length,
  actualRouteCalculations: routeResults.length,
});
if (failures.length > 0) process.exitCode = 1;
