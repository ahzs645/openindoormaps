import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  nativeRouteBlocker,
  type RouteOpening,
  type RoomPoint,
} from "../../../reviter/lib/reviter/room-directory.ts";
import { recoverNativeWallJunctionRepairs } from "../../../reviter/lib/reviter/native-room-presentation.ts";
import { readIndoorProject } from "../../app/indoor-project/package";
const [input, geometryInput, output] = process.argv.slice(2);
if (!input || !geometryInput || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-resolved-geometry.ts project.zip geometry-input.json report.json",
  );
const { dataset: d } = await readIndoorProject(await readFile(input));
assert.ok(
  d.doors &&
    d.walls.length > 0 &&
    d.walls.every((w) => w.kind === "wall" || w.kind === "column"),
  "Independent clearance verification requires classified native barriers and aperture metadata; regenerate older packages first",
);
import type { RoutePath } from "../../app/indoor-project/centered-route";
const inputs: {
  start: string;
  end: string;
  edgeIds: string[];
  paths: RoutePath[];
}[] = JSON.parse(await readFile(geometryInput, "utf8"));
const byEdge = new Map(d.edges.map((e) => [e.id, e]));
let repairedJoints = 0;
const nativeByLevel = new Map(
  d.nativeLevels.map((l) => {
    const walls = d.walls.filter((w) => w.levelId === l.id),
      repairs = recoverNativeWallJunctionRepairs(
        walls,
        d.doors?.filter((v) => v.levelId === l.id) ?? [],
      );
    repairedJoints += repairs.length;
    return [
      l.id,
      {
        walls: [
          ...walls
            .filter((w) => w.kind === "wall")
            .map((w) => ({ polygon: w.ringsFeet[0] })),
          ...repairs.map((r) => ({ polygon: r.ringsFeet[0] })),
        ],
        columns: walls
          .filter((w) => w.kind === "column")
          .map((w) => ({ polygon: w.ringsFeet[0] })),
      },
    ] as const;
  }),
);
function inside(p: number[], ring: number[][]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function crossing(a: number[], b: number[], ring: number[][]) {
  const ts = [0, 1],
    dx = b[0] - a[0],
    dy = b[1] - a[1];
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
  ts.sort((a, b) => a - b);
  return ts.slice(1).some((t, i) => {
    const mid = (t + ts[i]) / 2;
    return inside([a[0] + dx * mid, a[1] + dy * mid], ring);
  });
}
const checkers = new Map<
  string,
  {
    blocked: ReturnType<typeof nativeRouteBlocker>;
    blockedT: ReturnType<typeof nativeRouteBlocker>;
  }
>();
let segments = 0,
  paths = 0,
  unchangedValidatedPaths = 0,
  boundaryContacts = 0,
  recoveredApertures = 0;
const problems: {
  start: string;
  end: string;
  level: number;
  segment: number[][];
}[] = [];
for (const route of inputs) {
  const selected = new Set(route.edgeIds);
  for (const path of route.paths) {
    assert.ok(path.centered || path.sourceReason === "validated-source");
    assert.equal(
      path.levelIds.length,
      1,
      "This audit checks planar walking sections",
    );
    paths++;
    if (!path.centered) unchangedValidatedPaths++;
    const level = path.levelIds[0],
      edges = path.edgeIds.map((id: string) => byEdge.get(id)!),
      keys = new Set(edges.flatMap((e) => e.roomKeys));
    assert.ok(
      nativeByLevel.has(level),
      "The walking section needs a source native level",
    );
    const xs = path.pointsFeet.map((p) => p[0]),
      ys = path.pointsFeet.map((p) => p[1]),
      bounds = [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
      ];
    const selectedIds: string[] = [];
    const doors: RouteOpening[] = (d.doors ?? [])
      .filter((v) => {
        if (v.levelId !== level || v.state !== "connected" || !v.footprintFeet)
          return false;
        const xs = v.footprintFeet.map((p) => p[0]),
          ys = v.footprintFeet.map((p) => p[1]);
        if (
          Math.max(...xs) < bounds[0] ||
          Math.min(...xs) > bounds[2] ||
          Math.max(...ys) < bounds[1] ||
          Math.min(...ys) > bounds[3]
        )
          return false;
        if (selected.has(v.id)) {
          selectedIds.push(v.id);
          return true;
        }
        const edge = byEdge.get(v.id);
        const used =
          v.roomKeys.length === 2 &&
          v.roomKeys.every((k) => keys.has(k)) &&
          edge?.enabled &&
          edges.some((e) =>
            e.pointsFeet
              .slice(1)
              .some((p: number[], i: number) =>
                crossing(e.pointsFeet[i], p, v.footprintFeet!),
              ),
          );
        if (used) {
          recoveredApertures++;
          selectedIds.push(v.id);
        }
        return used;
      })
      .map((v) => ({
        rooms: v.roomKeys.slice(0, 2) as [string, string],
        point: v.pointFeet,
        from: v.pointFeet,
        to: v.pointFeet,
        halfWidth: 0,
        halfHeight: 0,
        footprint: v.footprintFeet!,
      }));

    const tolerant: RouteOpening[] = doors.map((v) => {
      const c = v.footprint!.reduce(
        (s: number[], p: number[]) => [
          s[0] + p[0] / v.footprint!.length,
          s[1] + p[1] / v.footprint!.length,
        ],
        [0, 0],
      );
      return {
        ...v,
        footprint: v.footprint!.map((p: number[]) => {
          const dx = p[0] - c[0],
            dy = p[1] - c[1],
            len = Math.hypot(dx, dy);
          return [
            p[0] + (dx / len) * 1e-8,
            p[1] + (dy / len) * 1e-8,
          ] as RoomPoint;
        }),
      };
    });
    // Source nativeRouteBlocker indexes openings at construction. Cache the
    // immutable aperture set; mutating an array afterwards would leave its
    // index empty and falsely report every selected doorway as a wall hit.
    const cacheKey = JSON.stringify([level, selectedIds.sort()]);
    let checks = checkers.get(cacheKey);
    if (!checks) {
      checks = {
        blocked: nativeRouteBlocker(nativeByLevel.get(level)!, doors),
        blockedT: nativeRouteBlocker(nativeByLevel.get(level)!, tolerant),
      };
      if (checkers.size >= 32) checkers.delete(checkers.keys().next().value!);
      checkers.set(cacheKey, checks);
    }
    const { blocked, blockedT } = checks;
    for (let i = 1; i < path.pointsFeet.length; i++) {
      segments++;
      const a = path.pointsFeet[i - 1],
        b = path.pointsFeet[i];
      if (blocked([a[0], a[1]], [b[0], b[1]])) {
        if (blockedT([a[0], a[1]], [b[0], b[1]]))
          problems.push({
            start: route.start,
            end: route.end,
            level,
            segment: [a, b],
          });
        else boundaryContacts++;
      }
    }
  }
}
const report = {
  input,
  scope:
    "Independently check every resolved walking section and unchanged clearance-validated source guide supplied by the room audit against native walls, columns, supported microscopic junction barriers and only selected/source-used native aperture footprints. Other preserved source sections and physical passage-width certification are outside this report.",
  checkedRoutes: inputs.length,
  checkedPaths: paths,
  checkedNewResolvedPaths: paths - unchangedValidatedPaths,
  checkedUnchangedValidatedPaths: unchangedValidatedPaths,
  checkedSegments: segments,
  repairedJoints,
  recoveredInternalApertureUses: recoveredApertures,
  nativeObstacleCrossings: problems.length,
  strictApertureBoundaryContacts: boundaryContacts,
  apertureBoundaryToleranceFeet: 1e-8,
  problems,
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log({ ...report, problems: problems.slice(0, 8) });
assert.equal(problems.length, 0);
