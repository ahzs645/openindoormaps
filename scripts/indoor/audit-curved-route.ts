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
import { routingFloorPlateRecords } from "../../../reviter/lib/reviter/routing-floor-support.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import { nativeSlabsCoverSegment } from "./native-floor-proof";
const [zip, cachePath, output] = process.argv.slice(2);
if (!output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-curved-route.ts project.zip exact-native-cache.json report.json",
  );
const { dataset: data } = await readIndoorProject(await readFile(zip));
const cache = JSON.parse(await readFile(cachePath, "utf8")) as {
  sourceModelSha256: string;
  nativeModel: ConvertResult;
};
assert.equal(cache.sourceModelSha256, data.source.modelSha256);
const original = JSON.stringify(data);
const results = [];
let checkedSegments = 0;
for (const [from, to] of [
  ["06-260", "06-204"],
  ["06-204", "06-260"],
  ["06-260", "07-240"],
  ["07-240", "06-260"],
  ["05-120", "05-165"],
  ["05-165", "05-120"],
]) {
  const start = data.records.find((r) => r.number === from)!,
    end = data.records.find((r) => r.number === to)!;
  assert.ok(start && end);
  const route = findProjectRoute(data, start.key, end.key);
  assert.ok(route, `${from} → ${to} exists`);
  const curve = route.paths.find((p) => p.shape === "curved");
  if (from === "06-260" || to === "06-260")
    assert.ok(
      curve,
      "The actual lobby bend must consume curvature evidence in both directions.",
    );
  else
    assert.ok(!curve, "The straight Library corridor keeps its native axes.");
  for (const path of route.paths.filter((p) => p.centered)) {
    const level = path.levelIds[0];
    const walls = data.walls.filter((w) => w.levelId === level);
    const doors = data.doors!.filter((d) => d.levelId === level);
    const repairs = recoverNativeWallJunctionRepairs(walls, doors);
    const openings = doors
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
      openings,
    );
    const floors = routingFloorPlateRecords(
      cache.nativeModel,
      path.pointsFeet[0][2],
    ).map((r) =>
      r.loops!.map((loop) => loop.map((p) => [p[0], p[1]] as RoomPoint)),
    );
    for (let i = 1; i < path.pointsFeet.length; i++) {
      const a = path.pointsFeet[i - 1].slice(0, 2) as RoomPoint,
        b = path.pointsFeet[i].slice(0, 2) as RoomPoint;
      assert.equal(
        blocked(a, b),
        false,
        `${from} → ${to}: native wall/column at segment ${i}`,
      );
      if (path.shape === "curved" && path.nativeCirculationUsed) {
        const cells = data
          .circulationGeometry!.cells.filter(
            (c) =>
              c.levelIds.includes(level) &&
              Math.abs(c.elevationFeet - path.pointsFeet[0][2]) < 0.05,
          )
          .map((c) => c.ringsFeet);
        assert.ok(
          nativeSlabsCoverSegment(a, b, cells),
          `${from} → ${to}: whole segment stays inside native circulation cells`,
        );
      }
      assert.ok(
        nativeSlabsCoverSegment(a, b, floors),
        `${from} → ${to}: whole native floor coverage at segment ${i}`,
      );
      checkedSegments++;
    }
  }
  const steps = projectNavigationSteps(data, route, from, to);
  let maximumCurveAngleDegrees = 0;
  for (const path of route.paths)
    for (const range of path.curveRanges ?? []) {
      for (
        let i = Math.max(1, range.start);
        i <= Math.min(range.end, path.pointsFeet.length - 2);
        i++
      ) {
        const [a, b, c] = path.pointsFeet.slice(i - 1, i + 2);
        const u = [b[0] - a[0], b[1] - a[1]],
          v = [c[0] - b[0], c[1] - b[1]];
        maximumCurveAngleDegrees = Math.max(
          maximumCurveAngleDegrees,
          (Math.abs(
            Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]),
          ) *
            180) /
            Math.PI,
        );
      }
    }
  if (from === "06-204" || to === "06-204") {
    assert.ok(
      maximumCurveAngleDegrees < 3,
      "Pantry route has tangent approaches and a continuous bend without side steps",
    );
    assert.equal(
      steps.filter((s) => s.message === "Follow the curved corridor").length,
      1,
    );
    assert.equal(
      route.paths.filter((p) => p.sourceReason === "source-opening").length,
      0,
      "Semantic corridor seams do not become physical door turns",
    );
    for (const edge of route.edges.filter((e) => e.kind === "door"))
      assert.ok(
        route.paths.some(
          (p) =>
            p.edgeIds.includes(edge.id) &&
            JSON.stringify(p.pointsFeet) ===
              JSON.stringify(
                edge.from === route.nodeIds[route.edges.indexOf(edge)]
                  ? edge.pointsFeet
                  : [...edge.pointsFeet].reverse(),
              ),
        ),
        "Real native doorway geometry is preserved",
      );
  }
  results.push({
    from,
    to,
    distanceMetres: route.distanceMetres,
    unknownAccessAreas: route.unknownAccessAreas.length,
    selectedDoors: route.doorEdgeIds,
    verticalEdges: route.edges
      .filter((e) =>
        ["stairs", "elevator", "ramp", "escalator", "local-steps"].includes(
          e.kind,
        ),
      )
      .map((e) => e.id),
    curvedPoints: curve?.pointsFeet.length ?? 0,
    maximumCurveAngleDegrees,
    curveRanges: curve?.curveRanges,
    turnInstructions: steps.filter((s) => s.type === "turn").length,
    curveInstructions: steps.filter(
      (s) => s.message === "Follow the curved corridor",
    ).length,
    finalLevel: steps.at(-1)!.levelId,
  });
}
assert.equal(
  JSON.stringify(data),
  original,
  "Route resolution must not mutate source geometry/access/graph.",
);
const report = {
  zip,
  modelSha256: data.source.modelSha256,
  checkedSegments,
  nativeBarrierFailures: 0,
  nativeFloorCoverageFailures: 0,
  sourceDatasetUnchanged: true,
  results,
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
