import { gunzipSync } from "fflate";
import type { IndoorDataset } from "./contract";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import { preparedDisplayDatasetSha256 } from "./prepared-display-assets";
import { progressiveSha256 } from "./progressive-delivery";
import {
  createNativeExactTopologyIndex,
  type NativeExactPlanarTopology,
} from "./native-exact-planar-topology";
import {
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  type NativeRationalParts,
} from "./native-rational-overlay";
import {
  createImmutableRoutingSession,
  routingCalculationValue,
} from "./routing-cache";
import { createWorkerRouteCalculator } from "./route-calculation";
import { PUBLISHED_ROUTE_CELL_RECEIPTS } from "./published-route-cell-receipts";
import { PUBLISHED_ROUTE_RUNTIME_SHA256 } from "./published-route-runtime-binding";
import {
  verifiedRoutingDatasetSha256,
  isPrivateImmutableRoutingDataset,
} from "./verified-routing-dataset";
import {
  hydratePublishedMaterials,
  hydratePublishedAccessZones,
  hydratePublishedTopology,
  type PublishedRoutingHydration,
} from "./published-routing-hydration";
import {
  restorePublishedSupportTiles,
  type PublishedSupportTileFactory,
} from "./published-support-tiles";

export type PublishedRouteCellReceipt = {
  id: string;
  datasetSha256: string;
  engineSha256: string;
  source: IndoorDataset["source"];
  logicalSha256: string;
  logicalBytes: number;
  compressedSha256: string;
  compressedBytes: number;
  url: string;
  runtimeSha256?: string;
};
type LinkResult = {
  blockers: {
    kind: string;
    edgeId: string;
    roomKey?: string;
    nativeElementId?: number;
  }[];
  requiredRooms: string[];
};
type LinkRow = LinkResult & { edgeId: string; forward: boolean };
type PublishedPolicies = { public: LinkRow[]; accessible: LinkRow[] };
type PublishedGuards = {
  cellIds: string[];
  blockedEdgeIds: string[];
  circulationBinding: string;
  access: [string, boolean][];
  anchors?: [
    string,
    {
      edgeId: string;
      nodeId: string;
      roomKey: string;
      levelId: number;
      nativeElementId: number;
      kind: string;
      pointFeet: number[];
    },
  ][];
};
const approvedGuards = new WeakMap<
  ReadonlyMap<string, NativeRationalParts>,
  PublishedGuards
>();
const approvedPolicies = new WeakMap<
  ReadonlyMap<string, NativeRationalParts>,
  PublishedPolicies
>();
const admittedRuntime = new WeakMap<IndoorDataset, PublishedRouteCellReceipt>();
const approvedHydration = new WeakMap<
  ReadonlyMap<string, NativeRationalParts>,
  {
    data: IndoorDataset;
    hydration: Omit<
      PublishedRoutingHydration,
      "materials" | "supportTiles" | "accessZones"
    >;
    materials: ReturnType<typeof hydratePublishedMaterials>;
    supportTiles?: PublishedSupportTileFactory;
    accessZones?: ReturnType<typeof hydratePublishedAccessZones>;
  }
>();
export type PublishedRouteCells = {
  format: "openindoormaps-published-route-cells-v1";
  version: 1;
  datasetSha256: string;
  engineSha256: string;
  source: IndoorDataset["source"];
  originalTopologySha256: string;
  inventory: { id: string; faceId: string; empty: boolean }[];
  topology: NativeExactPlanarTopology;
  policies?: PublishedPolicies;
  guards?: PublishedGuards;
  hydration?: PublishedRoutingHydration;
};
const sameSource = (a: IndoorDataset["source"], b: IndoorDataset["source"]) =>
  a.modelSha256 === b.modelSha256 &&
  a.roomsSha256 === b.roomsSha256 &&
  a.modelFileName === b.modelFileName;
// The exported compiled metadata must not become a mutable capability. These
// are checked build literals; custom policy objects never grant hydration.
for (const receipt of PUBLISHED_ROUTE_CELL_RECEIPTS) {
  Object.freeze(receipt.source);
  Object.freeze(receipt);
}
const DEFAULT_ROUTE_POLICY = Object.freeze({
  receipts: PUBLISHED_ROUTE_CELL_RECEIPTS,
  engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
});

/** Only an exact privately cloned, publisher-pinned routing snapshot can reuse
 * the precomputed physical intersections and original link-policy results.
 * Any source/door/access change misses this receipt and uses ordinary checks.
 * Graph traversal and path construction remain the original calculator. */
