import * as DMath from "./deterministic-math";
import {
  nativeRationalOverlay,
  type NativeRationalParts,
} from "./native-rational-overlay";
import {
  freezeNativeRationalParts,
  nativeRationalThresholdHalf,
  nativeExactPartsForProposals,
} from "./native-exact-planar-topology";
import { nativeDoorClearOpening } from "./native-door-clear-opening";
import { routingCalculationValue } from "./routing-cache";
import { nativeDoorFloorBlockers } from "./native-door-floor-support";
import {
  createNativeHostApertureQuery,
  createNativeRoutingMaterialQuery,
} from "./native-routing-material";
import {
  createNativeBoundaryMaterialQuery,
  createNativeExactBoundaryMaterialQuery,
} from "./native-boundary-material";
import pc from "polygon-clipping";
import { indoorExclusionParts } from "./indoor-exclusions";
import { createNativeIndoorEnvelopeIndex } from "./native-indoor-envelopes";
import type { IndoorDataset, IndoorEdge } from "./contract";
type Point = [number, number];
type Rings = Point[][];
type IndexedPart = {
  rings: Rings;
  exactParts?: NativeRationalParts;
  box: [number, number, number, number];
  nativeId?: number;
  column?: boolean;
  repair?: boolean;
  roomKey?: string;
};
const indexed = (rings: Rings): IndexedPart => {
  const points = rings.flat();
  return {
    rings,
    box: [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ],
  };
};
const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** A saved portal may sit inside the door thickness rather than outside it.
 * Permit only its own half of the exact native footprint as approach support.
 * The opposite half still requires the explicit reviewed door edge. Display
 * apertures and extensions never authorize routing. */
