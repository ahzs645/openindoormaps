import * as DMath from "./deterministic-math";
import type { IndoorDataset } from "./contract";
import type { IndoorProject } from "./package";
import { wallReviewContext, wallReviewKey } from "./wall-review";
import type { EditPoint } from "./map-edits";
import { nearbySourceStairs } from "./source-stairs";
export type ReviewPin = {
  id: string;
  label: string;
  notes: string;
  levelId: number;
  pointFeet: EditPoint;
  wallKey?: string;
};
export type ReviewPins = {
  version: 1;
  sourceModelSha256: string;
  pins: ReviewPin[];
};
export function validateReviewPins(
  value: unknown,
  data: IndoorDataset,
): asserts value is ReviewPins {
  const v = value as ReviewPins | undefined;
  if (
    !v ||
    v.version !== 1 ||
    v.sourceModelSha256 !== data.source.modelSha256 ||
    !Array.isArray(v.pins) ||
    v.pins.length > 5000
  )
    throw new Error("Review pins do not match this model or exceed the limit.");
  const ids = new Set<string>();
  for (const pin of v.pins) {
    if (
      !pin ||
      typeof pin.id !== "string" ||
      !pin.id ||
      pin.id.length > 100 ||
      ids.has(pin.id) ||
      typeof pin.label !== "string" ||
      !pin.label.trim() ||
      pin.label.length > 200 ||
      typeof pin.notes !== "string" ||
      pin.notes.length > 4000 ||
      !data.nativeLevels.some((l) => l.id === pin.levelId) ||
      !Array.isArray(pin.pointFeet) ||
      pin.pointFeet.length !== 2 ||
      pin.pointFeet.some(
        (n) =>
          typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e8,
      ) ||
      (pin.wallKey !== undefined &&
        (typeof pin.wallKey !== "string" ||
          !data.walls.some(
            (w) =>
              w.levelId === pin.levelId && wallReviewKey(w) === pin.wallKey,
          )))
    )
      throw new Error(
        "Invalid review pin. Check its floor, label and coordinates.",
      );
    ids.add(pin.id);
  }
}
export function setReviewPins(
  project: IndoorProject,
  pins: ReviewPin[],
): IndoorProject {
  const reviewPins: ReviewPins = {
    version: 1,
    sourceModelSha256: project.dataset.source.modelSha256,
    pins: structuredClone(pins),
  };
  validateReviewPins(reviewPins, project.dataset);
  return { ...project, rooms: { ...project.rooms, reviewPins } };
}

/** Updating a prepared project for the same model keeps the user's reference
 * pins. Incoming pins win on ID; graph and source review metadata stay incoming. */
export function preserveReviewPins(
  next: IndoorProject,
  previous: IndoorProject | null,
): IndoorProject {
  // Visitor assets have no authoring pins or native master to re-export.
  if (next.manifest?.format === "openindoormaps-viewer") return next;
  const old = previous?.rooms.reviewPins;
  if (!old || old.sourceModelSha256 !== next.dataset.source.modelSha256)
    return next;
  const pins = new Map<string, ReviewPin>();
  for (const pin of old.pins) {
    if (!next.dataset.nativeLevels.some((l) => l.id === pin.levelId)) continue;
    const copy = structuredClone(pin);
    if (
      copy.wallKey &&
      !next.dataset.walls.some(
        (w) => w.levelId === copy.levelId && wallReviewKey(w) === copy.wallKey,
      )
    )
      delete copy.wallKey;
    pins.set(copy.id, copy);
  }
  for (const pin of next.rooms.reviewPins?.pins ?? []) pins.set(pin.id, pin);
  return setReviewPins(next, [...pins.values()]);
}
const distanceToRing = (point: EditPoint, ring: EditPoint[]) =>
  Math.min(
    ...ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
      return DMath.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
    }),
  );
/** Optional source reference; the dot's original coordinates are never snapped or moved. */
export function nearbyPinWall(
  data: IndoorDataset,
  levelId: number,
  point: EditPoint,
) {
  const candidates = data.walls
    .filter((w) => w.levelId === levelId && w.kind !== "column")
    .map((w) => ({
      w,
      distance: Math.min(...w.ringsFeet.map((r) => distanceToRing(point, r))),
    }))
    .filter((c) => c.distance <= 1)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0] ? wallReviewKey(candidates[0].w) : undefined;
}
export function reviewPinContext(data: IndoorDataset, pin: ReviewPin) {
  return {
    format: "openindoormaps-pin-review",
    version: 1,
    source: data.source,
    pin,
    nativeLevel: data.nativeLevels.find((l) => l.id === pin.levelId),
    floor: data.floors.find((f) => f.levelIds.includes(pin.levelId))?.name,
    alignment: data.alignment,
    nearbyWall: pin.wallKey ? wallReviewContext(data, pin.wallKey) : null,
    nearbyStairs: nearbySourceStairs(data, pin.levelId, pin.pointFeet).map(
      ({ stair, distanceFeet, routeEdges }) => ({
        stairElementId: stair.stairElementId,
        distanceFeet,
        levelIds: stair.levelIds,
        sourceGeometry: stair.sourceGeometry,
        routeConnectionAvailable: routeEdges.some((edge) => edge.enabled),
        routeEdges: routeEdges.map((edge) => ({
          id: edge.id,
          enabled: edge.enabled,
          roomKeys: edge.roomKeys,
          evidence: edge.evidence,
        })),
      }),
    ),
    nearbyRooms: data.records
      .filter(
        (r) =>
          r.levelId === pin.levelId &&
          (() => {
            const points = r.ringsFeet.flat();
            return (
              pin.pointFeet[0] >= Math.min(...points.map((p) => p[0])) - 8 &&
              pin.pointFeet[0] <= Math.max(...points.map((p) => p[0])) + 8 &&
              pin.pointFeet[1] >= Math.min(...points.map((p) => p[1])) - 8 &&
              pin.pointFeet[1] <= Math.max(...points.map((p) => p[1])) + 8
            );
          })(),
      )
      .map((r) => ({
        key: r.key,
        number: r.number,
        name: r.name,
        ringsFeet: r.ringsFeet,
      })),
    reviewGuidance:
      "The magenta dot marks a user-selected floor-plan reference, not a surveyed location or routing node. A nearby wall ID is a proximity hint, not a verified attachment to its face. Compare the image, coordinates, surrounding rooms and any wall evidence with the user's notes.",
  };
}
