/** Worker-only. This compares cached face drawing to an ALREADY VALIDATED published
 * v3 mapping. It certifies neither the mapping nor walls/preparedFloor geometry.
 * No native trace/preparation or topology validation is repeated. Exact source
 * coordinates are decoded only for the existing metadata tint rule. */
import polygonClipping from "polygon-clipping";
import type { IndoorDataset } from "./contract";
import type { NativeExploreResult } from "./native-explore";
import { nativeExploreRegionStyle } from "./native-explore";
import { Rational, type NativeRationalParts } from "./native-rational-overlay";
import { nativeAreaDisplayParts } from "./native-area-display";
import { geographicPoint } from "./routing";
import { isOverviewWalkway, isRestrictedArea } from "./display-passages";
import {
  nativeLectureFloorOwners,
  nativeLectureFloorOwner,
} from "./native-lecture-ownership";
import {
  nativeSlabFloorOwners,
  nativeSlabFloorOwner,
} from "./native-slab-ownership";
const fail = (s: string): never => {
  throw new Error("Cached native drawing: " + s);
};
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => same(v, b[i]))
    );
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>,
    ak = Object.keys(x).filter((k) => x[k] !== undefined),
    bk = Object.keys(y).filter((k) => y[k] !== undefined);
  return (
    ak.length === bk.length &&
    ak.every((k) => Object.hasOwn(y, k) && same(x[k], y[k]))
  );
}
const check = (a: unknown, b: unknown, label: string) => {
  if (!same(a, b)) fail(label);
};
export function validateNativeCachedDrawing(
  data: IndoorDataset,
  levels: number[],
  cached: NativeExploreResult,
  building = "all",
) {
  if (data.nativeExploreMapping?.version !== 3)
    fail("requires prevalidated exact published mapping");
  if (building !== "all")
    fail("task proposal supports generated all-building variants only");
  check(cached.levelIds, levels, "requested scope changed");
  const source = data.nativeExploreMapping!,
    byKey = new Map(data.records.map((r) => [r.key, r]));
  const lectureOwners = nativeLectureFloorOwners(data),
    slabOwners = nativeSlabFloorOwners(data);
  const expected: {
    fills: any[];
    overview: any[];
    outlines: any[];
    partitions: any[];
  } = { fills: [], overview: [], outlines: [], partitions: [] };
  const expectedRegions: any[] = [];
  let sourceResidualFaces = 0;
  if (cached.exactTopologies?.length !== levels.length)
    fail("complete exact scope carrier omitted");
  for (const [levelIndex, levelId] of levels.entries()) {
    const level = source.levels.find((l) => l.levelId === levelId);
    if (!level?.exactTopology)
      throw new Error(
        "Cached native drawing: unsupported published source scope",
      );
    const topology = level.exactTopology,
      entry = cached.exactTopologies![levelIndex]!;
    check(entry.levelId, levelId, "exact scope reordered");
    check(entry.topology, topology, "exact coordinates/faces changed");
    check(
      entry.geometrySha256,
      topology.sourceGeometryKey,
      "exact source binding changed",
    );
    sourceResidualFaces += level.displayResidualTopology?.faces.length ?? 0;
    // Decoder is not an authority bypass: package/trace validation is a required
    // caller precondition. Source residual carrier remains in the bound dataset.
    const coordinates = topology.coordinates.map(
      (q) =>
        [
          new Rational(BigInt(q.x[0]), BigInt(q.x[1])),
          new Rational(BigInt(q.y[0]), BigInt(q.y[1])),
        ] as [Rational, Rational],
    );
    const faces = new Map(
      topology.faces.map((f) => [
        f.id,
        f.parts.map((p) =>
          p.map((r) => r.map((i) => coordinates[i]!)),
        ) as NativeRationalParts,
      ]),
    );
    for (const original of level.regions) {
      if (!original.exactFaceId || !faces.has(original.exactFaceId))
        fail("missing positive original face");
      const lectureRoomKey = !original.roomKeys.length
        ? nativeLectureFloorOwner(lectureOwners, levelId, original.ringsFeet)
        : undefined;
      const slabRoomKey =
        !original.roomKeys.length && !lectureRoomKey
          ? nativeSlabFloorOwner(slabOwners, levelId, original.ringsFeet)
          : undefined;
      const owner = lectureRoomKey ?? slabRoomKey,
        region = owner ? { ...original, roomKeys: [owner] } : original;
      const display = region.displayPartsFeet;
      if (!display)
        throw new Error(
          "Cached native drawing: source mapping lacks contained drawing",
        );
      const expectedRegion = {
        ...region,
        levelId,
        visitorPartsFeet: display,
        ...(lectureRoomKey ? { lectureRoomKey } : {}),
        ...(slabRoomKey ? { slabRoomKey } : {}),
      };
      expectedRegions.push(expectedRegion);
      const places = region.roomKeys
          .map((k) => byKey.get(k))
          .filter((r) => r !== undefined),
        style = nativeExploreRegionStyle(
          { ...region, displayPartsFeet: display },
          places,
          display,
          faces.get(region.exactFaceId!)!,
        );
      const protectedShared =
        places.length > 1 &&
        places.some((r) => isRestrictedArea(r) || !r.walkable);
      const properties = {
        nativeRegionId: region.id,
        levelId,
        placeCount: region.roomKeys.length,
        color: protectedShared ? "#e9edef" : style.color,
        roomKeys: region.roomKeys,
        circulation: style.circulation && places.every(isOverviewWalkway),
        restricted: !!places.length && places.every(isRestrictedArea),
      };
      const feature = (rings: number[][][], props = properties) => ({
        type: "Feature",
        properties: props,
        geometry: {
          type: "Polygon",
          coordinates: rings.map((r) =>
            [...r, r[0]!].map((p) =>
              geographicPoint(data, p as [number, number]),
            ),
          ),
        },
      });
      expected.outlines.push(feature(region.ringsFeet));
      expected.overview.push(...display.map((p) => feature(p)));
      expected.fills.push(...display.map((p) => feature(p)));
      if (
        !protectedShared &&
        style.circulation &&
        !places.every(isOverviewWalkway)
      ) {
        const tintProps = {
          ...properties,
          color: style.color,
          circulation: true,
          restricted: false,
        };
        for (const part of display) {
          expected.overview.push(feature(part, tintProps));
          expected.fills.push(
            ...nativeAreaDisplayParts(part).map((p) => feature(p, tintProps)),
          );
        }
      }
    }
    if (data.indoorExclusions?.sourceModelSha256 === data.source.modelSha256)
      for (const area of data.indoorExclusions.areas) {
        const lift = data.connectors?.find(
          (c) =>
            c.id === area.connectorId &&
            c.kind === "elevator" &&
            c.sourceModelSha256 === data.source.modelSha256 &&
            c.entrances.some((e) => e.levelId === levelId),
        );
        if (!lift || area.reason !== "off-limits" || area.levelId !== levelId)
          continue;
        for (const rings of area.partsFeet) {
          const f = {
            type: "Feature",
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
              type: "Polygon",
              coordinates: rings.map((r) =>
                [...r, r[0]!].map((p) => geographicPoint(data, p)),
              ),
            },
          };
          expected.overview.push(f);
          expected.fills.push(f);
          expected.outlines.push(f);
        }
      }
    for (const p of level.boundaries)
      expected.partitions.push({
        type: "Feature",
        properties: { id: p.id, label: p.label },
        geometry: {
          type: "LineString",
          coordinates: (p.closed
            ? [...p.pointsFeet, p.pointsFeet[0]!]
            : p.pointsFeet
          ).map((q) => geographicPoint(data, q)),
        },
      });
  }
  if (cached.regions.length !== expectedRegions.length)
    fail("positive region omitted/duplicated");
  for (const [i, expectedRegion] of expectedRegions.entries()) {
    const actual = cached.regions[i]!;
    for (const key of [
      "id",
      "levelId",
      "exactFaceId",
      "ringsFeet",
      "displayPartsFeet",
      "containedDisplay",
      "visitorPartsFeet",
      "roomKeys",
      "nativeFloorIds",
      "nativeDoorIds",
      "areaSquareFeet",
      "exposedFloorEdgeFeet",
      "lectureRoomKey",
      "slabRoomKey",
    ])
      check(
        (actual as any)[key],
        expectedRegion[key],
        `region ${expectedRegion.id} ${key} changed`,
      );
  }
  // Replay the existing source-only STROKE rule; exact faces/holes and
  // contained fill pieces are unchanged and remain separately compared above.
  for (const key of new Set(
    expectedRegions.map((r) => r.lectureRoomKey).filter(Boolean),
  )) {
    const pieces = expectedRegions.filter(
      (r) =>
        r.roomKeys.length === 1 &&
        r.roomKeys[0] === key &&
        r.visitorPartsFeet?.length,
    );
    if (pieces.length < 2) continue;
    const ids = new Set(pieces.map((r) => r.id)),
      template = expected.outlines.find((f) =>
        ids.has(String(f.properties?.nativeRegionId)),
      );
    if (!template) continue;
    try {
      const united = polygonClipping.union(
        pieces.flatMap((r) => r.visitorPartsFeet),
      );
      const outlines = united.map((rings) => ({
        ...template,
        properties: {
          ...template.properties,
          nativeLevelIds: [...new Set(pieces.map((r) => r.levelId))],
        },
        geometry: {
          type: "Polygon",
          coordinates: rings.map((r) =>
            [...r, r[0]!].map((p) => geographicPoint(data, p)),
          ),
        },
      }));
      expected.outlines = expected.outlines.filter(
        (f) => !ids.has(String(f.properties?.nativeRegionId)),
      );
      expected.outlines.push(...outlines);
    } catch {
      /* Same deterministic union failure retains the original source strokes. */
    }
  }
  for (const key of ["fills", "overview", "outlines", "partitions"] as const) {
    if (cached[key].type !== "FeatureCollection")
      fail(`${key} collection changed`);
    check(
      cached[key].features,
      expected[key],
      `${key} source geometry/count/properties changed`,
    );
  }
  return {
    regions: expectedRegions.length,
    sourceResidualFaces,
    completeExactSourceRetained: true,
    sourceResidualCarrierRetained: true,
    residualCarrierIsInBoundDataset: true,
    coordinatesComparedDirectly: true,
    wallsCertified: false,
    preparedFloorCertified: false,
  };
}
