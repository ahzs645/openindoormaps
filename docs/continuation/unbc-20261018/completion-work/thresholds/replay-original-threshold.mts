/** Read-only original-RVT context diagnosis for the recorded doorway case.
 * Conservative seven-foot demand is a screen, never route/clearance approval. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readOriginalForeignEnvelopeWallType, readOriginalForeignEnvelopeScopedSemantic, createOriginalNativeForeignEnvelopeCensus, originalNativeForeignEnvelopeFacts, auditOriginalForeignEnvelopeHorizontal, auditOriginalForeignEnvelopeVertical, readOriginalForeignEnvelopeScopedFrame } from "../../../../../../reviter/lib/reviter/native-source-foreign-envelope-census.ts";
import { certifyOriginalRectangularMullionSourceEnvelope, originalRectangularMullionSourceEnvelopeFact } from "../../../../../../reviter/lib/reviter/native-source-rectangular-mullion-envelope.ts";
import { certifyOriginalSimpleSystemPanelSourceEnvelope, originalSimpleSystemPanelSourceEnvelopeFact } from "../../../../../../reviter/lib/reviter/native-source-simple-system-panel.ts";
import { inspectFilledThresholdFrames } from "../../../../../../reviter/lib/reviter/native-filled-threshold-body.ts";
import { projectStatedTwoFootWalkingVolume } from "../../../../../../reviter/lib/reviter/native-source-walking-volume.ts";
import { rational, Rational } from "../../../../../../reviter/lib/reviter/native-rational-overlay.ts";
import { certifyOriginalCurtainCellBindings, originalCurtainCellMemberBinding } from "../../../../../../reviter/lib/reviter/native-source-curtain-cell-bindings.ts";
import { certifyOriginalFilledThresholdDemand, auditOriginalFilledThresholdDemand, auditOriginalFilledThresholdFloorSupport, auditOriginalFilledThresholdCurtainMembers, auditOriginalFilledThresholdSupportedMaterial } from "../../../../../../reviter/lib/reviter/native-filled-threshold-step.ts";
import { decodeRevit2027FramedGRepRoot } from "../../../../../../reviter/lib/reviter/revit-2027-framed-grep-root.ts";
import { replayRevit2027GRepFifo } from "../../../../../../reviter/lib/reviter/revit-2027-grep-replay.ts";
import { revit2027OwnerMeshIndex, revit2027OwnerSurface } from "../../../../../../reviter/lib/reviter/revit-2027-owner-mesh-index.ts";
import type { Revit2027PlaneSurface } from "../../../../../../reviter/lib/reviter/revit-2027-surfaces.ts";
import { certifyOriginalCurtainMaterialContainer, originalCurtainMaterialContainerFact } from "../../../../../../reviter/lib/reviter/native-source-curtain-material-container.ts";
import { inspectOriginalCurrentCurtainDoorDefinition } from "../../../../../../reviter/lib/reviter/native-source-curtain-door-definition.ts";
const [original, output, dependenciesFile, drawingReviewFile] = process.argv.slice(2);
if (!original || !output) throw Error("Usage: replay-original-threshold.mts ORIGINAL.rvt NEW-OUTPUT-DIRECTORY [SOURCE-DEPENDENCIES.json DRAWING-REVIEW.json]");
const modelSha = "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178";
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const bytes = await readFile(original);
if (hash(bytes) !== modelSha) throw Error("Wrong original RVT");
const requestBytes = await readFile(new URL("../../door-threshold-workflow/five-door-proposals.json", import.meta.url));
const sourceRequest = JSON.parse(requestBytes.toString()).proposals.find((p: { nativeDoorElementId: number }) => p.nativeDoorElementId === 2315416);
const points = sourceRequest.proposedPointsFeet as [number, number, number][];
const scope = { min: { x: Math.min(...points.map((p) => p[0])) - 2, y: Math.min(...points.map((p) => p[1])) - 2, z: points[0]![2] - 0.5 },
  max: { x: Math.max(...points.map((p) => p[0])) + 2, y: Math.max(...points.map((p) => p[1])) + 2, z: points[0]![2] + 8 } };
await mkdir(output, { recursive: false });
const started = performance.now();
const dependencyBytes = dependenciesFile ? await readFile(dependenciesFile) : undefined;
const dependencies = dependencyBytes ? JSON.parse(dependencyBytes.toString()) : undefined;
if (dependencies && dependencies.sourceModelSha256 !== modelSha) throw Error("Wrong source dependency locators");
const drawingBytes = drawingReviewFile ? await readFile(drawingReviewFile) : undefined;
const drawingReview = drawingBytes ? JSON.parse(drawingBytes.toString()) : undefined;
const requestedIds = [...new Set([2315423, 1223587, 2315413, 2315416, 1505065, 2312095, 2315435,2315436,2312085,1223585,2315432,2315433,293121,1658391,1658392,293143,2315434,1544662,293116,1658388, ...Array.from({length:18}, (_,i)=>2315414+i), ...(dependencies?.requestedOriginalFrameIds ?? [])])];
const { certificate, summary } = createOriginalNativeForeignEnvelopeCensus(bytes, modelSha, scope, drawingReview, requestedIds);
const censusSeconds = (performance.now() - started) / 1000;
const placed = readOriginalForeignEnvelopeScopedFrame(certificate, 2315423), definition = readOriginalForeignEnvelopeScopedFrame(certificate, 1223587);
const body = inspectFilledThresholdFrames({ bytes: placed, nativeElementId: 2315423, sha256: hash(placed) }, { bytes: definition, nativeElementId: 1223587, sha256: hash(definition) });
if (!body.ok) throw Error("Fresh original threshold body refused: " + body.blockers.join("; "));
const compare = async (part: string, id: number, fresh: Uint8Array) => hash(await readFile(new URL(`../../directions-and-threshold-blockers/${part}/${id}-1.grep.bin`, import.meta.url))) === hash(fresh);
const exactExtractedFramesMatchOriginal = await compare("original-placed-bodies", 2315423, placed) && await compare("original-shared-definitions", 1223587, definition);
if (!exactExtractedFramesMatchOriginal) throw Error("Fresh original source differs from preserved threshold frames");
const forward = auditOriginalForeignEnvelopeHorizontal(certificate, points[0]!, points[1]!, 7);
const reverse = auditOriginalForeignEnvelopeHorizontal(certificate, points[1]!, points[0]!, 7);
const facts = originalNativeForeignEnvelopeFacts(certificate);
const relevantIds = new Set([...forward.candidateNativeElementIds, ...forward.unboundedNativeElementIds]);
const cmp = (a: Rational, b: Rational) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
const disjointScope = (minimum: Rational[], maximum: Rational[]) => ["x", "y", "z"].some((axis, i) => cmp(maximum[i]!, rational(scope.min[axis as "x" | "y" | "z"])) < 0 || cmp(minimum[i]!, rational(scope.max[axis as "x" | "y" | "z"])) > 0);
const reconstructed = [];
if (dependencies) for (const row of facts.rows.filter((r) => !r.boundsFeet || r.blocker)) {
  if (row.categoryId === -2000171) {
    const result = certifyOriginalRectangularMullionSourceEnvelope(certificate, row.nativeElementId);
    if (!result.ok) { reconstructed.push({ nativeElementId: row.nativeElementId, ok: false, blockers: result.blockers }); continue; }
    const fact = originalRectangularMullionSourceEnvelopeFact(certificate, result.certificate), b = fact.boundsFeet;
    reconstructed.push({ nativeElementId: row.nativeElementId, ok: true, kind: "rectangular-mullion", fact,
      completeConservativeMaterialEnvelopeDisjointFromWholeDemandScope: disjointScope([b.min.x, b.min.y, b.min.z].map(rational), [b.max.x, b.max.y, b.max.z].map(rational)) });
  } else if (row.categoryId === -2000170) {
    const result = certifyOriginalSimpleSystemPanelSourceEnvelope(certificate, row.nativeElementId);
    if (!result.ok) { reconstructed.push({ nativeElementId: row.nativeElementId, ok: false, blockers: result.blockers }); continue; }
    const fact = originalSimpleSystemPanelSourceEnvelopeFact(certificate, result.certificate);
    reconstructed.push({ nativeElementId: row.nativeElementId, ok: true, kind: "simple-system-panel", fact,
      completeConservativeMaterialEnvelopeDisjointFromWholeDemandScope: fact.conservativeMaterialBoxesFeet.every((b) => disjointScope(b.minimumFeet, b.maximumFeet)) });
  } else reconstructed.push({ nativeElementId: row.nativeElementId, ok: false, blockers: ["Unsupported unknown original source category"] });
}
// No replacement/exclusion is supplied. Original host, leaf, sill, floors and
// unknowns remain present; each requires its own finite material treatment.
const scalar = ([n, d]: [string, string]) => new Rational(BigInt(n), BigInt(d));
const lo = scalar(body.bottomCap!.elevationFeet), hi = scalar(body.topCap!.elevationFeet);
const strips = projectStatedTwoFootWalkingVolume(points[0]!, points[1]!, lo, hi, 7).unclippedStatedStripFeet;
const vertical = auditOriginalForeignEnvelopeVertical(certificate, strips, lo, hi, 7);
const hostBindingCertificate = certifyOriginalCurtainCellBindings(certificate, 2315413);
const sourceCellBinding = originalCurtainCellMemberBinding(hostBindingCertificate, 2315416, 2315423);
const nativeMemberFrameChecks = [
 {nativeElementId:2315416, expectedSha256:"1aa88f8d623458a56674a69f295415371a36f3907f7e2282d159e25394a71fd7"},
 {nativeElementId:2315423, expectedSha256:"3988051c09200935b69d506a80b9379472c2302d488a549c3b120daf3a06e363"},
].map(r=>{const actual=readOriginalForeignEnvelopeScopedSemantic(certificate,r.nativeElementId,2031);if(actual.originalFrameSha256!==r.expectedSha256)throw Error("Fresh native member frame differs from retained fixture");return {...r,actualSha256:actual.originalFrameSha256};});
const thresholdDemandCertificate = certifyOriginalFilledThresholdDemand({ census: certificate, hostBinding: hostBindingCertificate, nativeDoorElementId: 2315416, nativeSillElementId: 2315423, nativeSillDefinitionId: 1223587, fromFeet: points[0]!, toFeet: points[1]! });
const originalSixFootDemand = auditOriginalFilledThresholdDemand(certificate, thresholdDemandCertificate);
// Mutating a returned diagnostic must never alter the opaque original demand.
const savedFoot=originalSixFootDemand.step.fromFeet![0];
(originalSixFootDemand.step.fromFeet as unknown[])[0]=rational(200);
const demandSnapshotIsolated=auditOriginalFilledThresholdDemand(certificate,thresholdDemandCertificate).step.fromFeet![0].n===savedFoot.n;
(originalSixFootDemand.step.fromFeet as unknown[])[0]=savedFoot;
if(!demandSnapshotIsolated)throw Error("Returned transport modified private original demand");
let originalCurtainMaterialDecomposition:unknown;
try {
 const container=certifyOriginalCurtainMaterialContainer(certificate,2315413);
 let originalDoorDefinition:unknown;try{originalDoorDefinition={ok:true,fact:inspectOriginalCurrentCurtainDoorDefinition(certificate,container,2315416)};}catch(e){originalDoorDefinition={ok:false,blocked:e instanceof Error?e.message:String(e)};}
 originalCurtainMaterialDecomposition={ok:true, originalDoorDefinition, fact:originalCurtainMaterialContainerFact(certificate,container), demand:auditOriginalFilledThresholdCurtainMembers(certificate,thresholdDemandCertificate,container)};
 try{originalCurtainMaterialContainerFact(certificate,JSON.parse(JSON.stringify(container)));throw Error("Forged container admitted");}catch(e){if(e instanceof Error&&e.message==="Forged container admitted")throw e;}
} catch(e) { originalCurtainMaterialDecomposition={ok:false,blocked:e instanceof Error?e.message:String(e)}; }
const originalWallType=readOriginalForeignEnvelopeWallType(certificate,29097);
await writeFile(resolve(output,"native-wall-type-29097.bin"),originalWallType.originalFrameBytes,{flag:"wx"});
for(const id of [2315414,2315416,2315418,2315419,...Array.from({length:12},(_,i)=>2315420+i)]) {
 const frame=readOriginalForeignEnvelopeScopedSemantic(certificate,id,2031);
 await writeFile(resolve(output,`native-member-${id}.bin`),frame.originalFrameBytes,{flag:"wx"});
 try{await writeFile(resolve(output,`graphics-member-${id}.bin`),readOriginalForeignEnvelopeScopedFrame(certificate,id),{flag:"wx"});}catch{}
}

const refusalCases = [];
for (const [name, patch] of [
 ["foreign-original-mullion-outside-current-door-cell", { nativeSillElementId:2315422 }],
 ["stale-original-definition", { nativeSillDefinitionId:1191708 }],
 ["json-forged-host-binding", { hostBinding:JSON.parse(JSON.stringify(hostBindingCertificate)) }],
 ["out-of-source-scope", { fromFeet:[200,points[0]![1],points[0]![2]] }],
] as const) {
 try { certifyOriginalFilledThresholdDemand({ census:certificate, hostBinding:hostBindingCertificate, nativeDoorElementId:2315416,nativeSillElementId:2315423,nativeSillDefinitionId:1223587,fromFeet:points[0]!,toFeet:points[1]!,...patch }); refusalCases.push({name,refused:false}); }
 catch(e) { refusalCases.push({name,refused:true,reason:e instanceof Error?e.message:String(e)}); }
}
if (refusalCases.some(r=>!r.refused)) throw Error("An original threshold refusal control was admitted");

// Saved support ID1505065 is only a discovery locator. Re-read its actual
// source Frame and enumerate candidate horizontal caps; the production
// consumer checks original Floor/category/holes/uncertainty again internally.
const floorGeometryBytes = readOriginalForeignEnvelopeScopedFrame(certificate, 1505065);
if(hash(floorGeometryBytes)!=="26a7335fbc65872d298584cd07117190b18b2e18cf3c2ac8996f4a728400ac74")throw Error("Fresh original Floor body differs from retained complete fixture");
const fv = new DataView(floorGeometryBytes.buffer, floorGeometryBytes.byteOffset, floorGeometryBytes.length);
const fr = decodeRevit2027FramedGRepRoot(floorGeometryBytes, {offset:0,elementId:1505065,marker:2246,objectLength:fv.getUint32(12,true),typeCode:fv.getUint32(18,true)}, 2027);
if (!fr.ok) throw Error(fr.error);
const fReplay = replayRevit2027GRepFifo(floorGeometryBytes, fr.value); if (!fReplay.ok) throw Error(fReplay.error);
const fi = revit2027OwnerMeshIndex(fReplay.value);
const originalFloorCapCandidates = [...fi.faces.keys()].flatMap(token => {
 const p = revit2027OwnerSurface<Revit2027PlaneSurface>(fi,634,token);
 return p && p.kind === "plane" && p.xVector[2] === 0 && p.yVector[2] === 0 ? [{nativeFloorElementId:1505065,originalCapFaceToken:token,sourceHeightFeet:p.origin[2]}] : [];
});
const originalFloorSupportAttempts = originalFloorCapCandidates.map(c => {
 try { return {locator:c,result:auditOriginalFilledThresholdFloorSupport(certificate, thresholdDemandCertificate, [c])}; }
 catch (e) { return {locator:c,blocked:e instanceof Error?e.message:String(e)}; }
});
for(const id of [2315435,2312095,2315436,2312085,1223585,2315432,2315433,1223587,293121,1658391,1658392,293143,2315434,1544662,293116,1658388]) {
 try{await writeFile(resolve(output,`graphics-symbol-${id}.bin`),readOriginalForeignEnvelopeScopedFrame(certificate,id),{flag:"wx"});}catch{}
 for(const marker of [4316,4318,2064] as const)try{const f=readOriginalForeignEnvelopeScopedSemantic(certificate,id,marker);await writeFile(resolve(output,`native-symbol-${id}-${marker}.bin`),f.originalFrameBytes,{flag:"wx"});}catch{}
}
let originalComposedSupportAndMaterial:unknown;
try { const container=certifyOriginalCurtainMaterialContainer(certificate,2315413);
 originalComposedSupportAndMaterial={ok:true,result:auditOriginalFilledThresholdSupportedMaterial(certificate,thresholdDemandCertificate,container,[{nativeFloorElementId:1505065,originalCapFaceToken:5}])};
 for(const [name,action] of [
 ["wrong-original-floor-cap",()=>auditOriginalFilledThresholdSupportedMaterial(certificate,thresholdDemandCertificate,container,[{nativeFloorElementId:1505065,originalCapFaceToken:4}])],
 ["json-forged-container",()=>auditOriginalFilledThresholdSupportedMaterial(certificate,thresholdDemandCertificate,JSON.parse(JSON.stringify(container)),[{nativeFloorElementId:1505065,originalCapFaceToken:5}])],
 ["original-non-door-member",()=>inspectOriginalCurrentCurtainDoorDefinition(certificate,container,2315414)],
 ] as const){try{action();refusalCases.push({name,refused:false});}catch(e){refusalCases.push({name,refused:true,reason:e instanceof Error?e.message:String(e)});}}
} catch(e) {originalComposedSupportAndMaterial={ok:false,blocked:e instanceof Error?e.message:String(e)};}
if(refusalCases.some(r=>!r.refused))throw Error("Composed source material refusal admitted");
const outputReport = { format: "original-source-bound-threshold-demand-and-support-v1", sourceCellBinding, nativeMemberFrameChecks, demandSnapshotIsolated, originalCurtainMaterialDecomposition, originalComposedSupportAndMaterial, originalSixFootDemand, refusalCases, originalFloorCapCandidates, originalFloorSupportAttempts, sourceModelSha256: modelSha,
  sourceSchemaSha256: certificate.sourceSchemaSha256, driverSha256: hash(await readFile(new URL(import.meta.url))), dependencyLocatorsSha256: dependencyBytes ? hash(dependencyBytes) : null, drawingReviewSha256: drawingBytes ? hash(drawingBytes) : null, requestSha256: hash(requestBytes), nativeDoorElementId: 2315416,
  scopeBoundsFeet: scope, originalFrameReadbackMatchesSaved: exactExtractedFramesMatchOriginal,
  originalPages: summary.pages, censusSeconds, originalCensus: summary,
  thresholdBody: body, forward, reverse, verticalConservativeWholeApproachScreen: vertical,
  relevantOriginalRows: facts.rows.filter((r) => relevantIds.has(r.nativeElementId)), reconstructedUnknownOriginalMaterial: reconstructed,
  conservativeDemandHeadroomFeet: 7, statedProfileHeadroomRequirementFeet: 6,
  demandScope: "Full two-foot original proposed approach at original floor plus seven-foot conservative band; vertical screen covers floor-to-cap across same full strip. Not a reconstructed admitted step profile.",
  sourceMembershipOfComparedFramesRevalidatedFromActualRvt: true,
  sourceModelUnchanged: hash(await readFile(original)) === modelSha,
  sourceReview: drawingReview ? "Original source-bound owner-reviewed drawing reference descriptor replayed by current census" : "No drawing-review omission applied; imports/unknown source records remain conservative blockers",
  bodyClearanceApproved: false, floorSupportApproved: false, sourceOwnersApplied: false, actualRouteCalculated: false, routeApproved: false, wheelchairApproved: false,
  elapsedSeconds: (performance.now() - started) / 1000 };
if (!outputReport.sourceModelUnchanged) throw Error("Original RVT changed");
const encode = (v: unknown): unknown => v instanceof Rational ? { numerator: v.n.toString(), denominator: v.d.toString() } : typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(encode) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, q]) => [k, encode(q)])) : v;
await writeFile(resolve(output, "report.json"), JSON.stringify(encode(outputReport), null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ originalPages: summary.pages, censusSeconds, candidateIds: forward.candidateNativeElementIds, unknownIds: forward.unboundedNativeElementIds,
  reconstructedUnknownCount: reconstructed.length, successfulDisjointUnknowns: reconstructed.filter((r) => r.ok && r.completeConservativeMaterialEnvelopeDisjointFromWholeDemandScope).length, freshOriginalBodyMatches: exactExtractedFramesMatchOriginal, clearanceApproved: false, routeApproved: false }));
