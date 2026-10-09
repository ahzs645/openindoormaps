import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { readIndoorProject } from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import {
  nativeRouteBlocker,
  type RoomPoint,
} from "../../../reviter/lib/reviter/room-directory.ts";
import { recoverNativeWallJunctionRepairs } from "../../../reviter/lib/reviter/native-room-presentation.ts";
import {
  routingFloorPlateRecords,
  nativeFloorPolygons,
} from "../../../reviter/lib/reviter/routing-floor-support.ts";
import { nativeSlabsCoverSegment } from "./native-floor-proof";
const [zip, cachePath, output] = process.argv.slice(2);
const { dataset: data } = await readIndoorProject(await readFile(zip));
const cache = JSON.parse(await readFile(cachePath, "utf8"));
assert.equal(cache.sourceModelSha256, data.source.modelSha256);
const before = JSON.stringify(data),
  results = [];
let checkedSegments = 0;
for (const [from, to] of [
  ["06-260", "07-240"],
  ["07-240", "06-260"],
]) {
  const start = data.records.find((r) => r.number === from)!,
    end = data.records.find((r) => r.number === to)!;
  const route = findProjectRoute(data, start.key, end.key)!;
  assert.ok(route);
  const rooms = [...new Set(route.edges.flatMap((e) => e.roomKeys))].map(
    (k) => data.records.find((r) => r.key === k)!.number,
  );
  assert.ok(rooms.includes("06-S204"));
  assert.ok(rooms.includes("06-210"));
  assert.ok(
    !rooms.includes("06-205"),
    "the open circulation path must avoid Seminar room transit",
  );
  const openings = route.edges.filter((e) => e.kind === "opening");
  assert.ok(
    openings.some((e) =>
      e.roomKeys.some(
        (k) => data.records.find((r) => r.key === k)?.number === "06-S204",
      ),
    ),
  );
  for (const path of route.paths) {
    if (
      path.levelIds.length !== 1 ||
      path.pointsFeet.some((p) => Math.abs(p[2] - path.pointsFeet[0][2]) > 0.01)
    )
      continue;
    const level = path.levelIds[0],
      walls = data.walls.filter((w) => w.levelId === level),
      doors = data.doors!.filter((d) => d.levelId === level);
    const repairs = recoverNativeWallJunctionRepairs(walls, doors);
    const apertures = doors
      .filter((d) => d.footprintFeet && route.doorEdgeIds?.includes(d.id))
      .map((d) => ({
        rooms: d.roomKeys.slice(0, 2) as [string, string],
        point: d.pointFeet,
        from: d.pointFeet,
        to: d.pointFeet,
        halfWidth: 0,
        halfHeight: 0,
        footprint: d.footprintFeet!,
        normal: d.normalFeet,
      }));
    const blocked = nativeRouteBlocker(
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
      apertures,
    );
    const floors = routingFloorPlateRecords(
      cache.nativeModel,
      path.pointsFeet[0][2],
    ).flatMap((floor) =>
      nativeFloorPolygons(floor, !!data.nativeIndoorEnvelopes),
    );
    for (let i = 1; i < path.pointsFeet.length; i++) {
      const a = path.pointsFeet[i - 1].slice(0, 2) as RoomPoint,
        b = path.pointsFeet[i].slice(0, 2) as RoomPoint;
      assert.equal(
        blocked(a, b),
        false,
        `${from}: barrier in ${path.edgeIds.join(",")} segment ${i}`,
      );
      assert.ok(
        nativeSlabsCoverSegment(a, b, floors),
        `${from}: missing native floor segment ${i}`,
      );
      checkedSegments++;
    }
  }
  const steps = projectNavigationSteps(data, route, from, to);
  results.push({
    from,
    to,
    distanceMetres: route.distanceMetres,
    rooms,
    openings: openings.map((e) => ({ id: e.id, hasSpan: !!e.openingSpan })),
    turns: steps.filter((s) => s.type === "turn").length,
    curvedSections: route.paths.filter((p) => p.shape === "curved").length,
    finalLevel: steps.at(-1)!.levelId,
  });
}
assert.equal(JSON.stringify(data), before);
await writeFile(
  output,
  JSON.stringify(
    {
      zip,
      modelSha256: data.source.modelSha256,
      checkedSegments,
      nativeBarrierFailures: 0,
      nativeFloorCoverageFailures: 0,
      sourceDatasetUnchanged: true,
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ checkedSegments, results }, null, 2));
