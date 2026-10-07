import {
  nativeSlabFloorOwners,
  nativeSlabFloorOwner,
} from "./native-slab-ownership";
import { nativeDisplayScopeParts } from "./native-display-scopes";
import { validatePublishedNativeExploreMapping } from "./native-explore-mapping";
import {
  associateNativeRooms,
  type NativeRoomAssociation,
} from "./native-explore-associations";
import polygonClipping from "polygon-clipping";
import { roomDisplayColor } from "./display-geometry";
import { nativeAreaDisplayParts } from "./native-area-display";
import type { FeatureCollection, Polygon, LineString } from "geojson";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { deriveNativeAreas, type NativeAreaRegion } from "./native-area-review";
import { geographicPoint } from "./routing";
import {
  HALLWAY_COLOR,
  RESTRICTED_AREA_COLOR,
  isHallway,
  isRestrictedArea,
  isOverviewWalkway,
} from "./display-passages";
import { projectPlaceDisplayName } from "./visitor-metadata";
import { isVisitorHallway } from "./place-discovery";
import { pointInNativeArea } from "./native-area-review";
import {
  nativeIndoorEnvelopeParts,
  verifyNativeIndoorEnvelopes,
} from "./native-indoor-envelopes";
import {
  nativeLectureFloorOwners,
  nativeLectureFloorOwner,
} from "./native-lecture-ownership";

export type NativeExploreRegion = NativeAreaRegion & {
  levelId: number;
  /** Proven internal tiered-floor identity; does not edit the published mapping. */
  lectureRoomKey?: string;
  /** Current native enclosure on a proven offset slab in the same campus floor. */
  slabRoomKey?: string;
  associations?: NativeRoomAssociation[];
  /** Presentation crop only; ringsFeet remains the complete native component. */
  visitorPartsFeet?: [number, number][][][];
  /** Native slab extent hidden pending enclosure evidence; never a route veto. */
  enclosureReviewAreaSquareFeet?: number;
};
export type NativeExploreResult = {
  regions: NativeExploreRegion[];
  fills: FeatureCollection<Polygon>;
  overview: FeatureCollection<Polygon>;
  outlines: FeatureCollection<Polygon>;
  partitions: FeatureCollection<LineString>;
  warnings: string[];
  warningCount: number;
  levelIds: number[];
};
/** Type colors are independent of old outline paints and selection highlights.
 * Mixed shared areas keep a neutral fill until their boundaries are resolved. */
export function nativeExploreRegionColor(places: IndoorRecord[]) {
  if (places.length && places.every(isRestrictedArea))
    return RESTRICTED_AREA_COLOR;
  if (places.length && places.every(isHallway)) return HALLWAY_COLOR;
  const colors = new Set(places.map((r) => roomDisplayColor(r, false)));
  return colors.size === 1 ? [...colors][0] : "#e9edef";
}
const nativePolygonArea = (rings: [number, number][][]) => {
  const ringArea = (ring: [number, number][]) => {
    const [x, y] = ring[0];
    return (
      Math.abs(
        ring.reduce((sum, p, i) => {
          const q = ring[(i + 1) % ring.length];
          return sum + (p[0] - x) * (q[1] - y) - (q[0] - x) * (p[1] - y);
        }, 0),
      ) / 2
    );
  };
  return Math.max(
    0,
    ringArea(rings[0]) -
      rings.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0),
  );
};
/** A small corridor/vestibule label cannot recolor an entire dining hall.
 * Metadata chooses a type only when its unioned claims supply the unique strict
 * majority of the native face. Claims never replace that face's boundary. */
