import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { readProjectPackage } from "../../../reviter/lib/reviter/project-package.ts";
import { architecturalPlanGeometry } from "../../../reviter/lib/reviter/architectural-plan.ts";
import { directoryDoors } from "../../../reviter/lib/reviter/directory-navigation.ts";
import { recoverNativeWallJunctionRepairs } from "../../../reviter/lib/reviter/native-room-presentation.ts";
import {
  containsDirectoryRoomPoint,
  nativeRouteBlocker,
  type RoomPoint,
  type RouteOpening,
} from "../../../reviter/lib/reviter/room-directory.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import { projectRoutingGraph } from "../../app/indoor-project/routing-graph";
import { walkPassages } from "../../app/indoor-project/route-passages";
import {
  nativeSlabsCoverSegment,
  type FloorPolygon,
} from "./native-floor-proof";

const [beforePath, afterPath, cachePath, output] = process.argv.slice(2);
if (!beforePath || !afterPath || !cachePath || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-connectivity-recovery.ts before.zip after.zip exact-model-native-cache.json proof.json",
  );
const beforeBytes = await readFile(beforePath),
  afterBytes = await readFile(afterPath);
const beforePkg = await readProjectPackage(beforeBytes),
  afterPkg = await readProjectPackage(afterBytes);
assert.ok(beforePkg.indoor && afterPkg.indoor);
const before = beforePkg.indoor as IndoorDataset,
  after = afterPkg.indoor as IndoorDataset;
const cache = JSON.parse(await readFile(cachePath, "utf8")) as {
  sourceModelSha256: string;
  nativeModel: ConvertResult;
};
assert.equal(cache.sourceModelSha256, after.source.modelSha256);
assert.equal(cache.nativeModel.fileName, after.source.modelFileName);
assert.deepEqual(
  before.source,
  after.source,
  "Source identity and original annotations are unchanged",
);
assert.deepEqual(
  beforePkg.rooms,
  afterPkg.rooms,
  "Room labels, outlines and explicit reviewed route points preserved",
);
const originalZip = unzipSync(beforeBytes),
  newZip = unzipSync(afterBytes),
  assets = [];
for (const path of Object.keys(originalZip).filter(
  (p) => !p.startsWith("viewer/") && !/manifest\.json$/.test(p),
)) {
  assert.ok(newZip[path], `Preserve source asset ${path}`);
  const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
  const hash = sha(originalZip[path]);
  assert.equal(
    sha(newZip[path]),
    hash,
    `Original source asset byte preservation: ${path}`,
  );
  assets.push({ path, sha256: hash });
}
const portableSource = (data: IndoorDataset) =>
  data.records.map(({ arrivalNodeId, properties, ...record }) => {
    const { arrivalRecovery, ...sourceProperties } = properties;
    return { ...record, properties: sourceProperties };
  });
assert.deepEqual(
  portableSource(before),
  portableSource(after),
  "Portable source room polygons and label properties unchanged apart from allowed arrival recovery metadata",
);
assert.deepEqual(before.floors, after.floors);
assert.deepEqual(before.nativeLevels, after.nativeLevels);
assert.deepEqual(
  before.walls,
  after.walls,
  "Native walls and columns preserved",
);
const stairGeometry = (display: IndoorDataset["stairDisplay"]) =>
  display
    ? {
        ...display,
        flights: display.flights.map((f) => ({
          ...f,
          treads: f.treads.map(({ thicknessFeet, ...t }) => t),
        })),
      }
    : undefined;
