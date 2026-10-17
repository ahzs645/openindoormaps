import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "fflate";
import { readIndoorProject } from "../../app/indoor-project/package";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import {
  createImmutableRoutingSession,
  routingCalculationValue,
} from "../../app/indoor-project/routing-cache";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { projectRoutingGraph } from "../../app/indoor-project/routing-graph";
import { nativeCirculationExactCellParts } from "../../app/indoor-project/native-circulation";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import { NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION } from "../../app/indoor-project/native-rational-overlay";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";

/** Publisher-only: calculate once using the normal validator and calculator.
 * Output is inert until its exact hashes are reviewed and compiled as a trust
 * root. Input ZIP/source bytes are never changed. Test actual routes separately. */
async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      "Usage: node --import tsx scripts/indoor/export-published-routing.ts INPUT.zip OUTPUT_DIRECTORY",
    );
  await initializeNativeExactGeosOverlay();
  const project = await readIndoorProject(
    new Uint8Array(await readFile(input)),
  );
  const data = routeWorkerDataset(project.dataset);
  const hash = (bytes: string | Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const datasetSha256 = hash(JSON.stringify(data));
  const run = createImmutableRoutingSession(data);
  const value = run(() => {
    validateIndoorDataset(data);
    if (!data.circulationGeometry?.exactTopology)
      throw new Error("The project lacks exact native circulation.");
    const calculate = createWorkerRouteCalculator(data);
    const policies = Object.fromEntries(
      (["public", "accessible"] as const).map((mode) => {
        calculate("", "", mode);
        const graph = projectRoutingGraph(data, mode);
        if (data.edges.some((edge) => edge.from === edge.to))
          throw new Error(
            "Self-loop policy serialization requires explicit direction handling.",
          );
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
    );
    const inventory: { id: string; faceId: string; empty: boolean }[] = [],
      faces = [];
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
        throw new Error(`Missing completed publisher calculation: ${key}`);
      });
    const access = data.circulationGeometry.cells.flatMap((cell) => {
      try {
        return [
          [cell.id, known<boolean>(`native-exact-face-access:${cell.id}`)],
        ];
      } catch {
        return [];
      }
    });
    let anchors;
    try {
      anchors = [
        ...known<Map<string, unknown>>("native-source-connector-anchors"),
      ];
    } catch {
      /* No connector anchors were needed. */
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
  });
  if (hash(JSON.stringify(data)) !== datasetSha256)
    throw new Error("Publisher checks changed their source snapshot.");
  const logical = new TextEncoder().encode(JSON.stringify(value)),
    stored = gzipSync(logical, { level: 9, mtime: 0 }),
    name = hash(stored) + ".json.gz";
  const folder = resolve(output);
  await mkdir(folder, { recursive: true });
  await writeFile(resolve(folder, name), stored);
  const receipt = {
    id: "verified-native-routing-" + datasetSha256,
    datasetSha256,
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    source: data.source,
    logicalSha256: hash(logical),
    logicalBytes: logical.length,
    compressedSha256: hash(stored),
    compressedBytes: stored.length,
    url: "/data/published-routing/" + name,
  };
  await writeFile(
    resolve(folder, "receipt.json"),
    JSON.stringify(receipt, null, 2),
  );
  console.log(
    JSON.stringify({ output: folder, receipt, sourceUnchanged: true }),
  );
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
