import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { readIndoorProject } from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import {
  projectRoutingGraph,
  isProjectDestination,
} from "../../app/indoor-project/routing-graph";
import { createProjectRouteDiagnostics } from "../../app/indoor-project/route-diagnostics";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import { createNativeFloorHoleQuery } from "../../app/indoor-project/walking-support";
import type { RoutePath } from "../../app/indoor-project/centered-route";

const [input, output, countArgument = "120", seedArgument = "20261002"] =
  process.argv.slice(2);
const count = Number(countArgument),
  seed = Number(seedArgument);
if (
  !input ||
  !output ||
  !output.endsWith(".json") ||
  !Number.isSafeInteger(count) ||
  count < 1 ||
  !Number.isSafeInteger(seed)
)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-random-routes.ts project.zip report.json [pairs-per-profile=120] [seed=20261002]",
  );
let randomState = seed >>> 0;
const random = () => {
  randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
  return randomState / 0x1_00_00_00_00;
};
const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
const loadStart = performance.now();
const inputBytes = new Uint8Array(await readFile(input));
const inputSha256 = createHash("sha256").update(inputBytes).digest("hex");
const { dataset: data } = await readIndoorProject(inputBytes);
const loadMs = performance.now() - loadStart;
const snapshot = JSON.stringify(data);
const records = data.records.filter(
  (r) => r.arrivalNodeId && isProjectDestination(r),
);
const byNode = new Map(data.nodes.map((n) => [n.id, n]));
const floor = new Map(
  data.floors.flatMap((f) => f.levelIds.map((id) => [id, f.id] as const)),
);
const holes = createNativeFloorHoleQuery(data);
type Row = {
  mode: "public" | "accessible";
  selection: "reachable" | "unrestricted";
  start: string;
  end: string;
  startNumber: string;
  endNumber: string;
  startFloor?: string;
  endFloor?: string;
  startBuilding: string;
  endBuilding: string;
  graphReachable: boolean;
  calculationMs: number;
  repeatMs?: number;
  status: string;
  message?: string;
  diagnosticMs?: number;
  diagnosticKind?: string;
  blockerKinds?: string[];
  routeSha256?: string;
  metres?: number;
  sourceMetres?: number;
  steps?: number;
  turns?: number;
  transitions?: string[];
  sourceReasons?: (string | undefined)[];
  problems: string[];
};
const rows: Row[] = [],
  preparation: unknown[] = [];
const geometry: {
  start: string;
  end: string;
  edgeIds: string[];
  paths: RoutePath[];
}[] = [];
const summaries = () =>
  (["public", "accessible"] as const).map((mode) => {
    const selected = rows.filter((r) => r.mode === mode);
    const sorted = selected.map((r) => r.calculationMs).sort((a, b) => a - b);
    const percentile = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
    return {
      mode,
      cases: selected.length,
      available: selected.filter((r) => r.status === "available").length,
      blocked: selected.filter((r) => r.status === "blocked").length,
      exceptions: selected.filter((r) => r.status === "exception").length,
      validationProblems: selected.reduce((n, r) => n + r.problems.length, 0),
      multifloor: selected.filter((r) => r.startFloor !== r.endFloor).length,
      crossBuilding: selected.filter((r) => r.startBuilding !== r.endBuilding)
        .length,
      medianMs: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: sorted.at(-1),
    };
  });