assert.deepEqual(
  stairGeometry(before.stairDisplay),
  stairGeometry(after.stairDisplay),
  "Every native stair identity, tread plan geometry and elevation is preserved",
);
const nativeCarriers = new Map(
  cache.nativeModel.elementBounds.map((e) => [e.elementId, e]),
);
const addedNativeThicknessRecords: {
  flightIndex: number;
  treadIndex: number;
  runElementId: number;
  nativeUniqueId: string | null;
  thicknessFeet: number;
}[] = [];
const changedNativeThicknessRecords: {
  flightIndex: number;
  treadIndex: number;
  runElementId: number;
  before: number;
  after: number;
}[] = [];
for (const [flightIndex, flight] of (
  after.stairDisplay?.flights ?? []
).entries())
  for (const [treadIndex, tread] of flight.treads.entries()) {
    const old =
      before.stairDisplay!.flights[flightIndex].treads[treadIndex]
        .thicknessFeet;
    if (old === tread.thicknessFeet) continue;
    assert.ok(
      tread.thicknessFeet != null,
      "Native tread thickness is never removed",
    );
    assert.equal(
      tread.thicknessFeet,
      nativeCarriers.get(tread.runElementId)?.stairTreadThicknessFeet,
      "Every added/changed thickness exactly matches its bound native run carrier",
    );
    if (old == null)
      addedNativeThicknessRecords.push({
        flightIndex,
        treadIndex,
        runElementId: tread.runElementId,
        nativeUniqueId:
          cache.nativeModel.nativeIdentity?.identities.find(
            (i) => i.elementId === tread.runElementId,
          )?.uniqueId ?? null,
        thicknessFeet: tread.thicknessFeet,
      });
    else
      changedNativeThicknessRecords.push({
        flightIndex,
        treadIndex,
        runElementId: tread.runElementId,
        before: old,
        after: tread.thicknessFeet,
      });
  }

const oldDoorEdges = before.edges.filter((e) => e.kind === "door"),
  newDoorEdges = after.edges.filter(
    (e) => e.kind === "door" && !oldDoorEdges.some((old) => old.id === e.id),
  );
assert.ok(
  oldDoorEdges.every((old) =>
    after.edges.some(
      (e) => e.id === old.id && e.kind === "door" && e.enabled === old.enabled,
    ),
  ),
  "No existing native door link lost",
);
const originals = new Map(before.records.map((r) => [r.key, r])),
  records = new Map(after.records.map((r) => [r.key, r])),
  annotations = new Map(afterPkg.rooms.annotations.map((r) => [r.key, r])),
  nodes = new Map(after.nodes.map((n) => [n.id, n]));
const identities = new Map(
    cache.nativeModel.nativeIdentity?.identities.map((v) => [
      v.elementId,
      v.uniqueId,
    ]),
  ),
  hosts = new Map(
    cache.nativeModel.nativeHostRelations?.map((v) => [v.elementId, v.hostId]),
  );
const graph = projectRoutingGraph(after, "public"),
  passages = walkPassages(after);
const geometryCache = new Map<
    number,
    ReturnType<typeof architecturalPlanGeometry>
  >(),
  doorCache = new Map<number, ReturnType<typeof directoryDoors>>(),
  jointCache = new Map<
    number,
    ReturnType<typeof recoverNativeWallJunctionRepairs>
  >();
function levelGeometry(levelId: number) {
  if (!geometryCache.has(levelId)) {
    const g = architecturalPlanGeometry(cache.nativeModel, levelId),
      doors = directoryDoors(cache.nativeModel, levelId);
    geometryCache.set(levelId, g);
    doorCache.set(levelId, doors);
    const nativeWalls = [
      ...g.walls.map((w) => ({ ...w, kind: "wall" as const })),
      ...g.columns.map((w) => ({ ...w, kind: "column" as const })),
    ]
      .filter((w) => w.polygon.length >= 3)
      .map((w) => ({
        levelId,
        nativeElementId: w.elementId,
        kind: w.kind,
        approximate: w.approximate,
        ringsFeet: [w.polygon],
      }));
    const nativeDoors = doors.map((d) => ({
      id: `door:${levelId}:${d.id}`,
      levelId,
      nativeElementId: d.id,
      pointFeet: d.point,
      footprintFeet: d.footprint,
      roomKeys: [],
      state: "unmatched" as const,
    }));
    jointCache.set(
      levelId,
      recoverNativeWallJunctionRepairs(nativeWalls, nativeDoors),
    );
  }
  return geometryCache.get(levelId)!;
}
const failures: {
  context: string;
  edgeId?: string;
  levelId: number;
  segment?: number;
  reason: string;
  a?: RoomPoint;
  b?: RoomPoint;
}[] = [];
let checkedSegments = 0,
  floorSegments = 0;
