import * as DMath from "./deterministic-math";
import { nativeSelectionBoolean } from "./native-selection-boolean";
import type { FeatureCollection, MultiPolygon, Polygon, Point } from "geojson";
import type { IndoorDataset, IndoorRecord } from "./contract";
import type { ProjectDisplayGeometry } from "./display-geometry";
import type { NativeExploreResult } from "./native-explore";
import { nativeCirculationCells } from "./native-circulation";
import { nativeExploreWallFeatures } from "./native-explore-wall-drawing";
import { geographicPoint } from "./routing";
import { interiorLabelPoint } from "./interior-label-point";
import { isFlatArea } from "./display-passages";
import {
  roomDisplayColor,
  ROOM_BLOCK_HEIGHT_METRES,
  EXPOSED_WALL_HEIGHT_METRES,
} from "./display-geometry";
type Rings = [number, number][][];
const empty = <
  G extends MultiPolygon | Polygon | Point,
>(): FeatureCollection<G> => ({ type: "FeatureCollection", features: [] });
/** Only complete current native faces define visitor geometry. Prepared blocks
 * establish source enclosure evidence, never a contour crop or fallback. */
export function strictNativeDisplay(
  data: IndoorDataset,
  levels: number[],
  building: string,
  selected: string,
  showVestibuleDoors: boolean,
  native?: NativeExploreResult,
): ProjectDisplayGeometry {
  const polygon = (parts: Rings[]): MultiPolygon => ({
    type: "MultiPolygon",
    coordinates: parts.map((p) =>
      p.map((r) => [...r, r[0]!].map((q) => geographicPoint(data, q))),
    ),
  });
  const areas = empty<MultiPolygon>(),
    roomBlocks = empty<MultiPolygon>(),
    walls = empty<MultiPolygon>(),
    doorFootprints = empty<Polygon>(),
    doorMarkers = empty<Point>(),
    labels = empty<Point>();
  const faces =
    native?.regions.map((r) => ({
      id: r.id,
      levelId: r.levelId,
      elevationFeet: data.nativeLevels.find((l) => l.id === r.levelId)!
        .elevationFeet,
      roomKeys: r.roomKeys,
      parts: r.visitorPartsFeet ?? [],
      boundaryParts: [r.ringsFeet],
      complete:
        !!r.exactFaceId ||
        !(
          r.enclosureReviewAreaSquareFeet &&
          r.enclosureReviewAreaSquareFeet > 0.001
        ),
    })) ??
    (data.nativeMaterialSections ? [] : nativeCirculationCells(data))
      .filter((c) => c.levelIds.some((id) => levels.includes(id)))
      .map((c) => ({
        id: c.id,
        levelId: c.levelIds.find((id) => levels.includes(id))!,
        elevationFeet: c.elevationFeet,
        roomKeys: c.roomKeys,
        parts: [c.ringsFeet],
        boundaryParts: [c.ringsFeet],
        complete: true,
      }));
  const ownedKeys = new Set(faces.flatMap((f) => f.roomKeys));
  const records = data.records.filter(
    (r) =>
      (levels.includes(r.levelId) || ownedKeys.has(r.key)) &&
      (building === "all" || r.building === building),
  );
  const byKey = new Map(records.map((r) => [r.key, r]));
  const fillByFace = new Map(
    native?.outlines.features.map((f) => [
      f.properties?.nativeRegionId,
      f.properties,
    ]) ?? [],
  );
  for (const face of faces) {
    const owners = face.roomKeys
      .map((k) => byKey.get(k))
      .filter((r): r is IndoorRecord => !!r);
    if (building !== "all" && !owners.length) continue;
    const owner = owners.find((r) => r.key === selected) ?? owners[0];
    if (!face.parts.length) continue;
    const prepared =
      owner && data.presentation?.sourceModelSha256 === data.source.modelSha256
        ? data.presentation.rooms.find(
            (p) =>
              p.roomKey === owner.key &&
              p.sourceGeometryKey ===
                JSON.stringify([owner.levelId, owner.ringsFeet]),
          )
        : undefined;
    const virtualBoundary =
      data.reviewedAreaPartitions?.sourceModelSha256 ===
        data.source.modelSha256 &&
      data.reviewedAreaPartitions.partitions.some((p) => {
        if (p.status !== "applied" || p.levelId !== face.levelId) return false;
        const chain = p.closed
          ? [...p.pointsFeet, p.pointsFeet[0]]
          : p.pointsFeet;
        return chain.slice(1).some((b, i) => {
          const a = chain[i],
            length = DMath.hypot(b[0] - a[0], b[1] - a[1]);
          if (!length) return false;
          const x = (-(b[1] - a[1]) / length) * 0.0001,
            y = ((b[0] - a[0]) / length) * 0.0001;
          const strip: Rings[] = [
            [
              [
                [a[0] + x, a[1] + y],
                [b[0] + x, b[1] + y],
                [b[0] - x, b[1] - y],
                [a[0] - x, a[1] - y],
              ],
            ],
          ];
          return (
            nativeSelectionBoolean("intersection", face.parts, strip).length > 0
          );
        });
      });
    const physicalEnclosure =
      face.complete &&
      !virtualBoundary &&
      owners.length === 1 &&
      owner &&
      owner.walkable &&
      !isFlatArea(owner) &&
      prepared &&
      (prepared.boundarySource !== "reviewed-native-wall-enclosure" ||
        prepared.reviewProof?.sourceModelSha256 === data.source.modelSha256) &&
      (prepared.boundarySource !== "native-mesh-wall-enclosure" ||
        !!prepared.meshProof?.nativeElementIds.length) &&
      [
        "native-wall-enclosure",
        "native-mesh-wall-enclosure",
        "reviewed-native-wall-enclosure",
      ].includes(prepared.boundarySource);
    const nativeFill = fillByFace.get(face.id);
    const properties = {
      ...nativeFill,
      key: owner?.key,
      roomKeys: face.roomKeys,
      building: owner?.building,
      levelId: face.levelId,
      elevationFeet: face.elevationFeet,
      nativePhysical: true,
      // Preserve native drawing coordinates for exact stair/ramp render cuts.
      // Geographic projection is paint output, never the clipping authority.
      nativeDisplayPartsFeet: face.parts,
      // Stroke the source face perimeter, never its contained paint cells.
      // Later visibility cuts carry their own exact drawing perimeter instead.
      nativeBoundaryPartsFeet: face.boundaryParts,
      circulation: !!nativeFill?.circulation,
      walkable: owners.length > 0 && owners.every((r) => r.walkable),
      access: owner?.access ?? "unknown",
      selected: face.roomKeys.includes(selected),
      color: face.roomKeys.includes(selected)
        ? "#ffe1a0"
        : (nativeFill?.color ??
          (owner ? roomDisplayColor(owner, false) : "#e9edef")),
      boundarySource: "source-native-face",
      boundaryReviewRequired:
        !physicalEnclosure && !!owner && !isFlatArea(owner) && !owner.stair,
      height: physicalEnclosure ? ROOM_BLOCK_HEIGHT_METRES : 0,
    };
    const feature = {
      type: "Feature" as const,
      id: face.id,
      properties,
      geometry: polygon(face.parts),
    };
    areas.features.push(feature);
    if (physicalEnclosure)
      roomBlocks.features.push({ ...feature, id: owner.key });
    const point = owner && interiorLabelPoint(face.parts[0]!);
    if (owner && point) {
      labels.features.push({
        type: "Feature",
        properties: {
          ...properties,
          name: [owner.number, owner.name].filter(Boolean).join("\n"),
          heightMetres: physicalEnclosure
            ? ROOM_BLOCK_HEIGHT_METRES + 0.03
            : 0.03,
        },
        geometry: { type: "Point", coordinates: geographicPoint(data, point) },
      });
    }
  }
  // Reuse the contained wall paint already derived beside these native faces.
  // Strict maps never round an aperture intersection back into a physical wall.
  const wallPaint =
    native?.walls ??
    nativeExploreWallFeatures(
      data,
      levels,
      data.nativeMaterialSections ? levels : [],
    );
  for (const wall of wallPaint.features) {
    const levelId = wall.properties?.levelId;
    if (!levels.includes(levelId)) continue;
    walls.features.push({
      type: "Feature",
      properties: {
        ...wall.properties,
        elevationFeet: data.nativeLevels.find((level) => level.id === levelId)
          ?.elevationFeet,
        nativePhysical: true,
        approximate: false,
        base: 0,
        height: EXPOSED_WALL_HEIGHT_METRES,
        color: "#dedfda",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: [wall.geometry.coordinates],
      },
    });
  }
  for (const door of data.doors ?? []) {
    if (
      !levels.includes(door.levelId) ||
      (building !== "all" && !door.roomKeys.some((k) => byKey.has(k)))
    )
      continue;
    if (
      !showVestibuleDoors &&
      door.roomKeys.every((k) => {
        const r = byKey.get(k);
        return r && /vestibule/i.test(r.name);
      })
    )
      continue;
    const z =
      data.edges.find((e) => e.id === door.id)?.pointsFeet[0]?.[2] ??
      data.nativeLevels.find((l) => l.id === door.levelId)?.elevationFeet;
    const properties = {
      id: door.id,
      nativeElementId: door.nativeElementId,
      levelId: door.levelId,
      elevationFeet: z,
      nativePhysical: true,
      state: door.state,
      color: door.state === "connected" ? "#d4e7ec" : "#ee9d45",
    };
    if (door.footprintFeet)
      doorFootprints.features.push({
        type: "Feature",
        properties,
        geometry: {
          type: "Polygon",
          coordinates: polygon([[door.footprintFeet]]).coordinates[0]!,
        },
      });
    doorMarkers.features.push({
      type: "Feature",
      properties,
      geometry: {
        type: "Point",
        coordinates: geographicPoint(data, door.pointFeet),
      },
    });
  }
  return {
    areas,
    walls,
    exposedWalls: walls,
    roomBlocks,
    doorFootprints,
    doorMarkers,
    records,
    uncutSurfaces: 0,
    lowerRooms: empty(),
    lowerWalls: empty(),
    lowerOpenings: empty(),
    labels,
  };
}