export function nativeExploreRegionStyle(
  region: NativeAreaRegion,
  places: IndoorRecord[],
  displayPartsFeet = [region.ringsFeet],
) {
  const uniform = new Set(places.map((r) => roomDisplayColor(r, false)));
  if (places.length < 2 || uniform.size === 1)
    return {
      color: nativeExploreRegionColor(places),
      circulation: !!places.length && places.every(isOverviewWalkway),
    };
  const groups = new Map<string, IndoorRecord[]>();
  for (const room of places.filter((r) => !isRestrictedArea(r) && r.walkable)) {
    const color = roomDisplayColor(room, false);
    groups.set(color, [...(groups.get(color) ?? []), room]);
  }
  const total = displayPartsFeet.reduce(
    (sum, rings) => sum + nativePolygonArea(rings),
    0,
  );
  const majorities: { color: string; circulation: boolean }[] = [];
  for (const [color, rooms] of groups) {
    const claims = polygonClipping.union(
      rooms[0].ringsFeet,
      ...rooms.slice(1).map((r) => r.ringsFeet),
    );
    const coverage = polygonClipping
      .intersection(displayPartsFeet, claims)
      .reduce((sum, rings) => sum + nativePolygonArea(rings), 0);
    if (coverage > total * (0.5 + 1e-8))
      majorities.push({
        color,
        circulation: rooms.every(isOverviewWalkway),
      });
  }
  return majorities.length === 1
    ? majorities[0]
    : { color: "#e9edef", circulation: false };
}
export function hasNativeExploreGeometry(data: IndoorDataset) {
  return (
    data.walkingSupport?.sourceModelSha256 === data.source.modelSha256 &&
    !!data.walkingSupport.floors.length
  );
}
/** A fresh import starts the main map; restores may retain a comparison link. */
export function initialMapPresentation(
  data: IndoorDataset,
  requested: string | null,
  freshImport = false,
) {
  if (freshImport) requested = null;
  if (requested === "relative" || requested === "3d" || requested === "native")
    return { view: requested, nativeFloor: true } as const;
  if (requested === "2d") return { view: "2d", nativeFloor: false } as const;
  return {
    view: hasNativeExploreGeometry(data) ? "2d" : "3d",
    nativeFloor: true,
  } as const;
}
/** A read-only floor trace. Applied selection boundaries remain analytical;
 * this does not create visitor room blocks or change navigation interiors. */
