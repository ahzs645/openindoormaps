/** Publisher-only geometry derivation. Normal route calculations never install
 * this cache. Every tile is produced by the original exact clipping kernel.
 */
import assert from "node:assert/strict";
import {
  encodeNativeExactTopology,
  type NativeExactTopologyIndex,
} from "../../app/indoor-project/native-exact-planar-topology";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import { nativeRationalIntersectionOperand } from "../../app/indoor-project/native-rational-intersection-broadphase";
import {
  supportTileBounds,
  supportTileRectangle,
  supportTileId,
  restorePublishedSupportTiles,
  type PublishedSupportTiles,
  type SupportTileParent,
} from "../../app/indoor-project/published-support-tiles";
import { hydratePublishedTopology } from "../../app/indoor-project/published-routing-hydration";
import { assertExactRoutingIndexParity } from "./exact-routing-index-proof";
import { createNativeExactTopologyIndex } from "../../app/indoor-project/native-exact-planar-topology";

export function producePublishedSupportTiles(
  supported: NativeExactTopologyIndex,
  parents: readonly SupportTileParent[],
  progress?: (completed: number, total: number) => void,
): PublishedSupportTiles {
  const faces: Parameters<typeof encodeNativeExactTopology>[1] = [],
    empty: string[] = [],
    rows: PublishedSupportTiles["parents"] = [];
  for (const [i, parent] of parents.entries()) {
    const bounds = supportTileBounds(parent.parts);
    if (!bounds) continue;
    rows.push({
      id: parent.id,
      z: parent.z,
      bounds: bounds.map(String) as [string, string, string, string],
    });
    for (let x = bounds[0]; x <= bounds[2]; x++)
      for (let y = bounds[1]; y <= bounds[3]; y++) {
        const tile = supportTileRectangle(x, y),
          id = supportTileId(parent.id, x, y),
          parts = nativeRationalOverlay(
            "intersection",
            tile,
            nativeRationalIntersectionOperand(tile, parent.parts),
          );
        if (parts.length > 0) faces.push({ id, parts });
        else empty.push(id);
      }
    progress?.(i + 1, parents.length);
  }
  const topology = encodeNativeExactTopology(supported.binding, faces),
    normalIndex = createNativeExactTopologyIndex(topology, supported.binding),
    restored = hydratePublishedTopology(topology),
    value: PublishedSupportTiles = {
      version: 1,
      tileFeet: 32,
      supportedTopologySha256: supported.geometrySha256,
      parents: rows,
      empty,
      topology,
    };
  assert.equal(
    assertExactRoutingIndexParity(normalIndex, restored),
    faces.length,
  );
  restorePublishedSupportTiles(
    value,
    restored,
    supported.geometrySha256,
    parents,
  );
  return value;
}
