import assert from "node:assert/strict";
import type { IndoorDataset } from "../../../app/indoor-project/contract";
import { pathNetworkView } from "../../../app/indoor-project/path-network-view";
import { pathNetworkCoverage } from "../../../app/indoor-project/path-network-coverage";
import {
  preparedRoutingKey,
  preparedWalkingGuides,
  ROUTING_GUIDE_VERSION,
  validatePreparedRouting,
  withPreparedRouting,
  type PreparedRouting,
} from "../../../app/indoor-project/prepared-routing";

export type PreviewDataset = IndoorDataset & {
  preparedRouting?: PreparedRouting;
};

/** An inspection may install an explicitly supplied guide catalog only when
 * every guide binds to the complete source and its original endpoints. */
export function installPreviewGuides(
  source: IndoorDataset,
  guides?: PreparedRouting,
): PreviewDataset {
  const data: PreviewDataset = guides
    ? withPreparedRouting(source, guides)
    : source;
  const metadata = data.preparedRouting;
  if (!metadata) return data;
  validatePreparedRouting(data);
  assert.equal(
    metadata.resolverVersion,
    ROUTING_GUIDE_VERSION,
    "Preview guide resolver differs from the current implementation",
  );
  assert.equal(
    metadata.sourceModelSha256,
    data.source.modelSha256,
    "Preview guide model differs from the complete source",
  );
  assert.equal(
    metadata.sourceGeometryKey,
    preparedRoutingKey(data),
    "Preview guides do not bind to the complete source geometry and policy",
  );
  assert.equal(
    preparedWalkingGuides(data).size,
    metadata.guides.length,
    "One or more preview guides changed an original endpoint or physical plane",
  );
  return data;
}

