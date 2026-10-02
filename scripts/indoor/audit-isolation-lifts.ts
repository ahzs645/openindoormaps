/** Repeatable exact-model inspection; never edits access or fabricates lift stops. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { readProjectPackage } from "../../../reviter/lib/reviter/project-package.ts";
import { inspectNativeLiftEvidence } from "../../../reviter/lib/reviter/indoor-lift-evidence.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import {
  projectRoutingGraph,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";
import type { IndoorDataset } from "../../app/indoor-project/contract";

const [input, cachePath, triagePath, output] = process.argv.slice(2);
if (!input || !cachePath || !triagePath || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-isolation-lifts.ts prepared.zip model-bound-native-cache.json previous-triage.json output.json",
  );
const pkg = await readProjectPackage(new Uint8Array(await readFile(input)));
assert.ok(pkg.indoor, "Prepared indoor data is required");
const data = pkg.indoor as IndoorDataset;
const cache = JSON.parse(await readFile(cachePath, "utf8")) as {
  sourceModelSha256: string;
  nativeModel: ConvertResult;
};
assert.equal(
  cache.sourceModelSha256,
  pkg.manifest.model.sha256,
  "Cache bound to exact native RVT bytes",
);
assert.equal(
  cache.nativeModel.fileName,
  pkg.model.name,
  "Cache names this native model",
);
const triage = JSON.parse(await readFile(triagePath, "utf8")) as {
  source: { modelSha256: string };
  reviews: { key: string; status: string; reason: string }[];
};
assert.equal(
  triage.source.modelSha256,
  data.source.modelSha256,
  "Historical review belongs to this model",
);
const initialDataset = JSON.stringify(data),
  initialAnnotations = JSON.stringify(pkg.rooms);
const graph = projectRoutingGraph(data, "public");
const records = new Map(data.records.map((r) => [r.key, r]));
const annotations = new Map(pkg.rooms.annotations.map((r) => [r.key, r]));
const identities = new Map(
  cache.nativeModel.nativeIdentity?.identities.map((v) => [
    v.elementId,
    v.uniqueId,
  ]),
);
const nativeRecords = new Map(
  cache.nativeModel.elementBounds.map((e) => [e.elementId, e]),
);
const hosts = new Map(
  cache.nativeModel.nativeHostRelations?.map((v) => [v.elementId, v.hostId]),
);
const reviews = triage.reviews
  .filter((r) => r.status === "isolated-for-profile")
  .map((previous) => {
    const room = records.get(previous.key);
    assert.ok(room, `Historical destination retained: ${previous.key}`);
    const reachable = reachableProjectDestinations(graph, room.key);
    reachable.delete(room.key);
    const doors = (data.doors ?? [])
      .filter((d) => d.roomKeys.includes(room.key))
      .map((d) => {
        const edge = data.edges.find((e) => e.id === d.id),
          native = nativeRecords.get(d.nativeElementId);
        const neighbors = d.roomKeys
          .filter((k) => k !== room.key)
          .map((k) => {
            const r = records.get(k)!;
            return {
              roomKey: k,
              number: r?.number,
              name: r?.name,
              levelId: r?.levelId,
              hasArrival: !!r?.arrivalNodeId,
              circulation: r?.circulation,
              stair: r?.stair,
              access: r?.access,
              originalAccessReview: annotations.get(k)?.access ?? null,
              sourceDrawing: annotations.get(k)?.dwg ?? null,
            };
          });
        const issueIds = data.issues
          .filter((i) => i.roomKey === room.key || i.message.includes(d.id))
          .map((i) => ({ id: i.id, code: i.code, message: i.message }));
        return {
          nativeDoorId: d.nativeElementId,
          nativeDoorUniqueId: identities.get(d.nativeElementId) ?? null,
          nativeHostId: hosts.get(d.nativeElementId) ?? null,
          nativeFamily: native?.familyName ?? null,
          nativeType: native?.typeName ?? null,
          levelId: d.levelId,
          pointFeet: d.pointFeet,
          normalFeet: d.normalFeet ?? null,
          footprintFeet: d.footprintFeet ?? null,
          ownershipMatchState: d.state,
          hasSavedRoutingEdge: !!edge,
          edgeEnabled: edge?.enabled ?? false,
          edgeDirection: edge?.direction ?? null,
          portalNodes: edge
            ? [edge.from, edge.to].map((id) => ({
                nodeId: id,
                exists: data.nodes.some((n) => n.id === id),
                walkingBranches: data.edges.filter(
                  (e) => e.kind === "walk" && (e.from === id || e.to === id),
                ).length,
              }))
            : [],
          neighbors,
          issues: issueIds,
        };
      });
    const staff = doors.some((d) =>
      d.neighbors.some((r) => r.access === "staff"),
    );
    const missingEdges = doors.filter(
      (d) => d.ownershipMatchState === "connected" && !d.hasSavedRoutingEdge,
    );
    const disposition =
      reachable.size > 0
        ? "resolved-in-current-project"
        : staff
          ? "staff-access-retained"
          : missingEdges.length > 0
            ? "matched-door-without-native-safe-routing-edge"
            : doors.some((d) =>
                  d.neighbors.some((r) => !r.circulation && !r.stair),
                )
              ? "ordinary-room-transit-needs-explicit-review"
              : "connected-branch-needs-source-review";
    const nextAction =
      disposition === "staff-access-retained"
        ? "Preserve reviewed staff access. If a public destination needs a separate public entrance, inspect and export that actual native threshold; do not reopen the staff circulation to make the destination reachable."
        : disposition === "ordinary-room-transit-needs-explicit-review"
          ? "Inspect the actual public route and phase-specific threshold ownership. A gallery or stores room stays endpoint-only unless an explicit reviewer establishes a public circulation path; never infer transit permission from a room name."
          : disposition === "matched-door-without-native-safe-routing-edge"
            ? "The display door has matched ownership, but no routing edge survived preparation. Inspect host wall, actual jamb width/traversal normal, continuous slab coverage, per-side approach and native wall/column clearance. Repair extraction only when native geometry supports it; do not infer that a matched icon is traversable."
            : disposition === "resolved-in-current-project"
              ? "Native-safe public route now exists; preserve supporting source identities and geometry checks."
              : "Inspect saved edge availability, approaches, continuous slab coverage and all connecting native thresholds before connecting this branch.";
    return {
      roomKey: room.key,
      number: room.number,
      name: room.name,
      building: room.building,
      levelId: room.levelId,
      arrivalNodeId: room.arrivalNodeId ?? null,
      sourceDrawing: annotations.get(room.key)?.dwg ?? null,
      historicalReason: previous.reason,
      currentReachablePublicDestinations: reachable.size,
      disposition,
      doors,
      nextAction,
    };
  });
const lifts = inspectNativeLiftEvidence(
  cache.nativeModel,
  pkg.rooms.annotations,
);
const connectorReview = pkg.rooms.indoorConnectors;
const report = {
  version: 1,
  source: data.source,
  inputProject: input,
  scope:
    "Every previously reported isolated destination plus all named lift drawing annotations and native inventory.",
  isolation: {
    reviewed: reviews.length,
    remainingIsolated: reviews.filter(
      (r) => !r.currentReachablePublicDestinations,
    ).length,
    summary: Object.fromEntries(
      [...new Set(reviews.map((r) => r.disposition))].map((reason) => [
        reason,
        reviews.filter((r) => r.disposition === reason).length,
      ]),
    ),
    reviews,
  },
  lifts: {
    ...lifts,
    explicitConnectorReview: connectorReview ?? null,
    exportedRoutingConnectors: data.connectors ?? [],
    verifiedRoutingStopCount: (data.connectors ?? [])
      .filter((c) => c.kind === "elevator")
      .reduce((n, c) => n + c.entrances.length, 0),
  },
  preservation: {
    routesMutated: false,
    annotationsMutated: false,
    staffAccessRetained: true,
    ordinaryRoomsEndpointOnly: true,
    inferredLiftStops: 0,
  },
  sourceExportRequirements: [
    "Exact source model SHA-256 and phase/view context.",
    "Native Room ElementId/UniqueId and Finish boundary loops, where native Rooms exist.",
    "Door ElementId/UniqueId, host and phase-specific FromRoom/ToRoom; public/staff direction and access review.",
    "Actual elevator assembly ElementId/UniqueId; ordered served native level IDs, landing-door identities, per-floor interior lobby anchors and operational status.",
    "Separate accessibility review of the complete landing approach, door width, car and route; elevator name alone does not prove step-free access.",
  ],
};
assert.equal(JSON.stringify(data), initialDataset);
assert.equal(JSON.stringify(pkg.rooms), initialAnnotations);
await writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      reviewed: reviews.length,
      isolation: report.isolation.summary,
      lifts: lifts.decodedInventory,
      verifiedStops: report.lifts.verifiedRoutingStopCount,
    },
    null,
    2,
  ),
);
