import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";

type Point = [number, number];
type Wall = IndoorDataset["walls"][number];
export const wallReviewKey = (w: Pick<Wall, "levelId" | "nativeElementId">) =>
  `wall:${w.levelId}:${w.nativeElementId}`;
const bounds = (rings: Point[][]) => {
  const points = rings.flat();
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
};
const overlaps = (a: number[], b: number[], margin = 0) =>
  a[0] <= b[2] + margin &&
  a[2] >= b[0] - margin &&
  a[1] <= b[3] + margin &&
  a[3] >= b[1] - margin;
const ringArea = (ring: Point[]) =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
const footprintArea = (w: Wall) =>
  Math.max(
    0,
    ringArea(w.ringsFeet[0]) -
      w.ringsFeet.slice(1).reduce((sum, r) => sum + ringArea(r), 0),
  );

/** Unmerged native footprints retain identity even when display walls are unioned or carved. */
export function wallReviewFeatures(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
): FeatureCollection<MultiPolygon> {
  const rooms = data.records.filter(
    (r) => levelIds.includes(r.levelId) && r.building === building,
  );
  const groups = new Map<string, Wall[]>();
  for (const w of data.walls) {
    if (
      w.kind === "column" ||
      !levelIds.includes(w.levelId) ||
      !w.ringsFeet[0]?.length
    )
      continue;
    if (
      building !== "all" &&
      !rooms.some(
        (r) =>
          r.levelId === w.levelId &&
          overlaps(bounds(r.ringsFeet), bounds(w.ringsFeet), 5),
      )
    )
      continue;
    const key = wallReviewKey(w);
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  return {
    type: "FeatureCollection",
    features: [...groups].map(([key, parts]) => ({
      type: "Feature",
      properties: {
        key,
        nativeElementId: parts[0].nativeElementId,
        levelId: parts[0].levelId,
        approximate: parts.some((w) => w.approximate === true),
        areaFeet2: parts.reduce((sum, w) => sum + footprintArea(w), 0),
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: parts.map((w) =>
          w.ringsFeet.map((ring) => {
            const points = ring.map((p) => geographicPoint(data, p));
            if (
              points.length > 0 &&
              (points[0][0] !== points.at(-1)![0] ||
                points[0][1] !== points.at(-1)![1])
            )
              points.push(points[0]);
            return points;
          }),
        ),
      },
    })),
  };
}

/** Self-contained evidence for an AI or human; never treats a display envelope as a certified boundary. */
export function wallReviewContext(data: IndoorDataset, key: string) {
  const parts = data.walls.filter((w) => wallReviewKey(w) === key);
  if (parts.length === 0) return null;
  const { levelId, nativeElementId } = parts[0];
  const extent = bounds(parts.flatMap((w) => w.ringsFeet));
  const nearbyRooms = data.records.filter(
    (r) =>
      r.levelId === levelId &&
      (overlaps(extent, bounds(r.ringsFeet), 8) ||
        data.presentation?.rooms.some(
          (p) =>
            p.roomKey === r.key &&
            p.boundaryElementIds.includes(nativeElementId),
        )),
  );
  const nearbyDoors = (data.doors ?? []).filter(
    (d) =>
      d.levelId === levelId &&
      overlaps(
        extent,
        [d.pointFeet[0], d.pointFeet[1], d.pointFeet[0], d.pointFeet[1]],
        8,
      ),
  );
  return {
    format: "openindoormaps-wall-review",
    version: 1,
    source: data.source,
    selection: {
      key,
      nativeElementId,
      levelId,
      nativeLevel: data.nativeLevels.find((l) => l.id === levelId),
      floor: data.floors.find((f) => f.levelIds.includes(levelId))?.name,
      footprintQuality: parts.some((w) => w.approximate === true)
        ? "approximate bounds envelope"
        : parts.every((w) => w.approximate === false)
          ? "native footprint"
          : "not specified in this package",
      partsFeet: parts.map((w) => w.ringsFeet),
      boundsFeet: extent,
      areaFeet2: parts.reduce((sum, w) => sum + footprintArea(w), 0),
    },
    nearbyRooms: nearbyRooms.map((r) => ({
      key: r.key,
      number: r.number,
      name: r.name,
      building: r.building,
      levelId: r.levelId,
      ringsFeet: r.ringsFeet,
      preparedBoundary:
        data.presentation?.rooms.find((p) => p.roomKey === r.key) ?? null,
    })),
    nearbyDoors,
    issues: data.issues.filter(
      (i) =>
        i.nativeElementId === nativeElementId ||
        (i.roomKey && nearbyRooms.some((r) => r.key === i.roomKey)),
    ),
    alignment: data.alignment,
    reviewGuidance:
      "Compare the selected source wall footprint with adjacent room boundaries and door openings. Identify gaps, overlaps or bad joints. Approximate envelopes are uncertain evidence. Do not infer verified room boundaries or routing connections from the preview alone.",
  };
}
export type WallReviewContext = NonNullable<
  ReturnType<typeof wallReviewContext>
>;
