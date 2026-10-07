import pc from "polygon-clipping";
import type { IndoorDataset } from "./contract";
import { deriveNativeAreas, pointInNativeArea } from "./native-area-review";
import { roomLabelPoint } from "./map-edits";

type Point = [number, number];
type Rings = Point[][];
export type GapScanOptions = {
  minWidthFeet: number;
  maxWidthFeet: number;
  minAreaSquareFeet: number;
};
export type GapScanPart = {
  ringsFeet: Rings;
  areaSquareFeet: number;
  roomKeys: string[];
};
export type GapScanFinding = {
  id: string;
  regionId: string;
  widthFeet: number;
  endpointsFeet: [Point, Point];
  wallIds: number[];
  kind: "wall-gap" | "narrow-passage";
  separation: "single-cut" | "combined-cuts";
  /** The combined experiment is not a minimal repair set. */
  experimentRegionId?: string;
  sides: [GapScanPart, GapScanPart];
};
export type GapScanResult = {
  format: "openindoormaps-gap-scan";
  version: 1;
  sourceModelSha256: string;
  roomsSha256: string;
  geometrySha256: string;
  levelId: number;
  options: GapScanOptions;
  findings: GapScanFinding[];
  experiments: { regionId: string; cuts: { id: string; endpointsFeet: [Point, Point] }[]; parts: GapScanPart[] }[];
  measuredDoors: {
    nativeElementId: number;
    widthFeet: number;
    status: string;
    pointFeet: Point;
  }[];
  warnings: string[];
  testedCuts: number;
  regionCount: number;
  complete: boolean;
};
export type GapScanPreview = { cuts: [Point, Point][]; parts: Rings[]; displayParts?: { side: number; ringsFeet: Rings }[] };
const EPS = 0.0001;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const area = (rings: Rings) => rings.reduce((sum, ring, index) => {
  const [x, y] = ring[0];
  const value = Math.abs(ring.reduce((n, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return n + (p[0] - x) * (q[1] - y) - (q[0] - x) * (p[1] - y);
  }, 0)) / 2;
  return sum + (index ? -value : value);
}, 0);
const closest = (p: Point, a: Point, b: Point): Point => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return [a[0] + t * dx, a[1] + t * dy];
};
const midpoint = (ends: [Point, Point]): Point => [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2];
/** A diagnostic cross-section only: its thin strip is never a wall patch. */
function strip([a, b]: [Point, Point]): Rings {
  const width = distance(a, b), dx = (b[0] - a[0]) / width, dy = (b[1] - a[1]) / width;
  const p = (along: number, side: number): Point => [a[0] + dx * along - dy * side, a[1] + dy * along + dx * side];
  return [[p(-EPS, -EPS), p(width + EPS, -EPS), p(width + EPS, EPS), p(-EPS, EPS)]];
}
export function validateGapScanOptions(o: GapScanOptions) {
  if (!o || !Number.isFinite(o.minWidthFeet) || !Number.isFinite(o.maxWidthFeet) || !Number.isFinite(o.minAreaSquareFeet) ||
      o.minWidthFeet < 0.02 || o.maxWidthFeet > 20 || o.maxWidthFeet < o.minWidthFeet ||
      o.minAreaSquareFeet < 1 || o.minAreaSquareFeet > 1e7)
    throw new Error("Use widths from 0.02 to 20 feet and a positive minimum area on each side.");
}

/** Find narrow cross-sections in the actual connected polygon, not room outlines.
 * Test real separation and preserve all holes. Labels identify possible ownership,
 * never approval of a missing partition, outdoor extent or public access. */
