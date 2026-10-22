// Which stepped-stair terminal-approach condition fails, and for which edge.
import { readFileSync } from "node:fs";
import { routeWorkerDataset } from "../unbc/openindoormaps/app/indoor-project/route-worker-dataset";
import { nativeSteppedStairV2Digest } from "../unbc/openindoormaps/app/indoor-project/native-stepped-stair-v2";
const raw = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const data: any = process.argv[3] === "projected" ? routeWorkerDataset(raw) : raw;
const g = data.circulationGeometry;
const out: unknown[] = [];
let total = 0;
for (const edge of data.edges) {
  const proof = edge.nativeSteppedStairV2;
  if (!proof) continue;
  total++;
  for (const [side, nodeId] of [edge.from, edge.to].entries()) {
    const b = proof.terminalApproaches?.[side];
    const node = data.nodes.find((n: any) => n.id === nodeId);
    const record = node && data.records.find((r: any) => r.key === node.roomKey);
    const cells = g.cells.filter((c: any) => c.id === b?.nativeCellId);
    const walks = data.edges.filter((e: any) => e.id === b?.walkEdgeId);
    const cell = cells[0], walk = walks[0];
    const checks: Record<string, boolean> = {
      binding: !!b, nodeMatches: b?.nodeId === nodeId, node: !!node, record: !!record,
      walkable: !!record?.walkable, notStaff: record?.access !== "staff", stairOrCirc: !!(record?.stair || record?.circulation),
      oneCell: cells.length === 1, oneWalk: walks.length === 1, exactFace: !!cell?.exactFaceId,
      cellRoom: !!cell?.roomKeys?.includes(node?.roomKey), cellLevel: !!cell?.levelIds?.includes(node?.levelId),
      cellElevation: cell?.elevationFeet === node?.pointFeet?.[2], walkEnabled: !!walk?.enabled, walkKind: walk?.kind === "walk",
      walkCell: walk?.nativeCellId === cell?.id, walkEnds: !!walk && [walk.from, walk.to].includes(nodeId),
      walkRoom: !!walk?.roomKeys?.includes(node?.roomKey), walkRoomsInCell: !!walk && !walk.roomKeys.some((k: string) => !cell?.roomKeys?.includes(k)),
      walkDigest: !!walk && nativeSteppedStairV2Digest(walk) === b?.walkEdgeSha256,
      cellDigest: !!cell && nativeSteppedStairV2Digest(cell) === b?.cellSha256,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (failed.length) out.push({ edge: edge.id, side, nodeId, room: record ? `${record.number} ${record.name}` : null, levelId: node?.levelId, cellId: b?.nativeCellId, walkEdgeId: b?.walkEdgeId, cellsFound: cells.length, walksFound: walks.length, failed });
  }
}
console.log(JSON.stringify({ steppedEdges: total, failingSides: out.length, out }, null, 1));
