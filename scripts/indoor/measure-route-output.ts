/** Route OUTPUT quality on real data: instructions and the composed route line.
 *
 * Runs the normal (unhydrated) worker calculator, exactly as the explicit
 * policy matrix's `--stage normal` does, over the routing projection of one
 * visitor JSON, and records for every routed case:
 *
 *  - steps, steps per 100 m (of the reported distance) and step messages;
 *  - the composed route line: drawn length, routed edge length
 *    (`sourceDistanceMetres`), reported `distanceMetres`, vertex/segment
 *    counts, exact retrace pairs, near reversals (> 150 deg) and zigzags
 *    (> 120 deg with an adjacent leg <= 2 m, as in the reference comparison);
 *  - the routed edge sequence hash, so before/after runs can prove that the
 *    edge ids are unchanged.
 *
 * Usage (needs a large heap; wrap in the shared heavy lock):
 *   node --max-old-space-size=9216 --expose-gc --import tsx \
 *     scripts/indoor/measure-route-output.ts VISITOR.json EXPECTED-SHA256 \
 *     CASES.json OUTPUT.json [--journeys JOURNEYS.json] [--only-journeys]
 *
 * CASES.json uses the explicit-policy case format (POLICY-CASES.json).
 * JOURNEYS.json uses the browser journey format (final-candidate/browser).
 * Nothing is written except OUTPUT.json.
 */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectStep } from "../../app/indoor-project/navigation-steps";
import type { ProjectRoute } from "../../app/indoor-project/viewer-routing";
import { progressiveRouteOptions } from "../../app/indoor-project/progressive-route-options";

type Case = {
  id: string;
  start: string;
  end: string;
  profile: "public" | "accessible";
  endpointMode: "inside" | "hallway";
  allowOtherRoomTransit: boolean;
};

const sha = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");

type XYZ = [number, number, number];

/** Line metrics of one composed route, in metres. Segments shorter than
 * 1e-6 m are ignored. Vertical paths (z changes) count towards drawn length
 * horizontally only, like the reported distance of a centred path. */
export function routeLineMetrics(
  paths: readonly { pointsFeet: readonly XYZ[] }[],
  metresPerFoot: number,
) {
  const points: XYZ[] = [];
  for (const path of paths)
    for (const p of path.pointsFeet) {
      const last = points.at(-1);
      if (
        last &&
        last[0] === p[0] &&
        last[1] === p[1] &&
        Math.abs(last[2] - p[2]) < 1e-9
      )
        continue;
      points.push([...p]);
    }
  const segments: { dx: number; dy: number; m: number; z: boolean }[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0],
      dy = points[i][1] - points[i - 1][1],
      m = Math.hypot(dx, dy) * metresPerFoot;
    if (m < 1e-6) continue;
    segments.push({
      dx,
      dy,
      m,
      z: Math.abs(points[i][2] - points[i - 1][2]) >= 0.01,
    });
  }
  let exactRetrace = 0,
    reversals = 0,
    zigzags = 0;
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1],
      b = segments[i];
    if (a.z || b.z) continue;
    const turn = Math.abs(
      (Math.atan2(a.dx * b.dy - a.dy * b.dx, a.dx * b.dx + a.dy * b.dy) * 180) /
        Math.PI,
    );
    if (a.dx === -b.dx && a.dy === -b.dy) exactRetrace++;
    if (turn > 150) reversals++;
    if (turn > 120 && (a.m <= 2 || b.m <= 2)) zigzags++;
  }
  return {
    vertices: points.length,
    segments: segments.length,
    drawnLengthMetres: segments.reduce((s, x) => s + x.m, 0),
    shortSegmentsUnder2m: segments.filter((s) => s.m < 2).length,
    exactRetracePairs: exactRetrace,
    reversalsOver150: reversals,
    zigzags,
  };
}

const casesFromPolicy = (value: unknown): Case[] =>
  (value as Record<string, unknown>[]).map((c) => ({
    id: [
      c.name,
      c.endpointMode,
      c.allowOtherRoomTransit ? "transit" : "no-transit",
      c.profile,
    ].join(":"),
    start: c.start as string,
    end: c.end as string,
    profile: c.profile as Case["profile"],
    endpointMode: c.endpointMode as Case["endpointMode"],
    allowOtherRoomTransit: c.allowOtherRoomTransit as boolean,
  }));
