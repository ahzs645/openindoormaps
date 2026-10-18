/** Node-only original-source producer. A portable profile is never authority:
 * only actual RVT-issued contexts plus checked original graph bytes can mint
 * this process-local capability, after both complete source directions pass.
 * Applying it still requires the normal final graph/circulation checks. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createOriginalNativeForeignEnvelopeCensus,
  originalNativeForeignEnvelopeFacts,
} from "../../../reviter/lib/reviter/native-source-foreign-envelope-census.ts";
import { createOriginalNativeStairPhysicalContext } from "../../../reviter/lib/reviter/native-source-stair-physical-inventory.ts";
import { certifyOriginalNativePlacedStairEnvelope } from "../../../reviter/lib/reviter/native-source-stair-placed-envelope.ts";
import { certifyOriginalNativePlanarSlabEnvelope } from "../../../reviter/lib/reviter/native-source-planar-slab-envelope.ts";
import { certifyOriginalNativeFloorObstacleDomains } from "../../../reviter/lib/reviter/native-source-floor-obstacle-domains.ts";
import {
  createOriginalPlacedTrimObstacleContext,
  proveOriginalPlacedTrimObstacleEnvelope,
} from "../../../reviter/lib/reviter/native-source-placed-trim-obstacles.ts";
import {
  certifyOriginalRectangularMullionSourceEnvelope,
  originalRectangularMullionSourceEnvelopeFact,
} from "../../../reviter/lib/reviter/native-source-rectangular-mullion-envelope.ts";
import {
  certifyOriginalSimpleSystemPanelSourceEnvelope,
  originalSimpleSystemPanelSourceEnvelopeFact,
} from "../../../reviter/lib/reviter/native-source-simple-system-panel.ts";
import {
  createCurrentSteppedStairGraphBinding,
  type PortableSteppedGraphBinding,
} from "../../../reviter/lib/reviter/native-stepped-stair-v2-graph-binding.ts";
import {
  encodeSteppedStairV2WireValue,
  type SteppedStairV2WireValue,
} from "../../../reviter/lib/reviter/native-stepped-stair-v2-kernel.ts";
import {
  captureOriginalSteppedStairGraphDemand,
  inspectOriginalSteppedStairGraphDemand,
  type OriginalSteppedStairGraphDemand,
} from "./proposals/original-stepped-stair-graph-demand.ts";
import {
  extractOriginalSteppedStairV2Candidate,
  type SteppedSourceRouteProposal,
} from "./proposals/stepped-stair-v2-source-adapter.ts";
import { replayPortableSteppedStairV2 } from "./proposals/stepped-stair-v2-kernel.ts";

type Sources = Parameters<typeof extractOriginalSteppedStairV2Candidate>[0];
type Review = Parameters<typeof createOriginalNativeForeignEnvelopeCensus>[3];
type Scope = Parameters<typeof createOriginalNativeForeignEnvelopeCensus>[2];
type StairRequest = Parameters<
  typeof createOriginalNativeStairPhysicalContext
>[2][number];
type TrimRequest = Parameters<
  typeof createOriginalPlacedTrimObstacleContext
>[2][number];
type TerminalRecipe = {
  kind: "floor-domains" | "planar-slab";
  nativeFloorElementId: number;
};
const brand: unique symbol = Symbol("original-stepped-stair-v2-source-proof");
export type OriginalSteppedStairV2SourceProof = {
  readonly [brand]: true;
  readonly sourceModelSha256: string;
  readonly originalDatasetSha256: string;
  readonly originalEdgeId: string;
  readonly scope: "original-source-physical-profile-only";
};
export type OriginalSteppedStairV2SourceProofPayload = {
  sourceIndex: { id: string; physical: SteppedStairV2WireValue };
  receipt: SteppedStairV2WireValue;
  originalGraphBinding: PortableSteppedGraphBinding;
  bindings: {
    sourceModelSha256: string;
    sourceSchemaSha256: string;
    sourceRoomsSha256: string;
    originalExplicitSourceReview: Record<string, unknown> | null;
    originalDatasetSha256: string;
    sourceCensusSha256: string;
    originalEdgeId: string;
    nativeStairId: number;
    nativeRunId: number;
    nativeDefinitionId: number;
    originalGraphBindingSha256: string;
    proposalSha256: string;
    physicalWireSha256: string;
    receiptWireSha256: string;
    completeForeignRowsSha256: string;
    completeForeignRows: number;
    sourceIssuedMullionCount: number;
    sourceIssuedPanelCount: number;
    sourceIssuedForeignFactsSha256: string;
    implementation: { path: string; sha256: string }[];
    bothOriginalSourceDirectionsPassed: true;
    runtimeIntegrationApproved: false;
    stepFreeApproved: false;
  };
};
const issued = new WeakMap<
  OriginalSteppedStairV2SourceProof,
  OriginalSteppedStairV2SourceProofPayload
>();
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const jsonHash = (value: unknown) => hash(JSON.stringify(value));
const isHash = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
/** Direct implementation receipts supplement the enclosing source rebuild's
 * complete imported-runtime manifest; they do not claim to be that manifest. */
