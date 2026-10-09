/** CANDIDATE (not installed): reproducible supplement to authored nativeIndoorEnvelopes.
 *
 * The historical envelope generator is not recoverable; reviter only validates, hashes and
 * indexes the authored field. Once separately reviewed, reversible corrections (provisional
 * seals, derived frame returns, drawing-backed assumption rows) are applied, the enclosure must be
 * re-derived or the corrected spaces stay outside the envelope and receive no native cell.
 *
 * Rule (deliberately conservative, no tolerance, no dilation, no bounding boxes, no room outlines):
 *   face(cut)  = bounded complement faces of the exact union of the barrier at that cut
 *   enclosed   = INTERSECTION of face(cut) over every supplied cut (a parapet bounded only at the
 *                ankle cut, or a facade open at any cut, is not enclosed)
 *   supplement = enclosed ∩ original native walking support − authored envelope
 * Barrier = finite original native material sections (approximate curtain-host footprints are
 * excluded, matching the authored envelope evidence), every physical door footprint closed for
 * ENCLOSURE only (portals/access unchanged), and explicitly reviewed correction rows active at the
 * cut. Authored parts are kept byte-identical; supplement parts are appended and carry their own
 * evidence, correction ids and assumption ids. */
import { nativeRationalOverlay, type NativeRationalParts, type NativeRationalOverlayInput } from "./native-rational-overlay.ts";
import { nativeExactPartsForProposals } from "./native-exact-planar-topology.ts";
import { nativeIndoorEnvelopeHash, validateNativeIndoorEnvelopes, type NativeIndoorEnvelopes } from "./native-indoor-envelopes.ts";
import { recoverNativeWallJunctionRepairs } from "./native-room-presentation.ts";
import type { IndoorDataset } from "./indoor-contract.ts";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

