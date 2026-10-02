import polygonClipping from "polygon-clipping";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { validatedOpeningSpan } from "./opening-span";

type Rings = [number, number][][];
const bounds = (rings: Rings) => {
  const ps = rings.flat();
  return [
    Math.min(...ps.map((p) => p[0])),
    Math.min(...ps.map((p) => p[1])),
    Math.max(...ps.map((p) => p[0])),
    Math.max(...ps.map((p) => p[1])),
  ];
};
const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Paint only a prepared, model-bound doorless aperture. Source room contours
 * can stop short of a threshold; their visual seam is not a new routing rule. */
export function circulationThresholds(
  data: IndoorDataset,
  records: IndoorRecord[],
): { id: string; owner: IndoorRecord; parts: Rings[] }[] {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const walls = data.walls.map((w) => ({ ...w, box: bounds(w.ringsFeet) }));
  const places = data.records.map((r) => ({ ...r, box: bounds(r.ringsFeet) }));
  return data.edges.flatMap((edge) => {
    const span = edge.enabled && validatedOpeningSpan(data, edge);
    if (!span) return [];
    const owners = edge.roomKeys.map((key) => byKey.get(key));
    if (
      owners.length !== 2 ||
      owners.some((r) => !r?.circulation || !r.walkable)
    )
      return [];
    const owner = owners.find((r) => !r!.stair) ?? owners[0];
    if (!owner) return [];
    const box = bounds([span.apertureFeet]);
    const floors = data
      .walkingSupport!.floors.filter(
        (f) => Math.abs(f.elevationFeet - span.pointsFeet[0][2]) < 0.05,
      )
      .map((f) => f.ringsFeet);
    const masks = [
      ...walls
        .filter((w) => w.levelId === span.levelId && overlaps(box, w.box))
        .map((w) => w.ringsFeet),
      ...places
        .filter(
          (r) =>
            r.levelId === span.levelId &&
            overlaps(box, r.box) &&
            !edge.roomKeys.includes(r.key) &&
            (!r.circulation || !r.walkable),
        )
        .map((r) => r.ringsFeet),
      ...places
        .filter((r) => r.levelId === span.levelId && overlaps(box, r.box))
        .flatMap((r) => r.ringsFeet.slice(1).map((h) => [h])),
    ];
    try {
      let parts = polygonClipping.intersection([span.apertureFeet], floors);
      if (masks.length > 0) parts = polygonClipping.difference(parts, masks);
      return parts.length > 0 ? [{ id: edge.id, owner, parts }] : [];
    } catch {
      return [];
    }
  });
}