function implementationBindings() {
  const paths = [
    "./source-stepped-stair-v2-producer.ts",
    "./proposals/stepped-stair-v2-source-adapter.ts",
    "./proposals/stepped-stair-v2-kernel.ts",
    "./proposals/original-stepped-stair-graph-demand.ts",
    "../../../reviter/lib/reviter/native-source-foreign-envelope-census.ts",
    "../../../reviter/lib/reviter/native-source-stair-physical-inventory.ts",
    "../../../reviter/lib/reviter/native-source-stair-placed-envelope.ts",
    "../../../reviter/lib/reviter/native-source-planar-slab-envelope.ts",
    "../../../reviter/lib/reviter/native-source-floor-obstacle-domains.ts",
    "../../../reviter/lib/reviter/native-source-placed-trim-obstacles.ts",
    "../../../reviter/lib/reviter/native-source-rectangular-mullion-envelope.ts",
    "../../../reviter/lib/reviter/native-source-mullion-host-enclosure.ts",
    "../../../reviter/lib/reviter/native-source-simple-system-panel.ts",
    "../../../reviter/lib/reviter/native-stepped-stair-v2-kernel.ts",
    "../../../reviter/lib/reviter/native-stepped-stair-v2-graph-binding.ts",
  ];
  return paths.map((p) => {
    const path = fileURLToPath(new URL(p, import.meta.url));
    return { path, sha256: hash(readFileSync(path)) };
  });
}
/** Freeze the imported producer's direct policy at module initialization.
 * Sampling new disk hashes cannot upgrade already-cached source mathematics.
 * The enclosing rebuild additionally requires a fresh process and its complete
 * transitive import-closure manifest; query-suffix module reloads are invalid. */
const loadedImplementation = implementationBindings();
function stableImplementationBindings() {
  const current = implementationBindings();
  if (JSON.stringify(current) !== JSON.stringify(loadedImplementation))
    throw new Error(
      "Original source implementation changed after module load; start a fresh frozen source process",
    );
  return current;
}
function checkedDemand(options: {
  originalDatasetBytes: Uint8Array;
  originalSourceRoomsBytes: Uint8Array;
  expectedOriginalDatasetSha256: string;
  expectedSourceModelSha256: string;
  originalEdgeId: string;
}) {
  return captureOriginalSteppedStairGraphDemand(
    options.originalDatasetBytes,
    options.expectedOriginalDatasetSha256,
    options.expectedSourceModelSha256,
    options.originalEdgeId,
  );
}
/** Only exact original source room bytes bound by the checked complete graph
 * can establish the absence/presence of an explicit disabled source review. */