type Point = [number, number];
type Ring = Point[];
type Parts = Ring[][];
export type NativeEnvelopeCorrection = { id: string; assumption: boolean; partsFeet: Parts };
export type NativeEnvelopeCutBarrier = {
  cutElevationFeet: number;
  material: { nativeElementId: number; partsFeet: Parts }[];
  doorClosures: { nativeElementId: number; footprintFeet: Ring }[];
  corrections: NativeEnvelopeCorrection[];
};
export type NativeEnvelopeSupplement = {
  version: 1;
  method: "bounded-faces-intersection-over-cuts-v1";
  levelId: number;
  elevationFeet: number;
  cutElevationsFeet: number[];
  partsFeet: Parts;
  areaSqFt: number;
  sourceElementIds: number[];
  correctionIds: string[];
  assumptionIds: string[];
  evidenceSha256: string;
};
const finite = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7);
const validParts = (ps: Parts) => Array.isArray(ps) && ps.every((part) => Array.isArray(part) && part.length > 0 && part.every((r) => Array.isArray(r) && r.length >= 3 && r.every(finite)));
const ringArea = (r: Ring) => Math.abs(r.reduce((s, a, i) => { const b = r[(i + 1) % r.length]!; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
const partsArea = (ps: Parts) => ps.reduce((s, p) => s + p.reduce((a, r, i) => a + (i ? -1 : 1) * ringArea(r), 0), 0);

/** Exact bounded faces of the complement of a barrier union. Islands inside a cavity stay solid. */
export function nativeBoundedFaces(barrier: Parts): NativeRationalParts {
  if (!barrier.length) return [];
  const union = nativeRationalOverlay("union", [barrier[0]!] as NativeRationalOverlayInput, ...barrier.slice(1).map((p) => [p] as NativeRationalOverlayInput));
  const cavities = union.flatMap((part) => part.slice(1).map((hole) => [hole]));
  if (!cavities.length) return [];
  return nativeRationalOverlay("difference", cavities as NativeRationalOverlayInput, union as NativeRationalOverlayInput);
}

export function deriveNativeIndoorEnvelopeSupplement(input: {
  levelId: number;
  elevationFeet: number;
  cuts: NativeEnvelopeCutBarrier[];
  walkingSupportPartsFeet: Parts;
  authoredPartsFeet: Parts;
}): NativeEnvelopeSupplement {
  const { levelId, elevationFeet, cuts } = input;
  if (!Number.isSafeInteger(levelId) || !Number.isFinite(elevationFeet) || !cuts.length || cuts.length > 16)
    throw new Error("Envelope supplement needs a native level and 1-16 material cuts.");
  if (cuts.some((c) => !Number.isFinite(c.cutElevationFeet) || c.cutElevationFeet <= elevationFeet || c.cutElevationFeet > elevationFeet + 20))
    throw new Error("Envelope supplement cut heights must lie above the level and within 20 ft.");
  if (new Set(cuts.map((c) => c.cutElevationFeet)).size !== cuts.length) throw new Error("Duplicate envelope cut height.");
  if (!validParts(input.walkingSupportPartsFeet) || !input.walkingSupportPartsFeet.length) throw new Error("Envelope supplement needs original native walking support.");
  let enclosed: NativeRationalParts | undefined;
  const sourceIds = new Set<number>(), correctionIds = new Set<string>(), assumptionIds = new Set<string>();
  for (const cut of cuts) {
    const barrier: Parts = [];
    for (const m of cut.material) {
      if (!Number.isSafeInteger(m.nativeElementId) || m.nativeElementId <= 0 || !validParts(m.partsFeet)) throw new Error("Invalid original native material section.");
      barrier.push(...m.partsFeet); sourceIds.add(m.nativeElementId);
    }
    for (const d of cut.doorClosures) {
      if (!Array.isArray(d.footprintFeet) || d.footprintFeet.length < 3 || !d.footprintFeet.every(finite)) throw new Error("Invalid physical door footprint.");
      barrier.push([d.footprintFeet]);
    }
    for (const c of cut.corrections) {
      if (typeof c.id !== "string" || !c.id.trim() || !validParts(c.partsFeet)) throw new Error("Invalid reviewed envelope correction.");
      barrier.push(...c.partsFeet); correctionIds.add(c.id); if (c.assumption) assumptionIds.add(c.id);
    }
    const faces = nativeBoundedFaces(barrier);
    enclosed = enclosed === undefined ? faces : (enclosed.length && faces.length ? nativeRationalOverlay("intersection", enclosed, faces) : []);
    if (!enclosed.length) break;
  }
  let supplement: NativeRationalParts = enclosed?.length ? nativeRationalOverlay("intersection", enclosed, input.walkingSupportPartsFeet as NativeRationalOverlayInput) : [];
  if (supplement.length && input.authoredPartsFeet.length) supplement = nativeRationalOverlay("difference", supplement, input.authoredPartsFeet as NativeRationalOverlayInput);
  const partsFeet = nativeExactPartsForProposals(supplement) as Parts;
  const body = { levelId, elevationFeet, cutElevationsFeet: cuts.map((c) => c.cutElevationFeet), partsFeet, sourceElementIds: [...sourceIds].sort((a, b) => a - b), correctionIds: [...correctionIds].sort(), assumptionIds: [...assumptionIds].sort() };
  return { version: 1, method: "bounded-faces-intersection-over-cuts-v1", ...body, areaSqFt: partsArea(partsFeet), evidenceSha256: bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(body)))) };
}

