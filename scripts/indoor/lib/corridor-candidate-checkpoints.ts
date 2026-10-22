import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../../app/indoor-project/contract";
import { indexCorridorRoutingScope } from "../../../app/indoor-project/corridor-routing-scope";
import type { CorridorCompilerParameters } from "../../../app/indoor-project/corridor-routing-parameters";
import { geographicPoint } from "../../../app/indoor-project/routing";
import type { CorridorCellCompilation } from "../../../app/indoor-project/prepare-corridor-routing";
import type { PreparedRouting } from "../../../app/indoor-project/prepared-routing";

export const CORRIDOR_CANDIDATE_PARAMETERS = {
  method: "shared-corridor",
  constructionScope: "complete-native-physical-cell",
  emittedEdges: "all-eligible-original-walks",
} as const;

export type CorridorCandidateBinding = {
  version: 2;
  inputZipSha256: string;
  inputJsonSha256: string;
  sourceModelSha256: string;
  sourceGeometryKey: string;
  compilerBinding: string;
  resolverVersion: string;
  runtime: {
    node: string;
    v8: string;
    platform: string;
    architecture: string;
    execArgv: string[];
    nodeOptions: string;
  };
  parameters: typeof CORRIDOR_CANDIDATE_PARAMETERS & {
    compiler: CorridorCompilerParameters;
  };
};

export type CorridorCandidateCellScope = {
  cellId: string;
  elevationFeet: number;
  edgeIds: string[];
  terminalIds: string[];
  incidentDoorIds: string[];
  scopeSha256: string;
};

export type CorridorCandidateCheckpoint = {
  version: 2;
  status: "candidate-guides-only";
  binding: CorridorCandidateBinding;
  scope: CorridorCandidateCellScope;
  cell: CorridorCellCompilation;
  guides: PreparedRouting["guides"];
  payloadSha256: string;
};

export const corridorCandidateSha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** Key order in a decoded JSON file is not a dependency change. Numeric
 * coordinates and original array order remain exact; no rounding is allowed.
 */
export function corridorCandidateCanonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(
      Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
    );
  });
}

/** The complete input hash binds all exact faces, elevations, obstacles and
 * policy. This additional local scope records the original requirements and
 * portal context explicitly, so a shard cannot silently omit an anchor.
 */
export function corridorCandidateCellScopes(data: IndoorDataset) {
  const { nodes, edgesByCell } = indexCorridorRoutingScope(data);
  const cells = new Map(
    data.circulationGeometry?.cells.map((cell) => [cell.id, cell]),
  );
  const doorsByNode = new Map<string, typeof data.edges>();
  for (const edge of data.edges) {
    if (!edge.enabled || edge.kind !== "door") continue;
    for (const id of [edge.from, edge.to]) {
      const edges = doorsByNode.get(id) ?? [];
      edges.push(edge);
      doorsByNode.set(id, edges);
    }
  }
  return new Map(
    [...edgesByCell]
      .map(([cellId, edges]) => {
        const terminalIds = [
          ...new Set(edges.flatMap((edge) => [edge.from, edge.to])),
        ].sort();
        const terminals = terminalIds.map((id) => nodes.get(id)!);
        const doors = [
          ...new Map(
            terminalIds
              .flatMap((id) => doorsByNode.get(id) ?? [])
              .map((edge) => [edge.id, edge]),
          ).values(),
        ].sort((a, b) => a.id.localeCompare(b.id));
        const cell = cells.get(cellId);
        const scope: CorridorCandidateCellScope = {
          cellId,
          elevationFeet: cell?.elevationFeet ?? terminals[0].pointFeet[2],
          edgeIds: edges.map((edge) => edge.id).sort(),
          terminalIds,
          incidentDoorIds: doors.map((edge) => edge.id),
          scopeSha256: corridorCandidateSha256(
            corridorCandidateCanonicalJson([
              cell ?? null,
              edges,
              terminals,
              doors,
            ]),
          ),
        };
        return [cellId, scope] as const;
      })
      .sort(
        ([, a], [, b]) =>
          a.elevationFeet - b.elevationFeet || a.cellId.localeCompare(b.cellId),
      ),
  );
}

