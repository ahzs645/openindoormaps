import pc from "polygon-clipping";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { roomLabelPoint } from "./map-edits";
import { pointInNativeArea } from "./native-area-review";

type Rings = [number, number][][];
type Owner = {
  room: IndoorRecord;
  levelIds: number[];
  interiorFeet: Rings;
  seedFeet: [number, number];
  floorsFeet: Rings[];
  competingSeeds: [number, number][];
};
const area = (parts: Rings[]) =>
  parts.reduce(
    (sum, rings) =>
      sum +
      rings.reduce((a, ring, i) => {
        const [x, y] = ring[0];
        return (
          a +
          ((i ? -1 : 1) *
            Math.abs(
              ring.reduce((s, p, j) => {
                const q = ring[(j + 1) % ring.length];
                return s + (p[0] - x) * (q[1] - y) - (q[0] - x) * (p[1] - y);
              }, 0),
            )) /
            2
        );
      }, 0),
    0,
  );
/** Some registered room levels are campus storey identities while their actual
 * slab is offset. Recover presentation ownership only from an existing current
 * native enclosure and a same-campus physical slab. Source levels, portals,
 * access and exact native faces remain unchanged. */
export function nativeSlabFloorOwners(data: IndoorDataset): Owner[] {
  if (
    data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256 ||
    data.presentation?.sourceModelSha256 !== data.source.modelSha256
  )
    return [];
  const owners: Owner[] = [];
  for (const room of data.records) {
    if (room.stair || room.circulation) continue;
    const sourceLevel = data.nativeLevels.find((l) => l.id === room.levelId);
    const campus = data.floors.find((f) => f.levelIds.includes(room.levelId));
    if (
      !sourceLevel ||
      !campus ||
      Math.abs(sourceLevel.elevationFeet - room.elevationFeet) < 0.15
    )
      continue;
    const prepared = data.presentation.rooms.find(
      (r) => r.roomKey === room.key,
    );
    if (
      !prepared ||
      prepared.boundarySource !== "native-wall-enclosure" ||
      prepared.levelId !== room.levelId ||
      prepared.sourceGeometryKey !==
        JSON.stringify([room.levelId, room.ringsFeet]) ||
      prepared.sourceCoverage < 0.95 ||
      prepared.cellCoverage < 0.95
    )
      continue;
    const interior = prepared.interiorRingsFeet;
    const levels = data.nativeLevels.filter(
      (l) =>
        campus.levelIds.includes(l.id) &&
        l.id !== room.levelId &&
        Math.abs(l.elevationFeet - room.elevationFeet) < 0.15,
    );
    if (levels.length !== 1 || !interior?.length) continue;
    const floors = data.walkingSupport.floors
      .filter((f) => Math.abs(f.elevationFeet - room.elevationFeet) < 0.15)
      .flatMap((f) => f.partsFeet ?? [f.ringsFeet]);
    if (!floors.length) continue;
    try {
      if (area(pc.difference(interior, floors)) > 0.002) continue;
      const seed = roomLabelPoint(data, room.key);
      if (!pointInNativeArea(seed, interior)) continue;
      const competingSeeds = data.records
        .filter(
          (r) =>
            r.key !== room.key &&
            campus.levelIds.includes(r.levelId) &&
            Math.abs(r.elevationFeet - room.elevationFeet) < 0.15,
        )
        .map((r) => roomLabelPoint(data, r.key));
      owners.push({
        room,
        levelIds: [levels[0].id],
        interiorFeet: interior,
        seedFeet: seed,
        floorsFeet: floors,
        competingSeeds,
      });
    } catch {
      /* Inconsistent or incomplete source/floor evidence remains unowned. */
    }
  }
  return owners;
}
/** Call only for an otherwise unclaimed verified native component. An identity
 * hint cannot carve or manufacture its geometry, bridge a void, or merge labels. */
export function nativeSlabFloorOwner(
  owners: Owner[],
  levelId: number,
  rings: Rings,
): string | undefined {
  try {
    const total = area([rings]);
    if (!(total > 0)) return;
    const candidates = owners.filter(
      (o) =>
        o.levelIds.includes(levelId) &&
        pointInNativeArea(o.seedFeet, rings) &&
        !o.competingSeeds.some((seed) => pointInNativeArea(seed, rings)) &&
        area(pc.intersection(o.interiorFeet, rings)) / total >= 0.95 &&
        area(pc.intersection(o.room.ringsFeet, rings)) / total >= 0.95 &&
        area(pc.difference(rings, o.floorsFeet)) <= 0.002,
    );
    return candidates.length === 1 ? candidates[0].room.key : undefined;
  } catch {
    return;
  }
}
