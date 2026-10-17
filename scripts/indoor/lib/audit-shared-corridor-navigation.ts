import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../../app/indoor-project/contract";
import type { PreparedRouting } from "../../../app/indoor-project/prepared-routing";
import { createWorkerRouteCalculator } from "../../../app/indoor-project/route-calculation";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../../app/indoor-project/prepared-display-engine-binding";

/** Actual normal calculator calls over one immutable, fully imported source.
 * Reuses its resident policy graph for all pairs and both guide preferences.
 */
export async function auditSharedCorridorNavigation(
  data: IndoorDataset,
  output: string,
) {
  await mkdir(output, { recursive: true });
  const records = new Map(data.records.map((r) => [r.key, r])),
    nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const sourceEdges = new Map(data.edges.map((e) => [e.id, e]));
  const sha = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const sourceBefore = sha([data.nodes, data.edges, data.records]);
  type Case = {
    id: string;
    from: string;
    to: string;
    mode: "public" | "accessible";
    expected?: boolean;
    floorId?: string;
  };
  const cases: Case[] = [];
  const library = [
    "05-411",
    "05-412",
    "05-413",
    "05-414",
    "05-416",
    "05-417",
    "05-423",
  ];
  const room = (number: string) =>
    data.records.find(
      (r) =>
        r.number === number &&
        r.arrivalNodeId &&
        r.walkable &&
        r.access !== "staff",
    );
  for (const a of library)
    for (const b of library)
      if (a !== b) {
        const from = room(a),
          to = room(b);
        if (!from || !to)
          throw new Error(`Missing corridor test destination ${a}/${b}`);
        cases.push({
          id: `05-415:${a}->${b}`,
          from: from.key,
          to: to.key,
          mode: "public",
          expected: true,
        });
      }
  const floorCoverage: {
    floorId: string;
    name: string;
    caseId?: string;
    reason?: string;
  }[] = [];
  const guides =
    (data as IndoorDataset & { preparedRouting?: PreparedRouting })
      .preparedRouting?.guides ?? [];
  const destinations = (id: string): IndoorRecord[] => {
    const result: IndoorRecord[] = [];
    for (const e of data.edges.filter(
      (e) => e.enabled && e.kind === "door" && (e.from === id || e.to === id),
    )) {
      const other = nodes.get(e.from === id ? e.to : e.from),
        r = other && records.get(other.roomKey);
      if (
        r?.arrivalNodeId &&
        r.walkable &&
        r.access !== "staff" &&
        r.number &&
        !r.stair
      )
        result.push(r);
    }
    const own = records.get(nodes.get(id)!.roomKey);
    if (
      own?.arrivalNodeId &&
      own.walkable &&
      own.access !== "staff" &&
      own.number
    )
      result.push(own);
    return result;
  };
  for (const floor of data.floors) {
    let chosen: Case | undefined;
    for (const guide of guides) {
      const edge = sourceEdges.get(guide.edgeId)!;
      if (!floor.levelIds.includes(nodes.get(edge.from)!.levelId)) continue;
      for (const a of destinations(edge.from))
        for (const b of destinations(edge.to))
          if (
            !chosen &&
            a.key !== b.key &&
            floor.levelIds.includes(a.levelId) &&
            floor.levelIds.includes(b.levelId)
          )
            chosen = {
              id: `floor:${floor.id}`,
              from: a.key,
              to: b.key,
              mode: "public",
              floorId: floor.id,
            };
      if (chosen) break;
    }
    if (chosen) {
      cases.push(chosen);
      floorCoverage.push({
        floorId: floor.id,
        name: floor.name,
        caseId: chosen.id,
      });
    } else
      floorCoverage.push({
        floorId: floor.id,
        name: floor.name,
        reason: "No distinct destination pair in compiled guides",
      });
  }
  for (const [a, b] of [
    ["05-136", "05-173"],
    ["05-143", "05-242"],
    ["05-242", "05-143"],
  ]) {
    const from = room(a),
      to = room(b);
    if (from && to)
      cases.push({
        id: `regression:${a}->${b}`,
        from: from.key,
        to: to.key,
        mode: "public",
        expected: true,
      });
  }
  const stepFrom = room("05-143"),
    stepTo = room("05-242");
  if (stepFrom && stepTo)
    cases.push({
      id: "step-free:05-143->05-242",
      from: stepFrom.key,
      to: stepTo.key,
      mode: "accessible",
    });
  const calculate = createWorkerRouteCalculator(data);
  const results: unknown[] = [],
    failures: { id: string; message: string }[] = [];
  const allStarted = performance.now();
  for (const item of cases) {
    console.log(`Navigation start ${item.id}`);
    const started = performance.now();
    try {
      const shared = calculate(item.from, item.to, item.mode, {
        endpointMode: "hallway",
        useSharedCorridorGuides: true,
      });
      const sharedSeconds = (performance.now() - started) / 1000;
      const baselineStart = performance.now();
      const existing = calculate(item.from, item.to, item.mode, {
        endpointMode: "hallway",
        useSharedCorridorGuides: false,
      });
      const legacySeconds = (performance.now() - baselineStart) / 1000;
      assert.equal(
        !!shared.route,
        !!existing.route,
        "guide preference changed route availability",
      );
      if (item.expected !== undefined)
        assert.equal(
          !!shared.route,
          item.expected,
          "expected actual route unavailable",
        );
      const route = shared.route;
      if (route) {
        for (const edge of route.edges) {
          const original = sourceEdges.get(edge.id);
          assert.ok(original?.enabled);
          assert.deepEqual(
            edge.pointsFeet,
            original.pointsFeet,
            "source edge geometry changed",
          );
        }
        if (route.departure)
          assert.deepEqual(
            route.paths[0].pointsFeet[0],
            route.departure.pointFeet,
          );
        if (route.arrival?.mode === "hallway")
          assert.deepEqual(
            route.paths.at(-1)!.pointsFeet.at(-1),
            route.arrival.pointFeet,
          );
        if (item.mode === "accessible")
          assert.ok(route.paths.every((p) => !p.sharedCorridorGuideUsed));
      }
      const result = {
        ...item,
        fromNumber: records.get(item.from)?.number,
        toNumber: records.get(item.to)?.number,
        available: !!route,
        sharedSeconds,
        legacySeconds,
        sharedPaths:
          route?.paths.filter((p) => p.sharedCorridorGuideUsed).length ?? 0,
        sourceEdgeIds: route?.edges.map((e) => e.id),
        baselineEdgeIds: existing.route?.edges.map((e) => e.id),
        departure: route?.departure,
        arrival: route?.arrival,
        paths: route?.paths,
        unknownAccessAreas: route?.unknownAccessAreas,
        diagnostic: shared.diagnostic,
      };
      results.push(result);
      console.log(
        JSON.stringify({
          case: item.id,
          available: result.available,
          sharedPaths: result.sharedPaths,
          sharedSeconds,
          legacySeconds,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: item.id, message });
      results.push({ ...item, error: message });
      console.error(`Navigation failure ${item.id}: ${message}`);
    }
    await writeFile(
      path.join(output, "navigation-progress.json"),
      JSON.stringify(
        { completed: results.length, total: cases.length, failures },
        null,
        2,
      ),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(
    sha([data.nodes, data.edges, data.records]),
    sourceBefore,
    "calculator changed original source",
  );
  const report = {
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    seconds: (performance.now() - allStarted) / 1000,
    cases: cases.length,
    failures,
    floorCoverage,
    heldStairEdges: data.edges
      .filter((e) => e.kind === "stairs" && !e.enabled)
      .map((e) => e.id),
    originalNodesEdgesAndRecordsUnchanged: true,
    results,
  };
  await writeFile(
    path.join(output, "actual-navigation.json"),
    JSON.stringify(report, null, 2),
  );
  return report;
}