async function save() {
  await writeFile(
    output,
    JSON.stringify(
      {
        input,
        inputSha256,
        seed,
        pairsPerProfile: count,
        source: data.source,
        loadMs,
        preparation,
        summaries: summaries(),
        datasetUnchanged: JSON.stringify(data) === snapshot,
        rows,
        slowest: [...rows]
          .sort((a, b) => b.calculationMs - a.calculationMs)
          .slice(0, 12),
      },
      null,
      2,
    ),
  );
  await writeFile(
    output.replace(/\.json$/, ".geometry-input.json"),
    JSON.stringify(geometry),
  );
}
for (const mode of ["public", "accessible"] as const) {
  const began = performance.now();
  const graph = projectRoutingGraph(data, mode);
  preparation.push({ mode, graphMs: performance.now() - began });
  const diagnostics = createProjectRouteDiagnostics(data, mode);
  const hasFloorConnections = [...graph.adjacency].some(([from, links]) =>
    links.some(
      (link) =>
        floor.get(byNode.get(from)!.levelId) !==
        floor.get(byNode.get(link.to)!.levelId),
    ),
  );
  preparation.push({ mode, hasFloorConnections });
  const reachCache = new Map<string, Set<string>>();
  const reach = (start: (typeof records)[number]) => {
    let seen = reachCache.get(start.key);
    if (!seen) {
      seen = new Set([start.arrivalNodeId!]);
      const queue = [...seen];
      for (let i = 0; i < queue.length; i++)
        for (const link of graph.adjacency.get(queue[i]) ?? [])
          if (!seen.has(link.to)) {
            seen.add(link.to);
            queue.push(link.to);
          }
      reachCache.set(start.key, seen);
    }
    return seen;
  };
  const starts = [...records];
  for (let i = starts.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [starts[i], starts[j]] = [starts[j], starts[i]];
  }
  const sampled = new Set<string>();
  let attempt = 0;
  for (let i = 0; i < count && attempt < records.length * 8; attempt++) {
    const start = starts[attempt % starts.length];
    const selection =
      !hasFloorConnections || i % 4 === 3 ? "unrestricted" : "reachable";
    const reachable = reach(start);
    const candidates = records.filter(
      (r) =>
        floor.get(r.levelId) !== floor.get(start.levelId) &&
        (selection === "unrestricted" || reachable.has(r.arrivalNodeId!)),
    );
    if (candidates.length === 0) continue;
    // Alternate broad sampling and distant floors/cross-building routes.
    const distant = candidates.filter(
      (r) => Math.abs(r.elevationFeet - start.elevationFeet) > 15,
    );
    const cross = candidates.filter((r) => r.building !== start.building);
    const end = pick(
      i % 3 === 0 && distant.length > 0
        ? distant
        : i % 3 === 1 && cross.length > 0
          ? cross
          : candidates,
    );
    const key = JSON.stringify([start.key, end.key]);
    if (sampled.has(key)) continue;
    sampled.add(key);
    const row: Row = {
      mode,
      selection,
      start: start.key,
      end: end.key,
      startNumber: start.number,
      endNumber: end.number,
      startFloor: floor.get(start.levelId),
      endFloor: floor.get(end.levelId),
      startBuilding: start.building,
      endBuilding: end.building,
      graphReachable: reachable.has(end.arrivalNodeId!),
      calculationMs: 0,
      status: "pending",
      problems: [],
    };
    const t = performance.now();
    try {
      const route = findProjectRoute(data, start.key, end.key, mode);
      row.calculationMs = performance.now() - t;
      row.status = route ? "available" : "blocked";
      if (route) {
        row.routeSha256 = createHash("sha256")
          .update(JSON.stringify(route))
          .digest("hex");
        const check = (valid: unknown, message: string) => {
          if (!valid) row.problems.push(message);
        };
        check(
          route.nodeIds[0] === start.arrivalNodeId &&
            route.nodeIds.at(-1) === end.arrivalNodeId,
          "wrong-endpoints",
        );
        check(
          route.nodeIds.length === route.edges.length + 1,
          "discontinuous-node-chain",
        );
        check(
          Number.isFinite(route.distanceMetres) && route.distanceMetres > 0,
          "invalid-distance",
        );
        for (const [j, edge] of route.edges.entries()) {
          const from = route.nodeIds[j],
            to = route.nodeIds[j + 1];
          check(
            edge.enabled &&
              ((edge.from === from && edge.to === to) ||
                (edge.to === from && edge.from === to)),
            "invalid-edge-chain",
          );
          check(
            graph.adjacency
              .get(from)
              ?.some((l) => l.to === to && l.edge.id === edge.id),
            "excluded-policy-edge",
          );
          if (mode === "accessible")
            check(
              edge.accessible === "yes" &&
                !["stairs", "local-steps", "escalator"].includes(edge.kind),
              "unverified-step-free-link",
            );
        }
        const steps = projectNavigationSteps(
          data,
          route,
          start.number,
          end.number,
        );
        check(steps.at(-1)?.levelId === end.levelId, "wrong-arrival-floor");
        const transitions = route.edges.flatMap((e, j) =>
          ["stairs", "local-steps", "elevator", "escalator", "ramp"].includes(
            e.kind,
          )
            ? [
                {
                  from: byNode.get(route.nodeIds[j])!.levelId,
                  to: byNode.get(route.nodeIds[j + 1])!.levelId,
                },
              ]
            : [],
        );
        const changes = steps.filter((s) => s.type === "floor-change");
        check(
          changes.length === transitions.length,
          "missing-transition-instructions",
        );
        for (let j = 0; j < changes.length; j++)
          check(
            changes[j].fromLevel === transitions[j]?.from &&
              changes[j].toLevel === transitions[j]?.to,
            "incorrect-transition-floor",
          );
        const planar = route.paths.filter((p) =>
          p.edgeIds.every((id) =>
            ["walk", "door", "opening"].includes(
              route.edges.find((e) => e.id === id)!.kind,
            ),
          ),
        );
        check(
          planar.every((p) => holes(p.pointsFeet).length === 0),
          "route-crosses-native-floor-hole",
        );
        row.metres = route.distanceMetres;
        row.sourceMetres = route.sourceDistanceMetres;
        row.steps = steps.length;
        row.turns = steps.filter((s) => s.type === "turn").length;
        row.transitions = changes.map((s) => s.message);
        row.sourceReasons = route.paths
          .filter((p) => !p.centered)
          .map((p) => p.sourceReason);
        geometry.push({
          start: start.key,
          end: end.key,
          edgeIds: [
            ...new Set([
              ...route.edges.map((e) => e.id),
              ...(route.doorEdgeIds ?? []),
            ]),
          ],
          paths: planar.filter(
            (p) => p.centered || p.sourceReason === "validated-source",
          ),
        });
        if (i % 10 === 0) {
          const r = performance.now();
          const repeated = findProjectRoute(data, start.key, end.key, mode);
          row.repeatMs = performance.now() - r;
          assert.deepEqual(
            repeated,
            route,
            "Repeated calculation changed route",
          );
        }
      } else {
        const d = performance.now(),
          diagnostic = diagnostics.inspect(start.key, end.key);
        row.diagnosticMs = performance.now() - d;
        row.message = diagnostic.message;
        row.diagnosticKind = diagnostic.kind;
        row.blockerKinds = [...new Set(diagnostic.blockers.map((b) => b.kind))];
        if (diagnostic.kind === "connected")
          row.problems.push("failure-explanation-claims-connected");
        if (!diagnostic.message || diagnostic.message.includes("source path ."))
          row.problems.push("missing-failure-explanation");
        if (i % 10 === 0) {
          const repeat = performance.now();
          assert.equal(findProjectRoute(data, start.key, end.key, mode), null);
          row.repeatMs = performance.now() - repeat;
          assert.deepEqual(diagnostics.inspect(start.key, end.key), diagnostic);
        }
      }
    } catch (error) {
      row.calculationMs = performance.now() - t;
      row.status = "exception";
      row.problems.push(error instanceof Error ? error.message : String(error));
    }
    rows.push(row);
    i++;
    console.log(
      `${mode} ${i}/${count}: ${start.number} → ${end.number}; ${row.status}; ${row.calculationMs.toFixed(0)} ms${row.problems.length > 0 ? `; ${row.problems.join(",")}` : ""}`,
    );
    if (i % 10 === 0) await save();
  }
}
await save();
console.log(JSON.stringify(summaries(), null, 2));
if (rows.some((r) => r.problems.length) || JSON.stringify(data) !== snapshot)
  process.exitCode = 1;
