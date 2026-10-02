import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readIndoorProject } from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import {
  nativeRouteBlocker,
  type RoomPoint,
  type RouteOpening,
} from "../../../reviter/lib/reviter/room-directory.ts";
const [beforePath, afterPath, output] = process.argv.slice(2);
if (!beforePath || !afterPath || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-navigation-upgrade.ts before.zip after.zip output.json",
  );
const cases = JSON.parse(
  await readFile(
    new URL("../../tests/fixtures/unbc-indoor-routes.json", import.meta.url),
    "utf8",
  ),
) as {
  name: string;
  start: { key?: string; number?: string; levelId?: number };
  end: { key?: string; number?: string; levelId?: number };
  expect: string;
}[];
cases.push(
  {
    name: "Ordinary room across three flights",
    start: { number: "10-1018", levelId: 1_487_816 },
    end: { number: "10-4018", levelId: 402_367 },
    expect: "route",
  },
  {
    name: "Meeting room to fourth-floor classroom remains source-gap review",
    start: { number: "05-107", levelId: 311 },
    end: { number: "05-401", levelId: 402_367 },
    expect: "review",
  },
);
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const summary = async (path: string) => {
  const bytes = await readFile(path),
    project = await readIndoorProject(bytes),
    d = project.dataset;
  const byNode = new Map(d.nodes.map((n) => [n.id, n]));
  const blocker = new Map<number, ReturnType<typeof nativeRouteBlocker>>();
  for (const l of new Set(d.walls.map((w) => w.levelId))) {
    const obstacles = d.walls.filter((w) => w.levelId === l),
      openings: RouteOpening[] = [];
    for (const e of d.edges.filter(
      (e) =>
        ["door", "opening"].includes(e.kind) &&
        byNode.get(e.from)?.levelId === l,
    )) {
      const from = byNode.get(e.from)!,
        to = byNode.get(e.to)!,
        footprint = d.doors?.find((door) => door.id === e.id)?.footprintFeet;
      if (footprint)
        openings.push({
          rooms: e.roomKeys.slice(0, 2) as [string, string],
          point: [from.pointFeet[0], from.pointFeet[1]],
          from: from.pointFeet.slice(0, 2) as RoomPoint,
          to: to.pointFeet.slice(0, 2) as RoomPoint,
          halfWidth: 0,
          halfHeight: 0,
          footprint,
        });
    }
    blocker.set(
      l,
      nativeRouteBlocker(
        {
          walls: obstacles
            .filter((w) => w.kind !== "column")
            .map((w) => ({ polygon: w.ringsFeet[0]! })),
          columns: obstacles
            .filter((w) => w.kind === "column")
            .map((w) => ({ polygon: w.ringsFeet[0]! })),
        },
        openings,
      ),
    );
  }
  const identify = (endpoint: {
    key?: string;
    number?: string;
    levelId?: number;
  }) =>
    d.records.find((r) =>
      endpoint.key
        ? r.key === endpoint.key
        : r.number === endpoint.number && r.levelId === endpoint.levelId,
    )?.key;
  const results = [];
  let crossings = 0,
    segments = 0;
  for (const test of cases)
    for (const reverse of [false, true])
      for (const profile of ["public", "accessible"] as const) {
        const a = identify(reverse ? test.end : test.start),
          b = identify(reverse ? test.start : test.end);
        if (!a || !b) throw new Error(`Missing ${test.name}`);
        const route = findProjectRoute(d, a, b, profile);
        const checked =
          route?.paths
            .filter((p) => p.levelIds.length === 1)
            .flatMap((p) =>
              p.pointsFeet.slice(1).map((end, i) => ({
                from: p.pointsFeet[i]!,
                to: end,
                levelId: p.levelIds[0],
              })),
            ) ?? [];
        const hits = checked.filter((s) =>
          blocker.get(s.levelId)?.(
            s.from.slice(0, 2) as RoomPoint,
            s.to.slice(0, 2) as RoomPoint,
          ),
        );
        crossings += hits.length;
        segments += checked.length;
        const steps = route ? projectNavigationSteps(d, route, a, b) : [];
        results.push({
          name: test.name,
          reverse,
          profile,
          available: !!route,
          distanceMetres: route?.distanceMetres ?? null,
          sourceDistanceMetres: route?.sourceDistanceMetres ?? null,
          turns: steps.filter((s) => s.type === "turn").length,
          transitions: steps
            .filter((s) => s.type === "floor-change")
            .map((s) => ({
              type: s.networkType,
              from: s.fromLevel,
              to: s.toLevel,
            })),
          nativeBarrierCrossings: hits.length,
          centeredWalkingPaths:
            route?.paths.filter((p) => p.centered).length ?? 0,
        });
      }
  const unmatched = d.doors?.filter((door) => door.state !== "connected") ?? [];
  const groups: Record<string, number> = {};
  for (const door of unmatched) {
    const key = `${door.state}:${door.roomKeys.length} candidates`;
    groups[key] = (groups[key] ?? 0) + 1;
  }
  const quality = d.edges.flatMap((e) =>
    e.routingQuality ? [e.routingQuality] : [],
  );
  return {
    path,
    sha256: hash(bytes),
    report: d.report,
    nodeCount: d.nodes.length,
    edgeCount: d.edges.length,
    connectors: d.connectors?.length ?? 0,
    unmatchedDoorReasons: groups,
    unmatchedDoorExamples: unmatched.slice(0, 20).map((door) => ({
      nativeElementId: door.nativeElementId,
      levelId: door.levelId,
      state: door.state,
      candidateRoomKeys: door.roomKeys,
    })),
    gridQuality: {
      auditedEdges: quality.length,
      totalTurns: quality.reduce((s, q) => s + q.turnCount, 0),
      minimumEstimatedRasterClearanceFeet:
        quality.length > 0
          ? Math.min(...quality.map((q) => q.estimatedRasterClearanceFeet))
          : null,
      clearanceCertified: false,
    },
    routeAudit: { segments, crossings, results },
    preservedSourceFiles: Object.fromEntries(
      Object.entries(project.files)
        .filter(([name]) => /\.rvt$|^model\/scene\.|^gis\//i.test(name))
        .map(([name, bytes]) => [name, hash(bytes)]),
    ),
  };
};
const before = await summary(beforePath),
  after = await summary(afterPath);
const changes = after.routeAudit.results.map((result, i) => ({
  name: result.name,
  reverse: result.reverse,
  profile: result.profile,
  beforeAvailable: before.routeAudit.results[i]!.available,
  afterAvailable: result.available,
  beforeMetres: before.routeAudit.results[i]!.distanceMetres,
  afterMetres: result.distanceMetres,
  beforeTurns: before.routeAudit.results[i]!.turns,
  afterTurns: result.turns,
}));
await writeFile(
  output,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scope:
        "Explicit route pairs in both directions/profiles plus native wall/column zero-width checks. Raster clearance preference is not passage-width or accessibility certification. Door candidate counts are diagnostics, not inferred links.",
      before,
      after,
      changes,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    output,
    beforeReport: before.report,
    afterReport: after.report,
    beforeCrossings: before.routeAudit.crossings,
    afterCrossings: after.routeAudit.crossings,
    availabilityChanges: changes.filter(
      (c) => c.beforeAvailable !== c.afterAvailable,
    ),
  }),
);