export function pathwayPreviewLevel(data: IndoorDataset, levelId: number) {
  const level = data.nativeLevels.find((item) => item.id === levelId);
  assert(level, `Unknown native level ${levelId}`);
  const cells = (data.circulationGeometry?.cells ?? []).filter((cell) =>
    cell.levelIds.includes(levelId),
  );
  const records = data.records.filter((record) => record.levelId === levelId);
  const network = pathNetworkView(data, [levelId], "all", {
    includeSourceFeet: true,
  });
  const coverage = pathNetworkCoverage(data, [levelId], "all");
  // Preserve the source XY. The UI explicitly labels its declared-level
  // placement; this record cannot become a threshold or inferred graph edge.
  const doorDiagnostics = (data.doors ?? []).filter(
    (door) => door.levelId === levelId && door.state !== "connected",
  );
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const include = (point: number[]) => {
    assert(
      point.length >= 2 && point.slice(0, 2).every(Number.isFinite),
      "Native display coordinates must be finite",
    );
    bounds[0] = Math.min(bounds[0], point[0]);
    bounds[1] = Math.min(bounds[1], point[1]);
    bounds[2] = Math.max(bounds[2], point[0]);
    bounds[3] = Math.max(bounds[3], point[1]);
  };
  for (const item of [...cells, ...records])
    for (const ring of item.ringsFeet) for (const point of ring) include(point);
  for (const collection of [network.hallwayPaths, network.pathConnections])
    for (const feature of collection.features) {
      if (feature.geometry.type === "LineString")
        for (const point of feature.properties?.pointsFeet ?? [])
          include(point);
      else if (feature.properties?.pointFeet)
        include(feature.properties.pointFeet);
    }
  for (const door of doorDiagnostics) include(door.pointFeet);
  const edgeIds = new Set<string>();
  for (const collection of [network.hallwayPaths, network.pathConnections])
    for (const feature of collection.features)
      for (const id of feature.properties?.edgeIds ?? [
        feature.properties?.edgeId,
      ])
        if (typeof id === "string") edgeIds.add(id);
  return {
    format: "indoor-pathway-preview-level-v1" as const,
    status: "display-only" as const,
    navigationAuthority: false,
    newRoutesComputed: false,
    coordinateSystem: "original-model-feet" as const,
    level,
    campusFloors: data.floors
      .filter((floor) => floor.levelIds.includes(levelId))
      .map(({ id, name }) => ({ id, name })),
    boundsFeet: Number.isFinite(bounds[0]) ? bounds : null,
    cells: cells.map((cell) => ({
      id: cell.id,
      exactFaceId: cell.exactFaceId,
      levelIds: cell.levelIds,
      elevationFeet: cell.elevationFeet,
      roomKeys: cell.roomKeys,
      nativeFloorIds: cell.nativeFloorIds,
      ringsFeet: cell.ringsFeet,
    })),
    rooms: records.map((record) => ({
      key: record.key,
      number: record.number,
      name: record.name,
      building: record.building,
      levelId: record.levelId,
      elevationFeet: record.elevationFeet,
      circulation: record.circulation,
      stair: record.stair,
      access: record.access,
      walkable: record.walkable,
      ringsFeet: record.ringsFeet,
    })),
    network,
    doorDiagnostics,
    sourceEdges: data.edges
      .filter((edge) => edgeIds.has(edge.id))
      .map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        enabled: edge.enabled,
        direction: edge.direction ?? "both",
        nativeElementId: edge.nativeElementId,
        savedAccessibility: edge.accessible,
        roomKeys: edge.roomKeys,
      })),
    coverage,
    summary: {
      cells: cells.length,
      innerRingsCountedPerCellOccurrence: cells.reduce(
        (sum, cell) => sum + Math.max(0, cell.ringsFeet.length - 1),
        0,
      ),
      rooms: records.length,
      hallwayFeatures: network.hallwayPaths.features.length,
      sharedGuideSegments: network.hallwayPaths.features.filter(
        (feature) => feature.properties?.source === "shared-guide",
      ).length,
      savedWalkSegments: network.hallwayPaths.features.filter(
        (feature) => feature.properties?.source === "saved-walk",
      ).length,
      connectionLines: network.pathConnections.features.filter(
        (feature) => feature.geometry.type === "LineString",
      ).length,
      connectionMarkers: network.pathConnections.features.filter(
        (feature) => feature.geometry.type === "Point",
      ).length,
      sourceEdges: edgeIds.size,
      unresolvedDoorMarkers: doorDiagnostics.length,
      approachStates: coverage.stops.reduce(
        (counts, stop) => {
          counts[stop.status] = (counts[stop.status] ?? 0) + 1;
          return counts;
        },
        {} as Record<string, number>,
      ),
    },
  };
}

export type PathwayPreviewLevel = ReturnType<typeof pathwayPreviewLevel>;

export function pathwayPreviewInventory(data: PreviewDataset) {
  const cells = data.circulationGeometry?.cells ?? [];
  const unique = new Map(cells.map((cell) => [cell.id, cell]));
  assert.equal(unique.size, cells.length, "Duplicate native cell identities");
  const edgeById = new Map(data.edges.map((edge) => [edge.id, edge]));
  const guides = data.preparedRouting?.guides ?? [];
  return {
    nativeLevels: data.nativeLevels.length,
    nativeLevelsWithCells: data.nativeLevels.filter((level) =>
      cells.some((cell) => cell.levelIds.includes(level.id)),
    ).length,
    uniqueNativeCells: unique.size,
    innerRingsCountedOncePerCell: cells.reduce(
      (sum, cell) => sum + Math.max(0, cell.ringsFeet.length - 1),
      0,
    ),
    records: data.records.length,
    nodes: data.nodes.length,
    edges: data.edges.length,
    sourceDoorRecords: data.doors?.length ?? 0,
    unresolvedSourceDoorRecords: (data.doors ?? []).filter(
      (door) => door.state !== "connected",
    ).length,
    installedGuides: guides.length,
    guideNativeCellIds: [
      ...new Set(
        guides.flatMap((guide) => {
          const cell = edgeById.get(guide.edgeId)?.nativeCellId;
          return cell ? [cell] : [];
        }),
      ),
    ].sort(),
    buildings: [
      ...new Set(data.records.map((record) => record.building)),
    ].sort(),
  };
}
