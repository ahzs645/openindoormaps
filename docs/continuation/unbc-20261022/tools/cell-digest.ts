import { readFileSync } from "node:fs";
import { nativeSteppedStairV2Digest } from "../unbc/openindoormaps/app/indoor-project/native-stepped-stair-v2";
const data = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const edge = data.edges.find((e: any) => e.nativeSteppedStairV2);
for (const b of edge.nativeSteppedStairV2.terminalApproaches) {
  const cell = data.circulationGeometry.cells.find((c: any) => c.id === b.nativeCellId);
  const { containedDisplay, ...stripped } = cell;
  console.log(JSON.stringify({ cell: b.nativeCellId, hasContainedDisplay: containedDisplay !== undefined, fullMatches: nativeSteppedStairV2Digest(cell) === b.cellSha256, strippedMatches: nativeSteppedStairV2Digest(stripped) === b.cellSha256, cellsWithContainedDisplay: data.circulationGeometry.cells.filter((c: any) => c.containedDisplay).length, totalCells: data.circulationGeometry.cells.length }));
}
