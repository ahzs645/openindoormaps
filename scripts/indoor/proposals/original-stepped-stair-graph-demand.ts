/** Unimported design prototype: preserves a CHECKED ORIGINAL graph demand.
 * This establishes identity only. It supplies no floor, stair, body, access or
 * route approval, and a matching checksum is never a geometry certificate. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

type Point3 = [number, number, number];
type Node = {
  id: string; roomKey: string; kind: string; levelId: number;
  pointFeet: Point3; [key: string]: unknown;
};
type Edge = {
  id: string; from: string; to: string; kind: string;
  nativeElementId?: number; accessible: string; roomKeys: string[];
  pointsFeet: Point3[]; direction?: string; [key: string]: unknown;
};
type Record = {
  key: string; levelId: number; building: string; access: string;
  walkable: boolean; circulation: boolean; stair: boolean;
  [key: string]: unknown;
};
type Dataset = {
  source: { modelSha256: string };
  nodes: Node[]; edges: Edge[]; records: Record[];
  nativeLevels: { id: number; elevationFeet: number; [key: string]: unknown }[];
};
const brand: unique symbol = Symbol("original-stepped-stair-graph-demand");
export type OriginalSteppedStairGraphDemand = {
  readonly [brand]: true;
  readonly originalDatasetSha256: string;
  readonly sourceModelSha256: string;
  readonly edgeId: string;
  /** Identity demand only; callers must never treat this handle as admission. */
  readonly scope: "original-graph-identity-only";
};
const identity = (edge: Edge) => ({
  id: edge.id, from: edge.from, to: edge.to, kind: edge.kind,
  nativeElementId: edge.nativeElementId, accessible: edge.accessible,
  roomKeys: edge.roomKeys, direction: edge.direction ?? "both",
});
const recordIdentity = (record: Record) => ({
  key: record.key, levelId: record.levelId, building: record.building,
  access: record.access, walkable: record.walkable,
  circulation: record.circulation, stair: record.stair,
});
type Snapshot = {
  edge: ReturnType<typeof identity>;
  terminals: {
    node: Node;
    level: Dataset["nativeLevels"][number];
    record: ReturnType<typeof recordIdentity>;
  }[];
};
const snapshots = new WeakMap<OriginalSteppedStairGraphDemand, Snapshot>();
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const finitePoint = (point: unknown): point is Point3 =>
  Array.isArray(point) && point.length === 3 &&
  [0, 1, 2].every((i) => typeof point[i] === "number" && Number.isFinite(point[i]));
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
function unique<T>(values: T[], message: string): T {
  if (values.length !== 1) throw Error(message);
  return values[0]!;
}
function snapshot(data: Dataset, edgeId: string): Snapshot {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges) ||
      !Array.isArray(data.records) || !Array.isArray(data.nativeLevels))
    throw Error("Missing original stair graph operands");
  const edge = unique(data.edges.filter((e) => e.id === edgeId), "Missing or duplicated original stair edge");
  if (!nonempty(edge.id) || !nonempty(edge.from) || !nonempty(edge.to) ||
      edge.from === edge.to || !["stairs", "local-steps"].includes(edge.kind) ||
      !Number.isSafeInteger(edge.nativeElementId) || Number(edge.nativeElementId) <= 0 ||
      edge.accessible !== "no" || !Array.isArray(edge.roomKeys) ||
      new Set(edge.roomKeys).size !== edge.roomKeys.length ||
      !["both", "from-to", "to-from"].includes(edge.direction ?? "both"))
    throw Error("Invalid original stair identity/access demand");
  const terminals = [edge.from, edge.to].map((id) => {
    const node = unique(data.nodes.filter((n) => n.id === id), "Missing or duplicated original stair node");
    if (node.kind !== "stair" || !nonempty(node.roomKey) || !finitePoint(node.pointFeet))
      throw Error("Invalid original stair terminal node");
    const level = unique(data.nativeLevels.filter((l) => l.id === node.levelId), "Missing or duplicated original served level");
    const record = unique(data.records.filter((r) => r.key === node.roomKey), "Missing or duplicated original stair room identity");
    if (level.elevationFeet !== node.pointFeet[2] || record.levelId !== node.levelId ||
        !["public", "staff", "unknown"].includes(record.access) ||
        typeof record.walkable !== "boolean" || typeof record.circulation !== "boolean" ||
        typeof record.stair !== "boolean")
      throw Error("Original terminal level/room/access disagrees");
    return { node, level, record: recordIdentity(record) };
  });
  const keys = [...new Set(terminals.map((t) => t.node.roomKey))];
  if (terminals[0]!.node.levelId === terminals[1]!.node.levelId ||
      keys.length !== edge.roomKeys.length || keys.some((key) => !edge.roomKeys.includes(key)))
    throw Error("Original stair endpoints do not match served identity");
  return structuredClone({ edge: identity(edge), terminals });
}
function stored(demand: OriginalSteppedStairGraphDemand): Snapshot {
  const value = snapshots.get(demand);
  if (!value) throw Error("Original graph demand requires its checked-byte handle");
  return value;
}

