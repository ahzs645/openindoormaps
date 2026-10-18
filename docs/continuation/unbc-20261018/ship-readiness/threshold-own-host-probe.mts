/** Actual existing reader/consumer predicates only; no synthesized bridge
 * authority, aperture patch, replacement owner or source geometry. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { decodeRevit2027FramedGRepRoot } from "../../../../../reviter/lib/reviter/revit-2027-framed-grep-root.ts";
import { replayRevit2027GRepFifo } from "../../../../../reviter/lib/reviter/revit-2027-grep-replay.ts";
import { inspectPlacedTrimObstacleBranches } from "../../../../../reviter/lib/reviter/native-source-placed-trim-obstacles.ts";
import { inspectOriginalWallTrimObstacleBranches } from "../../../../../reviter/lib/reviter/native-source-wall-trim-obstacles.ts";
import { nativeDoorClearOpening } from "../../../../../reviter/lib/reviter/native-door-clear-opening.ts";
import { projectStatedTwoFootWalkingVolume } from "../../../../../reviter/lib/reviter/native-source-walking-volume.ts";
import { nativeRationalOverlay, Rational } from "../../../../../reviter/lib/reviter/native-rational-overlay.ts";
import type { IndoorDataset } from "../../../../../reviter/lib/reviter/indoor-contract.ts";
const [source, output] = process.argv.slice(2);
if (!source || !output) throw Error("Usage: threshold-own-host-probe.mts COMPLETE-ACCEPTED-VISITOR.json NEW-REPORT.json");
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const base = new URL("../directions-and-threshold-blockers/", import.meta.url);
const retained: { nativeElementId: number; sha256: string; part: string }[] = [];
async function replay(id: number, part: string) {
  const inventory = JSON.parse((await readFile(new URL(`${part}/inspection.json`, base))).toString());
  const rows = inventory.results.filter((r: { nativeElementId: number }) => r.nativeElementId === id);
  if (rows.length !== 1 || inventory.sourceModelSha256 !== "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178") throw Error("Wrong original source inventory");
  const bytes = await readFile(new URL(`${part}/${rows[0].file}`, base));
  if (hash(bytes) !== rows[0].sha256) throw Error("Original extracted frame checksum mismatch");
  retained.push({ nativeElementId: id, sha256: rows[0].sha256, part });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const root = decodeRevit2027FramedGRepRoot(bytes, { offset: 0, elementId: id, marker: 2246, objectLength: view.getUint32(12, true), typeCode: view.getUint32(18, true) }, 2027);
  if (!root.ok) throw Error(root.error);
  const r = replayRevit2027GRepFifo(bytes, root.value); if (!r.ok) throw Error(r.error);
  return { root: root.value, replay: r.value };
}
const host = await replay(2315413, "original-placed-bodies"), door = await replay(2315416, "original-placed-bodies"), definition = await replay(2312095, "original-shared-definitions");
const hostResult = inspectOriginalWallTrimObstacleBranches(host.replay), leafResult = inspectPlacedTrimObstacleBranches(door.replay, definition.replay);
const raw = await readFile(source), data = JSON.parse(raw.toString()) as IndoorDataset;
if (hash(raw) !== "87194bb96ce4564699f5fb431ef00917fae93181f5730fe3e5f7056c1ca6ca1b") throw Error("Wrong accepted complete visitor source");
const matches = data.doors!.filter((d) => d.nativeElementId === 2315416);
if (matches.length !== 1) throw Error("Ambiguous current door");
const current = matches[0]!, z = data.nativeLevels.find((l) => l.id === current.levelId)!.elevationFeet;
const opening = nativeDoorClearOpening(data, current, z);
const materialLevels = data.nativeMaterialSections?.levels.filter((l) => Math.abs(l.elevationFeet - z) < 0.05 && Math.abs(l.cutElevationFeet - (z + 0.1)) < 1e-6) ?? [];
const profiles = materialLevels.flatMap((l) => l.originalDoorClearOpeningProfiles ?? []).filter((p) => p.nativeDoorElementId === 2315416);
const proposalBytes = await readFile(new URL("../door-threshold-workflow/five-door-proposals.json", import.meta.url));
const proposal = JSON.parse(proposalBytes.toString()).proposals.find((p: { nativeDoorElementId: number }) => p.nativeDoorElementId === 2315416);
const points = proposal.proposedPointsFeet as [number, number, number][];
const componentApertureDiagnostics = leafResult.ok ? leafResult.components.map((c) => ({
  originalGeometryToken: c.originalGeometryToken, physicalFaceTokens: c.physicalFaceTokens,
  minimumElevationFeet: c.minimumElevationFeet, maximumElevationFeet: c.maximumElevationFeet,
  hasConservativeEnvelopeOutsideUnchangedDoorFootprint: nativeRationalOverlay("difference", c.outerPlanEnvelope, [[current.footprintFeet!]]).length > 0,
  fullApproachConservativeEnvelopeOverlapOutsideUnchangedDoorFootprint: nativeRationalOverlay("difference", nativeRationalOverlay("intersection", c.outerPlanEnvelope,
    [[projectStatedTwoFootWalkingVolume(points[0]!, points[1]!, c.minimumElevationFeet, c.maximumElevationFeet, 7).possibleClosedProjectionFeet]]), [[current.footprintFeet!]]).length > 0,
})) : [];
const report = { format: "threshold-own-host-reader-consumer-probe-v1", datasetSha256: hash(raw),
  sourceModelSha256: data.source.modelSha256, driverSha256: hash(await readFile(new URL(import.meta.url))), originalFrames: retained,
  scope: "Current exact source-shaped body readers and actual accepted-dataset doorway consumer; no generated aperture/bridge authority, no source exclusions or gate changes",
  originalHostPrimitiveCounts: Object.fromEntries([...new Set(host.replay.spans.map((s) => s.readerId))].map((name) => [name, host.replay.spans.filter((s) => s.readerId === name).length])),
  hostDirectTrimReader: hostResult, doorPlacedTrimReader: leafResult, componentApertureDiagnostics,
  originalDoorRootWorldExtents: door.root.worldExtents,
  currentDoorState: current.state, currentDoorOwners: current.roomKeys, existingEnabledDoorEdges: data.edges.filter((e) => e.nativeElementId === 2315416 && e.kind === "door" && e.enabled).map((e) => e.id),
  nativeFloorElevationFeet: z, ordinaryAnkleCutFeet: z + 0.1,
  proposalSha256: hash(proposalBytes), proposedOriginalOwnerDepthsFeet: [proposal.sideProposal.from.depthFeet, proposal.sideProposal.to.depthFeet],
  ordinaryDoorBridgeDepthLimitFeet: 1.5, originalOwnerDepthsExceedOrdinaryDoorBridgeLimit: [proposal.sideProposal.from.depthFeet, proposal.sideProposal.to.depthFeet].map((d: number) => d > 1.5),
  originalDoorSourceBoundBaseFeet: door.root.worldExtents.minimum[2],
  ordinaryAnkleCutBelowOriginalDoorSourceBoundBase: z + 0.1 < door.root.worldExtents.minimum[2],
  matchingMaterialLevels: materialLevels.length, matchingOriginalClearOpeningProfiles: profiles.length,
  nativeDoorClearOpeningReturned: opening ?? null,
  existingBasicHostAperturePrecondition: "Requires an original basic-wall host AND preserved enabled connected two-owner physical portal; this is an unmatched curtain-host doorway, so the variant cannot apply",
  dedicatedDirectHostFullBodyPredicateAvailable: hostResult.ok,
  hostOrLeafExempted: false, positiveOwnMaterialRemainsAVeto: true,
  completeSteppedDemandOrStandingSupportReplayed: false, sourceOwnerPairApplied: false, actualRouteCalculated: false,
  geometryEdited: false, clearanceApproved: false, routeApproved: false, wheelchairApproved: false,
  nextRequiredPredicate: "Complete source selected-curtain-host material/aperture census plus exact two-foot stepped approach, endpoint standing/floor-hole support, persisted original owner binding and current policy. Existing flat ankle-cut recovery cannot consume the50mm body by erasing its own host." };
const encode = (v: unknown): unknown => v instanceof Rational ? { numerator: v.n.toString(), denominator: v.d.toString() } : typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(encode) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, q]) => [k, encode(q)])) : v;
await writeFile(output, JSON.stringify(encode(report), null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ host: hostResult.ok, hostBlockers: hostResult.ok ? [] : hostResult.blockers,
  door: leafResult.ok, doorComponents: leafResult.ok ? leafResult.components.length : null,
  actualDoorClearOpeningReturned: opening ?? null, clearOpeningProfiles: profiles.length, ankleBelowDoor: report.ordinaryAnkleCutBelowOriginalDoorSourceBoundBase, routeApproved: false }));
