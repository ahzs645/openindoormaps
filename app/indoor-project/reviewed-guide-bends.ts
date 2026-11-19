import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { IndoorDataset } from "./contract";
import { preparedRoutingKey, type PreparedRouting } from "./prepared-routing";
import { routingCalculationValue } from "./routing-cache";
import { NATIVE_CORRIDOR_STRIP_ENGINE_SHA256 } from "./published-route-runtime-binding";
import catalog from "./reviewed-bend-catalog.json";
import {
  corridorGuideLength,
  type SharedGuidePoint as Point,
} from "./shared-corridor-guides";
import type { PathwayArc } from "./shared-pathway-routing";

const same = (a: Point, b: Point) => a.every((value, i) => value === b[i]);

/** A room's perpendicular projection can split the original first or last
 * segment. Keep its surveyed coordinates even on trips that omit that stop. */
function onOriginalSegment(a: Point, b: Point, station: Point) {
  if (same(station, a) || same(station, b)) return true;
  if (a[2] !== b[2] || a[2] !== station[2]) return false;
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const fraction =
    Math.abs(dx) >= Math.abs(dy)
      ? (station[0] - a[0]) / dx
      : (station[1] - a[1]) / dy;
  const xError = a[0] + dx * fraction - station[0];
  const yError = a[1] + dy * fraction - station[1];
  return (
    fraction > 0 && fraction < 1 && xError * xError + yError * yError < 1e-20
  );
}

/** Replace a measured, contiguous source span. The same operation handles
 * a whole core, an embedded shared run and an individual station-overlay arc. */
export function straightenReviewedSpan(points: Point[], old: Point[]): Point[] {
  if (old.length < 3 || points.length < 3) return points;
  const path = points.filter((q, i) => !i || !same(q, points[i - 1]));
  for (const chain of [old, old.toReversed()]) {
    for (let i = 0; i + chain.length <= path.length; i++) {
      const last = i + chain.length - 1;
      if (
        !same(path[i + 1], chain[1]) ||
        !onOriginalSegment(path[i], path[i + 1], chain[0]) ||
        !onOriginalSegment(path[last - 1], path[last], chain.at(-1)!) ||
        !chain.slice(2, -1).every((q, k) => same(q, path[i + 2 + k]))
      )
        continue;
      const before = path.slice(0, i + (same(path[i], chain[0]) ? 0 : 1));
      const after = path.slice(
        last + (same(path[last], chain.at(-1)!) ? 1 : 0),
      );
      return [...before, chain[0], chain.at(-1)!, ...after];
    }
  }
  return points;
}

/** Extra inputs to strip, access-zone and station ownership checks which are
 * not all covered by the general prepared-guide binding. Pin the actual objects,
 * including zone members, geometry and room role metadata. */
export function bendReviewContext(data: IndoorDataset) {
  return bytesToHex(
    sha256(
      new TextEncoder().encode(
        JSON.stringify([
          data.source,
          data.nativeAccessZones,
          data.nativeLevels,
          data.records,
          data.nativeMaterialSectionSupplement,
        ]),
      ),
    ),
  );
}

/** True only on the exact physical, policy, identity and station geometry used
 * in the source replay. A changed authoring snapshot keeps ordinary validation. */
export function matchesReviewedGuideContext(
  data: IndoorDataset,
  prepared: PreparedRouting,
) {
  if (
    (data as IndoorDataset & { preparedRouting?: PreparedRouting })
      .preparedRouting !== prepared
  )
    return false;
  return routingCalculationValue(
    data,
    "reviewed-campus-guide-context",
    () =>
      data.source.modelSha256 === prepared.sourceModelSha256 &&
      prepared.sourceGeometryKey === catalog.physicalBinding &&
      bendReviewContext(data) === catalog.reviewContextSha256 &&
      preparedRoutingKey(data) === catalog.physicalBinding &&
      bytesToHex(
        sha256(new TextEncoder().encode(JSON.stringify(prepared.guides))),
      ) === catalog.guideAtlasSha256,
  );
}

export function prepareReviewedGuideBends(
  data: IndoorDataset,
  prepared: PreparedRouting,
) {
  if (
    catalog.nativeStripEngineSha256 !== NATIVE_CORRIDOR_STRIP_ENGINE_SHA256 ||
    !matchesReviewedGuideContext(data, prepared)
  )
    return;
  const byEdge = new Map<string, Point[][]>();
  for (const { owners, old } of catalog.bends) {
    for (const id of owners) {
      const spans = byEdge.get(id) ?? [];
      spans.push(old as Point[]);
      byEdge.set(id, spans);
    }
  }
  return (arc: PathwayArc) => {
    const spans = byEdge.get(arc.link.edge.id);
    if (!spans || arc.link.edge.kind !== "walk") return;
    let points = arc.points;
    for (const chain of spans) points = straightenReviewedSpan(points, chain);
    if (points === arc.points) return;
    arc.points = points;
    arc.metres =
      corridorGuideLength(points) * data.alignment.horizontalMetresPerFoot;
  };
}