/** expectedDatasetSha256 must come from the independently selected baseline
 * receipt. This checks those exact bytes; it does NOT validate the source
 * dataset or promote its existing disabled stair. The ordinary checked source
 * importer and complete native source constructors remain separate gates. */
export function captureOriginalSteppedStairGraphDemand(
  originalDatasetBytes: Uint8Array,
  expectedDatasetSha256: string,
  expectedSourceModelSha256: string,
  originalEdgeId: string,
): OriginalSteppedStairGraphDemand {
  if (!/^[a-f0-9]{64}$/.test(expectedDatasetSha256) ||
      !/^[a-f0-9]{64}$/.test(expectedSourceModelSha256))
    throw Error("Invalid expected original graph/model identity");
  const bytes = Uint8Array.from(originalDatasetBytes);
  if (hash(bytes) !== expectedDatasetSha256) throw Error("Original graph byte checksum differs");
  const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Dataset;
  if (data.source?.modelSha256 !== expectedSourceModelSha256) throw Error("Original graph source model differs");
  const value = snapshot(data, originalEdgeId);
  const edge = unique(data.edges.filter((e) => e.id === originalEdgeId), "Original edge missing");
  if (!Array.isArray(edge.pointsFeet) || edge.pointsFeet.length < 2 ||
      !equal(edge.pointsFeet[0], value.terminals[0]!.node.pointFeet) ||
      !equal(edge.pointsFeet.at(-1), value.terminals[1]!.node.pointFeet))
    throw Error("Original graph edge does not meet its original terminals");
  const demand = Object.freeze({
    [brand]: true as const,
    originalDatasetSha256: expectedDatasetSha256,
    sourceModelSha256: expectedSourceModelSha256,
    edgeId: originalEdgeId,
    scope: "original-graph-identity-only" as const,
  });
  snapshots.set(demand, value);
  return demand;
}

/** Snapshot is a detached request, never a portable certificate. */
export function inspectOriginalSteppedStairGraphDemand(demand: OriginalSteppedStairGraphDemand) {
  return { ...structuredClone(stored(demand)), routeApproved: false as const };
}

/** Enabling/path/length changes may be produced by later checked compilation;
 * every original node field, served level, room permission and edge identity
 * must remain exact. No geometric proof is accepted by this function. */
export function assertOriginalSteppedStairGraphDemandPreserved(
  demand: OriginalSteppedStairGraphDemand,
  candidate: Dataset,
): void {
  if (candidate.source?.modelSha256 !== demand.sourceModelSha256 ||
      !equal(stored(demand), snapshot(candidate, demand.edgeId)))
    throw Error("Candidate changed original stair terminal identity or permissions");
}

/** A cap candidate is only a REQUESTED position. Actual native floor/typed
 * begin/end corridor/full-body checks must independently supply its proof.
 * This deliberately exposes lateral mismatch rather than relabelling the
 * requested cap as an original graph terminal. */
export function describeOriginalSteppedTerminalRequests(
  demand: OriginalSteppedStairGraphDemand,
  requestedPhysicalCapsFeet: readonly [Point3, Point3],
) {
  const value = stored(demand);
  if (requestedPhysicalCapsFeet.length !== 2 ||
      !requestedPhysicalCapsFeet.every(finitePoint))
    throw Error("Invalid requested source physical caps");
  return value.terminals.map((terminal, i) => {
    const original = terminal.node.pointFeet;
    const cap = requestedPhysicalCapsFeet[i]!;
    const sameXY = original[0] === cap[0] && original[1] === cap[1];
    return {
      originalGraphNodeId: terminal.node.id,
      originalLevelId: terminal.node.levelId,
      originalLogicalPointFeet: [...original] as Point3,
      requestedPhysicalCapFeet: [...cap] as Point3,
      relation: !sameXY ? "source-supported-physical-approach-required" as const :
        original[2] === cap[2] ? "same-requested-point" as const :
          "distinct-logical-to-physical-height-binding-required" as const,
      sourceGeometryOrRouteApproved: false as const,
    };
  });
}
