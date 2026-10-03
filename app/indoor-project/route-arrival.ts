import { isConnectorLobbyDestination } from "./connector-arrival";
import type { IndoorDataset } from "./contract";
import type { ProjectRoute } from "./routing";
import { routingDoorApertures } from "./routing-apertures";
import { validatedOpeningSpan, openingSpanFrame } from "./opening-span";
import { createDoorPassageQuery } from "./route-passages";
export type ProjectArrivalMode = "inside" | "doorway" | "hallway";
type XYZ = [number, number, number];
export type ProjectRouteArrival = {
  mode: Exclude<ProjectArrivalMode, "inside">;
  pointFeet: XYZ;
  levelId: number;
  building: string;
  entranceEdgeId: string;
};
export const arrivalChoices = [
  {
    value: "inside" as const,
    name: "Inside room",
    description: "Continue to the room’s saved arrival point",
  },
  {
    value: "doorway" as const,
    name: "At doorway",
    description: "Stop at the selected entrance’s threshold",
  },
  {
    value: "hallway" as const,
    name: "Hallway outside door",
    description: "Stop on the hallway side without entering",
  },
];
export function loadArrivalMode(): ProjectArrivalMode {
  try {
    const value = globalThis.localStorage.getItem(
      "indoor-project-arrival-mode",
    );
    if (value === "doorway" || value === "hallway") return value;
  } catch {
    /* Storage is optional. */
  }
  return "inside";
}
export function saveArrivalMode(mode: ProjectArrivalMode) {
  try {
    globalThis.localStorage.setItem("indoor-project-arrival-mode", mode);
  } catch {
    /* Storage is optional. */
  }
}
const unavailable = (message: string) => ({ route: null, message });
const length = (points: readonly XYZ[], scale: number) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]) * scale,
      0,
    );

/** Shorten the selected, policy-checked route at its actual destination entrance.
 * Never add a connection, move a source node, or infer a door from a room box.
 * The saved route/graph remain intact; rendered points, distance and arrival
 * instructions all consume the same truncated path. */
