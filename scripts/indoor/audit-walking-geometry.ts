import { recoverNativeWallJunctionRepairs } from "../../../reviter/lib/reviter/native-room-presentation.ts";
import { readFile, writeFile } from "node:fs/promises";
import { readIndoorProject } from "../../app/indoor-project/package";
import {
  nativeRouteBlocker,
  containsRoomPoint,
  type RoomPoint,
  type RouteOpening,
} from "../../../reviter/lib/reviter/room-directory.ts";
const [input, output] = process.argv.slice(2);
const includeDoors = process.argv.includes("--doors");
if (!input || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-walking-geometry.ts project.zip output.json",
  );
const { dataset: d } = await readIndoorProject(await readFile(input));
const nodes = new Map(d.nodes.map((n) => [n.id, n]));
const records = new Map(d.records.map((r) => [r.key, r]));
const blockers = new Map<number, ReturnType<typeof nativeRouteBlocker>>();
let repairedJoints = 0;
for (const level of new Set(d.walls.map((w) => w.levelId))) {
  const walls = d.walls.filter((w) => w.levelId === level);
  const openings: RouteOpening[] =
    d.doors
      ?.filter(
        (door) =>
          door.levelId === level &&
          door.state === "connected" &&
          door.footprintFeet &&
          d.edges.some((e) => e.id === door.id && e.enabled),
      )
      .map((door) => ({
        rooms: door.roomKeys.slice(0, 2) as [string, string],
        point: door.pointFeet as RoomPoint,
        from: door.pointFeet as RoomPoint,
        to: door.pointFeet as RoomPoint,
        halfWidth: 0,
        halfHeight: 0,
        footprint: door.footprintFeet,
      })) ?? [];
  const repairs = recoverNativeWallJunctionRepairs(
    walls,
    d.doors?.filter((door) => door.levelId === level) ?? [],
  );
  repairedJoints += repairs.length;
  blockers.set(
    level,
    nativeRouteBlocker(
      {
        walls: [
          ...walls
            .filter((w) => w.kind !== "column")
            .map((w) => ({ polygon: w.ringsFeet[0] })),
          ...repairs.map((r) => ({ polygon: r.ringsFeet[0] })),
        ],
        columns: walls
          .filter((w) => w.kind === "column")
          .map((w) => ({ polygon: w.ringsFeet[0] })),
      },
      openings,
    ),
  );
}
const onBoundary = (p: RoomPoint, ring: RoomPoint[]) =>
  ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t =
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
    return (
      t >= 0 &&
      t <= 1 &&
      Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 1e-7
    );
  });
const inside = (p: RoomPoint, rings: RoomPoint[][]) =>
  (containsRoomPoint(p, rings[0]) || onBoundary(p, rings[0])) &&
  !rings.slice(1).some((r) => containsRoomPoint(p, r));
const crossings = (a: RoomPoint, b: RoomPoint, rings: RoomPoint[][]) => {
  const ts = [0, 1],
    dx = b[0] - a[0],
    dy = b[1] - a[1];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const u = ring[i],
        v = ring[(i + 1) % ring.length],
        ex = v[0] - u[0],
        ey = v[1] - u[1],
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-10) continue;
      const ox = u[0] - a[0],
        oy = u[1] - a[1],
        t = (ox * ey - oy * ex) / den,
        k = (ox * dy - oy * dx) / den;
      if (t > 0 && t < 1 && k >= 0 && k <= 1) ts.push(t);
    }
  return [...new Set(ts)].sort((x, y) => x - y);
};
const failures: {
  edgeId: string;
  levelId: number;
  segment: number;
  reason: string;
  a: RoomPoint;
  b: RoomPoint;
}[] = [];
let edges = 0,
  segments = 0;
