/** Explicit visitor-policy route matrix.
 *
 * Every case names its access profile (public walking | accessible step-free),
 * its arrival mode (inside | hallway) and whether transit through other rooms
 * is allowed. Each case is computed twice under exactly those options:
 *
 *  - normal: the unhydrated worker calculator (`createWorkerRouteCalculator`)
 *    over the routing projection of the exact visitor JSON;
 *  - worker: the actual progressive visitor route worker bundle, fed the real
 *    progressive manifest/routing parts and the admitted directions carrier,
 *    using the COMPILED receipt list (no receipt substitution).
 *
 * Both receive the options the visitor worker passes to its calculator:
 * `{ endpointMode, allowOtherRoomTransit, preferHallways: true }`.
 *
 * Stages run as separate processes so the worker keeps its own heap cap and the
 * normal stage can take the large visitor heap. Each stage appends one line per
 * finished case to OUTPUT.progress.jsonl and skips cases already recorded under
 * the same identity, so an interrupted stage can simply be restarted.
 *
 * The report stage passes only when every case is complete, the two outcomes
 * agree on EVERY recorded comparison field (explicit-policy-matrix-checks.ts),
 * and both meet the case's expected outcome from EXPECTATIONS.json (route with
 * distance ± tolerance and required-edge use, or refusal with its constraint
 * or blocker kinds). Otherwise it still writes OUTPUT.json and exits 1.
 *
 * Usage:
 *   run-explicit-policy-matrix.ts VISITOR.json EXPECTED-SHA256 CASES.json OUTPUT.json \
 *     --stage worker|normal|report --publication MANIFEST-DIRECTORY --carrier CARRIER.json.gz \
 *     [--expectations EXPECTATIONS.json]   (required for --stage report)
 *
 * CASES.json: [{ name, start, end, profile: "public"|"accessible",
 *   endpointMode: "inside"|"hallway", allowOtherRoomTransit: boolean,
 *   requiredEdgeId?, expect?: "route"|"blocked", group? }]
 * Nothing is written to the dataset, the carrier or the publication.
 */
