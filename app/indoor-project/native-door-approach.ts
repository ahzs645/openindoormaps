import pc from "polygon-clipping";
import type { IndoorDataset, IndoorEdge } from "./contract";
type Point = [number, number];
type Rings = Point[][];

/** A saved portal may sit inside the door thickness rather than outside it.
 * Permit only its own half of the exact native footprint as approach support.
 * The opposite half still requires the explicit reviewed door edge. Display
 * apertures and extensions never authorize routing. */
export function createNativeDoorApproachQuery(data: IndoorDataset) {
  const support = data.walkingSupport;
  const approaches = new Map<
    string,
    { doorId: string; z: number; rings: Rings[]; point: number[] }
  >();
  if (
    support?.version !== 1 ||
    support.sourceModelSha256 !== data.source.modelSha256
  )
    return (_edge: IndoorEdge) => [] as { z: number; rings: Rings }[];
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  const records = new Map(data.records.map((r) => [r.key, r]));
  for (const door of data.doors ?? []) {
    const edge = edges.get(door.id),
      footprint = door.footprintFeet,
      normal = door.normalFeet;
    if (
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
      continue;
    const pair = [nodes.get(edge.from), nodes.get(edge.to)];
    if (
      pair.some(
        (n) =>
          !n ||
          n.levelId !== door.levelId ||
          !door.roomKeys.includes(n.roomKey),
      )
    )
      continue;
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
      continue;
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
    if (side(pair[0]!.pointFeet) * side(pair[1]!.pointFeet) >= -1e-10) continue;
    const floors = support.floors
      .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
      .flatMap((f) => f.partsFeet ?? [f.ringsFeet]);
    if (floors.length === 0) continue;
    for (const node of pair) {
      // A room-to-hallway door has the same measured threshold thickness as
      // a hallway-to-hallway door. Only the hallway half needs extra support:
      // the room interior retains its separate room-boundary validation.
      if (!records.get(node!.roomKey)?.circulation) continue;
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
      const masks = [
        ...data.walls
          .filter((w) => w.levelId === door.levelId && w.kind === "column")
          .map((w) => w.ringsFeet),
        ...data.records
          .filter(
            (r) =>
              Math.abs(r.elevationFeet - z) < 0.05 &&
              !door.roomKeys.includes(r.key) &&
              (!r.circulation || !r.walkable || r.access === "staff"),
          )
          .map((r) => r.ringsFeet),
        ...(data.circulationGeometry?.fixtures ?? [])
          .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
          .map((f) => f.ringsFeet),
        ...data.records
          .filter((r) => Math.abs(r.elevationFeet - z) < 0.05)
          .flatMap((r) =>
            (
              (r.properties.floorOpeningsFeet as Point[][] | undefined) ?? []
            ).map((h) => [h]),
          ),
      ];
      try {
        let rings = pc.intersection([half], floors);
        // Bounds prune irrelevant masks; exact clipping remains authoritative.
        const lo = [
            Math.min(...half.map((p) => p[0])),
            Math.min(...half.map((p) => p[1])),
          ],
          hi = [
            Math.max(...half.map((p) => p[0])),
            Math.max(...half.map((p) => p[1])),
          ];
        const near = masks.filter(
          (r) =>
            r
              .flat()
              .some(
                (p) =>
                  p[0] >= lo[0] &&
                  p[0] <= hi[0] &&
                  p[1] >= lo[1] &&
                  p[1] <= hi[1],
              ) ||
            (Math.min(...r.flat().map((p) => p[0])) <= hi[0] &&
              Math.max(...r.flat().map((p) => p[0])) >= lo[0] &&
              Math.min(...r.flat().map((p) => p[1])) <= hi[1] &&
              Math.max(...r.flat().map((p) => p[1])) >= lo[1]),
        );
        if (near.length > 0) rings = pc.difference(rings, ...near);
        if (rings.length > 0)
          approaches.set(node!.id, {
            doorId: door.id,
            z,
            rings,
            point: node!.pointFeet,
          });
      } catch {
        /* Uncertain threshold support remains blocked. */
      }
    }
  }
  return (edge: IndoorEdge): { z: number; rings: Rings }[] => {
    if (edge.kind !== "walk") return [];
    const ends = [
      { id: edge.from, p: edge.pointsFeet[0], other: edge.to },
      { id: edge.to, p: edge.pointsFeet.at(-1), other: edge.from },
    ];
    return ends.flatMap(({ id, p, other }) => {
      const a = approaches.get(id);
      if (
        !a ||
        !p ||
        Math.hypot(...p.map((v, i) => v - a.point[i])) > 1e-6 ||
        approaches.get(other)?.doorId === a.doorId
      )
        return [];
      return a.rings.map((rings) => ({ z: a.z, rings }));
    });
  };
}