export function createNativeDoorApproachQuery(data: IndoorDataset) {
  const support = data.walkingSupport;
  type Approach = {
    doorId: string;
    z: number;
    rings: Rings[];
    exactParts?: NativeRationalParts;
    point: number[];
  };
  const approaches = new Map<string, Approach | undefined>();
  if (
    support?.version !== 1 ||
    support.sourceModelSha256 !== data.source.modelSha256
  )
    return (_edge: IndoorEdge) =>
      [] as { z: number; rings: Rings; exactParts?: NativeRationalParts }[];
  const envelopes = createNativeIndoorEnvelopeIndex(
    data.nativeIndoorEnvelopes,
    data.source.modelSha256,
  );
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  const records = new Map(data.records.map((r) => [r.key, r]));
  const materialQuery = createNativeRoutingMaterialQuery(data);
  const boundaryMaterial = createNativeBoundaryMaterialQuery(data);
  const exactBoundaryMaterial = data.nativeIndoorEnvelopes
    ? createNativeExactBoundaryMaterialQuery(data)
    : undefined;
  // This query belongs to one immutable calculation. Index each physical
  // elevation once, then prune irrelevant parts before exact clipping.
  const levels = new Map<
    string,
    {
      floors: IndexedPart[];
      envelopes: IndexedPart[];
      masks: IndexedPart[];
      ownsAperture: ReturnType<typeof createNativeHostApertureQuery>;
    }
  >();
  const levelParts = (z: number, levelId: number) => {
    const key = JSON.stringify([z, levelId]);
    let level = levels.get(key);
    if (level) return level;
    const material = materialQuery(z);
    level = {
      ownsAperture: createNativeHostApertureQuery(material),
      floors: support.floors
        .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
        .flatMap((f) => f.partsFeet ?? [f.ringsFeet])
        .map(indexed),
      envelopes: envelopes.parts(z).map(indexed),
      masks: [
        ...(material.derivedParts ?? []).map(indexed),
        ...material.parts.map((p) => ({
          ...indexed(p.rings),
          nativeId: p.nativeElementId,
          column: p.column,
        })),
        ...data.walls
          .filter(
            (w) =>
              w.levelId === levelId &&
              (!material.known.has(w.nativeElementId) ||
                (w.reviewPatchId && material.present.has(w.nativeElementId))),
          )
          .flatMap((w) =>
            exactBoundaryMaterial
              ? exactBoundaryMaterial(w).map((part) => ({
                  ...indexed(nativeExactPartsForProposals([part])[0]),
                  exactParts: [part],
                  nativeId: w.nativeElementId,
                  column: w.kind === "column",
                  repair: !!w.reviewPatchId,
                }))
              : boundaryMaterial(w).map((rings) => ({
                  ...indexed(rings),
                  nativeId: w.nativeElementId,
                  column: w.kind === "column",
                  repair: !!w.reviewPatchId,
                })),
          ),
        ...(data.nativeIndoorEnvelopes
          ? []
          : data.records
              .filter(
                (r) =>
                  Math.abs(r.elevationFeet - z) < 0.05 &&
                  (!r.circulation || !r.walkable || r.access === "staff"),
              )
              .map((r) => ({ ...indexed(r.ringsFeet), roomKey: r.key }))),
        ...(data.circulationGeometry?.fixtures ?? [])
          .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
          .map((f) => indexed(f.ringsFeet)),
        ...indoorExclusionParts(data, z).map(indexed),
        ...(data.nativeIndoorEnvelopes ? [] : data.records)
          .filter((r) => Math.abs(r.elevationFeet - z) < 0.05)
          .flatMap((r) =>
            (
              (r.properties.floorOpeningsFeet as Point[][] | undefined) ?? []
            ).map((h) => indexed([h])),
          ),
      ],
    };
    levels.set(key, level);
    return level;
  };
  const supportTiles = new Map<string, Rings[] | undefined>();
  const localSupport = (
    z: number,
    box: number[],
    level: ReturnType<typeof levelParts>,
  ): Rings[] | undefined => {
    // Every threshold half is inside its tile rectangle. Intersecting source
    // support with that rectangle removes only distant geometry; it cannot
    // create floor, fill a hole or move a physical boundary. Nearby portals
    // share the costly overlay of whole-building slab profiles.
    const size = 32,
      tile = [
        Math.floor(box[0] / size) * size,
        Math.floor(box[1] / size) * size,
        (Math.floor(box[2] / size) + 1) * size,
        (Math.floor(box[3] / size) + 1) * size,
      ];
    const key = JSON.stringify([z, tile]);
    if (supportTiles.has(key)) return supportTiles.get(key);
    const rect: Rings = [
      [
        [tile[0], tile[1]],
        [tile[2], tile[1]],
        [tile[2], tile[3]],
        [tile[0], tile[3]],
      ],
    ];
    const floors = level.floors
        .filter((p) => overlaps(tile, p.box))
        .map((p) => p.rings),
      envelope = level.envelopes
        .filter((p) => overlaps(tile, p.box))
        .map((p) => p.rings);
    let parts: Rings[] = [];
    try {
      if (floors.length && (!data.nativeIndoorEnvelopes || envelope.length)) {
        parts = pc.intersection(rect, floors);
        if (data.nativeIndoorEnvelopes)
          parts = pc.intersection(parts, envelope);
      }
    } catch {
      // If the sweep cannot overlay a tile, retry the original exact half
      // below. This fallback still uses native evidence, never a room trace.
      supportTiles.set(key, undefined);
      return;
    }
    supportTiles.set(key, parts);
    return parts;
  };
  const floorBlockedDoors = routingCalculationValue(
    data,
    "native-door-floor-blockers",
    () => nativeDoorFloorBlockers(data),
  );
  const doors = data.doors ?? [];
  const incident = new Map<string, number[]>();
  doors.forEach((door, index) => {
    const edge = edges.get(door.id);
    if (!edge) return;
    for (const nodeId of new Set([edge.from, edge.to])) {
      const indices = incident.get(nodeId) ?? [];
      indices.push(index);
      incident.set(nodeId, indices);
    }
  });
  const checkedDoors = new Map<number, Map<string, Approach>>();
  const checkDoor = (index: number) => {
    const saved = checkedDoors.get(index);
    if (saved) return saved;
    const result = new Map<string, Approach>();
    const door = doors[index];
    const edge = edges.get(door.id),
      footprint = data.nativeIndoorEnvelopes
        ? (nativeDoorClearOpening(
            data,
            door,
            edge?.pointsFeet[0]?.[2] ?? NaN,
          ) ?? door.footprintFeet)
        : door.footprintFeet,
      normal = door.normalFeet;
    if (
      floorBlockedDoors.has(door.id) ||
      door.state !== "connected" ||
      edge?.kind !== "door" ||
      !edge.enabled ||
      edge.nativeElementId !== door.nativeElementId ||
      !footprint ||
      !normal ||
      edge.roomKeys.length !== 2 ||
      door.roomKeys.length !== 2 ||
      edge.roomKeys.some((key) => !door.roomKeys.includes(key))
    )
      return result;
    if (data.nativeIndoorEnvelopes && !door.hostWallNativeElementId)
      return result;
    const pair = [nodes.get(edge.from), nodes.get(edge.to)];
    if (
      pair.some(
        (n) =>
          !n ||
          n.levelId !== door.levelId ||
          !door.roomKeys.includes(n.roomKey),
      )
    )
      return result;
    const z = pair[0]!.pointFeet[2];
    if (
      Math.abs(pair[1]!.pointFeet[2] - z) > 0.05 ||
      door.roomKeys.some((key) => {
        const r = records.get(key);
        return (
          !r ||
          !r.walkable ||
          r.access === "staff" ||
          Math.abs(r.elevationFeet - z) > 0.05
        );
      })
    )
      return result;
    const center = footprint.reduce(
      (c, p) =>
        [
          c[0] + p[0] / footprint.length,
          c[1] + p[1] / footprint.length,
        ] as Point,
      [0, 0] as Point,
    );
    const side = (p: number[]) =>
      (p[0] - center[0]) * normal[0] + (p[1] - center[1]) * normal[1];
    if (side(pair[0]!.pointFeet) * side(pair[1]!.pointFeet) >= -1e-10)
      return result;
    const level = levelParts(z, door.levelId);
    if (level.floors.length === 0) return result;
    for (const node of pair) {
      // A room-to-hallway door has the same measured threshold thickness as
      // a hallway-to-hallway door. Only the hallway half needs extra support:
      // the room interior retains its separate room-boundary validation.
      if (
        !data.nativeIndoorEnvelopes &&
        !records.get(node!.roomKey)?.circulation
      )
        continue;
      const sign = Math.sign(side(node!.pointFeet)),
        half: Point[] = [];
      // Exact half-plane intersection, no widened doorway or distance snap.
      for (let i = 0; i < footprint.length; i++) {
        const a = footprint[i],
          b = footprint[(i + 1) % footprint.length],
          sa = side(a) * sign,
          sb = side(b) * sign;
        if (sa >= 0) half.push(a);
        if (sa >= 0 !== sb >= 0) {
          const t = sa / (sa - sb);
          half.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        }
      }
      if (half.length < 3) continue;
      // The approximate half is not a source bound. The original whole door
      // keeps every mask intersecting its exact rational half in the broad phase.
      const box = indexed([data.nativeIndoorEnvelopes ? footprint : half]).box;
      const near = level.masks
        .filter(
          (p) =>
            overlaps(box, p.box) &&
            (!p.roomKey || !door.roomKeys.includes(p.roomKey)) &&
            (p.nativeId === undefined ||
              p.column ||
              p.repair ||
              (!!data.nativeIndoorEnvelopes &&
                !level.ownsAperture(
                  door.hostWallNativeElementId,
                  door.nativeElementId,
                  p.nativeId,
                ))),
        )
        .map((p) => p.rings);
      try {
        if (data.nativeIndoorEnvelopes) {
          const floors = level.floors
              .filter((p) => overlaps(box, p.box))
              .map((p) => p.rings),
            envelope = level.envelopes
              .filter((p) => overlaps(box, p.box))
              .map((p) => p.rings);
          const exactHalf = nativeRationalThresholdHalf(
            footprint,
            normal,
            node!.pointFeet,
          );
          let exactParts = nativeRationalOverlay(
            "intersection",
            exactHalf,
            floors,
          );
          exactParts = nativeRationalOverlay(
            "intersection",
            exactParts,
            envelope,
          );
          const exactMasks = level.masks
            .filter(
              (p) =>
                overlaps(box, p.box) &&
                (!p.roomKey || !door.roomKeys.includes(p.roomKey)) &&
                (p.nativeId === undefined ||
                  p.column ||
                  p.repair ||
                  !level.ownsAperture(
                    door.hostWallNativeElementId,
                    door.nativeElementId,
                    p.nativeId,
                  )),
            )
            .flatMap(
              (p) => p.exactParts ?? nativeRationalOverlay("union", [p.rings]),
            );
          if (exactMasks.length)
            exactParts = nativeRationalOverlay(
              "difference",
              exactParts,
              exactMasks,
            );
          exactParts = freezeNativeRationalParts(exactParts);
          if (exactParts.length)
            result.set(node!.id, {
              doorId: door.id,
              z,
              exactParts,
              rings: nativeExactPartsForProposals(exactParts),
              point: node!.pointFeet,
            });
          continue;
        }
        const support = localSupport(z, box, level);
        let rings;
        if (support === undefined) {
          const floors = level.floors
              .filter((p) => overlaps(box, p.box))
              .map((p) => p.rings),
            envelope = level.envelopes
              .filter((p) => overlaps(box, p.box))
              .map((p) => p.rings);
          if (
            !floors.length ||
            (data.nativeIndoorEnvelopes && !envelope.length)
          )
            continue;
          rings = pc.intersection([half], floors);
          if (data.nativeIndoorEnvelopes)
            rings = pc.intersection(rings, envelope);
        } else {
          if (!support.length) continue;
          rings = pc.intersection([half], support);
        }
        if (near.length > 0) rings = pc.difference(rings, ...near);
        if (rings.length > 0)
          result.set(node!.id, {
            doorId: door.id,
            z,
            rings,
            point: node!.pointFeet,
          });
      } catch {
        /* Uncertain threshold support remains blocked. */
      }
    }
    checkedDoors.set(index, result);
    return result;
  };
  const approachForNode = (nodeId: string) => {
    if (approaches.has(nodeId)) return approaches.get(nodeId);
    let result: Approach | undefined;
    // Independent door results may be computed in any query order. Replaying
    // incident doors in source order preserves the eager Map's last valid
    // assignment even when several physical doors share one portal node.
    for (const index of incident.get(nodeId) ?? []) {
      const value = checkDoor(index).get(nodeId);
      if (value) result = value;
    }
    approaches.set(nodeId, result);
    return result;
  };
  return (
    edge: IndoorEdge,
  ): { z: number; rings: Rings; exactParts?: NativeRationalParts }[] => {
    if (edge.kind !== "walk") return [];
    const ends = [
      { id: edge.from, p: edge.pointsFeet[0], other: edge.to },
      { id: edge.to, p: edge.pointsFeet.at(-1), other: edge.from },
    ];
    for (const end of ends) approachForNode(end.id);
    return ends.flatMap(({ id, p, other }) => {
      const a = approaches.get(id);
      if (
        !a ||
        !p ||
        DMath.hypot(...p.map((v, i) => v - a.point[i])) > 1e-6 ||
        approaches.get(other)?.doorId === a.doorId
      )
        return [];
      return a.exactParts
        ? [{ z: a.z, rings: a.rings[0], exactParts: a.exactParts }]
        : a.rings.map((rings) => ({ z: a.z, rings }));
    });
  };
}