export async function deriveNativeExplore(
  data: IndoorDataset,
  levels: number[],
  building = "all",
): Promise<NativeExploreResult> {
  await verifyNativeIndoorEnvelopes(
    data.nativeIndoorEnvelopes,
    data.source.modelSha256,
  );
  if (!hasNativeExploreGeometry(data))
    throw new Error(
      "This project has no matching native floor geometry. Use the prepared room map.",
    );
  const result: NativeExploreResult = {
    regions: [],
    fills: { type: "FeatureCollection", features: [] },
    overview: { type: "FeatureCollection", features: [] },
    outlines: { type: "FeatureCollection", features: [] },
    partitions: { type: "FeatureCollection", features: [] },
    warnings: [],
    warningCount: 0,
    levelIds: [],
  };
  await validatePublishedNativeExploreMapping(data);
  const byKey = new Map(data.records.map((r) => [r.key, r]));
  const lectureOwners = nativeLectureFloorOwners(data);
  const slabOwners = nativeSlabFloorOwners(data);
  for (const levelId of [...new Set(levels)]) {
    if (
      building !== "all" &&
      !data.records.some(
        (r) => r.levelId === levelId && r.building === building,
      ) &&
      !lectureOwners.some(
        (o) => o.room.building === building && o.levelIds.includes(levelId),
      ) &&
      !slabOwners.some(
        (o) => o.room.building === building && o.levelIds.includes(levelId),
      )
    )
      continue;
    try {
      // No crop, candidate/proposal preview, or inferred gap closure is allowed.
      // The native tracer revalidates applied partitions and persisted thresholds.
      const published = data.nativeExploreMapping?.levels.find(
        (l) => l.levelId === levelId,
      );
      if (data.nativeExploreMapping && !published)
        throw new Error(
          "This native level has no published verified floor map. Review it in the master before publishing.",
        );
      const traced = published
        ? {
            regions: published.regions.map((r) => ({
              ...r,
              displayPartsFeet:
                r.displayPartsFeet ?? nativeAreaDisplayParts(r.ringsFeet),
            })),
            warnings: published.warningCount
              ? [
                  `${published.warningCount} source evidence warnings; inspect this level in the authoring master.`,
                ]
              : [],
            logicalPartitionIds: published.boundaries.map((b) => b.id),
          }
        : await deriveNativeAreas(data, levelId, {
            mode: "connected",
            maxGapFeet: 0,
          });
      result.levelIds.push(levelId);
      result.warningCount += published?.warningCount ?? traced.warnings.length;
      result.warnings.push(
        ...traced.warnings.map((w) => `Native level #${levelId}: ${w}`),
      );
      const displayCoverage = nativeIndoorEnvelopeParts(
        data.nativeIndoorEnvelopes,
        data.source.modelSha256,
        data.nativeLevels.find((level) => level.id === levelId)!.elevationFeet,
      );
      for (const originalRegion of data.nativeExploreMapping?.version === 2
        ? traced.regions
        : associateNativeRooms(
            traced.regions,
            data.records.filter((r) => r.levelId === levelId),
          )) {
        const lectureRoomKey = !originalRegion.roomKeys.length
          ? nativeLectureFloorOwner(
              lectureOwners,
              levelId,
              originalRegion.ringsFeet,
            )
          : undefined;
        const slabRoomKey =
          !originalRegion.roomKeys.length && !lectureRoomKey
            ? nativeSlabFloorOwner(
                slabOwners,
                levelId,
                originalRegion.ringsFeet,
              )
            : undefined;
        const ownerKey = lectureRoomKey ?? slabRoomKey;
        const region = ownerKey
          ? { ...originalRegion, roomKeys: [ownerKey] }
          : originalRegion;
        if (
          building !== "all" &&
          !region.roomKeys.some((k) => byKey.get(k)?.building === building)
        )
          continue;
        const places = region.roomKeys
          .map((k) => byKey.get(k))
          .filter((r) => r !== undefined);
        // An exposed shared slab needs independently checked native enclosure
        // evidence. Registered room contours never create a display boundary.
        const needsDisplayScope =
          !!data.nativeIndoorEnvelopes || !places.length ||
          (places.length > 1 && region.exposedFloorEdgeFeet > 0);
        let visitorPartsFeet = !places.length && !data.nativeIndoorEnvelopes
          ? []
          : needsDisplayScope
            ? displayCoverage.length
              ? polygonClipping.intersection(region.ringsFeet, displayCoverage)
              : []
            : [region.ringsFeet];
        if (data.nativeDisplayScopes) {
          const scoped = await nativeDisplayScopeParts(
            data.nativeDisplayScopes,
            data.source.modelSha256,
            levelId,
            region.id,
            region.ringsFeet,
          );
          if (scoped.parts.length)
            visitorPartsFeet = polygonClipping.union(
              visitorPartsFeet,
              scoped.parts,
            );
          for (const id of scoped.stale) {
            result.warningCount++;
            result.warnings.push(
              `Native level #${levelId}: reviewed display scope ${id} needs rechecking after native geometry changed.`,
            );
          }
        }
        result.regions.push({
          ...region,
          levelId,
          visitorPartsFeet,
          ...(needsDisplayScope
            ? {
                enclosureReviewAreaSquareFeet: Math.max(
                  0,
                  nativePolygonArea(region.ringsFeet) -
                    visitorPartsFeet.reduce(
                      (sum, part) => sum + nativePolygonArea(part),
                      0,
                    ),
                ),
              }
            : {}),
          ...(lectureRoomKey ? { lectureRoomKey } : {}),
          ...(slabRoomKey ? { slabRoomKey } : {}),
        });
        const style = nativeExploreRegionStyle(
          region,
          places,
          visitorPartsFeet,
        );
        const color = style.color;
        // A mixed restricted face cannot be cut up with metadata polygons.
        const protectedShared =
          places.length > 1 &&
          places.some((room) => isRestrictedArea(room) || !room.walkable);
        const properties = {
          nativeRegionId: region.id,
          levelId,
          placeCount: region.roomKeys.length,
          color: protectedShared ? "#e9edef" : color,
          roomKeys: region.roomKeys,
          circulation: style.circulation && places.every(isOverviewWalkway),
          restricted: !!places.length && places.every(isRestrictedArea),
        };
        const feature = (rings: number[][][]) => ({
          type: "Feature" as const,
          properties,
          geometry: {
            type: "Polygon" as const,
            coordinates: rings.map((r) =>
              [...r, r[0]].map((p) =>
                geographicPoint(data, p as [number, number]),
              ),
            ),
          },
        });
        result.outlines.features.push(...visitorPartsFeet.map(feature));
        // Whole faces survive overview tile quantization; the detailed pass
        // keeps the prepared small triangles for robust architectural holes.
        result.overview.features.push(...visitorPartsFeet.map(feature));
        result.fills.features.push(
          ...visitorPartsFeet.flatMap(nativeAreaDisplayParts).map(feature),
        );
        // A dominant type colors the connected native face. An unresolved mixed
        // restricted face remains neutral until its native separation is known.
        if (
          !protectedShared &&
          style.circulation &&
          !places.every(isOverviewWalkway)
        ) {
          const walkwayParts = visitorPartsFeet;
          for (const part of walkwayParts) {
            const overview = feature(part);
            overview.properties = {
              ...properties,
              color,
              circulation: style.circulation,
              restricted: false,
            };
            result.overview.features.push(overview);
            for (const triangle of nativeAreaDisplayParts(part)) {
              const tint = feature(triangle);
              tint.properties = {
                ...properties,
                color,
                circulation: style.circulation,
                restricted: false,
              };
              result.fills.features.push(tint);
            }
          }
        }
      }
      // Reviewed shaft interiors are non-walkable architectural context. They
      // never enter the selectable floor-region list or create a floor surface.
      if (data.indoorExclusions?.sourceModelSha256 === data.source.modelSha256)
        for (const area of data.indoorExclusions.areas) {
          const lift = data.connectors?.find(
            (c) =>
              c.id === area.connectorId &&
              c.kind === "elevator" &&
              c.sourceModelSha256 === data.source.modelSha256 &&
              c.entrances.some(
                (e) =>
                  e.levelId === levelId &&
                  (building === "all" ||
                    data.records.some(
                      (r) => r.key === e.roomKey && r.building === building,
                    )),
              ),
          );
          if (!lift || area.reason !== "off-limits" || area.levelId !== levelId)
            continue;
          for (const rings of area.partsFeet) {
            const feature = {
              type: "Feature" as const,
              properties: {
                nativeRegionId: area.id,
                shaftConnectorId: lift.id,
                levelId,
                color: "#e9edef",
                roomKeys: [],
                placeCount: 0,
                circulation: false,
                restricted: true,
              },
              geometry: {
                type: "Polygon" as const,
                coordinates: rings.map((r) =>
                  [...r, r[0]].map((p) => geographicPoint(data, p)),
                ),
              },
            };
            result.overview.features.push(feature);
            result.fills.features.push(feature);
            result.outlines.features.push(feature);
          }
        }
      for (const p of published?.boundaries ??
        data.reviewedAreaPartitions?.partitions ??
        []) {
        if (!traced.logicalPartitionIds?.includes(p.id)) continue;
        result.partitions.features.push({
          type: "Feature",
          properties: { id: p.id, label: p.label },
          geometry: {
            type: "LineString",
            coordinates: (p.closed
              ? [...p.pointsFeet, p.pointsFeet[0]]
              : p.pointsFeet
            ).map((point) => geographicPoint(data, point)),
          },
        });
      }
    } catch (error) {
      result.warningCount++;
      result.warnings.push(
        `Native level #${levelId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (!result.levelIds.length)
    throw new Error(
      result.warnings.join(" ") ||
        "No native floor geometry on this campus floor.",
    );
  // A native elevation seam inside proven tiered seating is not a partition.
  // Union only the visible supported faces for its flat outline; keep each
  // analytical region, elevation and all actual holes in the result unchanged.
  for (const key of new Set(
    result.regions.map((r) => r.lectureRoomKey).filter(Boolean),
  )) {
    const pieces = result.regions.filter(
      (r) =>
        r.roomKeys.length === 1 &&
        r.roomKeys[0] === key &&
        r.visitorPartsFeet?.length,
    );
    if (pieces.length < 2) continue;
    const ids = new Set(pieces.map((r) => r.id));
    const template = result.outlines.features.find((f) =>
      ids.has(String(f.properties?.nativeRegionId)),
    );
    if (!template) continue;
    try {
      const parts = pieces.flatMap((r) => r.visitorPartsFeet!);
      const united = polygonClipping.union(parts);
      const outlines = united.map((rings) => ({
        ...template,
        properties: {
          ...template.properties,
          nativeLevelIds: [...new Set(pieces.map((r) => r.levelId))],
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: rings.map((r) =>
            [...r, r[0]].map((p) => geographicPoint(data, p)),
          ),
        },
      }));
      result.outlines.features = result.outlines.features.filter(
        (f) => !ids.has(String(f.properties?.nativeRegionId)),
      );
      result.outlines.features.push(...outlines);
    } catch {
      /* Retain separate native outlines if union cannot be verified. */
    }
  }
  return result;
}
/** Retain every original place identity when searching a shared native region. */
export function filterNativeExplorePlaces(
  places: IndoorRecord[],
  query: string,
  data?: IndoorDataset,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return places.filter((r) => {
    const label =
      `${r.number} ${r.name} ${data ? projectPlaceDisplayName(data, r) : ""} ${r.building} #${r.levelId}`.toLocaleLowerCase();
    return terms.every((term) => label.includes(term));
  });
}
/** Physical doorway/stair controls keep the main map's routing interaction. */
export function nativeExploreControlHit(layerId: string) {
  return (
    /(?:connector|portal|entrance)/.test(layerId) ||
    /^project-(?:door|native-stair)-(?:fill|boxes)$/.test(layerId)
  );
}

/** A hallway-only native component is not a destination. A genuinely shared
 * room component is selectable as a whole; metadata contours do not create
 * invisible hit boundaries inside that physical component. */
export function nativeExplorePickRegions(
  data: IndoorDataset,
  regions: NativeExploreRegion[],
  point: [number, number],
  building = "all",
) {
  return regions.filter((region) => {
    if (
      region.visitorPartsFeet &&
      !region.visitorPartsFeet.some((part) => pointInNativeArea(point, part))
    )
      return false;
    const places = nativeExplorePlaces(data, region, building);
    const destinations = places.filter((room) => !isVisitorHallway(room));
    if (!destinations.length) return false;
    return true;
  });
}
/** Region labels are associations, never an automatic place merge. */
export function nativeExplorePlaces(
  data: IndoorDataset,
  region: NativeExploreRegion,
  building = "all",
) {
  const keys = new Set(region.roomKeys);
  return data.records.filter(
    (r) =>
      keys.has(r.key) &&
      (r.levelId === region.levelId ||
        (region.lectureRoomKey === r.key &&
          nativeLectureFloorOwner(
            nativeLectureFloorOwners(data),
            region.levelId,
            region.ringsFeet,
          ) === r.key) ||
        (region.slabRoomKey === r.key &&
          nativeSlabFloorOwner(
            nativeSlabFloorOwners(data),
            region.levelId,
            region.ringsFeet,
          ) === r.key)) &&
      (building === "all" || r.building === building),
  );
}