function checkedOriginalSourceReview(options: {
  originalDatasetBytes: Uint8Array;
  originalSourceRoomsBytes: Uint8Array;
  originalEdgeId: string;
}) {
  const data = JSON.parse(
    new TextDecoder("utf8", { fatal: true }).decode(
      options.originalDatasetBytes,
    ),
  );
  const expected = data.source?.roomsSha256;
  if (
    !isHash(expected) ||
    !(options.originalSourceRoomsBytes instanceof Uint8Array) ||
    hash(options.originalSourceRoomsBytes) !== expected
  )
    throw new Error(
      "Original source room bytes do not match the checked full graph source checksum",
    );
  const source = JSON.parse(
    new TextDecoder("utf8", { fatal: true }).decode(
      options.originalSourceRoomsBytes,
    ),
  );
  const reviews = source?.indoorReviews;
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (
    !object(source) ||
    (reviews !== undefined &&
      (!object(reviews) || reviews.version !== 1 || !object(reviews.edges)))
  )
    throw new Error(
      "Original source edge reviews require direct version1 data; unresolved packed companions refuse",
    );
  if (
    reviews !== undefined &&
    (!object(reviews.records) ||
      Object.keys(reviews).some(
        (k) => !["version", "records", "edges"].includes(k),
      ) ||
      Object.entries(reviews.edges).some(
        ([id, value]) =>
          !id ||
          !object(value) ||
          Object.keys(value).some(
            (k) =>
              !["enabled", "accessible", "notes", "geometryKey"].includes(k),
          ) ||
          (value.enabled !== undefined && typeof value.enabled !== "boolean") ||
          (value.accessible !== undefined &&
            !["yes", "no", "unknown"].includes(value.accessible as string)) ||
          (value.notes !== undefined && typeof value.notes !== "string") ||
          (value.geometryKey !== undefined &&
            typeof value.geometryKey !== "string"),
      ))
  )
    throw new Error(
      "Original source edge reviews contain unresolved packed or unsupported values",
    );
  const decision =
    reviews === undefined ||
    !Object.prototype.hasOwnProperty.call(reviews.edges, options.originalEdgeId)
      ? null
      : reviews.edges[options.originalEdgeId];
  if (
    decision !== null &&
    (!object(decision) ||
      (decision.enabled !== undefined && typeof decision.enabled !== "boolean"))
  )
    throw new Error("Malformed original explicit source edge review");
  if (decision?.enabled === false)
    throw new Error("An explicit original source review disables this stair");
  return {
    sourceRoomsSha256: expected,
    originalExplicitSourceReview: structuredClone(decision) as Record<
      string,
      unknown
    > | null,
    originalGraphBinding: createCurrentSteppedStairGraphBinding(
      data,
      options.originalEdgeId,
    ),
  };
}

export type OriginalSteppedStairV2SourceInputs = {
  originalRVTBytes: Uint8Array;
  expectedSourceModelSha256: string;
  originalDatasetBytes: Uint8Array;
  originalSourceRoomsBytes: Uint8Array;
  expectedOriginalDatasetSha256: string;
  originalEdgeId: string;
  reviewedDrawingReferences?: Review;
  foreignScopeBoundsFeet: Scope;
  sourceRequest: StairRequest;
  terminalMaterials: [TerminalRecipe, TerminalRecipe];
  placedTrimRequests?: readonly TrimRequest[];
  /** Retention locators only; every requested frame/role is independently read
   * from original bytes by the opaque source constructors. */
  retainedOriginalElementIds?: readonly number[];
  proposal: SteppedSourceRouteProposal;
  log?: (value: unknown) => void;
};

/** Fresh source entry point. No cache, saved profile, certificate JSON or
 * incoming display geometry can replace any of the original constructors. */
