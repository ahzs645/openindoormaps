/** Local compiler diagnostic, never a visitor, receipt, or runtime admission.
 * The source context retains complete graph metadata. Exact physical cell faces
 * come from the unchanged, checksum-matched published carrier. Door extensions
 * are conservatively limited to the planar demand of previously saved branches;
 * this does not stand in for fresh whole-source doorway or route qualification.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
import type { PublishedRouteCells } from "../../app/indoor-project/published-route-cells";
import type { CorridorGuideTopologyInput } from "../../app/indoor-project/corridor-guide-contacts";

const sha = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
type SourceContext = Pick<
  IndoorDataset,
  "source" | "nodes" | "edges" | "records" | "doors"
> & {
  format: "unbc-corridor-source-context-v2";
  status: "diagnostic-only";
  sourceSha256: string;
  circulationBinding: string;
  originalTopologySha256: string;
  cells: NonNullable<IndoorDataset["circulationGeometry"]>["cells"];
  guides: PreparedRouting["guides"];
  scope: {
    eligibleEdgeIds: string[];
    edgesByCell: [string, string[]][];
    doorEdgesByNode: [string, string][];
  };
};
const [mode, input, target, output, ...cellIds] = process.argv.slice(2);
if (mode === "extract" && input && target && !output) {
  let text = readFileSync(input, "utf8");
  const sourceSha256 = sha(text);
  const data = JSON.parse(text) as IndoorDataset & {
    preparedRouting: PreparedRouting;
  };
  text = "";
  if (!data.circulationGeometry?.exactTopology || !data.preparedRouting)
    throw new Error("The source lacks exact cells or recorded corridor guides");
  const { indexCorridorRoutingScope } = await import(
    "../../app/indoor-project/corridor-routing-scope"
  );
  // Resolve eligibility while every original dependency is available, including
  // reviewed mixed-level ramp approaches. The smaller context is never cast
  // back to IndoorDataset or asked to infer missing physical metadata.
  const scope = indexCorridorRoutingScope(data);
  const context: SourceContext = {
    format: "unbc-corridor-source-context-v2",
    status: "diagnostic-only",
    sourceSha256,
    source: data.source,
    circulationBinding: data.circulationGeometry.sourceGeometryKey,
    originalTopologySha256:
      data.circulationGeometry.exactTopology.geometrySha256,
    cells: data.circulationGeometry.cells,
    nodes: data.nodes,
    edges: data.edges,
    records: data.records,
    doors: data.doors,
    guides: data.preparedRouting.guides,
    scope: {
      eligibleEdgeIds: scope.eligible.map((edge) => edge.id),
      edgesByCell: [...scope.edgesByCell].map(([id, edges]) => [
        id,
        edges.map((edge) => edge.id),
      ]),
      doorEdgesByNode: [...scope.doorsByNode].map(([id, edge]) => [
        id,
        edge.id,
      ]),
    },
  };
  const bytes = JSON.stringify(context);
  writeFileSync(target, bytes);
  console.log(JSON.stringify({ sourceSha256, contextSha256: sha(bytes) }));
} else if (mode === "run" && input && target && output && cellIds.length > 0) {
  await run(input, target, output, cellIds);
} else {
  throw new Error(
    "Usage: replay-corridor-run-diagnostic.ts extract source.json context.json | run context.json cache.json.gz output-directory cell-id...",
  );
}

async function run(
  input: string,
  cacheFile: string,
  output: string,
  requestedCells: string[],
) {
  const contextBytes = readFileSync(input);
  const context = JSON.parse(contextBytes.toString()) as SourceContext;
  const compressed = readFileSync(cacheFile);
  const cacheBytes = gunzipSync(compressed);
  const cache = JSON.parse(cacheBytes.toString()) as PublishedRouteCells;
  const cacheSha256 = sha(compressed);
  if (
    context.format !== "unbc-corridor-source-context-v2" ||
    context.status !== "diagnostic-only" ||
    cache.format !== "openindoormaps-published-route-cells-v1" ||
    cache.version !== 1 ||
    cache.datasetSha256 !== context.sourceSha256 ||
    JSON.stringify(cache.source) !== JSON.stringify(context.source) ||
    cache.originalTopologySha256 !== context.originalTopologySha256 ||
    cache.guards?.circulationBinding !== context.circulationBinding ||
    path.basename(cacheFile) !== `${cacheSha256}.json.gz`
  )
    throw new Error("Context and named carrier do not match the exact source");
  const [centerline, exact, rational, guideSupport, volume, contact] =
    await Promise.all([
      import("../../app/indoor-project/corridor-centerline"),
      import("../../app/indoor-project/native-exact-planar-topology"),
      import("../../app/indoor-project/native-rational-overlay"),
      import("../../app/indoor-project/corridor-guide-support"),
      import("../../app/indoor-project/native-stepped-stair-v2-walking-volume"),
      import("../../app/indoor-project/corridor-guide-contacts"),
    ]);
  type XY = [number, number];
  type Parts =
    import("../../app/indoor-project/native-rational-overlay").NativeRationalParts;
  const nodes = new Map(context.nodes.map((node) => [node.id, node]));
  const sourceEdges = new Map(context.edges.map((edge) => [edge.id, edge]));
  const eligible = new Set(context.scope.eligibleEdgeIds);
  const edgesByCell = new Map(
    context.scope.edgesByCell.map(([id, ids]) => [
      id,
      ids.map((edgeId) => {
        const edge = sourceEdges.get(edgeId);
        if (!edge || !eligible.has(edgeId) || edge.nativeCellId !== id)
          throw new Error("Invalid extracted complete-cell scope");
        return edge;
      }),
    ]),
  );
  const doorsByNode = new Map(
    context.scope.doorEdgesByNode.map(([id, edgeId]) => {
      const edge = sourceEdges.get(edgeId);
      if (
        !edge ||
        !edge.enabled ||
        edge.kind !== "door" ||
        (edge.from !== id && edge.to !== id)
      )
        throw new Error("Invalid extracted original-door index");
      return [id, edge] as const;
    }),
  );
  const { preparedDisplayEngineBinding } = await import(
    "./prepared-display-engine-binding"
  );
  const compilerBinding = () =>
    preparedDisplayEngineBinding(
      path.resolve(import.meta.dirname, "../.."),
      ["scripts/indoor/replay-corridor-run-diagnostic.ts"],
      { namespace: "conservative-corridor-run-diagnostic-v1" },
    ).sha256;
  const sourceBinding = compilerBinding();
  const provenance = {
    status: "scoped-compiler-diagnostic-only",
    navigationAuthority: false,
    compilerBinding: sourceBinding,
    recordedEngineSha256: cache.engineSha256,
    recordedRuntimeSha256: cache.hydration?.runtimeSha256,
    sourceSha256: context.sourceSha256,
    contextSha256: sha(contextBytes),
    cacheCompressedSha256: cacheSha256,
    cacheLogicalSha256: sha(cacheBytes),
    source: context.source,
    support:
      "Complete unchanged cached physical cell, including holes; original terminal extensions limited to saved branch two-foot demand",
    limits:
      "Centerline/compiler comparison only. No recovery passes, new native doorway admission, policy/journey acceptance, visitor export, hydration, or browser qualification. Recorded doorway demand is conservative diagnostic evidence, not renewed source authority.",
  };
  mkdirSync(output, { recursive: true });
  const summaries: unknown[] = [];
  const scalar = (value: [string, string]) => {
    const result = new rational.Rational(BigInt(value[0]), BigInt(value[1]));
    if (String(result.n) !== value[0] || String(result.d) !== value[1])
      throw new Error("Noncanonical source rational");
    return result;
  };
  for (const cellId of requestedCells) {
    const started = performance.now();
    const cell = context.cells.find((c) => c.id === cellId);
    const face = cache.topology.faces.find((f) => f.id === cellId);
    const inventory = cache.inventory.find((entry) => entry.id === cellId);
    const edges = edgesByCell.get(cellId);
    if (
      !cell ||
      !face ||
      !edges ||
      inventory?.empty !== false ||
      inventory.faceId !== cell.exactFaceId ||
      !cache.guards?.cellIds.includes(cellId)
    )
      throw new Error(
        `Cell lacks its exact recorded physical context: ${cellId}`,
      );
    const point = (index: number) => {
      const value = cache.topology.coordinates[index];
      if (!value) throw new Error("Missing original exact coordinate");
      return [scalar(value.x), scalar(value.y)] as [
        import("../../app/indoor-project/native-rational-overlay").Rational,
        import("../../app/indoor-project/native-rational-overlay").Rational,
      ];
    };
    const parts = exact.freezeNativeRationalParts(
      face.parts.map((part) => part.map((ring) => ring.map(point))),
    );
    const supported = guideSupport.createTwoFootCorridorSupport(
      parts,
      cell.elevationFeet,
    );
    const byEdge = new Map(edges.map((edge) => [edge.id, edge]));
    const recorded = context.guides.filter((guide) => byEdge.has(guide.edgeId));
    const own = new Map<string, Parts>();
    const unconfirmedRecordedCores: string[] = [];
    const mark = (phase: string) =>
      console.log(
        JSON.stringify({
          cellId,
          phase,
          seconds: (performance.now() - started) / 1000,
          rssMB: process.memoryUsage().rss / 1e6,
        }),
      );
    mark("complete-physical-face");
    for (const guide of recorded) {
      const edge = byEdge.get(guide.edgeId)!;
      if (!guide.hallwayJoins) continue;
      const [a, b] = guide.hallwayJoins;
      const xy = guide.pointsFeet.map(([x, y]): XY => [x, y]);
      if (!supported(xy.slice(a, b + 1))) {
        unconfirmedRecordedCores.push(guide.edgeId);
        continue;
      }
      for (const [terminalId, branch] of [
        [edge.from, guide.pointsFeet.slice(0, a + 1)],
        [edge.to, guide.pointsFeet.slice(b).toReversed()],
      ] as const) {
        const footprint: Parts = branch.slice(1).flatMap((end, i) => {
          const start = branch[i];
          if (start.every((value, k) => value === end[k])) return [];
          const strip = volume.projectStatedTwoFootWalkingVolume(
            start,
            end,
            rational.rational(cell.elevationFeet),
            rational.rational(cell.elevationFeet),
            6,
          ).unclippedStatedStripFeet;
          return [[strip]];
        });
        own.set(
          terminalId,
          rational.nativeRationalOverlay(
            "union",
            own.get(terminalId) ?? [],
            footprint,
          ),
        );
      }
    }
    mark("recorded-terminal-demand");
    const terminals = [
      ...new Set(edges.flatMap((edge) => [edge.from, edge.to])),
    ]
      .sort()
      .map((id) => {
        const node = nodes.get(id)!;
        const door = doorsByNode.get(id);
        const opposite =
          door && nodes.get(door.from === id ? door.to : door.from);
        return {
          id,
          point: node.pointFeet.slice(0, 2) as XY,
          ...(opposite
            ? {
                approachDirection: [
                  node.pointFeet[0] - opposite.pointFeet[0],
                  node.pointFeet[1] - opposite.pointFeet[1],
                ] as XY,
              }
            : {}),
        };
      });
    const checkedCore = new Map<string, boolean>();
    const support = (points: XY[], id?: string) => {
      if (id) return supported(points, own.get(id) ?? []);
      const key = JSON.stringify(points);
      if (!checkedCore.has(key)) checkedCore.set(key, supported(points));
      return checkedCore.get(key)!;
    };
    const length = (points: readonly number[][]) =>
      points
        .slice(1)
        .reduce(
          (sum, p, i) =>
            sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
          0,
        );
    const proposalRings = exact.nativeExactPartsForProposals(parts);
    const compile = (
      straightRuns: boolean,
      reference?: CorridorGuideTopologyInput,
    ) => {
      const build = (shapedApproaches: boolean) =>
        proposalRings.map((rings, networkIndex) =>
          centerline.createCorridorCenterline(rings, terminals, support, {
            straightRuns,
            shapedApproaches,
            requiredEdges: edges,
            retainedPaths:
              straightRuns && shapedApproaches && reference
                ? contact.retainedCorridorGuidePaths(
                    reference,
                    `primary:${networkIndex}`,
                  )
                : undefined,
          }),
        );
      const primary = build(true);
      let legacy: typeof primary | undefined;
      const resolve = (
        networks: typeof primary,
        edge: (typeof edges)[number],
      ) =>
        networks
          .flatMap((network, index) => {
            const result = network.routeDetails(edge.from, edge.to);
            return result ? [{ ...result, index }] : [];
          })
          .sort((a, b) => length(a.points) - length(b.points))
          .find(
            (route) =>
              route.points.length <= 10_000 &&
              length(route.points) <=
                length(edge.pointsFeet) * 1.15 + 0.6 + 24 &&
              supported(route.points, [
                ...(own.get(edge.from) ?? []),
                ...(own.get(edge.to) ?? []),
              ]),
          );
      const guides: PreparedRouting["guides"] = [];
      const origins = new Map<string, string>();
      const refused: string[] = [];
      for (const edge of edges) {
        let route = resolve(primary, edge),
          kind = "primary";
        if (!route) {
          legacy ??= build(false);
          route = resolve(legacy, edge);
          kind = "legacy";
        }
        if (!route) {
          refused.push(edge.id);
          continue;
        }
        const pointsFeet = route.points.map(
          ([x, y]): [number, number, number] => [x, y, cell.elevationFeet],
        );
        if (
          JSON.stringify(pointsFeet[0]) !==
            JSON.stringify(edge.pointsFeet[0]) ||
          JSON.stringify(pointsFeet.at(-1)) !==
            JSON.stringify(edge.pointsFeet.at(-1))
        )
          throw new Error("Changed original terminal");
        guides.push({
          edgeId: edge.id,
          pointsFeet,
          hallwayJoins: route.hallwayJoins,
          kind: "shared-corridor",
        });
        origins.set(edge.id, `${kind}:${route.index}`);
      }
      return {
        guides,
        origins,
        refused,
        networks: primary.map((n) => n.statistics()),
      };
    };
    const control = compile(false);
    mark("control-complete");
    const candidate = compile(true, { ...control, edges: byEdge });
    mark("candidate-complete");
    const guard = contact.compareCombinedCorridorGuides(
      { ...control, edges: byEdge },
      { ...candidate, edges: byEdge },
    );
    const withdrawn =
      guard.missingGuideIds.length > 0 || guard.newContacts.length > 0;
    const accepted = withdrawn ? control : candidate;
    const tag = cellId.replaceAll(":", "_");
    const write = (suffix: string, result: typeof control) =>
      writeFileSync(
        path.join(output, `${tag}-${suffix}.json`),
        JSON.stringify({
          ...provenance,
          cell,
          terminalCount: terminals.length,
          edges,
          ...result,
          origins: [...result.origins],
          withdrawn,
        }),
      );
    write("control", control);
    write("proposed", candidate);
    write("guarded", accepted);
    const countBends = (guides: PreparedRouting["guides"]) =>
      guides.reduce((sum, guide) => {
        const [a, b] = guide.hallwayJoins!;
        const p = guide.pointsFeet
          .slice(a, b + 1)
          .filter((p, i, all) => !i || p.some((v, k) => v !== all[i - 1][k]));
        return (
          sum +
          p.slice(2).filter((c, i) => {
            const u = [p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]],
              v = [c[0] - p[i + 1][0], c[1] - p[i + 1][1]];
            return (
              Math.abs(
                Math.atan2(
                  u[0] * v[1] - u[1] * v[0],
                  u[0] * v[0] + u[1] * v[1],
                ),
              ) >
              (5 * Math.PI) / 180
            );
          }).length
        );
      }, 0);
    const matched = new Set(
      control.guides
        .filter((g) => candidate.guides.some((c) => c.edgeId === g.edgeId))
        .map((g) => g.edgeId),
    );
    const summary = {
      cellId,
      elapsedSeconds: (performance.now() - started) / 1000,
      originalEdges: edges.length,
      terminals: terminals.length,
      recordedGuides: recorded.length,
      unconfirmedRecordedCores,
      controlGuides: control.guides.length,
      proposedGuides: candidate.guides.length,
      guardedGuides: accepted.guides.length,
      withdrawn,
      missingGuideIds: guard.missingGuideIds,
      newContactCount: guard.newContacts.length,
      newContacts: guard.newContacts.slice(0, 20),
      matchedGuides: matched.size,
      coreBendsOver5Degrees: {
        control: countBends(
          control.guides.filter((g) => matched.has(g.edgeId)),
        ),
        proposed: countBends(
          candidate.guides.filter((g) => matched.has(g.edgeId)),
        ),
      },
      metricScope:
        "Sum over matched guide paths; shared lanes may occur in several guides",
      fittedRuns: candidate.networks.reduce(
        (n, s) => n + (s.straightRuns?.fittedRuns ?? 0),
        0,
      ),
    };
    summaries.push(summary);
    console.log(JSON.stringify(summary));
  }
  if (sourceBinding !== compilerBinding())
    throw new Error("Diagnostic compiler source changed during this attempt");
  writeFileSync(
    path.join(output, "diagnostic-receipt.json"),
    JSON.stringify(
      {
        ...provenance,
        cells: summaries,
        maxRSSKiB: process.resourceUsage().maxRSS,
      },
      null,
      2,
    ) + "\n",
  );
}