function checkEdges(
  context: string,
  edges: IndoorEdge[],
  strictNativeFloor: boolean,
) {
  let segments = 0;
  for (const edge of edges) {
    const levelId = nodes.get(edge.from)!.levelId,
      g = levelGeometry(levelId);
    const relevantDoorIds = new Set([
      ...(edge.kind === "door" ? [edge.id] : []),
      ...(passages.get(edge.id) ?? []).map((p) => p.edge.id),
    ]);
    const enabledDoors = (after.doors ?? []).filter(
      (d) =>
        d.levelId === levelId &&
        relevantDoorIds.has(d.id) &&
        after.edges.some((e) => e.id === d.id && e.enabled),
    );
    const openings: RouteOpening[] = enabledDoors.map((d) => {
      const native = doorCache
        .get(levelId)!
        .find((n) => n.id === d.nativeElementId);
      assert.ok(
        native?.footprint,
        `Relevant aperture has exact native footprint: ${d.id}`,
      );
      assert.deepEqual(
        d.footprintFeet,
        native.footprint,
        "Portable aperture matches native source geometry",
      );
      return {
        rooms: d.roomKeys.slice(0, 2) as [string, string],
        point: native.point,
        from: native.point,
        to: native.point,
        halfWidth: 0,
        halfHeight: 0,
        footprint: native.footprint,
        normal: native.normal,
      };
    });
    const blocked = nativeRouteBlocker(
      {
        walls: [
          ...g.walls.filter((w) => w.polygon.length >= 3),
          ...jointCache.get(levelId)!.map((r) => ({ polygon: r.ringsFeet[0] })),
        ],
        columns: g.columns.filter((c) => c.polygon.length >= 3),
      },
      openings,
    );
    for (let i = 1; i < edge.pointsFeet.length; i++) {
      const a = edge.pointsFeet[i - 1].slice(0, 2) as RoomPoint,
        b = edge.pointsFeet[i].slice(0, 2) as RoomPoint;
      checkedSegments++;
      segments++;
      if (blocked(a, b))
        failures.push({
          context,
          edgeId: edge.id,
          levelId,
          segment: i,
          reason: "native-wall-column-or-proved-joint",
          a,
          b,
        });
      if (strictNativeFloor) {
        floorSegments++;
        if (
          !nativeSlabsCoverSegment(
            a,
            b,
            g.floors.filter((f) => f[0]?.length >= 3) as FloorPolygon[],
          )
        )
          failures.push({
            context,
            edgeId: edge.id,
            levelId,
            segment: i,
            reason: "native-slab-unsupported-interval-or-hole",
            a,
            b,
          });
      }
    }
  }
  return segments;
}
function savedBfs(
  start: string,
  end: string,
  allowed: Set<string>,
  levelId: number,
  exclude?: string,
) {
  const queue = [start],
    previous = new Map<string, { from: string; edge: IndoorEdge }>(),
    seen = new Set(queue);
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head];
    if (from === end) break;
    for (const link of graph.adjacency.get(from) ?? []) {
      if (
        link.edge.id === exclude ||
        seen.has(link.to) ||
        !["walk", "door", "opening"].includes(link.edge.kind) ||
        nodes.get(link.to)?.levelId !== levelId ||
        link.requiredRooms.some((k) => !allowed.has(k))
      )
        continue;
      seen.add(link.to);
      previous.set(link.to, { from, edge: link.edge });
      queue.push(link.to);
    }
  }
  if (!seen.has(end)) return null;
  const edges: IndoorEdge[] = [];
  for (let at = end; at !== start; ) {
    const p = previous.get(at)!;
    edges.push(p.edge);
    at = p.from;
  }
  return edges.reverse();
}
const doorCases = [];
for (const edge of newDoorEdges) {
  const a = records.get(edge.roomKeys[0])!,
    b = records.get(edge.roomKeys[1])!,
    levelId = nodes.get(edge.from)!.levelId;
  assert.ok(
    a && b,
    `New native door ${edge.id} has both source room identities`,
  );
  const allowed = new Set([a.key, b.key]);
  for (const reverse of [false, true]) {
    const start = reverse ? b : a,
      end = reverse ? a : b,
      from = reverse ? edge.to : edge.from,
      to = reverse ? edge.from : edge.to;
    const admitted = graph.adjacency
      .get(from)
      ?.some((link) => link.to === to && link.edge.id === edge.id);
    assert.ok(
      admitted,
      `New native link admitted by public graph in direction ${start.number} to ${end.number}`,
    );
    const first = savedBfs(
        start.arrivalNodeId!,
        from,
        allowed,
        levelId,
        edge.id,
      ),
      last = savedBfs(to, end.arrivalNodeId!, allowed, levelId, edge.id);
    assert.ok(
      first && last,
      `Both actual saved room branches exercise restored door: ${edge.id}`,
    );
    const journey = [...first, edge, ...last],
      segments = checkEdges(`${start.number} to ${end.number}`, journey, false);
    doorCases.push({
      edgeId: edge.id,
      nativeDoorId: edge.nativeElementId,
      nativeUniqueId: identities.get(edge.nativeElementId!),
      nativeHostId: hosts.get(edge.nativeElementId!),
      start: start.number,
      end: end.number,
      startHasPreparedArrival: !!start.arrivalNodeId,
      endHasPreparedArrival: !!end.arrivalNodeId,
      exerciseType:
        start.arrivalNodeId && end.arrivalNodeId
          ? "complete-arrival-to-arrival-saved-journey"
          : "native-door-side-exercise-with-unsupported-endpoint-retained",
      levelId,
      walkingEdgeIds: journey.map((e) => e.id),
      checkedSegments: segments,
    });
  }
}
const newArrivals = after.records.filter(
    (r) => r.arrivalNodeId && !originals.get(r.key)?.arrivalNodeId,
  ),
  arrivalCases = [];
