import {
  nativeRouteBlocker,
  type RoomPoint,
  type RouteOpening,
} from "../../../reviter/lib/reviter/room-directory.ts";
import { recoverNativeWallJunctionRepairs } from "../../../reviter/lib/reviter/native-room-presentation.ts";
import { readFile, writeFile } from "node:fs/promises";
import { readIndoorProject } from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
const [beforePath, afterPath, output] = process.argv.slice(2);
if (!beforePath || !afterPath || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-complex-routes.ts before.zip after.zip output.json",
  );
const before = (await readIndoorProject(await readFile(beforePath))).dataset;
const after = (await readIndoorProject(await readFile(afterPath))).dataset;
const cases = JSON.parse(
  await readFile(
    new URL("../../tests/fixtures/unbc-indoor-routes.json", import.meta.url),
    "utf8",
  ),
);
for (const num of [
  "10-1001",
  "10-1524",
  "10-2018",
  "10-2508",
  "10-3006",
  "10-3520",
  "10-3610",
  "10-4018",
])
  cases.push({
    name: `Ordinary room to ${num}`,
    start: { number: "10-1018" },
    end: { number: num },
  });
cases.push(
  {
    name: "Library to west ordinary room",
    start: { number: "05-120", levelId: 311 },
    end: { number: "05-183", levelId: 311 },
  },
  {
    name: "Building 10 OT Office to Agora washroom via recovered drawing doorway",
    start: { number: "10-1016", levelId: 1_487_816 },
    end: { number: "07-244", levelId: 311 },
  },
);
const rows = [];
const blockerCache = new WeakMap<
  typeof before,
  Map<number, ReturnType<typeof nativeRouteBlocker>>
>();
const blockerFor = (data: typeof before, level: number) => {
  let levels = blockerCache.get(data);
  if (!levels) {
    levels = new Map();
    blockerCache.set(data, levels);
  }
  let blocker = levels.get(level);
  if (blocker) return blocker;
  const walls = data.walls.filter((w) => w.levelId === level);
  const repairs = recoverNativeWallJunctionRepairs(
    walls,
    data.doors?.filter((d) => d.levelId === level) ?? [],
  );
  const openings: RouteOpening[] =
    data.doors
      ?.filter(
        (d) =>
          d.levelId === level &&
          d.state === "connected" &&
          d.footprintFeet &&
          data.edges.some((e) => e.id === d.id && e.enabled),
      )
      .map((d) => ({
        rooms: d.roomKeys.slice(0, 2) as [string, string],
        point: d.pointFeet as RoomPoint,
        from: d.pointFeet as RoomPoint,
        to: d.pointFeet as RoomPoint,
        halfWidth: 0,
        halfHeight: 0,
        footprint: d.footprintFeet,
      })) ?? [];
  blocker = nativeRouteBlocker(
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
  );
  levels.set(level, blocker);
  return blocker;
};
for (const c of cases)
  for (const reverse of [false, true]) {
    console.error(`Checking ${c.name} (${reverse ? "reverse" : "forward"})`);
    const match = (
      data: typeof before,
      selector: { key?: string; number?: string; levelId?: number },
    ) =>
      data.records.find((r) =>
        selector.key
          ? r.key === selector.key
          : r.number === selector.number &&
            (selector.levelId === undefined || r.levelId === selector.levelId),
      );
    const summarize = (data: typeof before) => {
      let a = match(data, c.start),
        b = match(data, c.end);
      if (reverse) [a, b] = [b, a];
      if (!a || !b)
        return { available: false, reason: "source-location-missing" };
      const r = findProjectRoute(data, a.key, b.key);
      if (!r) return { available: false, reason: "no-source-connection" };
      let resolvedWalkingSegments = 0,
        nativeBarrierViolations = 0;
      for (const path of r.paths.filter((p) => p.levelIds.length === 1)) {
        const blocked = blockerFor(data, path.levelIds[0]);
        for (let i = 1; i < path.pointsFeet.length; i++) {
          resolvedWalkingSegments++;
          if (
            blocked(
              path.pointsFeet[i - 1].slice(0, 2) as RoomPoint,
              path.pointsFeet[i].slice(0, 2) as RoomPoint,
            )
          )
            nativeBarrierViolations++;
        }
      }
      return {
        available: true,
        resolvedWalkingSegments,
        nativeBarrierViolations,
        metres: r.distanceMetres,
        sourceMetres: r.sourceDistanceMetres,
        turnInstructions: projectNavigationSteps(data, r, a.key, b.key).filter(
          (s) => s.type === "turn",
        ).length,
        walkingCorners: r.paths
          .filter(
            (p) =>
              p.levelIds.length === 1 &&
              p.edgeIds.every(
                (id) =>
                  r.edges.find((e) => e.id === id)?.kind === "walk" ||
                  r.edges.find((e) => e.id === id)?.kind === "door",
              ),
          )
          .reduce((n, p) => n + Math.max(0, p.pointsFeet.length - 2), 0),
        uncenteredWalkingCorners: r.paths
          .filter((p) => !p.centered && p.levelIds.length === 1)
          .reduce((n, p) => n + Math.max(0, p.pointsFeet.length - 2), 0),
        floors: [...new Set(r.paths.flatMap((p) => p.levelIds))],
        flights: r.edges.filter((e) => e.kind === "stairs").length,
      };
    };
    rows.push({
      name: c.name,
      reverse,
      before: summarize(before),
      after: summarize(after),
    });
  }
const result = {
  generatedAt: new Date().toISOString(),
  beforePath,
  afterPath,
  scope:
    "19 concrete campus route pairs in both directions, including Building 10 to Agora. Source walking safety independently checked by audit-walking-geometry. Every realized flat segment is independently checked against native walls/columns plus proved native joints and enabled precise door footprints. Stair flights are retained independently.",
  cases: rows.length,
  availableBefore: rows.filter((r) => r.before.available).length,
  availableAfter: rows.filter((r) => r.after.available).length,
  rows,
};
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
