/** Read-only original-RVT context diagnosis for the recorded doorway case.
 * Conservative seven-foot demand is a screen, never route/clearance approval. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createOriginalNativeForeignEnvelopeCensus, originalNativeForeignEnvelopeFacts, auditOriginalForeignEnvelopeHorizontal, auditOriginalForeignEnvelopeVertical, readOriginalForeignEnvelopeScopedFrame } from "../../../../../reviter/lib/reviter/native-source-foreign-envelope-census.ts";
import { certifyOriginalRectangularMullionSourceEnvelope, originalRectangularMullionSourceEnvelopeFact } from "../../../../../reviter/lib/reviter/native-source-rectangular-mullion-envelope.ts";
import { certifyOriginalSimpleSystemPanelSourceEnvelope, originalSimpleSystemPanelSourceEnvelopeFact } from "../../../../../reviter/lib/reviter/native-source-simple-system-panel.ts";
import { inspectFilledThresholdFrames } from "../../../../../reviter/lib/reviter/native-filled-threshold-body.ts";
import { projectStatedTwoFootWalkingVolume } from "../../../../../reviter/lib/reviter/native-source-walking-volume.ts";
import { rational, Rational } from "../../../../../reviter/lib/reviter/native-rational-overlay.ts";
const [original, output, dependenciesFile, drawingReviewFile] = process.argv.slice(2);
if (!original || !output) throw Error("Usage: threshold-original-context.mts ORIGINAL.rvt NEW-OUTPUT-DIRECTORY [SOURCE-DEPENDENCIES.json DRAWING-REVIEW.json]");
const modelSha = "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178";
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const bytes = await readFile(original);
if (hash(bytes) !== modelSha) throw Error("Wrong original RVT");
const requestBytes = await readFile(new URL("../door-threshold-workflow/five-door-proposals.json", import.meta.url));
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
const requestedIds = [...new Set([2315423, 1223587, 2315413, 2315416, ...(dependencies?.requestedOriginalFrameIds ?? [])])];
const { certificate, summary } = createOriginalNativeForeignEnvelopeCensus(bytes, modelSha, scope, drawingReview, requestedIds);
const censusSeconds = (performance.now() - started) / 1000;
const placed = readOriginalForeignEnvelopeScopedFrame(certificate, 2315423), definition = readOriginalForeignEnvelopeScopedFrame(certificate, 1223587);
const body = inspectFilledThresholdFrames({ bytes: placed, nativeElementId: 2315423, sha256: hash(placed) }, { bytes: definition, nativeElementId: 1223587, sha256: hash(definition) });
if (!body.ok) throw Error("Fresh original threshold body refused: " + body.blockers.join("; "));
const compare = async (part: string, id: number, fresh: Uint8Array) => hash(await readFile(new URL(`../directions-and-threshold-blockers/${part}/${id}-1.grep.bin`, import.meta.url))) === hash(fresh);
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
const outputReport = { format: "threshold-original-rvt-context-diagnostic-v1", sourceModelSha256: modelSha,
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