const casesFromJourneys = (value: unknown): Case[] =>
  (value as { journeys: Record<string, unknown>[] }).journeys.map((j) => ({
    id: `journey:${j.label as string}`,
    start: j.from as string,
    end: j.to as string,
    profile: j.profile as Case["profile"],
    endpointMode: "inside",
    allowOtherRoomTransit: j.allowOtherRoomTransit as boolean,
  }));

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf("--" + name);
    return i === -1 ? undefined : args[i + 1];
  };
  const [input, expected, casesPath, output] = args;
  assert(input && expected && casesPath && output, "usage: see header");
  const journeysPath = flag("journeys");
  let cases: Case[] = [];
  if (journeysPath)
    cases.push(
      ...casesFromJourneys(JSON.parse(await fs.readFile(journeysPath, "utf8"))),
    );
  if (!args.includes("--only-journeys"))
    cases.push(
      ...casesFromPolicy(JSON.parse(await fs.readFile(casesPath, "utf8"))),
    );
  const only = flag("only");
  if (only) cases = cases.filter((c) => c.id.includes(only));
  const { routeWorkerDataset } = await import(
    "../../app/indoor-project/route-worker-dataset"
  );
  const { parseVerifiedRoutingDataset } = await import(
    "../../app/indoor-project/verified-routing-dataset"
  );
  const { initializeNativeExactGeosOverlay } = await import(
    "../../app/indoor-project/native-exact-geos-overlay"
  );
  const { createWorkerRouteCalculator } = await import(
    "../../app/indoor-project/route-calculation"
  );
  const { projectNavigationSteps } = await import(
    "../../app/indoor-project/navigation-steps"
  );
  const { projectPlaceDisplayName } = await import(
    "../../app/indoor-project/visitor-metadata"
  );
  const { PUBLISHED_ROUTE_RUNTIME_SHA256 } = await import(
    "../../app/indoor-project/published-route-runtime-binding"
  );
  const data: IndoorDataset = await (async () => {
    const raw = new Uint8Array(await fs.readFile(input));
    assert.equal(sha(raw), expected);
    const projected = new TextEncoder().encode(
      JSON.stringify(
        routeWorkerDataset(
          JSON.parse(new TextDecoder().decode(raw)) as IndoorDataset,
        ),
      ),
    );
    return parseVerifiedRoutingDataset(projected, sha(projected));
  })();
  (globalThis as { gc?: () => void }).gc?.();
  await initializeNativeExactGeosOverlay();
  const calculate = createWorkerRouteCalculator(data);
  const records = new Map(data.records.map((r) => [r.key, r]));
  const name = (key: string) => {
    const room = records.get(key);
    return room
      ? [room.number, projectPlaceDisplayName(data, room)]
          .filter(Boolean)
          .join(" · ")
      : key;
  };
  const mpf = data.alignment.horizontalMetresPerFoot;
  const rows: unknown[] = [];
  for (const c of cases) {
    const began = performance.now();
    const value = calculate(c.start, c.end, c.profile, {
      ...progressiveRouteOptions({
        endpointMode: c.endpointMode,
        allowOtherRoomTransit: c.allowOtherRoomTransit,
      }),
      preferHallways: true,
    });
    const seconds = (performance.now() - began) / 1000;
    const route: ProjectRoute | null = value.route;
    const steps: ProjectStep[] = route
      ? projectNavigationSteps(data, route, name(c.start), name(c.end))
      : [];
    const row = route
      ? {
          id: c.id,
          available: true,
          seconds,
          distanceMetres: route.distanceMetres,
          sourceDistanceMetres: route.sourceDistanceMetres,
          preferenceCost: route.preferenceCost,
          edgeIdsSha256: sha(JSON.stringify(route.edges.map((e) => e.id))),
          edgeCount: route.edges.length,
          doorEdgeIds: route.doorEdgeIds,
          line: routeLineMetrics(route.paths, mpf),
          steps: steps.map((s) => ({
            type: s.type,
            message: s.message,
            distanceMetres: Math.round(s.distanceMeters * 100) / 100,
            turnKind: s.turnKind,
          })),
          stepCount: steps.length,
          stepsPer100m: (100 * steps.length) / route.distanceMetres,
          paths: route.paths.map((p) => ({
            edgeIds: p.edgeIds,
            levelIds: p.levelIds,
            centered: p.centered,
            sharedCorridorGuideUsed: p.sharedCorridorGuideUsed,
            sourceReason: p.sourceReason,
            pointsFeet: p.pointsFeet,
          })),
        }
      : {
          id: c.id,
          available: false,
          seconds,
          diagnostic: value.diagnostic
            ? {
                kind: value.diagnostic.kind,
                constraint: value.diagnostic.constraint,
                message: value.diagnostic.message,
              }
            : undefined,
        };
    rows.push(row);
    console.log(
      JSON.stringify({
        id: c.id,
        available: !!route,
        steps: steps.length,
        distanceMetres: route?.distanceMetres,
        seconds: Math.round(seconds * 10) / 10,
        rssBytes: process.memoryUsage().rss,
      }),
    );
  }
  await fs.writeFile(
    output,
    JSON.stringify({
      inputSha256: expected,
      metresPerFoot: mpf,
      routeRuntimeSha256: PUBLISHED_ROUTE_RUNTIME_SHA256,
      rows,
    }),
  );
}