import fs from "node:fs/promises";
import { createReadStream, appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { RouteCalculation } from "../../app/indoor-project/route-calculation";
import type { ProjectStep } from "../../app/indoor-project/navigation-steps";
import type { ProgressiveRouteSummary } from "../../app/indoor-project/progressive-route-summary";
import {
  validateProgressiveManifest,
  type ProgressiveManifest,
} from "../../app/indoor-project/progressive-delivery";
import { PUBLISHED_ROUTE_CELL_RECEIPTS } from "../../app/indoor-project/published-route-cell-receipts";
import { PUBLISHED_ROUTE_RUNTIME_SHA256 } from "../../app/indoor-project/published-route-runtime-binding";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { progressiveRouteOptions } from "../../app/indoor-project/progressive-route-options";
import { publishedRouteRuntimeBinding } from "./published-route-runtime-binding";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import {
  checkPolicyExpectations,
  expectationProblems,
  policyAgreement,
  type PolicyOutcome,
} from "./explicit-policy-matrix-checks";

type Profile = "public" | "accessible";
export type ExplicitPolicyCase = {
  group?: string;
  name: string;
  start: string;
  end: string;
  profile: Profile;
  endpointMode: "inside" | "hallway";
  allowOtherRoomTransit: boolean;
  requiredEdgeId?: string;
  expect?: "route" | "blocked";
};
type Outcome = PolicyOutcome;

export const caseId = (c: ExplicitPolicyCase) =>
  [
    c.name,
    c.endpointMode,
    c.allowOtherRoomTransit ? "transit" : "no-transit",
    c.profile,
  ].join(":");

export function checkExplicitPolicyCases(value: unknown): ExplicitPolicyCase[] {
  assert(Array.isArray(value) && value.length > 0 && value.length <= 4096);
  const known = new Set([
    "group",
    "name",
    "start",
    "end",
    "profile",
    "endpointMode",
    "allowOtherRoomTransit",
    "requiredEdgeId",
    "expect",
  ]);
  for (const c of value as ExplicitPolicyCase[]) {
    assert(c && typeof c === "object" && !Array.isArray(c));
    assert(
      Object.keys(c).every((key) => known.has(key)),
      "Unknown explicit-policy case field",
    );
    for (const key of ["name", "start", "end"] as const)
      assert(typeof c[key] === "string" && c[key].length > 0);
    assert(c.profile === "public" || c.profile === "accessible");
    assert(c.endpointMode === "inside" || c.endpointMode === "hallway");
    assert.equal(typeof c.allowOtherRoomTransit, "boolean");
    assert(c.expect === undefined || ["route", "blocked"].includes(c.expect));
    assert(
      c.requiredEdgeId === undefined ||
        (typeof c.requiredEdgeId === "string" && c.requiredEdgeId.length > 0),
    );
  }
  const ids = (value as ExplicitPolicyCase[]).map(caseId);
  assert.equal(new Set(ids).size, ids.length, "Case identities must be unique");
  return value as ExplicitPolicyCase[];
}

const sha = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");
const json = (v: unknown) =>
  JSON.stringify(v, (_, item) => (item instanceof Set ? [...item] : item));
const visitorOptions = (c: ExplicitPolicyCase) => ({
  // Validated exactly as at the visitor worker boundary.
  ...progressiveRouteOptions({
    endpointMode: c.endpointMode,
    allowOtherRoomTransit: c.allowOtherRoomTransit,
  }),
  preferHallways: true as const,
});

function outcome(
  c: ExplicitPolicyCase,
  value: RouteCalculation,
  steps: ProjectStep[],
  summary: ProgressiveRouteSummary,
  seconds: number,
): Outcome {
  const route = value.route,
    d = value.diagnostic;
  return {
    available: !!route,
    seconds,
    ...(route
      ? {
          distanceMetres: route.distanceMetres,
          edgeIdCount: route.edges.length,
          edgeIds: route.edges.map((e) => e.id),
          doorEdgeIds: route.doorEdgeIds,
          requiredEdgeUsed:
            c.requiredEdgeId === undefined
              ? undefined
              : route.edges.some((e) => e.id === c.requiredEdgeId),
        }
      : {}),
    ...(d
      ? {
          diagnostic: {
            kind: d.kind,
            constraint: d.constraint,
            message: d.message,
            blockers: d.blockers.map((b) => ({
              kind: b.kind,
              edgeId: b.edgeId,
              roomKey: b.roomKey,
            })),
            sourceEdgeIdCount: d.sourceEdgeIds.length,
            requiredEdgeInWitness:
              c.requiredEdgeId === undefined
                ? undefined
                : d.sourceEdgeIds.includes(c.requiredEdgeId),
            reviewRoomKey: d.reviewRoomKey,
            reviewEdgeId: d.reviewEdgeId,
          },
        }
      : {}),
    arrivalChoices: value.arrivals ? Object.keys(value.arrivals) : undefined,
    reachableCount: value.reachable ? value.reachable.size : undefined,
    stepCount: steps.length,
    valueSha256: sha(
      json({
        route: value.route,
        diagnostic: value.diagnostic,
        arrivals: value.arrivals,
        reachable: value.reachable ? [...value.reachable].sort() : undefined,
      }),
    ),
    stepsSha256: sha(json(steps)),
    summarySha256: sha(json(summary)),
  };
}

async function fileSha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf("--" + name);
    return i === -1 ? undefined : args[i + 1];
  };
  const [input, expected, casesPath, output] = args;
  const stage = flag("stage"),
    publication = flag("publication"),
    carrier = flag("carrier"),
    expectationsPath = flag("expectations");
  if (
    !input ||
    !/^[a-f0-9]{64}$/.test(expected ?? "") ||
    !casesPath ||
    !output ||
    !["worker", "normal", "report"].includes(stage ?? "") ||
    !publication ||
    !carrier ||
    (stage === "report" && !expectationsPath)
  )
    throw new Error("See usage in the file header.");
  const root = path.resolve(import.meta.dirname, "../.."),
    out = path.resolve(output),
    progressPath = out + ".progress.jsonl";
  const casesBytes = await fs.readFile(casesPath),
    cases = checkExplicitPolicyCases(JSON.parse(casesBytes.toString()));
  const manifestBytes = await fs.readFile(
      path.join(publication, "manifest.json"),
    ),
    manifest = JSON.parse(manifestBytes.toString()) as ProgressiveManifest;
  validateProgressiveManifest(manifest);
  const routeAsset = manifest.assets[manifest.routeAssetId];
  // The compiled receipt that the production worker will admit for this map.
  const receipt = PUBLISHED_ROUTE_CELL_RECEIPTS.find(
    (r) => r.datasetSha256 === routeAsset.logicalSha256,
  );
  assert(receipt, "No compiled receipt admits this publication's routing");
  const carrierBytes = await fs.readFile(carrier);
  assert.equal(carrierBytes.length, receipt.compressedBytes);
  assert.equal(sha(carrierBytes), receipt.compressedSha256);
  assert.equal(path.basename(carrier), path.basename(receipt.url));
  const runtime = publishedRouteRuntimeBinding(root).sha256,
    engine = preparedDisplayEngineBinding(root).sha256;
  assert.equal(runtime, PUBLISHED_ROUTE_RUNTIME_SHA256);
  assert.equal(engine, PREPARED_DISPLAY_ENGINE_SHA256);
  if (receipt.runtimeSha256 !== undefined)
    assert.equal(receipt.runtimeSha256, runtime);
  assert.equal(receipt.engineSha256, engine);
  const identity = {
    inputSha256: expected!,
    datasetSha256: routeAsset.logicalSha256,
    casesSha256: sha(casesBytes),
    manifestRevisionSha256: manifest.revisionSha256,
    manifestSha256: sha(manifestBytes),
    receiptId: receipt.id,
    carrierSha256: receipt.compressedSha256,
    runtimeSha256: runtime,
    engineSha256: engine,
  };
  const identityKey = sha(JSON.stringify(identity));
  type ProgressLine = {
    identityKey: string;
    stage: "worker" | "normal" | "worker-meta" | "normal-meta";
    id: string;
    row: unknown;
  };
  const progress: ProgressLine[] = existsSync(progressPath)
    ? (await fs.readFile(progressPath, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ProgressLine)
        .filter((line) => line.identityKey === identityKey)
    : [];
  const done = (s: ProgressLine["stage"]) =>
    new Map(
      progress
        .filter((l) => l.stage === s)
        .map((l) => [l.id, l.row as Outcome]),
    );
  const record = (s: ProgressLine["stage"], id: string, row: unknown) =>
    appendFileSync(
      progressPath,
      JSON.stringify({ identityKey, stage: s, id, row }) + "\n",
    );
  const log = (value: object) =>
    console.log(JSON.stringify({ at: new Date().toISOString(), ...value }));
  log({ stage, identity, identityKey, cases: cases.length });

  if (stage === "worker") {
    // The visitor file is bound by hash only here; the normal stage proves its
    // routing projection equals the published routing asset and receipt.
    assert.equal(await fileSha256(input), expected);
    const finished = done("worker");
    // A worker error (for example a timeout) is retried on resume.
    const todo = cases.filter((c) => {
      const row = finished.get(caseId(c));
      return !row || row.error !== undefined;
    });
    log({ resumed: finished.size, remaining: todo.length });
    if (todo.length > 0) {
      const { buildCandidateProductionRouteBundle } = await import(
        "./candidate-route-worker-bundle"
      );
      const { ProgressiveRouteClient } = await import(
        "../../app/indoor-project/progressive-route-client"
      );
      type Response =
        import("../../app/indoor-project/progressive-route-client").ProgressiveRouteResponse;
      const bundleDir = path.join(
        path.dirname(out),
        `bundle-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
      );
      await fs.mkdir(bundleDir, { recursive: true });
      const { bundle } = await buildCandidateProductionRouteBundle(
        root,
        bundleDir,
        receipt,
        { workerKind: "progressive", useCompiledReceipt: true },
      );
      const base = "https://candidate.test/data/unbc/manifest.json",
        downloads: Record<string, string> = {};
      for (const representation of routeAsset.representations)
        for (const part of representation.parts ?? [representation]) {
          const file = path.resolve(publication, part.path);
          assert(file.startsWith(path.resolve(publication) + path.sep));
          downloads[new URL(part.path, base).href] = file;
        }
      const fetches: unknown[] = [],
        heapLimits = new Set<number>();
      let starts = 0;
      const client = new ProgressiveRouteClient(() => {
        starts++;
        const native = new Worker(pathToFileURL(bundle), {
          execArgv: [],
          resourceLimits: {
            maxOldGenerationSizeMb: 768,
            maxYoungGenerationSizeMb: 32,
          },
          workerData: { receipt, cachePath: path.resolve(carrier), downloads },
        });
        const adapter = {
          onmessage: null as ((e: MessageEvent<Response>) => void) | null,
          onerror: null as ((e: ErrorEvent) => void) | null,
          onmessageerror: null as ((e: MessageEvent) => void) | null,
          postMessage: (r: unknown) => native.postMessage(r),
          terminate: () => void native.terminate(),
        };
        native.on("message", (m) => {
          if (m.memory) heapLimits.add(m.memory.heapLimit);
          if (m._qaFetch) {
            fetches.push(m._qaFetch);
            log({ workerFetch: m._qaFetch.url, bytes: m._qaFetch.bytes });
          }
          if (m._qaResponse)
            adapter.onmessage?.({
              data: m._qaResponse,
            } as MessageEvent<Response>);
        });
        native.on("error", (e) =>
          adapter.onerror?.({
            message: e.message,
            preventDefault() {},
          } as ErrorEvent),
        );
        return adapter;
      });
      const timeoutMs = Number(process.env.POLICY_MATRIX_TIMEOUT_MS ?? 600_000);
      try {
        for (const c of todo) {
          const began = performance.now(),
            options = visitorOptions(c),
            request = client.request(
              base,
              manifest,
              c.start,
              c.end,
              c.profile,
              {},
              {
                endpointMode: options.endpointMode,
                allowOtherRoomTransit: options.allowOtherRoomTransit,
              },
            );
          let timer: ReturnType<typeof setTimeout> | undefined;
          let row: Outcome;
          try {
            const result = await Promise.race([
              request.promise,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  reject(new Error(`worker exceeded ${timeoutMs} ms`));
                  request.cancel();
                }, timeoutMs);
              }),
            ]).finally(() => clearTimeout(timer));
            row = outcome(
              c,
              result.value,
              result.steps,
              result.summary,
              (performance.now() - began) / 1000,
            );
          } catch (error) {
            row = {
              available: false,
              error: String(error),
              seconds: (performance.now() - began) / 1000,
              stepCount: 0,
              valueSha256: "",
              stepsSha256: "",
              summarySha256: "",
            };
          }
          record("worker", caseId(c), row);
          log({
            worker: caseId(c),
            available: row.available,
            distanceMetres: row.distanceMetres,
            error: row.error,
            seconds: row.seconds,
          });
        }
      } finally {
        client.dispose();
      }
      assert(
        [...heapLimits].every((v) => v <= 900_000_000),
        "Worker heap cap was not retained",
      );
      record("worker-meta", new Date().toISOString(), {
        starts,
        fetches,
        heapLimits: [...heapLimits],
        bundleSha256: sha(await fs.readFile(bundle)),
        workerEntry: "app/indoor-project/progressive-route.worker.ts",
        compiledReceipt: true,
        carrier: path.resolve(carrier),
      });
    }
  }

  if (stage === "normal") {
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
    const { createImmutableRoutingSession } = await import(
      "../../app/indoor-project/routing-cache"
    );
    const { projectRoutingGraph } = await import(
      "../../app/indoor-project/routing-graph"
    );
    const { progressiveRouteSummary } = await import(
      "../../app/indoor-project/progressive-route-summary"
    );
    const { projectNavigationSteps } = await import(
      "../../app/indoor-project/navigation-steps"
    );
    const { projectPlaceDisplayName } = await import(
      "../../app/indoor-project/visitor-metadata"
    );
    const data = await (async () => {
      const raw = new Uint8Array(await fs.readFile(input));
      assert.equal(sha(raw), expected);
      const projected = new TextEncoder().encode(
        JSON.stringify(
          routeWorkerDataset(
            JSON.parse(new TextDecoder().decode(raw)) as IndoorDataset,
          ),
        ),
      );
      const projectedSha = sha(projected);
      assert.equal(
        projectedSha,
        routeAsset.logicalSha256,
        "Visitor routing projection differs from the published routing asset",
      );
      assert.equal(projectedSha, receipt.datasetSha256);
      return parseVerifiedRoutingDataset(projected, projectedSha);
    })();
    (globalThis as { gc?: () => void }).gc?.();
    log({ loaded: true, rssBytes: process.memoryUsage().rss });
    for (const c of cases) {
      for (const key of [c.start, c.end])
        assert.equal(
          data.records.filter((r) => r.key === key).length,
          1,
          `Missing or duplicate place ${key} in ${c.name}`,
        );
      if (c.requiredEdgeId)
        assert.equal(
          data.edges.filter((e) => e.id === c.requiredEdgeId).length,
          1,
          `Missing or duplicate required edge in ${c.name}`,
        );
    }
    await initializeNativeExactGeosOverlay();
    const finished = done("normal");
    const todo = cases.filter((c) => !finished.has(caseId(c)));
    log({ resumed: finished.size, remaining: todo.length });
    const calculate = createWorkerRouteCalculator(data),
      run = createImmutableRoutingSession(data),
      records = new Map(data.records.map((r) => [r.key, r])),
      label = (key: string) => {
        const r = records.get(key);
        return r ? `${r.number} ${r.name}` : key;
      },
      name = (key: string) => {
        const room = records.get(key);
        return room
          ? [room.number, projectPlaceDisplayName(data, room)]
              .filter(Boolean)
              .join(" · ")
          : key;
      };
    const required = new Map<Profile, Map<string, Set<string>>>();
    const requiredRoomsByEdge = (profile: Profile) => {
      let map = required.get(profile);
      if (!map) {
        map = new Map();
        const graph = run(() => projectRoutingGraph(data, profile));
        for (const links of graph.allAdjacency.values())
          for (const link of links) {
            const set = map.get(link.edge.id) ?? new Set<string>();
            for (const key of link.requiredRooms) set.add(key);
            map.set(link.edge.id, set);
          }
        required.set(profile, map);
      }
      return map;
    };
    for (const c of todo) {
      const began = performance.now(),
        value = calculate(c.start, c.end, c.profile, visitorOptions(c)),
        seconds = (performance.now() - began) / 1000,
        steps = value.route
          ? projectNavigationSteps(
              data,
              value.route,
              name(c.start),
              name(c.end),
            )
          : [],
        summary = progressiveRouteSummary(data, value.route, c.start, c.end),
        row = outcome(c, value, steps, summary, seconds);
      if (!value.route && value.diagnostic) {
        // Rooms the diagnostic witness depends on, split by the request's
        // ordinary-room rule (viewer-routing.ts): hallway arrival rejects any
        // required room; inside arrival rejects only rooms other than the two
        // endpoints.
        const byEdge = requiredRoomsByEdge(c.profile),
          witnessRooms = [
            ...new Set(
              value.diagnostic.sourceEdgeIds.flatMap((id) => [
                ...(byEdge.get(id) ?? []),
              ]),
            ),
          ];
        row.explanation = {
          witnessEdgeCount: value.diagnostic.sourceEdgeIds.length,
          witnessRequiredRooms: witnessRooms.map(label),
          roomsRejectedByRequestedRule: c.allowOtherRoomTransit
            ? []
            : witnessRooms
                .filter(
                  (key) =>
                    c.endpointMode === "hallway" ||
                    (key !== c.start && key !== c.end),
                )
                .map(label),
          blockers: value.diagnostic.blockers.map((b) => ({
            kind: b.kind,
            edgeId: b.edgeId,
            room: b.roomKey ? label(b.roomKey) : undefined,
          })),
        };
      }
      record("normal", caseId(c), row);
      log({
        normal: caseId(c),
        available: row.available,
        distanceMetres: row.distanceMetres,
        seconds,
        rssBytes: process.memoryUsage().rss,
      });
    }
    record("normal-meta", new Date().toISOString(), {
      projectionMatchesPublishedRouting: true,
      calculator: "createWorkerRouteCalculator (unhydrated)",
    });
  }

  if (stage === "report") {
    const expectationsBytes = await fs.readFile(expectationsPath!),
      expectations = checkPolicyExpectations(
        JSON.parse(expectationsBytes.toString()),
        cases.map(caseId),
        identity.casesSha256,
      );
    const normal = done("normal"),
      worker = done("worker");
    const rows = cases.map((c) => {
      const id = caseId(c),
        n = normal.get(id),
        w = worker.get(id),
        expectation = expectations.get(id)!;
      const { agreement, agrees, problems } = policyAgreement(n, w);
      const expectationProblemList = [
        ...expectationProblems(expectation, n).map((p) => `normal: ${p}`),
        ...expectationProblems(expectation, w).map((p) => `worker: ${p}`),
      ];
      return {
        id,
        ...c,
        normal: n,
        worker: w,
        agreement,
        agrees,
        agreementProblems: problems,
        expectation,
        expectationMet: expectationProblemList.length === 0,
        expectationProblems: expectationProblemList,
      };
    });
    const complete = rows.every((r) => r.normal && r.worker),
      allAgree = complete && rows.every((r) => r.agrees),
      allExpectationsMet = complete && rows.every((r) => r.expectationMet),
      passed = allAgree && allExpectationsMet;
    await fs.writeFile(
      out,
      JSON.stringify(
        {
          format: "explicit-policy-route-matrix-v2",
          generatedAt: new Date().toISOString(),
          passed,
          complete,
          allAgree,
          allExpectationsMet,
          agreementRule:
            "allAgree: every case has both outcomes, no error, and identical availability, edge id count, edge ids, door edge ids, required-edge use, distance, whole diagnostic, arrival choices, reachable count, step count, complete-value hash, step hash and summary hash (explicit-policy-matrix-checks.ts AGREEMENT_FIELDS).",
          expectationRule:
            "allExpectationsMet: the normal AND the worker outcome of every case meet its expectation (route: distance within tolerance, edges, steps, required-edge use; refusal: no route, diagnostic constraint or blocker kinds).",
          identity: {
            ...identity,
            expectationsSha256: sha(expectationsBytes),
          },
          options:
            "Both sides receive { endpointMode, allowOtherRoomTransit, preferHallways: true }, as progressive-route.worker.ts passes them; profile is the access mode.",
          normalCalculator:
            "createWorkerRouteCalculator over the visitor JSON's routing projection (unhydrated)",
          productionWorker:
            "app/indoor-project/progressive-route.worker.ts bundle, compiled receipt list, real manifest routing parts and admitted carrier",
          workerRuns: progress
            .filter((l) => l.stage === "worker-meta")
            .map((l) => l.row),
          normalRuns: progress
            .filter((l) => l.stage === "normal-meta")
            .map((l) => l.row),
          counts: {
            cases: rows.length,
            normalDone: rows.filter((r) => r.normal).length,
            workerDone: rows.filter((r) => r.worker).length,
            workerErrors: rows.filter((r) => r.worker?.error).length,
            agree: rows.filter((r) => r.agrees).length,
            expectationsMet: rows.filter((r) => r.expectationMet).length,
            expectedRoutes: rows.filter((r) => r.expectation.expect === "route")
              .length,
            expectedRefusals: rows.filter(
              (r) => r.expectation.expect === "refusal",
            ).length,
          },
          failures: rows
            .filter((r) => !r.agrees || !r.expectationMet)
            .map((r) => ({
              id: r.id,
              agreementProblems: r.agreementProblems,
              expectationProblems: r.expectationProblems,
            })),
          rows,
        },
        null,
        1,
      ),
    );
    log({ wrote: out, complete, allAgree, allExpectationsMet, passed });
    if (!passed) process.exitCode = 1;
  }
}
