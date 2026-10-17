/** Read-only structural audit, deliberately avoiding a full map import. This
 * verifies transport/descriptor hashes, not routing or current physical policy.
 * Usage: node --import tsx scripts/indoor/audit-corridor-package.ts input.zip
 *        output-directory [--cell exact-cell-id]
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  createNativeExactTopologyIndex,
  nativeRationalPathSupported,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  proposeCorridorBackbone,
  type CorridorTerminal,
  type Point,
} from "./lib/corridor-backbone-proposal";

const [input, output, ...args] = process.argv.slice(2);
if (
  !input ||
  !output ||
  (args.length > 0 && (args[0] !== "--cell" || args.length !== 2))
)
  throw new Error(
    "Usage: audit-corridor-package.ts visitor.zip output-directory [--cell cell-id]",
  );
const bytes = await readFile(input);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const files = unzipSync(bytes);
const manifest = JSON.parse(strFromU8(files["manifest.json"]));
const raw = files[manifest.indoor?.path];
if (
  !raw ||
  raw.length !== manifest.indoor.bytes ||
  sha(raw) !== manifest.indoor.sha256
)
  throw new Error("Indoor JSON does not match the package manifest");
const data = JSON.parse(strFromU8(raw)) as IndoorDataset;
if (data.source.modelSha256 !== manifest.model.sha256)
  throw new Error("Model identities disagree");
const serialized = (v: unknown) => Buffer.from(JSON.stringify(v));
const size = (v: unknown) => {
  const b = serialized(v);
  return {
    jsonBytes: b.length,
    independentGzip6Bytes: gzipSync(b, { level: 6 }).length,
  };
};
const fields = Object.entries(data)
  .map(([field, value]) => ({ field, ...size(value) }))
  .sort((a, b) => b.jsonBytes - a.jsonBytes);
const records = new Map(data.records.map((r) => [r.key, r]));
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const walks = data.edges.filter((e) => e.enabled && e.kind === "walk");
const hallwayWalks = walks.filter(
  (e) =>
    e.roomKeys.length > 0 &&
    e.roomKeys.every((k) => {
      const r = records.get(k);
      return r?.circulation && r.walkable && r.access !== "staff";
    }),
);
const counts = new Map<string, number>();
for (const e of data.edges) {
  const key = `${e.kind}:${e.enabled ? "enabled" : "disabled"}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const grouped = new Map<string, typeof walks>();
for (const edge of hallwayWalks) {
  const key = edge.nativeCellId ?? "no-native-cell";
  const group = grouped.get(key) ?? [];
  group.push(edge);
  grouped.set(key, group);
}
const exactSegments = new Set<string>();
let segmentUses = 0;
for (const edge of hallwayWalks) {
  // An identical segment may only be pooled with the same original policy
  // scope. This number is a storage statistic, never a junction or node merge.
  const scope = JSON.stringify([
    edge.nativeCellId,
    [...edge.roomKeys].sort(),
    edge.accessible,
    edge.direction ?? "both",
  ]);
  for (let i = 1; i < edge.pointsFeet.length; i++) {
    const pair = [
      JSON.stringify(edge.pointsFeet[i - 1]),
      JSON.stringify(edge.pointsFeet[i]),
    ];
    if ((edge.direction ?? "both") === "both") pair.sort();
    exactSegments.add(JSON.stringify([scope, pair]));
    segmentUses++;
  }
}
const cells = data.circulationGeometry?.cells ?? [];
const poolingProbes = [
  ["nativeMaterialSections", "levels", "sourceElementIds"],
  ["nativeProvisionalCornerSeals", "rows", "sourceFloorBindings"],
].map(([parentKey, rowsKey, field]) => {
  const parent = data[parentKey as keyof IndoorDataset] as unknown as Record<
    string,
    unknown
  >;
  const rows = parent[rowsKey] as Record<string, unknown>[];
  const values: unknown[] = [];
  const ids = new Map<string, number>();
  let valueBytes = 0;
  const pooledRows = rows.map((row) => {
    if (!(field in row)) return { ...row };
    const encoded = JSON.stringify(row[field]);
    valueBytes += Buffer.byteLength(encoded);
    let id = ids.get(encoded);
    if (id === undefined) {
      id = values.length;
      ids.set(encoded, id);
      values.push(row[field]);
    }
    return { ...row, [field]: { $pool: id } };
  });
  const candidate = {
    ...parent,
    [rowsKey]: pooledRows,
    pooledFieldValues: values,
  };
  const restored: Record<string, unknown> = {
    ...parent,
    [rowsKey]: pooledRows.map((row) => {
      const ref = row[field] as { $pool: number } | undefined;
      return ref ? { ...row, [field]: values[ref.$pool] } : { ...row };
    }),
  };
  if (JSON.stringify(restored) !== JSON.stringify(parent))
    throw new Error(
      "Pool experiment did not restore the exact reserialized parent",
    );
  return {
    parentKey,
    rowsKey,
    field,
    rows: rows.length,
    uniqueValues: values.length,
    repeatedSerializedValueBytes:
      valueBytes -
      [...ids.keys()].reduce((sum, v) => sum + Buffer.byteLength(v), 0),
    originalParent: fields.find((entry) => entry.field === parentKey),
    pooledParent: size(candidate),
    exactReserializedParentRestored: true,
    note: "Hypothetical pool codec only. Preserves property order and IEEE values after JSON parsing; does not assert original raw JSON spelling or issue a new geometry binding. No package was rewritten.",
  };
});
const report = {
  status: "structural-diagnostic-only",
  fullImportOrRouteValidationPerformed: false,
  source: {
    packageBytes: bytes.length,
    packageSha256: sha(bytes),
    indoorBytes: raw.length,
    indoorSha256: sha(raw),
    sourceModelSha256: data.source.modelSha256,
  },
  sizeNote:
    "Fields are independently gzip-compressed at level 6; these sizes do not sum to the original ZIP's DEFLATE size.",
  fields,
  poolingProbes,
  largestFieldChildren: Object.fromEntries(
    fields.slice(0, 5).map(({ field }) => {
      const v = data[field as keyof IndoorDataset];
      return [
        field,
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.entries(v)
              .map(([name, value]) => ({ name, ...size(value) }))
              .sort((a, b) => b.jsonBytes - a.jsonBytes)
              .slice(0, 8)
          : [],
      ];
    }),
  ),
  graph: {
    records: data.records.length,
    nodes: data.nodes.length,
    edges: data.edges.length,
    edgeKinds: Object.fromEntries(counts),
    walkingEdges: walks.length,
    walkingGeometryOnly: size(walks.map((e) => e.pointsFeet)),
    hallwayOwnedWalkingEdges: hallwayWalks.length,
    hallwayCoordinateUses: hallwayWalks.reduce(
      (sum, e) => sum + e.pointsFeet.length,
      0,
    ),
    hallwayGeometryOnly: size(hallwayWalks.map((e) => e.pointsFeet)),
    exactSamePolicySegmentUses: segmentUses,
    uniqueExactSamePolicySegments: exactSegments.size,
    preparedRoutingPresent: "preparedRouting" in data,
    nativeCellCount: cells.length,
    largestHallwayGroups: [...grouped]
      .map(([id, edges]) => ({
        id,
        edges: edges.length,
        coordinates: edges.reduce((sum, e) => sum + e.pointsFeet.length, 0),
        outerVertices: cells.find((c) => c.id === id)?.ringsFeet[0].length,
        holes: (cells.find((c) => c.id === id)?.ringsFeet.length ?? 1) - 1,
      }))
      .sort((a, b) => b.edges - a.edges)
      .slice(0, 10),
  },
};
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "package-audit.json"),
  JSON.stringify(report, null, 2) + "\n",
);
if (args[0] === "--cell") {
  const cell = cells.find((c) => c.id === args[1]);
  if (!cell?.exactFaceId || !data.circulationGeometry?.exactTopology)
    throw new Error("Selected cell needs saved exact topology");
  if (
    cell.roomKeys.some((key) => {
      const r = records.get(key);
      return !r?.circulation || !r.walkable || r.access === "staff";
    })
  )
    throw new Error(
      "Only an existing wholly circulation-owned cell can be proposed",
    );
  // Descriptor readback deliberately uses the historical binding printed in
  // the report. It does not recalculate/reissue current compiler authority.
  const topo = data.circulationGeometry.exactTopology;
  const index = createNativeExactTopologyIndex(topo, topo);
  const parts = index.parts(cell.exactFaceId);
  if (!parts || topo.sourceModelSha256 !== data.source.modelSha256)
    throw new Error("Selected historical source face is unavailable");
  const p = cell.ringsFeet[0];
  const longest = p
    .map((a, i) => ({ a, b: p[(i + 1) % p.length] }))
    .sort(
      (a, b) =>
        Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) -
        Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]),
    )[0];
  const angle = Math.atan2(
    longest.b[1] - longest.a[1],
    longest.b[0] - longest.a[0],
  );
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const local = p.map(([x, y]) => [x * c + y * s, -x * s + y * c]);
  const xs = local.map((q) => q[0]),
    ys = local.map((q) => q[1]);
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  if (cell.ringsFeet.length !== 1 || xmax - xmin < 3 * (ymax - ymin))
    throw new Error(
      "This bounded straight-run experiment needs a narrow, unperforated cell",
    );
  const xy = (x: number, y: number): Point => [
    x * c - y * s,
    x * s + y * c,
    cell.elevationFeet,
  ];
  const inset = (ymax - ymin) / 2;
  const run = {
    id: `${cell.id}:centre-proposal`,
    levelId: cell.levelIds[0],
    roomKeys: cell.roomKeys,
    pointsFeet: [
      xy(xmin + inset, (ymin + ymax) / 2),
      xy(xmax - inset, (ymin + ymax) / 2),
    ],
  };
  const original = walks.filter((e) => e.nativeCellId === cell.id);
  const nodeIds = new Set(original.flatMap((e) => [e.from, e.to]));
  const terminals: CorridorTerminal[] = [];
  const labels: Record<string, string> = {};
  for (const edge of data.edges.filter((e) => e.enabled && e.kind === "door"))
    for (const [id, other] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ]) {
      const n = nodes.get(id),
        otherNode = nodes.get(other);
      if (
        !n ||
        !otherNode ||
        !nodeIds.has(id) ||
        !cell.roomKeys.includes(n.roomKey)
      )
        continue;
      if (!terminals.some((t) => t.nodeId === id))
        terminals.push({
          nodeId: id,
          entranceEdgeId: edge.id,
          roomKey: n.roomKey,
          levelId: n.levelId,
          pointFeet: [...n.pointFeet],
        });
      labels[id] = records.get(otherNode.roomKey)?.number ?? otherNode.roomKey;
    }
  // Cover the source terminal stations, so end doors may branch perpendicularly
  // as well. A bounding-box axis is only a proposal: exact support below can
  // still refuse it. No endpoint is snapped, moved or replaced.
  if (terminals.length > 0) {
    const stations = terminals.map(
      (t) => t.pointFeet[0] * c + t.pointFeet[1] * s,
    );
    run.pointsFeet = [
      xy(Math.max(xmin, Math.min(...stations)), (ymin + ymax) / 2),
      xy(Math.min(xmax, Math.max(...stations)), (ymin + ymax) / 2),
    ];
  }
  const proposal = proposeCorridorBackbone([run], terminals, (path) =>
    nativeRationalPathSupported(path, parts),
  );
  const result = {
    ...proposal,
    cellId: cell.id,
    roomNumbers: cell.roomKeys.map((key) => records.get(key)?.number),
    source: report.source,
    savedTopology: {
      geometrySha256: topo.geometrySha256,
      sourceGeometryKey: topo.sourceGeometryKey,
      kernelVersion: topo.kernelVersion,
    },
    checks: {
      historicalExactFaceSupportOnly: true,
      fullWidthOrMaterialReplay: false,
      doorAndPolicyReplay: false,
      actualNavigation: false,
      sourceOrGraphMutated: false,
    },
    labels,
    terminals,
    ringsFeet: cell.ringsFeet,
    originalPaths: original.map((e) => ({
      edgeId: e.id,
      pointsFeet: e.pointsFeet,
    })),
    originalCoordinateUses: original.reduce(
      (sum, e) => sum + e.pointsFeet.length,
      0,
    ),
  };
  await writeFile(
    path.join(output, "corridor-proposal.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      cellId: cell.id,
      acceptedRuns: proposal.runs.length,
      sourceDoorTerminals: terminals.length,
      proposedBranches: proposal.branches.length,
      unattached: proposal.unattached,
      originalWalkingEdges: original.length,
    }),
  );
}
console.log(
  JSON.stringify({ packageBytes: bytes.length, graph: report.graph }),
);