for (const room of newArrivals) {
  const node = nodes.get(room.arrivalNodeId!)!,
    annotation = annotations.get(room.key)!;
  const recovery = room.properties.arrivalRecovery as
    | {
        sourcePointFeet: RoomPoint;
        pointFeet: RoomPoint;
        entranceId: string;
        displacementFeet: number;
        evidence: string;
      }
    | undefined;
  let seedId: string | undefined,
    branch: IndoorEdge[] | null = null;
  if (recovery) {
    assert.equal(
      annotation.routePointFeet,
      undefined,
      "Recovered drawing-label arrival never overrides explicit user route point",
    );
    assert.deepEqual(
      recovery.sourcePointFeet,
      annotation.labelPointFeet,
      "Arrival recovery retains exact original drawing label",
    );
    assert.deepEqual(
      recovery.pointFeet,
      node.pointFeet.slice(0, 2),
      "Recovery point matches saved arrival",
    );
    assert.equal(
      recovery.evidence,
      "room-contained native-floor-supported entrance path",
    );
    assert.ok(
      containsDirectoryRoomPoint(recovery.pointFeet, annotation),
      "Recovered arrival belongs to original room",
    );
    seedId = recovery.entranceId;
    assert.ok(
      nodes.has(seedId),
      "Recovery references actual saved entrance node",
    );
    branch = after.edges.filter(
      (e) =>
        e.enabled &&
        e.kind === "walk" &&
        ((e.from === seedId && e.to === node.id) ||
          (e.to === seedId && e.from === node.id)),
    );
    assert.ok(branch.length, "Explicit saved BFS entrance-to-arrival branch");
  } else {
    const candidates = after.nodes.filter(
      (n) =>
        n.roomKey === room.key &&
        n.kind !== "arrival" &&
        n.levelId === room.levelId,
    );
    for (const seed of candidates) {
      const found = savedBfs(
        seed.id,
        node.id,
        new Set([room.key]),
        room.levelId,
      );
      if (found?.length) {
        seedId = seed.id;
        branch = found;
        break;
      }
    }
    assert.ok(
      branch,
      `New arrival ${room.number} has actual saved walking branch to a native entrance`,
    );
  }
  const segments = checkEdges(`new arrival ${room.number}`, branch!, true);
  if (recovery)
    for (const edge of branch!)
      for (let i = 1; i < edge.pointsFeet.length; i++)
        assert.ok(
          nativeSlabsCoverSegment(
            edge.pointsFeet[i - 1].slice(0, 2) as RoomPoint,
            edge.pointsFeet[i].slice(0, 2) as RoomPoint,
            [
              [
                annotation.polygonFeet,
                ...(annotation.holesFeet ?? []),
                ...(annotation.floorOpeningsFeet ?? []),
              ],
            ],
          ),
          "Complete recovered BFS branch stays inside original source room and outside its holes/openings",
        );
  if (recovery)
    for (const e of branch!)
      for (const p of e.pointsFeet)
        assert.ok(
          containsDirectoryRoomPoint(p.slice(0, 2) as RoomPoint, annotation),
          "Recovered BFS points remain in the source room",
        );
  arrivalCases.push({
    roomKey: room.key,
    number: room.number,
    name: room.name,
    levelId: room.levelId,
    sourceLabelPointFeet: annotation.labelPointFeet,
    arrivalPointFeet: node.pointFeet,
    entranceNodeId: seedId,
    recovery: recovery ?? null,
    walkingEdgeIds: branch!.map((e) => e.id),
    checkedSegments: segments,
    nativeSlabCount: levelGeometry(room.levelId).floors.length,
  });
}
const result = {
  version: 1,
  source: after.source,
  beforePath,
  afterPath,
  sourceAssetsByteIdentical: true,
  sourcePreservationFailureCount: 0,
  preservedAssets: assets,
  sourceAnnotationsAndRoomGeometryPreserved: true,
  nativeWallsColumnsFloorsPreserved: true,
  nativeStairGeometryPreserved: true,
  nativeStairDisplayUpdated:
    addedNativeThicknessRecords.length + changedNativeThicknessRecords.length >
    0,
  nativeThicknessEvidenceValidated: true,
  nativeStairDisplayMetadataUnchanged:
    JSON.stringify(before.stairDisplay) === JSON.stringify(after.stairDisplay),
  addedNativeThicknessRecordCount: addedNativeThicknessRecords.length,
  changedNativeThicknessRecordCount: changedNativeThicknessRecords.length,
  addedNativeThicknessRecords,
  changedNativeThicknessRecords,
  existingNativeDoorLinksLost: 0,
  newNativeDoorLinks: newDoorEdges.length,
  newDoorDirectionCases: doorCases.length,
  newArrivalCount: newArrivals.length,
  newArrivalRecoveryCount: arrivalCases.filter((r) => r.recovery).length,
  checkedSavedSegments: checkedSegments,
  independentNativeSlabSegments: floorSegments,
  nativeJunctionsChecked: [...jointCache.values()].reduce(
    (n, v) => n + v.length,
    0,
  ),
  geometryFailureCount: failures.length,
  doorCases,
  arrivalCases,
  failures,
  scope:
    "Every new native door exercised in both public graph directions on actual saved entrance branches. Every new arrival branch checked against continuous coverage by original native slab polygons including holes, original native wall/column geometry and proved native junctions. Only exact native apertures for the selected saved edge and its actual doorway dependencies are permitted. This is geometry evidence, not public access or physical clearance certification.",
};
await writeFile(output, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      ...result,
      doorCases: undefined,
      arrivalCases: undefined,
      preservedAssets: undefined,
      addedNativeThicknessRecords: undefined,
      changedNativeThicknessRecords: undefined,
      failures: failures.slice(0, 10),
    },
    null,
    2,
  ),
);
assert.equal(
  failures.length,
  0,
  "All new saved branches pass independent native geometry proof; inspect the saved failure report",
);