export function publishedRouteCellReceipt(
  data: IndoorDataset,
  policy: {
    receipts: readonly PublishedRouteCellReceipt[];
    engineSha256: string;
  } = DEFAULT_ROUTE_POLICY,
) {
  admittedRuntime.delete(data);
  const candidates = policy.receipts.filter(
    (r) =>
      r.engineSha256 === policy.engineSha256 &&
      (!r.runtimeSha256 ||
        r.runtimeSha256 === PUBLISHED_ROUTE_RUNTIME_SHA256) &&
      (!r.runtimeSha256 ||
        policy !== DEFAULT_ROUTE_POLICY ||
        isPrivateImmutableRoutingDataset(data)) &&
      sameSource(r.source, data.source),
  );
  if (candidates.length === 0) return;
  const digest =
    (policy === DEFAULT_ROUTE_POLICY
      ? verifiedRoutingDatasetSha256(data)
      : undefined) ?? preparedDisplayDatasetSha256(data);
  const receipt = candidates.find((r) => r.datasetSha256 === digest);
  if (
    receipt?.runtimeSha256 &&
    policy === DEFAULT_ROUTE_POLICY &&
    policy.receipts === PUBLISHED_ROUTE_CELL_RECEIPTS &&
    policy.engineSha256 === PREPARED_DISPLAY_ENGINE_SHA256 &&
    PUBLISHED_ROUTE_CELL_RECEIPTS.includes(receipt) &&
    isPrivateImmutableRoutingDataset(data)
  )
    admittedRuntime.set(data, receipt);
  return receipt;
}