export function createOriginalSteppedStairV2SourceProof(
  options: OriginalSteppedStairV2SourceInputs,
): OriginalSteppedStairV2SourceProof {
  const started = Date.now(),
    before = stableImplementationBindings(),
    demand = checkedDemand(options),
    graph = inspectOriginalSteppedStairGraphDemand(demand),
    request = options.sourceRequest,
    log = options.log ?? (() => {});
  if (
    !isHash(options.expectedSourceModelSha256) ||
    hash(options.originalRVTBytes) !== options.expectedSourceModelSha256
  )
    throw new Error("Original RVT source checksum differs");
  if (
    !request ||
    request.nativeStairId !== graph.edge.nativeElementId ||
    request.nativeRunId !== options.proposal.nativeRunId ||
    options.terminalMaterials.length !== 2 ||
    options.terminalMaterials.some(
      (r, i) =>
        r.nativeFloorElementId !==
        options.proposal.terminals[i]!.nativeFloorElementId,
    )
  )
    throw new Error(
      "Source request/proposal/original stair graph demand disagree",
    );
  checkedOriginalSourceReview({ ...options, originalEdgeId: demand.edgeId });
  const bytes = Uint8Array.from(options.originalRVTBytes),
    sha = options.expectedSourceModelSha256,
    ids = [
      ...new Set([
        ...(options.retainedOriginalElementIds ?? []),
        request.nativeStairId,
        request.nativeRunId,
        request.nativeDefinitionId,
        ...options.terminalMaterials.map((f) => f.nativeFloorElementId),
        ...(options.placedTrimRequests ?? []).flatMap((r) =>
          r.nativeDefinitionId === undefined
            ? [r.nativeElementId]
            : [r.nativeElementId, r.nativeDefinitionId],
        ),
      ]),
    ];
  const census = createOriginalNativeForeignEnvelopeCensus(
      bytes,
      sha,
      options.foreignScopeBoundsFeet,
      options.reviewedDrawingReferences,
      ids,
    ).certificate,
    foreign = originalNativeForeignEnvelopeFacts(census),
    unknown = foreign.rows.filter((r) => !r.boundsFeet || r.blocker),
    mullionIds = [
      ...new Set(
        unknown
          .filter((r) => r.categoryId === -2_000_171)
          .map((r) => r.nativeElementId),
      ),
    ],
    panelIds = [
      ...new Set(
        unknown
          .filter((r) => r.categoryId === -2_000_170)
          .map((r) => r.nativeElementId),
      ),
    ];
  log({
    stage: "original-v2-complete-foreign-census",
    rows: foreign.rows.length,
    mullions: mullionIds.length,
    panels: panelIds.length,
    sourceCensusSha256: foreign.sourceCensusSha256,
  });
  const rectangularMullions = mullionIds.map((id) => {
      const result = certifyOriginalRectangularMullionSourceEnvelope(
        census,
        id,
      );
      if (!result.ok)
        throw new Error(
          `Original mullion${id} refuses: ${result.blockers.join("; ")}`,
        );
      return result.certificate;
    }),
    simpleSystemPanels = panelIds.map((id) => {
      const result = certifyOriginalSimpleSystemPanelSourceEnvelope(census, id);
      if (!result.ok)
        throw new Error(
          `Original panel${id} refuses: ${result.blockers.join("; ")}`,
        );
      return result.certificate;
    });
  const stair = createOriginalNativeStairPhysicalContext(bytes, sha, [request]),
    ownResult = certifyOriginalNativePlacedStairEnvelope(
      stair,
      request.nativeRunId,
    );
  if (!ownResult.ok)
    throw new Error(
      `Original placed stair refuses: ${ownResult.blockers.join("; ")}`,
    );
  const terminalMaterials = options.terminalMaterials.map((recipe) => {
    if (recipe.kind === "floor-domains") {
      const r = certifyOriginalNativeFloorObstacleDomains(
        census,
        recipe.nativeFloorElementId,
      );
      if (!r.ok)
        throw new Error(
          `Original floor domains refuse: ${r.blockers.join("; ")}`,
        );
      return { kind: "floor-domains" as const, certificate: r.certificate };
    }
    if (recipe.kind !== "planar-slab")
      throw new Error("Unsupported original terminal material recipe");
    const r = certifyOriginalNativePlanarSlabEnvelope(
      bytes,
      sha,
      recipe.nativeFloorElementId,
    );
    if (!r.ok)
      throw new Error(`Original slab refuses: ${r.blockers.join("; ")}`);
    return { kind: "planar-slab" as const, certificate: r.certificate };
  }) as Sources["terminalMaterials"];
  const trimRequests = options.placedTrimRequests ?? [],
    additionalForeignMaterials: NonNullable<
      Sources["additionalForeignMaterials"]
    > = [];
  if (trimRequests.length > 0) {
    const context = createOriginalPlacedTrimObstacleContext(
      bytes,
      sha,
      trimRequests,
    );
    for (const r of trimRequests) {
      const result = proveOriginalPlacedTrimObstacleEnvelope(
        context,
        r.nativeElementId,
      );
      if (!result.ok)
        throw new Error(
          `Original placed material${r.nativeElementId} refuses: ${result.blockers.join("; ")}`,
        );
      additionalForeignMaterials.push(result.certificate);
    }
  }
  const proof = createOriginalSteppedStairV2SourceProofFromSources({
    sources: {
      stair,
      foreign: census,
      own: ownResult.certificate,
      terminalMaterials,
      additionalForeignMaterials,
      rectangularMullions,
      simpleSystemPanels,
    },
    originalDemand: demand,
    originalDatasetBytes: options.originalDatasetBytes,
    originalSourceRoomsBytes: options.originalSourceRoomsBytes,
    expectedOriginalDatasetSha256: options.expectedOriginalDatasetSha256,
    expectedSourceModelSha256: sha,
    proposal: options.proposal,
    log,
  });
  if (JSON.stringify(before) !== JSON.stringify(stableImplementationBindings()))
    throw new Error(
      "Original source producer implementation changed during construction",
    );
  log({
    stage: "original-v2-source-profile-passed-both-directions",
    elapsedMs: Date.now() - started,
    nativeStairId: request.nativeStairId,
    nativeRunId: request.nativeRunId,
  });
  return proof;
}

