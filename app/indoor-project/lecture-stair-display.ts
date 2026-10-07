import polygonClipping from "polygon-clipping";
import type { IndoorDataset, IndoorRecord } from "./contract";

const cache = new WeakMap<
  IndoorDataset,
  {
    source: IndoorDataset["stairDisplay"];
    records: IndoorDataset["records"];
    edges: IndoorDataset["edges"];
    floors: IndoorDataset["floors"];
    modelSha256: string;
    hidden: Set<number>;
  }
>();
const lectureRoom = (r: IndoorRecord) =>
  !r.stair &&
  !r.circulation &&
  /\b(?:lecture\s+(?:theatre|theater|hall)|theatre|theater|classroom)\b/i.test(
    r.name,
  );
const area = (parts: number[][][][]) =>
  parts.reduce(
    (sum, rings) =>
      sum +
      rings.reduce((total, ring, index) => {
        const signed = ring.reduce((a, p, i) => {
          const q = ring[(i + 1) % ring.length];
          return a + p[0] * q[1] - q[0] * p[1];
        }, 0);
        return total + ((index ? -1 : 1) * Math.abs(signed)) / 2;
      }, 0),
    0,
  );
const bounds = (points: number[][]) => [
  Math.min(...points.map((p) => p[0])),
  Math.min(...points.map((p) => p[1])),
  Math.max(...points.map((p) => p[0])),
  Math.max(...points.map((p) => p[1])),
];
const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Visitor presentation only: hide internal seating/aisle steps, never a real
 * served-floor connection. Source geometry, access and route ownership stay intact.
 * Callers must not mutate the returned cached set. Dataset edits replace arrays. */
export function hiddenLectureStairIds(data: IndoorDataset): Set<number> {
  const previous = cache.get(data);
  if (
    previous &&
    previous.source === data.stairDisplay &&
    previous.records === data.records &&
    previous.edges === data.edges &&
    previous.floors === data.floors &&
    previous.modelSha256 === data.source.modelSha256
  )
    return previous.hidden;
  const hidden = new Set<number>();
  const source = data.stairDisplay;
  if (source?.sourceModelSha256 === data.source.modelSha256) {
    // Even a context label cannot conceal an enabled physical connection.
    const routed = new Set(
      data.edges
        .filter((e) => e.enabled && e.nativeElementId !== undefined)
        .map((e) => e.nativeElementId),
    );
    const rooms = data.records
      .filter(lectureRoom)
      .map((room) => ({ room, bounds: bounds(room.ringsFeet.flat()) }));
    for (const stair of source.sourceFlights ?? []) {
      if (routed.has(stair.stairElementId) || stair.context === "outdoor")
        continue;
      if (stair.context === "tiered-seating") {
        hidden.add(stair.stairElementId);
        continue;
      }
      // Source inventories can list several offset native levels on one campus
      // floor. Unknown or distinct floor groups cannot be assumed internal.
      const served = stair.levelIds.map(
        (id) => data.floors.find((f) => f.levelIds.includes(id))?.id,
      );
      if (
        !served.length ||
        served.some((id) => id === undefined) ||
        new Set(served).size !== 1
      )
        continue;
      const treads = stair.treads.filter((t) => t.ringFeet.length >= 3);
      if (treads.length !== stair.treads.length || !treads.length) continue;
      const box = bounds(treads.flatMap((t) => t.ringFeet));
      for (const candidate of rooms) {
        const room = candidate.room;
        if (
          !stair.levelIds.includes(room.levelId) ||
          !stair.buildings.includes(room.building) ||
          !overlaps(box, candidate.bounds)
        )
          continue;
        try {
          // Union, not repeated vertex counts: large unsupported strips and real
          // room holes contribute their full area to the containment decision.
          const footprints = polygonClipping.union(
            [treads[0].ringFeet],
            ...treads.slice(1).map((t) => [t.ringFeet]),
          );
          const total = area(footprints);
          if (
            total > 0 &&
            area(polygonClipping.intersection(footprints, room.ringsFeet)) /
              total >=
              0.95
          ) {
            hidden.add(stair.stairElementId);
            break;
          }
        } catch {
          /* Unusable polygons retain visible source review. */
        }
      }
    }
  }
  cache.set(data, {
    source: data.stairDisplay,
    records: data.records,
    edges: data.edges,
    floors: data.floors,
    modelSha256: data.source.modelSha256,
    hidden,
  });
  return hidden;
}
