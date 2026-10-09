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

/** Keep the measured door width; extend only through the host wall thickness.
 * Shared by wall carving and threshold paint so hidden doors leave no seam. */
export function nativeDoorDisplayAperture(
  door: NonNullable<IndoorDataset["doors"]>[number],
): [number, number][] {
  return (door.footprintFeet ?? []).map((p) => {
    const n = door.normalFeet;
    if (!n) return p;
    const side =
      (p[0] - door.pointFeet[0]) * n[0] + (p[1] - door.pointFeet[1]) * n[1];
    return [p[0] + Math.sign(side) * n[0], p[1] + Math.sign(side) * n[1]];
  });
}

/** Paint only enabled native doors joining circulation on the same physical
 * plane. This is display support for an existing graph edge, never a new link. */
function nativeDoorThresholds(data: IndoorDataset, records: IndoorRecord[]) {
  const support = data.walkingSupport;
  if (
    support?.version !== 1 ||
    support.sourceModelSha256 !== data.source.modelSha256
  )
    return [];
  const byKey = new Map(records.map((r) => [r.key, r]));
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  return (data.doors ?? []).flatMap((door) => {
    const edge = edges.get(door.id);
    if (
      door.state !== "connected" ||
      !door.footprintFeet ||
      !Number.isInteger(door.nativeElementId) ||
      door.nativeElementId <= 0 ||
      edge?.kind !== "door" ||
      !edge.enabled ||
      edge.nativeElementId !== door.nativeElementId ||
      edge.roomKeys.length !== 2 ||
      door.roomKeys.length !== 2 ||
      edge.roomKeys.some((key) => !door.roomKeys.includes(key))
    )
      return [];
    const owners = edge.roomKeys.map((key) => byKey.get(key));
    if (
      owners.some((r) => !r?.circulation || !r.walkable || r.access === "staff")
    )
      return [];
    const owner = owners.find((r) => !r!.stair) ?? owners[0]!;
    const z = owner!.elevationFeet,
      a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (
      !a ||
      !b ||
      owners.some(
        (r) =>
          r!.levelId !== door.levelId || Math.abs(r!.elevationFeet - z) > 0.05,
      ) ||
      [a, b].some(
        (n) =>
          !door.roomKeys.includes(n.roomKey) ||
          n.levelId !== door.levelId ||
          Math.abs(n.pointFeet[2] - z) > 0.05,
      )
    )
      return [];
    const aperture = nativeDoorDisplayAperture(door);
    if (aperture.length < 3 || aperture.some((p) => !p.every(Number.isFinite)))
      return [];
    const box = bounds([aperture]);
    try {
      // Only native hosts intersecting the measured door footprint may be cut.
      // Other walls and every column remain obstacles, even inside the strip.
      const nearbyWalls = data.walls.filter(
        (w) => w.levelId === door.levelId && overlaps(box, bounds(w.ringsFeet)),
      );
      const masks = [
        ...nearbyWalls
          .filter(
            (w) =>
              w.kind !== "wall" ||
              polygonClipping.intersection(w.ringsFeet, [door.footprintFeet!])
                .length === 0,
          )
          .map((w) => w.ringsFeet),
        ...(data.nativeIndoorEnvelopes ? [] : data.records)
          .filter(
            (r) =>
              Math.abs(r.elevationFeet - z) < 0.05 &&
              overlaps(box, bounds(r.ringsFeet)) &&
              !door.roomKeys.includes(r.key) &&
              (!r.circulation || !r.walkable || r.access === "staff"),
          )
          .map((r) => r.ringsFeet),
        ...(data.nativeIndoorEnvelopes ? [] : data.records)
          .filter(
            (r) =>
              Math.abs(r.elevationFeet - z) < 0.05 &&
              overlaps(box, bounds(r.ringsFeet)),
          )
          .flatMap((r) =>
            (
              (r.properties.floorOpeningsFeet as
                | [number, number][][]
                | undefined) ?? []
            ).map((hole) => [hole]),
          ),
      ];
      const floors = support.floors
        .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
        .flatMap((f) => f.partsFeet ?? [f.ringsFeet]);
      if (floors.length === 0) return [];
      let parts = polygonClipping.intersection([aperture], floors);
      if (masks.length > 0) parts = polygonClipping.difference(parts, ...masks);
      return parts.length > 0
        ? [
            {
              id: door.id,
              owner: owner!,
              parts,
              boundarySource: "prepared-native-door",
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
}

/** Paint only a prepared, model-bound aperture. Source room contours
 * can stop short of a threshold; their visual seam is not a new routing rule. */
export function circulationThresholds(
  data: IndoorDataset,
  records: IndoorRecord[],
): {
  id: string;
  owner: IndoorRecord;
  parts: Rings[];
  boundarySource: string;
}[] {
  // Strict native faces and checked pass-through closures supply the floor.
  // Historical threshold paint must not reintroduce outline-based surfaces.
  if (data.nativeIndoorEnvelopes) return [];
  const byKey = new Map(records.map((r) => [r.key, r]));
  const walls = data.walls.map((w) => ({ ...w, box: bounds(w.ringsFeet) }));
  const places = data.records.map((r) => ({ ...r, box: bounds(r.ringsFeet) }));
  const openings = data.edges.flatMap((edge) => {
    const span = edge.enabled && validatedOpeningSpan(data, edge);
    if (!span) return [];
    const owners = edge.roomKeys.map((key) => byKey.get(key));
    if (
      owners.length !== 2 ||
      owners.some((r) => !r?.circulation || !r.walkable || r.access === "staff")
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
      ...(data.nativeIndoorEnvelopes ? [] : places)
        .filter(
          (r) =>
            r.levelId === span.levelId &&
            overlaps(box, r.box) &&
            !edge.roomKeys.includes(r.key) &&
            (!r.circulation || !r.walkable || r.access === "staff"),
        )
        .map((r) => r.ringsFeet),
      ...(data.nativeIndoorEnvelopes ? [] : places)
        .filter((r) => r.levelId === span.levelId && overlaps(box, r.box))
        .flatMap((r) => r.ringsFeet.slice(1).map((h) => [h])),
    ];
    try {
      let parts = polygonClipping.intersection([span.apertureFeet], floors);
      if (masks.length > 0) parts = polygonClipping.difference(parts, masks);
      return parts.length > 0
        ? [
            {
              id: edge.id,
              owner,
              parts,
              boundarySource: "prepared-native-opening",
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
  return [...openings, ...nativeDoorThresholds(data, records)];
}
