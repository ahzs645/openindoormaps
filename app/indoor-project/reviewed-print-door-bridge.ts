import type { IndoorDataset, IndoorEdge } from "./contract";
import { nativeCirculationBinding } from "./native-circulation-binding";
import { nativeCirculationGeometryKey } from "./native-circulation";

// The native compiler replayed precisely this two-foot bridge against original
// slabs, panel/child sections, other leaves, and the headroom and access masks.
// The original source-only host relation is unavailable in the browser. Bind
// its result to the actual material and walking inputs present on the wire.
// Label and arrival coordinates never enter this geometry proof.
export function reviewedPrintBridgeBinding(
  data: IndoorDataset,
  edge: IndoorEdge,
) {
  const z = edge.pointsFeet[0]?.[2];
  return nativeCirculationBinding(
    [
      nativeCirculationGeometryKey(data),
      data.nativeLevels
        .filter((l) => z !== undefined && Math.abs(l.elevationFeet - z) < 0.05)
        .map((l) => [l.id, l.elevationFeet]),
      data.nativeMaterialSectionSupplement,
      data.indoorExclusions?.sourceModelSha256,
      data.indoorExclusions?.areas.map((a) => [
        a.id,
        a.levelId,
        a.elevationFeet,
        a.reason,
        a.partsFeet,
      ]),
      edge.id,
      edge.from,
      edge.to,
      edge.nativeElementId,
      edge.roomKeys,
      edge.pointsFeet,
    ],
    true,
  );
}
export function reviewedPrintBridgeMatches(
  data: IndoorDataset,
  edge: IndoorEdge,
  grossWallHits: number[],
) {
  return (
    edge.id === "door:694:1996013" &&
    edge.kind === "door" &&
    edge.enabled &&
    grossWallHits.length === 1 &&
    grossWallHits[0] === 1513404 &&
    reviewedPrintBridgeBinding(data, edge) ===
      "native-circulation-sha256-v1:3cb2fc16f0474b6f10ceb2fb5e798c9f73b6b27614b2619f06d1bccd9d0df119"
  );
}