for (const e of d.edges.filter(
  (e) =>
    e.enabled && (e.kind === "walk" || (includeDoors && e.kind === "door")),
)) {
  const level = nodes.get(e.from)!.levelId;
  const owned = e.roomKeys.map((key) => records.get(key)!).filter(Boolean);
  const floors = owned.map((r) => r.ringsFeet);
  // A walking region may span a verified internal doorway. Its exact aperture
  // supplies only the tiny wall threshold, never a bounding-box floor bridge.
  const doors =
    d.doors
      ?.filter(
        (door) =>
          door.levelId === level &&
          door.state === "connected" &&
          door.footprintFeet &&
          door.roomKeys.some((k) => e.roomKeys.includes(k)) &&
          d.edges.some((edge) => edge.id === door.id && edge.enabled),
      )
      .map((door) => [door.footprintFeet!]) ?? [];
  const threshold: RoomPoint[][][] = [];
  if (includeDoors && e.kind === "door") {
    const footprint = d.doors?.find(
      (door) => door.id === e.id && door.state === "connected",
    )?.footprintFeet;
    if (footprint?.length === 4) {
      let longest = 0,
        axis: RoomPoint = [1, 0];
      footprint.forEach((p, i) => {
        const q = footprint[(i + 1) % footprint.length],
          length = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (length > longest) {
          longest = length;
          axis = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
        }
      });
      const normal = d.doors?.find((door) => door.id === e.id)?.normalFeet;
      if (normal) axis = [-normal[1], normal[0]];
      const u = footprint.map((p) => p[0] * axis[0] + p[1] * axis[1]);
      const v = [...footprint, ...e.pointsFeet].map(
        (p) => -p[0] * axis[1] + p[1] * axis[0],
      );
      const lo = Math.min(...u),
        hi = Math.max(...u),
        bottom = Math.min(...v),
        top = Math.max(...v);
      threshold.push([
        [
          [lo, bottom],
          [hi, bottom],
          [hi, top],
          [lo, top],
        ].map(
          ([x, y]) =>
            [x * axis[0] - y * axis[1], x * axis[1] + y * axis[0]] as RoomPoint,
        ),
      ]);
    }
  }
  const permitted = [...floors, ...doors, ...threshold];
  const holes = owned.flatMap((r) => r.ringsFeet.slice(1));
  edges++;
  for (let i = 1; i < e.pointsFeet.length; i++) {
    segments++;
    const a = e.pointsFeet[i - 1].slice(0, 2) as RoomPoint,
      b = e.pointsFeet[i].slice(0, 2) as RoomPoint;
    if (blockers.get(level)?.(a, b))
      failures.push({
        edgeId: e.id,
        levelId: level,
        segment: i,
        reason: "native-wall-or-column",
        a,
        b,
      });
    const ts = crossings(a, b, permitted.flat());
    for (const [j, t] of ts.slice(1).entries()) {
      if (t - ts[j] < 1e-9) continue;
      const mid = (t + ts[j]) / 2,
        p: RoomPoint = [a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid];
      if (
        !permitted.some((r) => inside(p, r)) ||
        holes.some((h) => containsRoomPoint(p, h))
      ) {
        failures.push({
          edgeId: e.id,
          levelId: level,
          segment: i,
          reason: "unsupported-floor-or-hole",
          a,
          b,
        });
        break;
      }
    }
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  input,
  scope: `Every enabled saved walking edge${includeDoors ? " and native door edge (door floor coverage includes its approved side-anchor envelope at the native clear width, not a certified floor survey)" : ""}; continuous native wall/column tests with enabled precise door apertures, and complete segment floor coverage. Excludes stair flights, elevators/escalators and claims about physical passage width.`,
  edges,
  segments,
  repairedJoints,
  failureCount: failures.length,
  failedEdges: new Set(failures.map((f) => f.edgeId)).size,
  reasonCounts: Object.fromEntries(
    [...new Set(failures.map((f) => f.reason))].map((reason) => [
      reason,
      failures.filter((f) => f.reason === reason).length,
    ]),
  ),
  failures,
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ ...report, failures: failures.slice(0, 8) }, null, 2),
);
