import type { FeatureCollection, MultiPolygon, Position } from "geojson";

export type WallGeometryRepair = {
  featureIndex: number;
  featureId?: string | number;
  nativeElementId?: number;
  levelId?: number;
  part: number;
  ring: number;
  reason:
    | "invalid-coordinate"
    | "duplicate-vertex"
    | "collinear-vertex"
    | "backtracking-spur"
    | "degenerate-ring"
    | "microscopic-shell"
    | "winding-normalized";
  count: number;
  pointGeographic?: [number, number];
};

/** Display-only extrusion input. Boolean wall/roof subtraction leaves nearly
 * zero-width fragments; vector-tile rounding can reverse their winding and
 * attach an unrelated wall shell as a hole. Keep each real shell in its own
 * feature and discard only fragments narrower than 10 micrometres. Native
 * walls, door cuts, routing barriers and exports are never changed. */
export function stableWallGeometry(
  walls: FeatureCollection<MultiPolygon>,
  onRepair?: (repair: WallGeometryRepair) => void,
): FeatureCollection<MultiPolygon> {
  return {
    ...walls,
    features: walls.features.flatMap((feature, featureIndex) =>
      feature.geometry.coordinates.flatMap((polygon, part) => {
        const origin = polygon[0]?.[0];
        if (!origin) return [];
        const sx =
          ((6_378_137 * Math.PI) / 180) * Math.cos((origin[1] * Math.PI) / 180);
        const sy = (6_378_137 * Math.PI) / 180;
        const point = (p: Position) => [
          (p[0] - origin[0]) * sx,
          (p[1] - origin[1]) * sy,
        ];
        const cleanRing = (
          ring: Position[],
          outer: boolean,
          ringIndex: number,
        ) => {
          const report = (
            reason: WallGeometryRepair["reason"],
            count = 1,
            p = ring[0],
          ) =>
            onRepair?.({
              featureIndex,
              featureId: feature.id,
              nativeElementId: feature.properties?.nativeElementId,
              levelId: feature.properties?.levelId,
              part,
              ring: ringIndex,
              reason,
              count,
              ...(p?.slice(0, 2).every(Number.isFinite)
                ? { pointGeographic: [p[0], p[1]] as [number, number] }
                : {}),
            });
          if (
            !ring.every(
              (p) => p.length >= 2 && p.slice(0, 2).every(Number.isFinite),
            )
          ) {
            report("invalid-coordinate");
            return null;
          }
          const points = ring.filter(
            (p, i) =>
              i === 0 ||
              Math.hypot(
                (p[0] - ring[i - 1][0]) * sx,
                (p[1] - ring[i - 1][1]) * sy,
              ) > 1e-7,
          );
          if (points.length < ring.length)
            report("duplicate-vertex", ring.length - points.length);
          if (
            points.length > 1 &&
            Math.hypot(
              (points[0][0] - points.at(-1)![0]) * sx,
              (points[0][1] - points.at(-1)![1]) * sy,
            ) <= 1e-7
          )
            points.pop();
          // A zero-width spur can be attached to an otherwise valid shell.
          // Remove its backtracking tip, rather than keeping two coincident
          // extrusion faces after tile rounding. Ordinary collinear vertices
          // describe the same wall edge and can be dropped at this precision.
          let changed = true;
          while (changed && points.length >= 3) {
            changed = false;
            for (let i = 0; i < points.length; i++) {
              const a = point(points[(i + points.length - 1) % points.length]);
              const b = point(points[i]);
              const c = point(points[(i + 1) % points.length]);
              const dx = c[0] - a[0],
                dy = c[1] - a[1];
              const length = Math.hypot(dx, dy);
              const distance =
                length < 1e-7
                  ? 0
                  : Math.abs(dx * (b[1] - a[1]) - dy * (b[0] - a[0])) / length;
              if (distance < 1e-5) {
                const dot = (b[0] - a[0]) * dx + (b[1] - a[1]) * dy;
                report(
                  length < 1e-7 || dot < -1e-10 || dot > length * length + 1e-10
                    ? "backtracking-spur"
                    : "collinear-vertex",
                  1,
                  points[i],
                );
                points.splice(i, 1);
                changed = true;
                break;
              }
            }
          }
          if (points.length < 3) {
            report("degenerate-ring");
            return null;
          }
          let area = 0,
            perimeter = 0;
          for (let i = 0; i < points.length; i++) {
            const a = point(points[i]),
              b = point(points[(i + 1) % points.length]);
            area += a[0] * b[1] - b[0] * a[1];
            perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
          }
          if (
            !Number.isFinite(area) ||
            area === 0 ||
            (outer && Math.abs(area) / perimeter < 1e-5)
          ) {
            report(
              !Number.isFinite(area) || area === 0
                ? "degenerate-ring"
                : "microscopic-shell",
            );
            return null;
          }
          if (area > 0 !== outer) {
            report("winding-normalized");
            points.reverse();
          }
          return [...points, points[0]];
        };
        const outer = cleanRing(polygon[0], true, 0);
        if (!outer) return [];
        const holes = polygon
          .slice(1)
          .map((r, i) => cleanRing(r, false, i + 1))
          .filter((r): r is Position[] => r !== null);
        return [
          {
            ...feature,
            ...(feature.id === undefined
              ? {}
              : { id: `${feature.id}:wall-part:${part}` }),
            geometry: {
              type: "MultiPolygon" as const,
              coordinates: [[outer, ...holes]],
            },
          },
        ];
      }),
    ),
  };
}