export async function scanNativeGaps(data: IndoorDataset, levelId: number, options: GapScanOptions): Promise<GapScanResult> {
  validateGapScanOptions(options);
  // Always trace the whole native level with measured doors closed; temporary
  // previews, crops and global gap closure must not contaminate a diagnostic.
  const base = await deriveNativeAreas(data, levelId, { maxGapFeet: 0, mode: "connected" });
  const records = data.records.filter(r => r.levelId === levelId).map(r => ({ key: r.key, point: roomLabelPoint(data, r.key) }));
  const walls = data.walls.filter(w => w.levelId === levelId && !w.approximate && !w.reviewPatchId && w.kind === "wall");
  const part = (ringsFeet: Rings): GapScanPart => ({ ringsFeet, areaSquareFeet: area(ringsFeet), roomKeys: records.filter(r => pointInNativeArea(r.point, ringsFeet)).map(r => r.key) });
  const findings: GapScanFinding[] = [];
  const experiments: GapScanResult["experiments"] = [];
  let testedCuts = 0, complete = true;
  // Explicit budget bounds a pathological export. A partial scan is disclosed,
  // including when it finds zero results, and is never an enclosure certificate.
  const limit = 1500;
  for (const region of base.regions) {
    if (region.areaSquareFeet < options.minAreaSquareFeet * 2) continue;
    const segments = region.ringsFeet.flatMap((ring, ringIndex) => ring.map((a, index) => ({ a, b: ring[(index + 1) % ring.length], ringIndex, index })));
    const size = options.maxWidthFeet;
    const grid = new Map<string, Set<number>>();
    segments.forEach((s, index) => {
      const steps = Math.ceil(distance(s.a, s.b) / (size / 2));
      for (let i = 0; i <= steps; i++) {
        const p: Point = [s.a[0] + (s.b[0] - s.a[0]) * i / (steps || 1), s.a[1] + (s.b[1] - s.a[1]) * i / (steps || 1)];
        const key = `${Math.floor(p[0] / size)}:${Math.floor(p[1] / size)}`;
        if (!grid.has(key)) grid.set(key, new Set());
        grid.get(key)!.add(index);
      }
    });
    const candidates: { ends: [Point, Point]; width: number }[] = [];
    const seen = new Set<string>();
    for (const s of segments) {
      const x = Math.floor(s.a[0] / size), y = Math.floor(s.a[1] / size);
      const near = new Set<number>();
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
        grid.get(`${x + dx}:${y + dy}`)?.forEach(i => near.add(i));
      for (const index of near) {
        const target = segments[index], q = closest(s.a, target.a, target.b), width = distance(s.a, q);
        if (width < options.minWidthFeet || width > options.maxWidthFeet) continue;
        const ends: [Point, Point] = [s.a, q];
        const key = ends.map(p => p.map(n => n.toFixed(5)).join(":")).sort().join("/");
        if (seen.has(key)) continue;
        seen.add(key);
        // A cut must travel strictly through supported free space, never along
        // an edge, across a solid column, or through a slab/stair aperture.
        if (![0.001, 0.1, 0.5, 0.9, 0.999].every(t => pointInNativeArea([s.a[0] + (q[0] - s.a[0]) * t, s.a[1] + (q[1] - s.a[1]) * t], region.ringsFeet))) continue;
        // Check full interior support, not just the samples. Allow only the
        // EPS end overlap needed to touch the native boundary numerically.
        const cut = strip(ends), covered = pc.intersection(region.ringsFeet, cut).reduce((n, r) => n + area(r), 0);
        if (covered < width * EPS * 2 * 0.995) continue;
        candidates.push({ ends, width });
      }
    }
    candidates.sort((a, b) => a.width - b.width);
    const cuts: { id: string; ends: [Point, Point]; width: number; single?: [GapScanPart, GapScanPart] }[] = [];
    for (const candidate of candidates) {
      // Equivalent cross-sections at opposite wall-face corners should not
      // create duplicate findings or artificial slivers in the joint preview.
      if (cuts.some(c => distance(midpoint(c.ends), midpoint(candidate.ends)) < Math.min(0.5, candidate.width / 2) && Math.abs(c.width - candidate.width) < Math.max(0.05, candidate.width * 0.3))) continue;
      if (testedCuts >= limit) { complete = false; break; }
      const id = `neck:${levelId}:${candidate.ends.map(p => p.map(n => n.toFixed(5)).join(":")).sort().join("/")}`;
      testedCuts++;
      const split = pc.difference(region.ringsFeet, strip(candidate.ends)).filter(r => area(r) >= options.minAreaSquareFeet).map(part);
      // Convex-corner shavings are not connecting gaps. The remaining shared
      // cuts are evaluated together below for alternate bypasses.
      const c = { id, ...candidate, single: split.length >= 2 ? [split[0], split[1]] as [GapScanPart, GapScanPart] : undefined };
      cuts.push(c);
    }
    if (!cuts.length) continue;
    const separated = pc.difference(region.ringsFeet, ...cuts.map(c => strip(c.ends))).map(part);
    for (const c of cuts) {
      const p = midpoint(c.ends), a = c.ends[0], b = c.ends[1];
      const offset = Math.min(0.05, c.width / 4), nx = -(b[1] - a[1]) / c.width * offset, ny = (b[0] - a[0]) / c.width * offset;
      const sideA = separated.find(r => pointInNativeArea([p[0] + nx, p[1] + ny], r.ringsFeet));
      const sideB = separated.find(r => pointInNativeArea([p[0] - nx, p[1] - ny], r.ringsFeet));
      const joint = sideA && sideB && sideA !== sideB && sideA.areaSquareFeet >= options.minAreaSquareFeet && sideB.areaSquareFeet >= options.minAreaSquareFeet ? [sideA, sideB] as [GapScanPart, GapScanPart] : undefined;
      const sides = c.single ?? joint;
      if (!sides) continue;
      const supports = c.ends.map(p => walls.filter(w => w.ringsFeet.some(r => r.some((a, i) => distance(p, closest(p, a, r[(i + 1) % r.length])) < 0.001))).map(w => w.nativeElementId));
      const wallIds = [...new Set(supports.flat())];
      findings.push({ id: c.id, regionId: region.id, widthFeet: c.width, endpointsFeet: c.ends, wallIds,
        kind: supports.every(s => s.length) && wallIds.length >= 2 ? "wall-gap" : "narrow-passage",
        separation: c.single ? "single-cut" : "combined-cuts",
        ...(c.single ? {} : { experimentRegionId: region.id }), sides });
    }
    if (findings.some(f => f.regionId === region.id && f.separation === "combined-cuts"))
      experiments.push({ regionId: region.id, cuts: cuts.map(c => ({ id: c.id, endpointsFeet: c.ends })), parts: separated });
    if (!complete) break;
  }
  return {
    format: "openindoormaps-gap-scan", version: 1, sourceModelSha256: data.source.modelSha256, roomsSha256: data.source.roomsSha256, geometrySha256: base.geometrySha256, levelId, options,
    findings: findings.sort((a, b) => a.widthFeet - b.widthFeet).filter((f, index, all) => !all.slice(0, index).some(other =>
      f.regionId === other.regionId && f.separation === other.separation &&
      JSON.stringify(f.sides.map(s => [...s.roomKeys].sort()).sort()) === JSON.stringify(other.sides.map(s => [...s.roomKeys].sort()).sort()) &&
      distance(midpoint(f.endpointsFeet), midpoint(other.endpointsFeet)) < Math.max(1, f.widthFeet * 2) &&
      Math.abs(Math.min(...f.sides.map(s => s.areaSquareFeet)) - Math.min(...other.sides.map(s => s.areaSquareFeet))) < 1
    )), testedCuts, complete, regionCount: base.regions.length,
    experiments,
    measuredDoors: base.doorChecks.flatMap(check => {
      const door = data.doors?.find(d => d.levelId === levelId && d.nativeElementId === check.nativeElementId);
      if (!door?.footprintFeet || !door.normalFeet) return [];
      const [nx, ny] = door.normalFeet, len = Math.hypot(nx, ny);
      if (len < 1e-9) return [];
      const along = door.footprintFeet.map(p => (-ny * p[0] + nx * p[1]) / len);
      const widthFeet = Math.max(...along) - Math.min(...along);
      return widthFeet >= options.minWidthFeet && widthFeet <= options.maxWidthFeet ? [{ ...check, widthFeet }] : [];
    }),
    warnings: [...base.warnings,
      "A narrow connection may be an intentional corridor or opening. Geometric width and label hints do not approve a wall repair or access change.",
      "Combined cuts are a diagnostic experiment, not a minimal set of missing walls. Additional gaps, curved boundaries and omitted glazing may remain undetected.",
      ...(!complete ? [`Partial scan: stopped at ${limit} tested cross-sections. Narrow the width range or inspect remaining regions.`] : [])],
  };
}

/** Portable report omits display polygons while retaining measurements, labels
 * and exact endpoints. It is authoring evidence, never an applied patch. */
export function compactGapScan(result: GapScanResult) {
  return { ...result, experiments: result.experiments.map(e => ({ ...e, parts: e.parts.map(({ ringsFeet: _rings, ...part }) => part) })), findings: result.findings.map(f => ({ ...f, sides: f.sides.map(({ ringsFeet: _rings, ...side }) => side) })) };
}
export function gapScanPreview(result: GapScanResult, finding: GapScanFinding): GapScanPreview {
  const experiment = result.experiments.find(e => e.regionId === finding.regionId);
  return finding.separation === "combined-cuts" && experiment
    ? { cuts: experiment.cuts.map(c => c.endpointsFeet), parts: experiment.parts.filter(p => p.areaSquareFeet >= result.options.minAreaSquareFeet).map(p => p.ringsFeet) }
    : { cuts: [finding.endpointsFeet], parts: finding.sides.map(s => s.ringsFeet) };
}
