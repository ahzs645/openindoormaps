import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";

/** Read-only source/prepared evidence inventory. Measurements and saved owner
 * approvals are deliberately separate; this audit never approves an edge. */
type SavedReview = {
  accessible?: "yes" | "no" | "unknown";
  enabled?: boolean;
  notes?: string;
  geometryKey?: string;
};
type Rooms = {
  indoorReviews?: { edges?: Record<string, SavedReview> };
  indoorRamps?: {
    sourceModelSha256: string;
    ramps: {
      id: string;
      nativeRampId: number;
      accessible: string;
      evidence: string;
      notes?: string;
    }[];
  };
  indoorConnectors?: {
    modelSha256: string;
    connectors: {
      id: string;
      accessible: string;
      evidence: string;
      entrances: unknown[];
    }[];
  };
};
const tally = <T>(rows: T[], key: (row: T) => string) => {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = key(row);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
};
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const key = (data: IndoorDataset, edge: IndoorEdge) =>
  JSON.stringify([
    data.source.modelSha256,
    edge.from,
    edge.to,
    edge.roomKeys,
    edge.pointsFeet,
  ]);

export function accessibilityEvidenceInventory(
  data: IndoorDataset,
  source: Rooms,
) {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const edges = new Map(data.edges.map((edge) => [edge.id, edge]));
  const reviews = Object.entries(source.indoorReviews?.edges ?? {}).map(
    ([id, review]) => {
      const edge = edges.get(id);
      let saved: unknown;
      try {
        saved = JSON.parse(review.geometryKey ?? "");
      } catch {
        /* A malformed key is never evidence. */
      }
      const tuple = Array.isArray(saved) ? saved : [];
      return {
        id,
        accessible: review.accessible,
        enabled: review.enabled,
        notes: review.notes,
        compiledEdgePresent: !!edge,
        compiledAccessible: edge?.accessible,
        exactGeometryKeyMatches:
          !!edge && review.geometryKey === key(data, edge),
        savedModelMatches: tuple[0] === data.source.modelSha256,
        savedEndpointIds: [tuple[1], tuple[2]],
        savedEndpointIdsPresent: [
          typeof tuple[1] === "string" && nodes.has(tuple[1]),
          typeof tuple[2] === "string" && nodes.has(tuple[2]),
        ],
        nativeCellId: edge?.nativeCellId,
      };
    },
  );
  const ramps = data.edges
    .filter((edge) => edge.kind === "ramp")
    .map((edge) => {
      const slopes = edge.pointsFeet.slice(1).flatMap((point, i) => {
        const previous = edge.pointsFeet[i]!,
          run = Math.hypot(point[0] - previous[0], point[1] - previous[1]),
          rise = Math.abs(point[2] - previous[2]);
        return run > 1e-10 ? [rise / run] : [];
      });
      const proof = edge.nativeRampSurface?.widthCertificate;
      return {
        id: edge.id,
        nativeElementId: edge.nativeElementId,
        accessible: edge.accessible,
        notes: edge.notes,
        maximumSavedPathGradient: slopes.length ? Math.max(...slopes) : null,
        checkedProfileWidthFeet: proof ? 2 * proof.halfWidthFeet : null,
        maximumSourceCrossfallRatio: proof?.maximumCrossfallRatio,
        maximumContinuousHeightJointFeet:
          proof?.maximumContinuousHeightJointFeet,
        maximumNativeModellingJointFeet: proof?.maximumNativeJointFeet,
        sourceRampRecipe: source.indoorRamps?.ramps.find(
          (ramp) => ramp.id === edge.id,
        ),
        warning:
          "A checked one-foot lateral surface profile or path gradient is physical evidence, not a wheelchair approval, door threshold measurement or full accessible body-clearance survey.",
      };
    });
  return {
    sourceModelSha256: data.source.modelSha256,
    totalEdges: data.edges.length,
    byAccessible: tally(data.edges, (edge) => edge.accessible),
    byKind: Object.fromEntries(
      [...new Set(data.edges.map((edge) => edge.kind))].sort().map((kind) => [
        kind,
        tally(
          data.edges.filter((edge) => edge.kind === kind),
          (edge) => edge.accessible,
        ),
      ]),
    ),
    savedReviews: reviews,
    savedNativeCellReviewCount: reviews.filter((review) => review.nativeCellId)
      .length,
    originalRampRecipes: source.indoorRamps?.ramps.length ?? 0,
    rampRecipeModelMatches:
      source.indoorRamps?.sourceModelSha256 === data.source.modelSha256,
    ramps,
    originalLiftReviews: (source.indoorConnectors?.connectors ?? []).map(
      (connector) => ({
        id: connector.id,
        accessible: connector.accessible,
        servedEntranceCount: connector.entrances.length,
        evidence: connector.evidence,
      }),
    ),
    connectorReviewModelMatches:
      source.indoorConnectors?.modelSha256 === data.source.modelSha256,
    confirmedEdges: data.edges
      .filter((edge) => edge.accessible === "yes")
      .map((edge) => ({
        id: edge.id,
        kind: edge.kind,
        from: edge.from,
        to: edge.to,
        enabled: edge.enabled,
        roomKeys: edge.roomKeys,
      })),
    stationaryNativeCellAliases: tally(
      data.edges.filter((edge) => edge.id.includes(":alias:")),
      (edge) => edge.accessible,
    ),
    sourceReviewIssues: data.issues.filter((issue) =>
      ["connection-review-stale", "ramp-review"].includes(issue.code),
    ),
    limitations: [
      "This read-only inventory does not calculate graph reachability or real-world accessible clearance.",
      "Native floor/door/ramp geometry does not establish operating lift state, wheelchair clearance, door opening force, thresholds or surface conditions.",
      "Unknown edges remain unknown; explicit staff/off-limits and stepped transitions are never relaxed.",
    ],
  };
}

async function main() {
  const [visitorPath, masterPath, outputPath] = process.argv.slice(2);
  if (!visitorPath || !masterPath || !outputPath)
    throw new Error(
      "Usage: node --import tsx scripts/indoor/audit-accessibility-evidence.ts VISITOR.zip MASTER.reviter.zip OUTPUT.json",
    );
  const visitorBytes = new Uint8Array(await readFile(visitorPath));
  const masterBytes = new Uint8Array(await readFile(masterPath));
  const visitorSha256 = sha(visitorBytes),
    masterSha256 = sha(masterBytes);
  const visitor = unzipSync(visitorBytes, {
    filter: (entry) => entry.name === "viewer/indoor.json",
  });
  const master = unzipSync(masterBytes, {
    filter: (entry) => entry.name === "floors/rooms.json",
  });
  assert(
    visitor["viewer/indoor.json"] && master["floors/rooms.json"],
    "Both original source and prepared evidence are required.",
  );
  const data = JSON.parse(
    new TextDecoder().decode(visitor["viewer/indoor.json"]!),
  ) as IndoorDataset;
  const source = JSON.parse(
    new TextDecoder().decode(master["floors/rooms.json"]!),
  ) as Rooms;
  const result = {
    visitorSha256,
    masterSha256,
    ...accessibilityEvidenceInventory(data, source),
  };
  assert.equal(sha(new Uint8Array(await readFile(visitorPath))), visitorSha256);
  assert.equal(sha(new Uint8Array(await readFile(masterPath))), masterSha256);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify({
      outputPath,
      edges: result.totalEdges,
      byAccessible: result.byAccessible,
      savedNativeCellReviewCount: result.savedNativeCellReviewCount,
    }),
  );
}
if (process.argv[1]?.endsWith("audit-accessibility-evidence.ts")) await main();
