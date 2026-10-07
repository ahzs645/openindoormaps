import pc from "polygon-clipping";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { hiddenLectureStairIds } from "./lecture-stair-display";

type Rings = [number, number][][];
type Owner = { room: IndoorRecord; levelIds: number[] };
const area = (parts: Rings[]) =>
  parts.reduce(
    (sum, rings) =>
      sum +
      rings.reduce((a, ring, index) => {
        const [x, y] = ring[0];
        const signed = ring.reduce((s, p, i) => {
          const q = ring[(i + 1) % ring.length];
          return s + (p[0] - x) * (q[1] - y) - (q[0] - x) * (p[1] - y);
        }, 0);
        return a + ((index ? -1 : 1) * Math.abs(signed)) / 2;
      }, 0),
    0,
  );
const contains = (container: Rings, parts: Rings[]) => {
  const total = area(parts);
  return total > 0 && area(pc.intersection(container, parts)) / total >= 0.95;
};

/** A theatre's offset seating slabs can belong to the same campus floor as its
 * entrance. Prove identity from internal native treads; never manufacture a floor,
 * close an aperture, infer access, or use another campus floor as backing. */
export function nativeLectureFloorOwners(data: IndoorDataset): Owner[] {
  const hidden = hiddenLectureStairIds(data);
  const owners: Owner[] = [];
  for (const stair of data.stairDisplay?.sourceFlights ?? []) {
    if (!hidden.has(stair.stairElementId)) continue;
    const floors = stair.levelIds.map(
      (id) => data.floors.find((f) => f.levelIds.includes(id))?.id,
    );
    if (
      !floors.length ||
      floors.some((id) => id === undefined) ||
      new Set(floors).size !== 1
    )
      continue;
    try {
      const treads = stair.treads.filter((t) => t.ringFeet.length >= 3);
      if (!treads.length || treads.length !== stair.treads.length) continue;
      const parts = pc.union(
        [treads[0].ringFeet],
        ...treads.slice(1).map((t) => [t.ringFeet]),
      );
      const candidates = data.records.filter(
        (room) =>
          !room.stair &&
          !room.circulation &&
          /\b(?:lecture\s+(?:theatre|theater|hall)|theatre|theater|classroom)\b/i.test(
            room.name,
          ) &&
          stair.levelIds.includes(room.levelId) &&
          stair.buildings.includes(room.building) &&
          contains(room.ringsFeet, parts),
      );
      // Overlapping identities need review, even if the steps have explicit context.
      if (candidates.length === 1)
        owners.push({ room: candidates[0], levelIds: stair.levelIds });
    } catch {
      /* Invalid source polygons remain unassociated. */
    }
  }
  return owners;
}

/** Only otherwise unclaimed native faces can acquire a presentation identity.
 * The exact component, including all physical holes, is retained verbatim. */
export function nativeLectureFloorOwner(
  owners: Owner[],
  levelId: number,
  rings: Rings,
) {
  try {
    const keys = new Set(
      owners
        .filter(
          (o) =>
            o.levelIds.includes(levelId) && contains(o.room.ringsFeet, [rings]),
        )
        .map((o) => o.room.key),
    );
    return keys.size === 1 ? [...keys][0] : undefined;
  } catch {
    return undefined;
  }
}
