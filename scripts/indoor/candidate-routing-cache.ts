/** Capture freshly completed original validator/calculator values. No input
 * cache is read and no compiled application trust root is changed. */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { projectRoutingGraph } from "../../app/indoor-project/routing-graph";
import { routingCalculationValue } from "../../app/indoor-project/routing-cache";
import { nativeCirculationExactCellParts } from "../../app/indoor-project/native-circulation";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import { NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION } from "../../app/indoor-project/native-rational-overlay";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import {
  type PublishedRouteCellReceipt,
  type PublishedRouteCells,
} from "../../app/indoor-project/published-route-cells";
import { jsonSha256, sha256 } from "./pathway-candidate-audit";

/** Call synchronously inside the SAME immutable session as fresh original
 * physical validation. Missing validator guards fail instead of being guessed. */
export function collectFreshCandidateRoutingCache(
  data: IndoorDataset,
): PublishedRouteCells {
  if (!data.circulationGeometry?.exactTopology)
    throw Error("Fresh native cache requires original exact circulation");
  const datasetSha256 = jsonSha256(data),
    policies = Object.fromEntries(
      (["public", "accessible"] as const).map((mode) => {
        const graph = projectRoutingGraph(data, mode);
        if (data.edges.some((edge) => edge.from === edge.to))
          throw Error("Ambiguous self-loop route policy serialization");
        return [
          mode,
          [...graph.allAdjacency].flatMap(([from, links]) =>
            links.map((link) => ({
              edgeId: link.edge.id,
              forward: from === link.edge.from,
              blockers: link.blockers,
              requiredRooms: link.requiredRooms,
            })),
          ),
        ];
      }),
    ) as NonNullable<PublishedRouteCells["policies"]>;
  const inventory: PublishedRouteCells["inventory"] = [],
    faces: Array<Parameters<typeof encodeNativeExactTopology>[1][number]> = [];
  for (const cell of data.circulationGeometry.cells) {
    const parts = nativeCirculationExactCellParts(data, cell);
    if (parts === undefined) continue;
    inventory.push({
      id: cell.id,
      faceId: cell.exactFaceId!,
      empty: !parts.length,
    });
    if (parts.length) faces.push({ id: cell.id, parts });
  }
  const known = <T>(key: string) =>
      routingCalculationValue<T>(data, key, () => {
        throw Error(`Original candidate calculation did not produce ${key}`);
      }),
    access = data.circulationGeometry.cells.flatMap((cell) => {
      try {
        return [
          [cell.id, known<boolean>(`native-exact-face-access:${cell.id}`)] as [
            string,
            boolean,
          ],
        ];
      } catch {
        return [];
      }
    });
  let anchors: NonNullable<PublishedRouteCells["guards"]>["anchors"];
  try {
    anchors = [
      ...known<
        Map<
          string,
          NonNullable<
            NonNullable<PublishedRouteCells["guards"]>["anchors"]
          >[number][1]
        >
      >("native-source-connector-anchors"),
    ];
  } catch {
    /* No original anchor was needed. */
  }
  return {
    format: "openindoormaps-published-route-cells-v1",
    version: 1,
    datasetSha256,
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    source: data.source,
    originalTopologySha256:
      data.circulationGeometry.exactTopology.geometrySha256,
    inventory,
    topology: encodeNativeExactTopology(
      {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: datasetSha256,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      },
      faces,
    ),
    policies,
    guards: {
      cellIds: [...known<Set<string>>("routing-native-cell-ids")],
      blockedEdgeIds: [...known<Set<string>>("routing-native-walk-blockers")],
      circulationBinding: known<string>("native-circulation-binding"),
      access,
      anchors,
    },
  };
}
export async function writeFreshCandidateRoutingCache(
  value: PublishedRouteCells,
  directory: string,
) {
  const logical = new TextEncoder().encode(JSON.stringify(value)),
    compressed = gzipSync(logical, { level: 9, mtime: 0 }),
    name = sha256(compressed) + ".json.gz";
  const receipt: PublishedRouteCellReceipt = {
    id: "fresh-candidate-native-routing-" + value.datasetSha256,
    datasetSha256: value.datasetSha256,
    engineSha256: value.engineSha256,
    source: value.source,
    logicalSha256: sha256(logical),
    logicalBytes: logical.length,
    compressedSha256: sha256(compressed),
    compressedBytes: compressed.length,
    url: "/data/candidate-routing/" + name,
  };
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, name), compressed, { flag: "wx" });
  await fs.writeFile(
    path.join(directory, "receipt.json"),
    JSON.stringify(receipt, null, 2),
    { flag: "wx" },
  );
  return {
    receipt,
    cachePath: path.resolve(directory, name),
    freshOriginalCalculation: true as const,
    compiledTrustRootChanged: false as const,
  };
}