export function resolveRouteArrival(
  data: IndoorDataset,
  route: ProjectRoute | null,
  endKey: string,
  mode: ProjectArrivalMode,
): { route: ProjectRoute | null; message?: string } {
  if (!route || mode === "inside") return { route };
  const end = data.records.find((r) => r.key === endKey);
  if (end && isConnectorLobbyDestination(data, end)) return { route };
  let index = -1;
  route.edges.forEach((edge, i) => {
    if (
      ["door", "opening"].includes(edge.kind) &&
      edge.enabled &&
      data.nodes.find((n) => n.id === route.nodeIds[i + 1])?.roomKey ===
        endKey &&
      data.nodes.find((n) => n.id === route.nodeIds[i])?.roomKey !== endKey
    )
      index = i;
  });
  if (!end || index < 0)
    return unavailable(
      "This route has no verified destination entrance. Choose Inside room.",
    );
  const edge = route.edges[index],
    outside = data.nodes.find((n) => n.id === route.nodeIds[index])!,
    inside = data.nodes.find((n) => n.id === route.nodeIds[index + 1])!,
    outsideRoom = data.records.find((r) => r.key === outside.roomKey);
  if (
    outside.levelId !== inside.levelId ||
    Math.abs(outside.pointFeet[2] - inside.pointFeet[2]) > 0.01
  )
    return unavailable(
      "This entrance changes elevation. Choose Inside room to keep its verified transition.",
    );
  if (mode === "hallway" && !outsideRoom?.circulation)
    return unavailable(
      "The selected entrance opens into another room, not a hallway. Choose At doorway or Inside room.",
    );
  let center: [number, number],
    normal: [number, number],
    aperture: [number, number][];
  const door = routingDoorApertures(data).find(
    (d) => d.id === edge.id && d.state === "connected" && d.footprintFeet,
  );
  const span = validatedOpeningSpan(data, edge);
  if (door?.footprintFeet) {
    aperture = door.footprintFeet;
    center = [
      aperture.reduce((sum, p) => sum + p[0], 0) / aperture.length,
      aperture.reduce((sum, p) => sum + p[1], 0) / aperture.length,
    ];
    const delta = [
      inside.pointFeet[0] - outside.pointFeet[0],
      inside.pointFeet[1] - outside.pointFeet[1],
    ];
    const d = Math.hypot(...delta);
    if (d < 1e-8)
      return unavailable(
        "The destination entrance has no verified approach. Choose Inside room.",
      );
    normal = door.normalFeet
      ? [...door.normalFeet]
      : [delta[0] / d, delta[1] / d];
  } else if (span) {
    const frame = openingSpanFrame(edge, span);
    center = [(frame.a[0] + frame.b[0]) / 2, (frame.a[1] + frame.b[1]) / 2];
    normal = frame.n;
    aperture = span.apertureFeet;
  } else
    return unavailable(
      "The destination doorway geometry needs review. Choose Inside room.",
    );
  if (
    (inside.pointFeet[0] - outside.pointFeet[0]) * normal[0] +
      (inside.pointFeet[1] - outside.pointFeet[1]) * normal[1] <
    0
  )
    normal = [-normal[0], -normal[1]];
  const side = (p: readonly number[]) =>
    (p[0] - center[0]) * normal[0] + (p[1] - center[1]) * normal[1];
  const offset = mode === "hallway" ? side(outside.pointFeet) : 0;
  if (side(outside.pointFeet) >= -1e-7 || side(inside.pointFeet) <= 1e-7)
    return unavailable(
      "The destination entrance’s inside and outside points need review. Choose Inside room.",
    );
  const tangent = (p: readonly number[]) =>
    -(p[0] - center[0]) * normal[1] + (p[1] - center[1]) * normal[0];
  const width = aperture.map((p) => tangent(p)),
    lo = Math.min(...width),
    hi = Math.max(...width);
  let cut: { path: number; segment: number; point: XYZ } | undefined;
  route.paths.forEach((path, pathIndex) => {
    if (
      !path.edgeIds.includes(edge.id) ||
      !path.levelIds.includes(inside.levelId)
    )
      return;
    for (let i = 1; i < path.pointsFeet.length; i++) {
      const a = path.pointsFeet[i - 1],
        b = path.pointsFeet[i],
        s = side(a) - offset,
        e = side(b) - offset;
      if (s > 1e-7 || e < -1e-7 || e - s < 1e-8) continue;
      const t = Math.max(0, Math.min(1, -s / (e - s)));
      const point: XYZ = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ];
      if (
        Math.abs(point[2] - inside.pointFeet[2]) < 0.01 &&
        tangent(point) >= lo - 1e-7 &&
        tangent(point) <= hi + 1e-7
      )
        cut = { path: pathIndex, segment: i, point };
    }
  });
  if (!cut)
    return unavailable(
      "The resolved approach does not meet the verified entrance. Choose Inside room.",
    );
  const stop = cut,
    edgeCount = index + (mode === "doorway" ? 1 : 0),
    edges = route.edges.slice(0, edgeCount),
    ids = new Set(edges.map((e) => e.id));
  const paths = route.paths
    .slice(0, stop.path + 1)
    .map((path, i) => {
      const points =
        i === stop.path
          ? [...path.pointsFeet.slice(0, stop.segment), stop.point]
          : path.pointsFeet;
      const pointsFeet = points
        .filter(
          (p, j) =>
            !j ||
            Math.hypot(
              p[0] - points[j - 1][0],
              p[1] - points[j - 1][1],
              p[2] - points[j - 1][2],
            ) > 1e-8,
        )
        .map((p) => [...p] as XYZ);
      return {
        ...path,
        edgeIds: path.edgeIds.filter((id) => ids.has(id)),
        pointsFeet,
        curveRanges: path.curveRanges
          ?.filter((r) => r.start < pointsFeet.length - 1)
          .map((r) => ({ ...r, end: Math.min(r.end, pointsFeet.length - 1) })),
      };
    })
    .filter((p) => p.pointsFeet.length > 1 && p.edgeIds.length > 0);
  if (paths.length === 0)
    return unavailable(
      "There is no walking approach before this entrance. Choose Inside room.",
    );
  const dependencies = new Map(edges.map((e) => [e.id, e]));
  const passages = createDoorPassageQuery(data);
  paths.forEach((p) =>
    passages(p.levelIds[0], p.pointsFeet).forEach((passage) =>
      dependencies.set(passage.edge.id, passage.edge),
    ),
  );
  const used = new Set([...dependencies.values()].flatMap((e) => e.roomKeys));
  const scale = data.alignment.horizontalMetresPerFoot;
  const distanceMetres = paths.reduce(
    (sum, path) =>
      sum +
      (path.levelIds.length === 1 &&
      path.pointsFeet.every(
        (p) => Math.abs(p[2] - path.pointsFeet[0][2]) < 0.01,
      )
        ? length(path.pointsFeet, scale)
        : edges
            .filter((e) => path.edgeIds.includes(e.id))
            .reduce((m, e) => m + e.lengthMetres, 0)),
    0,
  );
  // Compute the saved prefix distance without changing any source edge.
  let sourceDistanceMetres = 0;
  for (const e of edges) {
    if (e.id !== edge.id) {
      sourceDistanceMetres += e.lengthMetres;
      continue;
    }
    const saved =
      edge.from === outside.id
        ? edge.pointsFeet
        : [...edge.pointsFeet].reverse();
    const prefix: XYZ[] = [saved[0]];
    for (let i = 1; i < saved.length; i++) {
      const a = saved[i - 1],
        b = saved[i],
        s = side(a) - offset,
        v = side(b) - offset;
      if (s <= 0 && v >= 0 && v > s) {
        const t = -s / (v - s);
        prefix.push([
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ]);
        break;
      }
      prefix.push(b);
    }
    sourceDistanceMetres += length(prefix, scale);
  }
  const result: ProjectRoute = {
    ...route,
    edges,
    nodeIds: route.nodeIds.slice(0, edgeCount + 1),
    paths,
    distanceMetres,
    sourceDistanceMetres,
    preferenceCost: undefined,
    unknownAccessAreas: [...used].filter(
      (k) => data.records.find((r) => r.key === k)?.access === "unknown",
    ),
    unknownAccessibilityEdges: [...dependencies.values()].filter(
      (e) => e.accessible === "unknown",
    ).length,
    doorEdgeIds: [...dependencies.values()]
      .filter((e) => e.kind === "door")
      .map((e) => e.id),
    arrival: {
      mode,
      pointFeet: [...paths.at(-1)!.pointsFeet.at(-1)!],
      levelId: inside.levelId,
      building: end.building,
      entranceEdgeId: edge.id,
    },
  };
  return { route: result };
}