/** Reuse ONLY genuine same-process original handles. Every handle is consumed
 * again by its private native registry; a structurally matching JSON snapshot
 * cannot enter this path. This permits a retained complete source session. */
export function createOriginalSteppedStairV2SourceProofFromSources(options: {
  sources: Sources;
  originalDemand: OriginalSteppedStairGraphDemand;
  originalDatasetBytes: Uint8Array;
  originalSourceRoomsBytes: Uint8Array;
  expectedOriginalDatasetSha256: string;
  expectedSourceModelSha256: string;
  proposal: SteppedSourceRouteProposal;
  log?: (value: unknown) => void;
}): OriginalSteppedStairV2SourceProof {
  const before = stableImplementationBindings(),
    demand = checkedDemand({
      ...options,
      originalEdgeId: options.originalDemand.edgeId,
    }),
    original = inspectOriginalSteppedStairGraphDemand(options.originalDemand),
    checked = inspectOriginalSteppedStairGraphDemand(demand);
  if (
    options.originalDemand.originalDatasetSha256 !==
      options.expectedOriginalDatasetSha256 ||
    JSON.stringify(original) !== JSON.stringify(checked)
  )
    throw new Error(
      "Original opaque graph demand and checked complete graph bytes differ",
    );
  const sourceReview = checkedOriginalSourceReview({
      ...options,
      originalEdgeId: demand.edgeId,
    }),
    originalGraphBinding = sourceReview.originalGraphBinding,
    extracted = extractOriginalSteppedStairV2Candidate(
      options.sources,
      demand,
      options.proposal,
    ),
    reverse = replayPortableSteppedStairV2(
      extracted.index,
      extracted.receipt,
      demand,
      { direction: "reverse" },
    );
  if (
    !extracted.replay.mathematicalReplayPassed ||
    !reverse.mathematicalReplayPassed
  ) {
    // Detached refusal diagnostics identify the exact source owner/movement so
    // a proposal can be repaired without relaxing the source or kernel guards.
    options.log?.({
      stage: "original-v2-source-profile-refused",
      forwardIssues: [...extracted.replay.issues],
      reverseIssues: [...reverse.issues],
      forwardContacts: structuredClone(
        extracted.replay.materialContacts.slice(0, 128),
      ),
      reverseContacts: structuredClone(reverse.materialContacts.slice(0, 128)),
      contactDetailsTruncated:
        extracted.replay.materialContacts.length > 128 ||
        reverse.materialContacts.length > 128,
      unknownPhysicalBodyKeys: [...extracted.replay.unknownPhysicalBodyKeys],
      routeApproved: false,
    });
    throw new Error(
      `Original complete source profile refuses: ${[...extracted.replay.issues, ...reverse.issues].join("; ")}`,
    );
  }
  const foreign = originalNativeForeignEnvelopeFacts(options.sources.foreign),
    sourceModelSha256 = options.expectedSourceModelSha256,
    physical = encodeSteppedStairV2WireValue(extracted.index),
    receipt = encodeSteppedStairV2WireValue(extracted.receipt),
    physicalWireSha256 = jsonHash(physical),
    facts = [
      ...(options.sources.rectangularMullions ?? []).map((c) =>
        originalRectangularMullionSourceEnvelopeFact(
          options.sources.foreign,
          c,
        ),
      ),
      ...(options.sources.simpleSystemPanels ?? []).map((c) =>
        originalSimpleSystemPanelSourceEnvelopeFact(options.sources.foreign, c),
      ),
    ],
    after = stableImplementationBindings();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Source producer implementation changed during proof");
  if (
    foreign.sourceModelSha256 !== sourceModelSha256 ||
    demand.sourceModelSha256 !== sourceModelSha256 ||
    extracted.index.sourceModelSha256 !== sourceModelSha256
  )
    throw new Error("Original source model binding differs");
  const payload: OriginalSteppedStairV2SourceProofPayload = {
    sourceIndex: {
      id: `original-stepped-v2:${extracted.index.nativeRunId}:${physicalWireSha256}`,
      physical,
    },
    receipt,
    originalGraphBinding,
    bindings: {
      sourceModelSha256,
      sourceRoomsSha256: sourceReview.sourceRoomsSha256,
      originalExplicitSourceReview: sourceReview.originalExplicitSourceReview,
      sourceSchemaSha256: extracted.index.sourceSchemaSha256,
      originalDatasetSha256: options.expectedOriginalDatasetSha256,
      sourceCensusSha256: extracted.sourceCensusSha256,
      originalEdgeId: demand.edgeId,
      nativeStairId: extracted.index.nativeStairId,
      nativeRunId: extracted.index.nativeRunId,
      nativeDefinitionId: extracted.index.nativeDefinitionId!,
      originalGraphBindingSha256: jsonHash(originalGraphBinding),
      proposalSha256: jsonHash(options.proposal),
      physicalWireSha256,
      receiptWireSha256: jsonHash(receipt),
      completeForeignRowsSha256: jsonHash(foreign.rows),
      completeForeignRows: foreign.rows.length,
      sourceIssuedMullionCount:
        options.sources.rectangularMullions?.length ?? 0,
      sourceIssuedPanelCount: options.sources.simpleSystemPanels?.length ?? 0,
      sourceIssuedForeignFactsSha256: jsonHash(
        encodeSteppedStairV2WireValue(facts),
      ),
      implementation: after,
      bothOriginalSourceDirectionsPassed: true,
      runtimeIntegrationApproved: false,
      stepFreeApproved: false,
    },
  };
  const proof = Object.freeze({
    [brand]: true as const,
    sourceModelSha256,
    originalDatasetSha256: options.expectedOriginalDatasetSha256,
    originalEdgeId: demand.edgeId,
    scope: "original-source-physical-profile-only" as const,
  });
  issued.set(proof, payload);
  return proof;
}

/** Detached exact-wire snapshot. Returned data cannot mutate or reissue the
 * private original-source capability. The finalizer still checks the dataset. */
export function readOriginalSteppedStairV2SourceProof(
  proof: OriginalSteppedStairV2SourceProof,
): OriginalSteppedStairV2SourceProofPayload {
  stableImplementationBindings();
  const payload = issued.get(proof);
  if (!payload)
    throw new Error(
      "A genuine same-process original stepped stair v2 source proof is required",
    );
  return structuredClone(payload);
}