export function decodePublishedRouteCells(
  data: IndoorDataset,
  receipt: PublishedRouteCellReceipt,
  stored: Uint8Array,
) {
  const bytes: Uint8Array =
    stored.length === receipt.compressedBytes &&
    progressiveSha256(stored) === receipt.compressedSha256
      ? gunzipSync(stored)
      : stored; // HTTP Content-Encoding can have already inflated it.
  if (
    bytes.length !== receipt.logicalBytes ||
    progressiveSha256(bytes) !== receipt.logicalSha256
  )
    throw new Error("Prepared directions checksum mismatch.");
  const value = JSON.parse(
    new TextDecoder("utf8", { fatal: true }).decode(bytes),
  ) as PublishedRouteCells;
  if (
    value.format !== "openindoormaps-published-route-cells-v1" ||
    value.version !== 1 ||
    value.datasetSha256 !== receipt.datasetSha256 ||
    value.engineSha256 !== receipt.engineSha256 ||
    !sameSource(value.source, receipt.source) ||
    value.originalTopologySha256 !==
      data.circulationGeometry?.exactTopology?.geometrySha256 ||
    !Array.isArray(value.inventory) ||
    value.inventory.length > (data.circulationGeometry?.cells.length ?? 0)
  )
    throw new Error("Prepared directions do not match this source snapshot.");
  const hydration = value.hydration;
  if (
    (receipt.runtimeSha256 || hydration) &&
    (!hydration ||
      admittedRuntime.get(data) !== receipt ||
      receipt.runtimeSha256 !== PUBLISHED_ROUTE_RUNTIME_SHA256 ||
      hydration.runtimeSha256 !== receipt.runtimeSha256 ||
      hydration.version !== 1 ||
      !/^native-circulation-sha256-v1:[a-f0-9]{64}$/.test(
        hydration.policySnapshot,
      ) ||
      (hydration.preparedRoutingKey !== undefined &&
        (typeof hydration.preparedRoutingKey !== "string" ||
          !/^[a-f0-9]{64}$/.test(hydration.preparedRoutingKey))) ||
      (hydration.resolvedRouteGeometryKey !== undefined &&
        (typeof hydration.resolvedRouteGeometryKey !== "string" ||
          !/^native-circulation-sha256-v1:[a-f0-9]{64}$/.test(
            hydration.resolvedRouteGeometryKey,
          ))) ||
      (hydration.supportTiles !== undefined &&
        (hydration.supportTiles.topology.sourceModelSha256 !==
          value.topology.sourceModelSha256 ||
          hydration.supportTiles.topology.sourceGeometryKey !==
            value.topology.sourceGeometryKey ||
          hydration.supportTiles.topology.kernelVersion !==
            value.topology.kernelVersion)) ||
      !Array.isArray(hydration.materials) ||
      hydration.materials.length > 32 ||
      value.topology.sourceModelSha256 !== data.source.modelSha256 ||
      value.topology.sourceGeometryKey !== receipt.datasetSha256 ||
      value.topology.kernelVersion !== NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION ||
      data.circulationGeometry?.exactTopology?.sourceGeometryKey !==
        value.guards?.circulationBinding)
  )
    throw new Error(
      "Published routing hydration lacks exact runtime admission.",
    );
  const index = hydration
    ? hydratePublishedTopology(value.topology)
    : createNativeExactTopologyIndex(value.topology, {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: receipt.datasetSha256,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      });
  const cells = new Map(data.circulationGeometry!.cells.map((c) => [c.id, c]));
  const entries = new Map<string, NativeRationalParts>();
  const indexed = new Set(index.ids());
  for (const item of value.inventory) {
    const cell = cells.get(item.id);
    if (
      !cell ||
      entries.has(item.id) ||
      cell.exactFaceId !== item.faceId ||
      typeof item.empty !== "boolean"
    )
      throw new Error("Prepared directions have an invalid cell inventory.");
    const parts = index.parts(item.id);
    if ((item.empty && parts) || (!item.empty && !parts))
      throw new Error("Prepared directions have an inconsistent exact face.");
    entries.set(
      item.id,
      parts ?? (Object.freeze([]) as unknown as NativeRationalParts),
    );
    indexed.delete(item.id);
  }
  if (indexed.size > 0)
    throw new Error("Prepared directions contain an unlisted face.");
  if (value.policies) {
    const edgeIds = new Set(data.edges.map((e) => e.id));
    const kinds = new Set([
      "outdoor",
      "off-limits",
      "disabled",
      "staff",
      "non-walkable",
      "missing-room",
      "direction",
      "step-free",
      "native-floor-hole",
      "source-proof",
      "native-circulation-proof",
    ]);
    for (const mode of ["public", "accessible"] as const) {
      const rows = value.policies[mode];
      if (!Array.isArray(rows) || rows.length !== data.edges.length * 2)
        throw new Error("Prepared directions lack complete link policies.");
      const seen = new Set<string>();
      for (const row of rows) {
        const key = JSON.stringify([row.edgeId, row.forward]);
        if (
          !edgeIds.has(row.edgeId) ||
          typeof row.forward !== "boolean" ||
          seen.has(key) ||
          !Array.isArray(row.requiredRooms) ||
          row.requiredRooms.some((k) => typeof k !== "string") ||
          !Array.isArray(row.blockers) ||
          row.blockers.some(
            (b) =>
              !kinds.has(b.kind) ||
              typeof b.edgeId !== "string" ||
              (b.roomKey !== undefined && typeof b.roomKey !== "string") ||
              (b.nativeElementId !== undefined &&
                !Number.isSafeInteger(b.nativeElementId)),
          )
        )
          throw new Error(
            "Prepared directions contain an invalid link policy.",
          );
        seen.add(key);
      }
    }
    approvedPolicies.set(entries, value.policies);
  }
  if (value.guards) {
    const guards = value.guards,
      edgeIds = new Set(data.edges.map((e) => e.id));
    const unique = (items: unknown, allowed: ReadonlySet<string>) =>
      Array.isArray(items) &&
      new Set(items).size === items.length &&
      items.every((id) => typeof id === "string" && allowed.has(id));
    if (
      guards.circulationBinding !==
        data.circulationGeometry?.sourceGeometryKey ||
      !unique(guards.cellIds, new Set(cells.keys())) ||
      !unique(guards.blockedEdgeIds, edgeIds) ||
      !Array.isArray(guards.access) ||
      new Set(guards.access.map((row) => row[0])).size !==
        guards.access.length ||
      guards.access.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== 2 ||
          !cells.has(row[0]) ||
          typeof row[1] !== "boolean",
      )
    )
      throw new Error("Prepared directions contain invalid graph guards.");
    if (guards.anchors) {
      const nodes = new Map(data.nodes.map((n) => [n.id, n]));
      if (
        !Array.isArray(guards.anchors) ||
        new Set(guards.anchors.map((row) => row[0])).size !==
          guards.anchors.length ||
        guards.anchors.some(([key, a]) => {
          const node = nodes.get(a.nodeId);
          return (
            !edgeIds.has(a.edgeId) ||
            !node ||
            key !== a.edgeId + "|" + a.nodeId ||
            a.levelId !== node.levelId ||
            !Array.isArray(a.pointFeet) ||
            JSON.stringify(a.pointFeet) !== JSON.stringify(node.pointFeet)
          );
        })
      )
        throw new Error(
          "Prepared directions contain invalid connector anchors.",
        );
    }
    approvedGuards.set(entries, guards);
  }
  if (hydration) {
    // Validate the derived wire representation while still inside admission.
    const materials = hydratePublishedMaterials(data, hydration.materials);
    const supportTiles = hydration.supportTiles
      ? restorePublishedSupportTiles(
          hydration.supportTiles,
          hydratePublishedTopology(hydration.supportTiles.topology),
          value.topology.geometrySha256,
          [...entries].map(([id, parts]) => ({
            id,
            parts,
            z: cells.get(id)!.elevationFeet,
          })),
        )
      : undefined;
    const accessZones = hydration.accessZones
      ? hydratePublishedAccessZones(data, hydration.accessZones, {
          sourceModelSha256: value.topology.sourceModelSha256,
          sourceGeometryKey: value.topology.sourceGeometryKey,
          kernelVersion: value.topology.kernelVersion,
        })
      : undefined;
    // Retain only decoded query operands. Keeping the full wire here also kept
    // every rational tile string/index alive beside its decoded geometry.
    approvedHydration.set(entries, {
      data,
      hydration: {
        version: hydration.version,
        runtimeSha256: hydration.runtimeSha256,
        policySnapshot: hydration.policySnapshot,
        preparedRoutingKey: hydration.preparedRoutingKey,
        resolvedRouteGeometryKey: hydration.resolvedRouteGeometryKey,
      },
      materials,
      supportTiles,
      accessZones,
    });
  }
  return entries;
}