export function makeCorridorCandidateCheckpoint(
  binding: CorridorCandidateBinding,
  scope: CorridorCandidateCellScope,
  cell: CorridorCellCompilation,
  guides: PreparedRouting["guides"],
): CorridorCandidateCheckpoint {
  const payload = {
    version: 2 as const,
    status: "candidate-guides-only" as const,
    binding,
    scope,
    cell,
    guides,
  };
  return {
    ...payload,
    payloadSha256: corridorCandidateSha256(
      corridorCandidateCanonicalJson(payload),
    ),
  };
}

/** Integrity and complete accounting do not restore navigation authority.
 * Normal import, physical/policy qualification and worker replay still follow.
 */
export function validateCorridorCandidateCheckpoint(
  value: unknown,
  binding: CorridorCandidateBinding,
  scope: CorridorCandidateCellScope,
  data: IndoorDataset,
): asserts value is CorridorCandidateCheckpoint {
  const fail = (reason: string): never => {
    throw new Error(`Invalid candidate checkpoint ${scope.cellId}: ${reason}`);
  };
  if (!value || typeof value !== "object") fail("missing record");
  const record = value as CorridorCandidateCheckpoint;
  if (record.version !== 2 || record.status !== "candidate-guides-only")
    fail("unsupported checkpoint version/status");
  if (
    corridorCandidateCanonicalJson(record.binding) !==
    corridorCandidateCanonicalJson(binding)
  )
    fail("stale input, compiler, runtime or parameters");
  if (
    corridorCandidateCanonicalJson(record.scope) !==
    corridorCandidateCanonicalJson(scope)
  )
    fail("incomplete or changed original cell scope");
  const { payloadSha256, ...payload } = record;
  if (
    payloadSha256 !==
    corridorCandidateSha256(corridorCandidateCanonicalJson(payload))
  )
    fail("payload checksum mismatch");
  const report = record.cell;
  if (
    !report ||
    report.cellId !== scope.cellId ||
    report.elevationFeet !== scope.elevationFeet ||
    report.eligibleEdges !== scope.edgeIds.length ||
    report.requestedEdges !== scope.edgeIds.length ||
    report.terminalCount !== scope.terminalIds.length ||
    !Array.isArray(report.guideIds) ||
    !Array.isArray(report.refusedEdges) ||
    !Array.isArray(record.guides) ||
    report.compiledEdges !== record.guides.length ||
    report.emittedEdges !== record.guides.length
  )
    fail("partial cell or inconsistent counts");
  const guideIds = record.guides.map((guide) => guide.edgeId);
  if (
    corridorCandidateCanonicalJson([...report.guideIds].sort()) !==
    corridorCandidateCanonicalJson([...guideIds].sort())
  )
    fail("guide identities disagree");
  const outcomes = [
    ...guideIds,
    ...report.refusedEdges.map((entry) => entry.edgeId),
  ].sort();
  if (
    corridorCandidateCanonicalJson(outcomes) !==
    corridorCandidateCanonicalJson(scope.edgeIds)
  )
    fail("duplicate, missing or foreign original-edge outcome");
  if (
    report.refusedEdges.some(
      (entry) => typeof entry.reason !== "string" || !entry.reason,
    )
  )
    fail("missing refusal reason");
  const edges = new Map(data.edges.map((edge) => [edge.id, edge]));
  for (const guide of record.guides) {
    const edge = edges.get(guide.edgeId);
    const points = guide.pointsFeet;
    if (
      !edge ||
      edge.nativeCellId !== scope.cellId ||
      guide.kind !== "shared-corridor" ||
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length > 10_000 ||
      points.some(
        (point) =>
          !Array.isArray(point) ||
          point.length !== 3 ||
          point.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e8) ||
          point[2] !== scope.elevationFeet,
      ) ||
      ![0, points.length - 1].every((index, end) =>
        points[index].every(
          (v, coordinate) =>
            v ===
            edge.pointsFeet[end ? edge.pointsFeet.length - 1 : 0][coordinate],
        ),
      )
    )
      fail("invalid guide or changed original endpoints");
    const joins = guide.hallwayJoins;
    if (
      !Array.isArray(joins) ||
      joins.length !== 2 ||
      joins.some(
        (index) =>
          !Number.isInteger(index) || index < 0 || index >= points.length,
      ) ||
      joins[0] > joins[1] ||
      joins[0] > 2 ||
      points.length - 1 - joins[1] > 2
    )
      fail("invalid original terminal approaches");
  }
}