/** Append supplements; authored parts, ids and cuts stay byte-identical. Recomputes the checksum. */
export async function mergeNativeIndoorEnvelopeSupplements(envelopes: NativeIndoorEnvelopes, supplements: NativeEnvelopeSupplement[], model: string): Promise<NativeIndoorEnvelopes> {
  validateNativeIndoorEnvelopes(envelopes, model);
  const levels = envelopes.levels.map((level) => {
    const own = supplements.filter((s) => s.levelId === level.levelId && Math.abs(s.elevationFeet - level.elevationFeet) < 1e-9 && s.partsFeet.length);
    if (!own.length) return level;
    return {
      ...level,
      partsFeet: [...level.partsFeet, ...own.flatMap((s) => s.partsFeet)],
      sourceElementIds: [...new Set([...level.sourceElementIds, ...own.flatMap((s) => s.sourceElementIds)])],
      supplements: own.map((s, i) => ({ ...s, partsFeet: undefined, partStartIndex: level.partsFeet.length + own.slice(0, i).reduce((n, t) => n + t.partsFeet.length, 0), partCount: s.partsFeet.length })),
    };
  });
  const merged = { version: 1 as const, sourceModelSha256: envelopes.sourceModelSha256, levels };
  const result = { ...merged, geometrySha256: await nativeIndoorEnvelopeHash(merged) } as NativeIndoorEnvelopes;
  validateNativeIndoorEnvelopes(result, model);
  return result;
}

/** Barrier adapter for a compiled dataset at one material cut. Approximate curtain-host
 * footprints (sections carrying sourceAssemblyChildIds) are excluded; their finite members remain. */
export function nativeEnvelopeBarrierFromDataset(
  data: Pick<IndoorDataset, "doors"> & { nativeMaterialSections?: { levels: { levelId: number; elevationFeet: number; cutElevationFeet: number; sections: { nativeElementId: number; kind: string; partsFeet: Parts; sourceAssemblyChildIds?: number[] }[] }[] } },
  levelId: number,
  cutElevationFeet: number,
  reviewedCorrections: NativeEnvelopeCorrection[],
  options: {
    productionJunctionRepairs?: boolean;
    /** Close physical doors of ANY native level whose door leaf spans the cut height. Without it only
     * the level's own doors close, and an intermediate-level cut that passes through another storey's
     * doorway leaves that doorway open (observed: Floor 0.5 at +4 ft runs through Floor 1 entrances). */
    doorVerticalExtentFeet?: (door: NonNullable<IndoorDataset["doors"]>[number]) => [number, number] | undefined;
  } = {},
): NativeEnvelopeCutBarrier {
  const row = data.nativeMaterialSections?.levels.find((l) => l.levelId === levelId && Math.abs(l.cutElevationFeet - cutElevationFeet) < 1e-6);
  if (!row) throw new Error(`No original material section for level ${levelId} at ${cutElevationFeet}.`);
  const finiteSections = row.sections.filter((s) => !s.sourceAssemblyChildIds);
  const doors = (data.doors ?? []).filter((d) => {
    if (!d.footprintFeet || d.footprintFeet.length < 3) return false;
    if (d.levelId === levelId) return true;
    const extent = options.doorVerticalExtentFeet?.(d);
    return !!extent && extent[0] < cutElevationFeet && cutElevationFeet < extent[1];
  });
  const corrections = [...reviewedCorrections];
  if (options.productionJunctionRepairs) {
    const ownDoors = doors.filter((d) => d.levelId === levelId);
    const walls = finiteSections.flatMap((s) => s.partsFeet.map((part) => ({ levelId, nativeElementId: s.nativeElementId, kind: s.kind, approximate: false, ringsFeet: part }))) as unknown as IndoorDataset["walls"];
    for (const r of recoverNativeWallJunctionRepairs(walls, ownDoors as NonNullable<IndoorDataset["doors"]>))
      corrections.push({ id: `production-junction:${levelId}:${cutElevationFeet}:${r.nativeWallElementId}-${r.supportingElementId}:${r.repairKind}`, assumption: false, partsFeet: [r.ringsFeet as Ring[]] });
  }
  return {
    cutElevationFeet,
    material: finiteSections.map((s) => ({ nativeElementId: s.nativeElementId, partsFeet: s.partsFeet })),
    doorClosures: doors.map((d) => ({ nativeElementId: d.nativeElementId!, footprintFeet: d.footprintFeet as Ring })),
    corrections,
  };
}