/** This session never escapes its worker or observes mutable authoring data.
 * Reuse exact publisher results only for the fully hashed source snapshot. */
export function createPublishedRouteCalculator(
  data: IndoorDataset,
  entries: ReadonlyMap<string, NativeRationalParts>,
) {
  const run = createImmutableRoutingSession(data);
  run(() => {
    const approved = approvedHydration.get(entries);
    if (approved && approved.data !== data)
      throw new Error(
        "Published routing hydration belongs to another private snapshot.",
      );
    const hydration = approved?.hydration;
    if (approved && hydration) {
      routingCalculationValue(
        data,
        "policy-snapshot",
        () => hydration.policySnapshot,
      );
      routingCalculationValue(data, "native-exact-circulation-topology", () =>
        hydratePublishedTopology(data.circulationGeometry!.exactTopology!),
      );
      routingCalculationValue(
        data,
        "native-route-material-query",
        () => approved.materials,
      );
      if (hydration.preparedRoutingKey !== undefined)
        routingCalculationValue(
          data,
          "prepared-routing-binding",
          () => hydration.preparedRoutingKey,
        );
      if (hydration.resolvedRouteGeometryKey !== undefined)
        routingCalculationValue(
          data,
          "resolved-route-geometry",
          () => hydration.resolvedRouteGeometryKey,
        );
      if (approved.supportTiles)
        routingCalculationValue(
          data,
          "native-published-support-tiles",
          () => approved.supportTiles,
        );
      if (approved.accessZones)
        routingCalculationValue(
          data,
          "native-route-access-zone-binding",
          () => approved.accessZones,
        );
    }
    for (const [id, parts] of entries)
      routingCalculationValue(
        data,
        `native-exact-supported-cell:${id}`,
        () => parts,
      );
    const guards = approvedGuards.get(entries);
    if (guards) {
      routingCalculationValue(
        data,
        "native-circulation-binding",
        () => guards.circulationBinding,
      );
      routingCalculationValue(
        data,
        "routing-native-cell-ids",
        () => new Set(guards.cellIds),
      );
      routingCalculationValue(
        data,
        "routing-native-walk-blockers",
        () => new Set(guards.blockedEdgeIds),
      );
      for (const [id, allowed] of guards.access)
        routingCalculationValue(
          data,
          `native-exact-face-access:${id}`,
          () => allowed,
        );
      if (guards.anchors)
        routingCalculationValue(
          data,
          "native-source-connector-anchors",
          () => new Map(guards.anchors),
        );
    }
    const policies = approvedPolicies.get(entries);
    if (policies) {
      const edges = new Map(data.edges.map((e) => [e.id, e]));
      const byKey = new Map(
        policies.accessible.map((row) => [
          JSON.stringify([row.edgeId, row.forward]),
          row,
        ]),
      );
      const links = new WeakMap();
      const result = (row: LinkRow) => ({
        requiredRooms: row.requiredRooms,
        blockers: row.blockers.map((b) => ({
          kind: b.kind,
          edgeId: b.edgeId,
          roomKey: b.roomKey,
          nativeElementId: b.nativeElementId,
        })),
      });
      for (const row of policies.public) {
        const edge = edges.get(row.edgeId)!;
        let directions = links.get(edge);
        if (!directions) {
          directions = new Map();
          links.set(edge, directions);
        }
        directions.set(row.forward, {
          public: result(row),
          accessible: result(
            byKey.get(JSON.stringify([row.edgeId, row.forward]))!,
          ),
        });
      }
      routingCalculationValue(data, "routing-link-policies", () => links);
    }
  });
  const calculate = createWorkerRouteCalculator(data);
  return (...args: Parameters<typeof calculate>) =>
    run(() => calculate(...args));
}
