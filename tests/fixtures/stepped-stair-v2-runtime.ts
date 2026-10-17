/** Synthetic current source topology for portable verifier tests only. No
 * original-RVT capability can be issued from this mathematical fixture. */
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { fixture as datasetFixture } from "./native-area-project";
import { fixture } from "./stepped-stair-v2";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import {
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  nativeRationalScalarToIEEE,
} from "../../app/indoor-project/native-rational-overlay";
import { createCurrentSteppedStairGraphBinding } from "../../app/indoor-project/native-stepped-stair-v2-graph-binding";
import {
  replayPortableSteppedStairV2,
  encodeSteppedStairV2WireValue,
} from "../../app/indoor-project/native-stepped-stair-v2-kernel";
import {
  nativeSteppedStairV2Digest,
  nativeSteppedStairV2DrawingPoints,
} from "../../app/indoor-project/native-stepped-stair-v2";

export async function steppedRuntimeFixture() {
  const f = fixture(),
    data = datasetFixture();
  delete data.presentation;
  data.nativeLevels = f.demand.terminals.map((t) => ({
    ...t.level,
    name: `Floor ${t.level.id}`,
  }));
  data.floors = data.nativeLevels.map((l) => ({
    id: String(l.id),
    name: l.name,
    levelIds: [l.id],
    elevationFeet: l.elevationFeet,
  }));
  const floors = f.index.supports
    .filter((s) => s.role === "floor")
    .map((s) => ({
      nativeElementId: s.nativeOwnerId,
      elevationFeet: nativeRationalScalarToIEEE(s.elevationFeet),
      ringsFeet: s.referencePartsFeet[0]!.map((ring) =>
        ring.map((p) => p.map(nativeRationalScalarToIEEE) as [number, number]),
      ),
    }));
  data.records = f.demand.terminals.map((t, i) => ({
    ...data.records[0]!,
    ...t.record,
    access: t.record.access as "unknown" | "public" | "staff",
    number: `01-S${i}`,
    name: "Synthetic stairs",
    elevationFeet: t.node.pointFeet[2],
    surfaceId: String(t.node.levelId),
    ringsFeet: floors[i]!.ringsFeet,
  }));
  data.nodes = f.demand.terminals.flatMap((t, i) => {
    const n = {
      ...t.node,
      building: "01",
      surfaceId: String(t.node.levelId),
      geographic: [0, 0] as [number, number],
    } as IndoorDataset["nodes"][number];
    return [
      n,
      {
        ...n,
        id: `arrival:${i}`,
        kind: "arrival" as const,
        pointFeet: [n.pointFeet[0] + (i ? 0.25 : -0.25), 0, n.pointFeet[2]] as [
          number,
          number,
          number,
        ],
      },
    ];
  });
  const original = {
    ...f.demand.edge,
    evidence: "Synthetic unqualified graph edge",
    enabled: false,
    lengthMetres: 2,
    pointsFeet: f.demand.terminals.map((t) => t.node.pointFeet),
  } as IndoorDataset["edges"][number];
  data.edges = [
    original,
    ...[0, 1].map((i) => ({
      id: `walk:${i}`,
      from: data.nodes[i * 2]!.id,
      to: data.nodes[i * 2 + 1]!.id,
      kind: "walk" as const,
      enabled: true,
      accessible: "unknown" as const,
      pointsFeet: [
        data.nodes[i * 2]!.pointFeet,
        data.nodes[i * 2 + 1]!.pointFeet,
      ],
      lengthMetres: 0.25 * 0.3048,
      roomKeys: [data.records[i]!.key],
      nativeCellId: `cell:${i}`,
      evidence: "Synthetic claimed same-owner alias",
    })),
  ];
  data.doors = [];
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors,
  };
  const envelope = {
    version: 1 as const,
    sourceModelSha256: data.source.modelSha256,
    levels: floors.map((floor, i) => ({
      levelId: i + 1,
      elevationFeet: floor.elevationFeet,
      partsFeet: [floor.ringsFeet],
      sourceElementIds: [floor.nativeElementId],
      cutElevationsFeet: [floor.elevationFeet + 4],
      evidenceSha256: "b".repeat(64),
    })),
  };
  data.nativeIndoorEnvelopes = {
    ...envelope,
    geometrySha256: await nativeIndoorEnvelopeHash(envelope),
  };
  const key = nativeCirculationGeometryKey(data);
  data.circulationGeometry = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: key,
    preparedRoomKeys: data.records.map((r) => r.key),
    exactTopology: encodeNativeExactTopology(
      {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: key,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      },
      f.index.supports
        .filter((s) => s.role === "floor")
        .map((s, i) => ({ id: `face:${i}`, parts: s.referencePartsFeet })),
    ),
    cells: floors.map((floor, i) => ({
      id: `cell:${i}`,
      exactFaceId: `face:${i}`,
      levelIds: [i + 1],
      elevationFeet: floor.elevationFeet,
      roomKeys: [data.records[i]!.key],
      nativeFloorIds: [floor.nativeElementId],
      ringsFeet: floor.ringsFeet,
      sourceCoverage: 1,
    })),
  };
  const graph = createCurrentSteppedStairGraphBinding(data, original.id),
    replay = replayPortableSteppedStairV2(f.index, f.receipt, graph, graph);
  if (!replay.mathematicalReplayPassed)
    throw new Error(replay.issues.join("; "));
  const edge = {
    ...original,
    enabled: true,
    pointsFeet: nativeSteppedStairV2DrawingPoints(replay, graph),
    nativeSteppedStairV2: {
      version: 2 as const,
      sourceIndexId: "synthetic-only",
      anchorPolicy: "existing-claimed-cell-only" as const,
      circulationGeometryKey: key,
      originalGraphBinding: graph,
      receipt: encodeSteppedStairV2WireValue(f.receipt),
      terminalApproaches: [0, 1].map((i) => ({
        nodeId: [original.from, original.to][i]!,
        nativeCellId: `cell:${i}`,
        walkEdgeId: `walk:${i}`,
        walkEdgeSha256: nativeSteppedStairV2Digest(data.edges[i + 1]),
        cellSha256: nativeSteppedStairV2Digest(
          data.circulationGeometry!.cells[i],
        ),
      })) as NonNullable<
        IndoorDataset["edges"][number]["nativeSteppedStairV2"]
      >["terminalApproaches"],
    },
  };
  data.edges[0] = edge;
  data.nativeSteppedStairV2SourceIndices = [
    { id: "synthetic-only", physical: encodeSteppedStairV2WireValue(f.index) },
  ];
  return { data, edge, sourceAuthority: false as const };
}