export function mergeCorridorCandidateCheckpoints(
  values: readonly unknown[],
  binding: CorridorCandidateBinding,
  scopes: ReadonlyMap<string, CorridorCandidateCellScope>,
  data: IndoorDataset,
  requireComplete = true,
) {
  const result = new Map<string, CorridorCandidateCheckpoint>();
  for (const value of values) {
    const id = (value as CorridorCandidateCheckpoint | null)?.scope?.cellId;
    const scope = id && scopes.get(id);
    if (!scope) throw new Error(`Unexpected candidate cell ${id ?? "unknown"}`);
    validateCorridorCandidateCheckpoint(value, binding, scope, data);
    if (result.has(scope.cellId))
      throw new Error(`Duplicate candidate cell ${scope.cellId}`);
    result.set(scope.cellId, value);
  }
  if (requireComplete) {
    const missing = [...scopes.keys()].filter((id) => !result.has(id));
    if (missing.length > 0)
      throw new Error(`Missing candidate cells: ${missing.join(", ")}`);
  }
  return new Map(
    [...scopes.keys()].flatMap((id) => {
      const record = result.get(id);
      return record ? [[id, record] as const] : [];
    }),
  );
}

/** WGS84 display features retain native feet and original identities as
 * properties. They are deliberately unsuitable as a replacement routing graph.
 */
export function corridorCandidateDisplayGeoJson(
  data: IndoorDataset,
  prepared: PreparedRouting,
) {
  const edges = new Map(data.edges.map((edge) => [edge.id, edge]));
  return {
    type: "FeatureCollection" as const,
    status: "candidate-display-only" as const,
    navigationAuthority: false,
    sourceModelSha256: prepared.sourceModelSha256,
    sourceGeometryKey: prepared.sourceGeometryKey,
    resolverVersion: prepared.resolverVersion,
    features: prepared.guides.flatMap((guide) => {
      const edge = edges.get(guide.edgeId);
      if (!edge || !guide.hallwayJoins)
        throw new Error(
          `Missing original display-guide identity: ${guide.edgeId}`,
        );
      const [first, last] = guide.hallwayJoins;
      const roles = [
        {
          role: "approach-start",
          points: guide.pointsFeet.slice(0, first + 1),
        },
        { role: "core", points: guide.pointsFeet.slice(first, last + 1) },
        { role: "approach-end", points: guide.pointsFeet.slice(last) },
      ];
      return roles
        .filter(({ points }) => points.length >= 2)
        .map(({ role, points }) => ({
          type: "Feature" as const,
          properties: {
            edgeId: edge.id,
            nativeCellId: edge.nativeCellId,
            from: edge.from,
            to: edge.to,
            elevationFeet: points[0][2],
            role,
            source: "checked-candidate-shared-guide",
            pointsFeet: points,
          },
          geometry: {
            type: "LineString" as const,
            coordinates: points.map((point) => geographicPoint(data, point)),
          },
        }));
    }),
  };
}
