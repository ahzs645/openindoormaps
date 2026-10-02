import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { readIndoorProject } from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import {
  nativeRouteBlocker,
  type RoomPoint,
  type RouteOpening,
} from "../../../reviter/lib/reviter/room-directory.ts";
import { recoverNativeWallJunctionRepairs } from "../../../reviter/lib/reviter/native-room-presentation.ts";
const [beforePath, afterPath, nativeCachePath, output] = process.argv.slice(2);
if (!beforePath || !afterPath || !nativeCachePath || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-native-door-axis.ts before.zip after.zip model-bound-cache.json report.json",
  );
const beforeBytes = await readFile(beforePath),
  afterBytes = await readFile(afterPath);
const before = (await readIndoorProject(beforeBytes)).dataset,
  after = (await readIndoorProject(afterBytes)).dataset;
assert.equal(before.source.modelSha256, after.source.modelSha256);
assert.equal(before.source.roomsSha256, after.source.roomsSha256);
const cache = JSON.parse(await readFile(nativeCachePath, "utf8"));
assert.equal(cache.sourceModelSha256, after.source.modelSha256);
assert.equal(cache.nativeModel.fileName, after.source.modelFileName);
const identity = new Map<number, string>(
  (cache.nativeModel.nativeIdentity?.identities ?? []).map(
    (v: { elementId: number; uniqueId: string }) => [v.elementId, v.uniqueId],
  ),
);
const hosts = new Map<number, number>(
  (cache.nativeModel.nativeHostRelations ?? []).map(
    (v: { elementId: number; hostId: number }) => [v.elementId, v.hostId],
  ),
);
const originalZip = unzipSync(beforeBytes),
  newZip = unzipSync(afterBytes);
const sha = async (bytes: Uint8Array) =>
  Buffer.from(
    await crypto.subtle.digest("SHA-256", [...bytes].buffer),
  ).toString("hex");
const preservedAssets = [];
for (const path of Object.keys(originalZip).filter(
  (p) => !p.startsWith("viewer/") && !/manifest\.json$/.test(p),
)) {
  assert.ok(newZip[path], `Preserve source asset ${path}`);
  const oldHash = await sha(originalZip[path]),
    newHash = await sha(newZip[path]);
  assert.equal(newHash, oldHash, `Changed original source asset ${path}`);
  preservedAssets.push({ path, sha256: newHash });
}
const originalEdges = new Set(before.edges.map((e) => e.id)),
  restored = after.edges.filter(
    (e) => e.kind === "door" && !originalEdges.has(e.id),
  );
assert.ok(
  restored.length > 0,
  "The regenerated example must actually recover a source connection",
);
assert.ok(
  before.edges
    .filter((e) => e.kind === "door")
    .every((e) => after.edges.some((n) => n.id === e.id)),
  "No existing native door link lost",
);
const records = new Map(after.records.map((r) => [r.key, r]));
const cases = [];
for (const edge of restored) {
  const a = records.get(edge.roomKeys[0])!,
    b = records.get(edge.roomKeys[1])!,
    door = after.doors!.find((v) => v.id === edge.id)!;
  assert.ok(door.normalFeet);
  const [nx, ny] = door.normalFeet,
    projectWidth = (p: readonly number[]) => -ny * p[0] + nx * p[1],
    widths = door.footprintFeet!.map(projectWidth);
  const widthsRange = [Math.min(...widths), Math.max(...widths)];
  for (const p of edge.pointsFeet)
    assert.ok(
      projectWidth(p) >= widthsRange[0] - 1e-7 &&
        projectWidth(p) <= widthsRange[1] + 1e-7,
      "Actual side anchor remains inside native jamb width",
    );
  const walls = after.walls.filter((w) => w.levelId === door.levelId),
    repairs = recoverNativeWallJunctionRepairs(
      walls,
      after.doors!.filter((v) => v.levelId === door.levelId),
    );
  const openings: RouteOpening[] = after
    .doors!.filter(
      (v) =>
        v.levelId === door.levelId &&
        v.state === "connected" &&
        v.footprintFeet &&
        after.edges.some((e) => e.id === v.id && e.enabled),
    )
    .map((v) => ({
      rooms: v.roomKeys.slice(0, 2) as [string, string],
      point: v.pointFeet,
      from: v.pointFeet,
      to: v.pointFeet,
      halfWidth: 0,
      halfHeight: 0,
      footprint: v.footprintFeet,
    }));
  const blocked = nativeRouteBlocker(
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
  for (const reverse of [false, true]) {
    const start = reverse ? b : a,
      end = reverse ? a : b,
      route = findProjectRoute(after, start.key, end.key);
    assert.ok(route, `${start.number} to ${end.number}`);
    assert.ok(
      route.edges.some((e) => e.id === edge.id),
      "Exercise the restored native link",
    );
    let segments = 0;
    for (const path of route.paths.filter(
      (p) => p.levelIds.length === 1 && p.levelIds[0] === door.levelId,
    ))
      for (let i = 1; i < path.pointsFeet.length; i++) {
        const a = path.pointsFeet[i - 1],
          b = path.pointsFeet[i];
        segments++;
        assert.equal(
          blocked([a[0], a[1]] as RoomPoint, [b[0], b[1]] as RoomPoint),
          false,
          "Displayed flat route crosses a native barrier",
        );
      }
    const steps = projectNavigationSteps(
      after,
      route,
      start.number,
      end.number,
    );
    assert.equal(steps.at(-1)?.levelId, end.levelId);
    assert.equal(
      findProjectRoute(after, start.key, end.key, "accessible"),
      null,
      "Unknown geometry/access reviews remain unapproved",
    );
    const previous = findProjectRoute(before, start.key, end.key);
    cases.push({
      nativeDoorId: door.nativeElementId,
      nativeUniqueId: identity.get(door.nativeElementId),
      nativeHostId: hosts.get(door.nativeElementId),
      levelId: door.levelId,
      start: start.number,
      end: end.number,
      beforeAvailable: !!previous,
      beforeMetres: previous?.distanceMetres,
      afterMetres: route.distanceMetres,
      checkedFlatSegments: segments,
      widthFeet: widthsRange[1] - widthsRange[0],
      normalFeet: door.normalFeet,
      edgePointsFeet: edge.pointsFeet,
      footprintFeet: door.footprintFeet,
    });
  }
}
const stripArrivals = (data: typeof before) =>
  data.records.map(({ arrivalNodeId, ...r }) => r);
assert.deepEqual(stripArrivals(after), stripArrivals(before));
assert.deepEqual(after.floors, before.floors);
assert.deepEqual(after.stairDisplay, before.stairDisplay);
assert.deepEqual(
  after.walls.map(({ approximate, ...w }) => w),
  before.walls.map(({ approximate, ...w }) => w),
);
const result = {
  source: after.source,
  beforePath,
  afterPath,
  preservedAssets,
  sourceRoomGeometryUnchanged: true,
  nativeWallFootprintsUnchanged: true,
  nativeStairDisplayUnchanged: true,
  sourceFloorsUnchanged: true,
  restoredNativeDoors: restored.length,
  cases: cases.length,
  checkedFlatSegments: cases.reduce((n, c) => n + c.checkedFlatSegments, 0),
  nativeBarrierCrossings: 0,
  unknownAccessibilityRetained: true,
  rows: cases,
};
await writeFile(output, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      ...result,
      rows: cases.map(({ footprintFeet, edgePointsFeet, ...c }) => c),
    },
    null,
    2,
  ),
);
