import {
  Rational,
  nativeRationalOverlay,
  nativeRationalScalarToIEEE,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "./native-rational-overlay";
import { NATIVE_CONTAINED_DISPLAY_VERSION } from "./native-contained-display";
import { nativeExactNumericIdentity } from "./native-exact-numeric-identity";
import {
  createNativeExactTopologyIndex,
  encodeNativeExactTopology,
  nativeRationalPoint,
  type NativeExactPlanarTopology,
} from "./native-exact-planar-topology";
import { nativeAreaGeometrySha256 } from "./native-area-review";
import { NATIVE_EXACT_GEOS_BINDING } from "./native-exact-geos-overlay";
import { NATIVE_SELECTION_TOPOLOGY_VERSION } from "./native-selection-topology";
import { NATIVE_FLOOR_CONTACT_SELECTION_VERSION } from "./native-material-plan";
import { NATIVE_BARRIER_TOPOLOGY_VERSION } from "./native-barrier-topology";
import type { IndoorDataset } from "./contract";
import { createContentCheckedValidation } from "./content-checked-validation";
import type { NativeAreaRegion } from "./native-area-review";
import {
  associateNativeRooms,
  type NativeRoomAssociation,
} from "./native-explore-associations";
import { nativeAreaDisplayParts } from "./native-area-display";
import { deriveNativeAreas } from "./native-area-review";
import { validateNativePhysicalLevels } from "./native-physical-levels";
import { nativeWallPositionMaterialBinding } from "./native-wall-position-repairs";
import {
  NATIVE_STAIR_LANDING_ASSOCIATION_VERSION,
  nativeStairLandingAssociation,
} from "./native-stair-landing-association";

export type PublishedNativeExploreMapping = {
  format: "openindoormaps-native-explore-mapping";
  version: 1 | 2 | 3;
  sourceModelSha256: string;
  datasetGeometrySha256: string;
  mappingSha256: string;
  levels: {
    levelId: number;
    exactTopology?: NativeExactPlanarTopology;
    displayResidualTopology?: NativeExactPlanarTopology;
    regions: (Omit<NativeAreaRegion, "displayPartsFeet"> & {
      displayPartsFeet?: NativeAreaRegion["displayPartsFeet"];
      associations?: NativeRoomAssociation[];
    })[];
    boundaries: {
      id: string;
      label: string;
      pointsFeet: [number, number][];
      closed: boolean;
    }[];
    warningCount: number;
  }[];
  unavailableLevelIds: number[];
};
async function sha(value: unknown) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
/** Geometry affecting the native trace, its labels and supported door ownership.
 * Display preferences and private authoring notes are deliberately absent. */
export async function nativeExploreDatasetGeometrySha256(
  data: IndoorDataset,
  version: 1 | 2 | 3 = data.nativeIndoorEnvelopes && data.nativeMaterialSections
    ? 3
    : 2,
) {
  return sha([
    `native-explore-published-geometry-v${version}`,
    data.source,
    data.alignment,
    data.nativeLevels,
    data.walkingSupport,
    ...(data.nativeIndoorEnvelopes
      ? [
          NATIVE_STAIR_LANDING_ASSOCIATION_VERSION,
          data.stairDisplay?.sourceModelSha256,
          data.stairDisplay?.sourceFlights?.map((f) => [
            f.stairElementId,
            f.levelIds,
            f.context,
            [...new Set(f.treads.map((t) => t.runElementId))].sort(
              (a, b) => a - b,
            ),
          ]),
          data.records.map((r) => [
            r.key,
            r.stair,
            r.walkable,
            r.access,
            r.elevationFeet,
          ]),
          data.edges.map((e) => [e.id, e.evidence, e.accessible]),
          data.nodes.map((n) => [
            n.id,
            n.kind,
            n.roomKey,
            n.levelId,
            n.pointFeet,
          ]),
        ]
      : []),
    ...(data.nativeIndoorEnvelopes && data.nativeMaterialSections
      ? [
          NATIVE_FLOOR_CONTACT_SELECTION_VERSION,
          version === 3
            ? [
                NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
                NATIVE_CONTAINED_DISPLAY_VERSION,
              ]
            : NATIVE_EXACT_GEOS_BINDING,
        ]
      : []),
    ...(data.nativeIndoorEnvelopes
      ? ["native-enclosed-selection-domain-v1", data.nativeIndoorEnvelopes]
      : []),
    ...(data.nativeMaterialSections ? [data.nativeMaterialSections] : []),
    ...(data.nativeDerivedFrameReturns ? [data.nativeDerivedFrameReturns] : []),
    ...(data.nativeSourceStairMaterials?.authoredTreadRoles
      ? [
          "native-authored-stair-tread-roles-v1",
          data.nativeSourceStairMaterials.authoredTreadRoles,
        ]
      : []),
    ...(data.nativeProvisionalCornerSeals
      ? [data.nativeProvisionalCornerSeals]
      : []),
    ...(data.nativePhysicalLevels
      ? [
          data.nativePhysicalLevels,
          data.floors.map((floor) => [floor.id, floor.levelIds]),
        ]
      : []),
    data.walls,
    data.doors,
    data.records.map((r) => [
      r.key,
      r.levelId,
      r.building,
      r.ringsFeet,
      r.properties.floorOpeningsFeet,
      ...(r.properties.nativeFloorOpeningOwnership
        ? [r.properties.nativeFloorOpeningOwnership]
        : []),
    ]),
    data.circulationGeometry?.fixtures,
    data.indoorExclusions?.areas.map(({ notes: _, ...area }) => area),
    ...(version >= 2
      ? [
          data.reviewedAreaPartitions?.partitions
            .filter((p) => p.status === "applied")
            .map(({ notes: _, ...p }) => p),
          ...(data.nativeSelectionContactRepairs?.repairs.some(
            (r) => r.status === "applied",
          )
            ? [
                data.nativeSelectionContactRepairs.repairs
                  .filter((r) => r.status === "applied")
                  .map(({ notes: _, ...r }) => r),
              ]
            : []),
          data.nativeDoorBoundaryClosures,
          data.nativeIndoorEnvelopes
            ? nativeWallPositionMaterialBinding(data.nativeWallPositionRepairs)
            : data.nativeWallPositionRepairs,
          data.selectionDoorThresholds,
          data.records.map((r) => [r.key, r.arrivalNodeId]),
          data.nodes.map((n) => [n.id, n.levelId, n.pointFeet]),
          NATIVE_SELECTION_TOPOLOGY_VERSION,
          NATIVE_BARRIER_TOPOLOGY_VERSION,
        ]
      : []),
    data.edges.map((e) => [
      e.id,
      e.kind,
      e.enabled,
      e.nativeElementId,
      e.roomKeys,
      e.pointsFeet,
    ]),
  ]);
}
export async function compileNativeExploreMapping(
  data: IndoorDataset,
  datasetGeometrySha256: string,
): Promise<PublishedNativeExploreMapping> {
  validateNativePhysicalLevels(data);
  const levels: PublishedNativeExploreMapping["levels"] = [],
    unavailableLevelIds: number[] = [];
  for (const level of data.nativeLevels) {
    if (
      !data.walkingSupport?.floors.some(
        (f) => Math.abs(f.elevationFeet - level.elevationFeet) < 0.15,
      )
    ) {
      unavailableLevelIds.push(level.id);
      continue;
    }
    try {
      const result = await deriveNativeAreas(data, level.id, {
        mode: "connected",
        maxGapFeet: 0,
      });
      levels.push({
        levelId: level.id,
        ...(result.exactTopology
          ? {
              exactTopology: result.exactTopology,
              displayResidualTopology: result.displayResidualTopology,
            }
          : {}),
        regions: result.exactTopology
          ? result.regions
          : associateNativeRooms(
              result.regions,
              data.records.filter((r) => r.levelId === level.id),
              data,
            ),
        warningCount: result.warnings.length,
        boundaries: (data.reviewedAreaPartitions?.partitions ?? [])
          .filter((p) => result.logicalPartitionIds?.includes(p.id))
          .map((p) => ({
            id: p.id,
            label: p.label,
            pointsFeet: structuredClone(p.pointsFeet),
            closed: p.closed,
          })),
      });
    } catch (error) {
      // A strict compilation cannot quietly publish an incomplete campus map.
      if (data.nativeIndoorEnvelopes && data.nativeMaterialSections)
        throw error;
      unavailableLevelIds.push(level.id);
    }
  }
  return {
    format: "openindoormaps-native-explore-mapping",
    version: data.nativeIndoorEnvelopes && data.nativeMaterialSections ? 3 : 2,
    sourceModelSha256: data.source.modelSha256,
    datasetGeometrySha256,
    mappingSha256: await sha([levels, unavailableLevelIds]),
    levels,
    unavailableLevelIds,
  };
}
/** Browser export uses its own worker; CLI exports can compute directly. */
export async function publishNativeExploreMapping(
  data: IndoorDataset,
  visitorData: IndoorDataset,
): Promise<PublishedNativeExploreMapping | undefined> {
  if (
    data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256 ||
    !data.walkingSupport.floors.length
  )
    return;
  const datasetGeometrySha256 =
    await nativeExploreDatasetGeometrySha256(visitorData);
  const bindVisitorMapping = async (mapping: PublishedNativeExploreMapping) => {
    if (mapping.version === 3) {
      for (const level of mapping.levels) {
        const sourceGeometryKey = await nativeAreaGeometrySha256(
          visitorData,
          level.levelId,
          { mode: "connected", maxGapFeet: 0 },
        );
        for (const field of [
          "exactTopology",
          "displayResidualTopology",
        ] as const) {
          const topology = level[field]!;
          if (topology.sourceGeometryKey === sourceGeometryKey) continue;
          const index = createNativeExactTopologyIndex(topology, {
            sourceModelSha256: data.source.modelSha256,
            sourceGeometryKey: topology.sourceGeometryKey,
            kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
          });
          level[field] = encodeNativeExactTopology(
            { ...index.binding, sourceGeometryKey },
            topology.faces.map((face) => ({
              id: face.id,
              parts: index.parts(face.id)!,
            })),
          );
        }
      }
      mapping.mappingSha256 = await sha([
        mapping.levels,
        mapping.unavailableLevelIds,
      ]);
    }
    return mapping;
  };
  if (data.nativeExploreMapping) {
    // Edits invalidate this derived cache. Never reuse stale polygons.
    const currentHash = await nativeExploreDatasetGeometrySha256(
      data,
      data.nativeExploreMapping.version,
    );
    if (
      currentHash === data.nativeExploreMapping.datasetGeometrySha256 &&
      (!(data.nativeIndoorEnvelopes && data.nativeMaterialSections) ||
        data.nativeExploreMapping.version === 3)
    ) {
      await validatePublishedNativeExploreMapping(data);
      const copy = structuredClone(data.nativeExploreMapping);
      if (copy.version === 1) {
        copy.version = 2;
        for (const level of copy.levels) {
          level.regions = associateNativeRooms(
            level.regions.map((r) => ({
              ...r,
              displayPartsFeet: nativeAreaDisplayParts(r.ringsFeet),
            })),
            data.records.filter((r) => r.levelId === level.levelId),
            data,
          );
        }
        copy.mappingSha256 = await sha([copy.levels, copy.unavailableLevelIds]);
      }
      copy.datasetGeometrySha256 = datasetGeometrySha256;
      return bindVisitorMapping(copy);
    }
  }
  if (typeof Worker === "undefined")
    return bindVisitorMapping(
      await compileNativeExploreMapping(data, datasetGeometrySha256),
    );
  const mapping = await new Promise<PublishedNativeExploreMapping>(
    (resolve, reject) => {
      const worker = new Worker(
        new URL("native-explore-export.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = ({
        data: response,
      }: MessageEvent<{
        result?: PublishedNativeExploreMapping;
        error?: string;
      }>) => {
        worker.terminate();
        response.error
          ? reject(new Error(response.error))
          : response.result
            ? resolve(response.result)
            : reject(
                new Error("Native floor map publication returned no mapping."),
              );
      };
      worker.onerror = () => {
        worker.terminate();
        reject(
          new Error(
            "Native floor map publication failed. Retry exporting the campus viewer.",
          ),
        );
      };
      worker.postMessage({ data, datasetGeometrySha256 });
    },
  );
  return bindVisitorMapping(mapping);
}
export async function validatePublishedNativeExploreMapping(
  data: IndoorDataset,
): Promise<void> {
  if (
    data.nativeExploreMapping?.version === 3 &&
    typeof window !== "undefined" &&
    typeof Worker !== "undefined"
  ) {
    await new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        new URL("native-explore-export.worker.ts", import.meta.url),
        { type: "module" },
      );
      const fail = (error: Error) => {
        worker.terminate();
        reject(error);
      };
      worker.onmessage = ({
        data: response,
      }: MessageEvent<{ error?: string }>) => {
        worker.terminate();
        response.error ? reject(new Error(response.error)) : resolve();
      };
      worker.onerror = () =>
        fail(new Error("Native floor map validation failed."));
      worker.onmessageerror = () =>
        fail(
          new Error("Native floor map validation response could not be read."),
        );
      try {
        worker.postMessage({ data, validation: true });
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
    return;
  }
  await validatePublishedNativeExploreMappingInProcess(data);
}
/** CLI and geometry workers validate exact topology without blocking browser input. */
export async function validatePublishedNativeExploreMappingInProcess(
  data: IndoorDataset,
): Promise<void> {
  if (data.nativeExploreMapping === undefined) return;
  await validateContentCheckedMapping(mappingProofInput(data));
}
const mappingProofInputs = new WeakMap<IndoorDataset, IndoorDataset>();
/** Native mapping checks use source floors/materials/thresholds, identities
 * and the complete exact mapping; never historical raised room blocks.
 * Keep every other actual property (including descriptor semantics) in the
 * detached, content-checked proof. The package still validates presentation
 * independently before this step. Excluding that unused large branch avoids
 * repeatedly hashing and cloning old volume meshes as native floor evidence. */
function mappingProofInput(data: IndoorDataset): IndoorDataset {
  if (Object.getPrototypeOf(data) !== Object.prototype) return data;
  const descriptors = Object.getOwnPropertyDescriptors(data);
  if (
    Reflect.ownKeys(descriptors).some((key) => {
      const d = Reflect.get(descriptors, key) as PropertyDescriptor;
      return !d.configurable || !d.enumerable || !("value" in d);
    })
  )
    return data;
  delete descriptors.presentation;
  let input = mappingProofInputs.get(data);
  if (!input) {
    input = {} as IndoorDataset;
    mappingProofInputs.set(data, input);
  }
  // Refresh references on every call: replacement, deletion and in-place
  // mutation of any retained field must invalidate the full content proof.
  for (const key of Reflect.ownKeys(input)) Reflect.deleteProperty(input, key);
  Object.defineProperties(input, descriptors);
  return input;
}
const validateContentCheckedMapping = createContentCheckedValidation(
  validatePublishedNativeExploreMappingUncachedInProcess,
);
async function validatePublishedNativeExploreMappingUncachedInProcess(
  data: IndoorDataset,
): Promise<void> {
  const v = data.nativeExploreMapping;
  if (v === undefined) return;
  const point = (p: unknown) =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every(
      (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7,
    );
  const hash = (h: unknown) =>
    typeof h === "string" && /^[a-f0-9]{64}$/.test(h);
  const keys = (v: object, allowed: string[]) =>
    Object.keys(v).every((k) => allowed.includes(k));
  if (
    !v ||
    v.format !== "openindoormaps-native-explore-mapping" ||
    ![1, 2, 3].includes(v.version) ||
    v.sourceModelSha256 !== data.source.modelSha256 ||
    !hash(v.datasetGeometrySha256) ||
    !hash(v.mappingSha256) ||
    !keys(v, [
      "format",
      "version",
      "sourceModelSha256",
      "datasetGeometrySha256",
      "mappingSha256",
      "levels",
      "unavailableLevelIds",
    ]) ||
    !Array.isArray(v.levels) ||
    v.levels.length > 1000 ||
    !Array.isArray(v.unavailableLevelIds) ||
    v.unavailableLevelIds.length > 1000
  )
    throw new Error("Invalid published native floor mapping.");
  const ids = new Set<number>();
  for (const level of v.levels) {
    if (
      !level ||
      !keys(level, [
        "levelId",
        "regions",
        "boundaries",
        "warningCount",
        ...(v.version === 3
          ? ["exactTopology", "displayResidualTopology"]
          : []),
      ]) ||
      !Number.isSafeInteger(level.levelId) ||
      ids.has(level.levelId) ||
      !data.nativeLevels.some((l) => l.id === level.levelId) ||
      !Number.isSafeInteger(level.warningCount) ||
      level.warningCount < 0 ||
      !Array.isArray(level.regions) ||
      level.regions.length > 100000 ||
      !Array.isArray(level.boundaries) ||
      level.boundaries.length > 10000
    )
      throw new Error("Invalid published native level.");
    ids.add(level.levelId);
    const exactIndex =
      v.version === 3
        ? createNativeExactTopologyIndex(level.exactTopology!, {
            sourceModelSha256: data.source.modelSha256,
            sourceGeometryKey: await nativeAreaGeometrySha256(
              data,
              level.levelId,
              { mode: "connected", maxGapFeet: 0 },
            ),
            kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
          })
        : undefined;
    const residualIndex = exactIndex
      ? createNativeExactTopologyIndex(
          level.displayResidualTopology!,
          exactIndex.binding,
        )
      : undefined;
    const regions = new Set<string>();
    for (const r of level.regions) {
      if (
        !r ||
        !keys(r, [
          "id",
          "ringsFeet",
          "roomKeys",
          "nativeFloorIds",
          "nativeDoorIds",
          "areaSquareFeet",
          "exposedFloorEdgeFeet",
          ...(v.version >= 2 ? ["displayPartsFeet", "associations"] : []),
          ...(v.version === 3 ? ["exactFaceId", "containedDisplay"] : []),
        ]) ||
        typeof r.id !== "string" ||
        !r.id ||
        r.id.length > 200 ||
        regions.has(r.id) ||
        !Array.isArray(r.ringsFeet) ||
        !r.ringsFeet.length ||
        r.ringsFeet.length > 100000 ||
        r.ringsFeet.some(
          (r) =>
            !Array.isArray(r) ||
            r.length < 3 ||
            r.length > 1000000 ||
            !r.every(point),
        ) ||
        !Array.isArray(r.roomKeys) ||
        r.roomKeys.length > 100000 ||
        r.roomKeys.some(
          (k) =>
            !data.records.some(
              (p) => p.key === k && p.levelId === level.levelId,
            ),
        ) ||
        ![r.areaSquareFeet, r.exposedFloorEdgeFeet].every(
          (n) => Number.isFinite(n) && n >= 0,
        ) ||
        !Array.isArray(r.nativeFloorIds) ||
        !Array.isArray(r.nativeDoorIds) ||
        [...r.nativeFloorIds, ...r.nativeDoorIds].some(
          (id) => !Number.isSafeInteger(id) || id <= 0,
        )
      )
        throw new Error("Invalid published native area.");
      if (
        v.version >= 2 &&
        (!Array.isArray(r.displayPartsFeet) ||
          (v.version !== 3 && !r.displayPartsFeet.length) ||
          r.displayPartsFeet.length > 1000000 ||
          r.displayPartsFeet.some(
            (part) =>
              !Array.isArray(part) ||
              !part.length ||
              part.some(
                (ring) =>
                  !Array.isArray(ring) || ring.length < 3 || !ring.every(point),
              ),
          ) ||
          !Array.isArray(r.associations) ||
          r.associations.length !== r.roomKeys.length ||
          new Set(r.associations.map((a) => a.roomKey)).size !==
            r.roomKeys.length ||
          r.associations.some(
            (a) =>
              !a ||
              !keys(a, [
                "roomKey",
                "coverage",
                "method",
                "labelPointFeet",
                ...(v.version === 3 ? ["coverageRatio"] : []),
              ]) ||
              !r.roomKeys.includes(a.roomKey) ||
              (a.labelPointFeet !== undefined && !point(a.labelPointFeet)) ||
              !Number.isFinite(a.coverage) ||
              a.coverage < 0 ||
              a.coverage > 1 ||
              ![
                "majority-overlap",
                "seed-fallback",
                "native-stair-landing",
              ].includes(a.method) ||
              (a.method === "majority-overlap" &&
                (v.version === 3
                  ? !validExactCoverage(a.coverageRatio, a.coverage)
                  : a.coverage <= 0.5)) ||
              (a.method === "native-stair-landing" &&
                (() => {
                  const room = data.records.find((p) => p.key === a.roomKey);
                  const proof =
                    room &&
                    nativeStairLandingAssociation(data, room, [
                      r as NativeAreaRegion,
                    ]);
                  return (
                    !proof ||
                    proof.coverage !== a.coverage ||
                    JSON.stringify(proof.labelPointFeet) !==
                      JSON.stringify(a.labelPointFeet)
                  );
                })()),
          ))
      )
        throw new Error(
          "Invalid precomputed native display or room association.",
        );
      if (
        exactIndex &&
        (r.exactFaceId !== r.id || !exactIndex.parts(r.exactFaceId))
      )
        throw new Error("Published native area is missing its exact face.");
      if (exactIndex) {
        const display = r.containedDisplay;
        if (
          !display ||
          !keys(display, [
            "certificate",
            "faces",
            "unchangedIEEEAnchorsFeet",
          ]) ||
          display.certificate.version !== NATIVE_CONTAINED_DISPLAY_VERSION ||
          display.certificate.kernelVersion !==
            NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION ||
          !display.certificate.renderOnly ||
          !display.certificate.exactDecompositionEqualsSource ||
          !display.certificate.numericOutsideSourceEmpty ||
          !display.certificate.completeExactAuthorityRetained ||
          !display.certificate.positiveResidualsRetained ||
          !display.certificate.originalIEEEAnchorsUnchanged ||
          !Number.isFinite(display.certificate.maximumGeneratedMovementFeet) ||
          display.certificate.maximumGeneratedMovementFeet < 0 ||
          !Array.isArray(display.unchangedIEEEAnchorsFeet) ||
          !display.unchangedIEEEAnchorsFeet.every(point)
        )
          throw new Error("Invalid contained native display certificate.");
        const source = exactIndex.parts(r.exactFaceId!)!;
        const residual = residualIndex!.parts(`${r.id}:render-residual`) ?? [];
        if (
          !Array.isArray(display.faces) ||
          display.faces.length !== source.length ||
          display.faces.some(
            (face, index) =>
              !face ||
              !keys(face, [
                "sourcePartIndex",
                "exactCells",
                "numericPieces",
                "unrepresentablePositiveCells",
                "exactResidualParts",
                "numericPieceStartIndex",
                "exactResidualStartIndex",
                "unchangedIEEEAnchorsFeet",
              ]) ||
              face.sourcePartIndex !== index ||
              ![
                face.exactCells,
                face.numericPieces,
                face.unrepresentablePositiveCells,
                face.exactResidualParts,
                face.numericPieceStartIndex,
                face.exactResidualStartIndex,
              ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
              face.exactCells !==
                face.numericPieces + face.unrepresentablePositiveCells ||
              face.numericPieceStartIndex !==
                display.faces
                  .slice(0, index)
                  .reduce((n, f) => n + f.numericPieces, 0) ||
              face.exactResidualStartIndex !==
                display.faces
                  .slice(0, index)
                  .reduce((n, f) => n + f.exactResidualParts, 0) ||
              !Array.isArray(face.unchangedIEEEAnchorsFeet) ||
              !face.unchangedIEEEAnchorsFeet.every(point),
          ) ||
          display.faces.reduce((n, f) => n + f.numericPieces, 0) !==
            r.displayPartsFeet!.length ||
          display.faces.reduce((n, f) => n + f.exactResidualParts, 0) !==
            residual.length
        )
          throw new Error("Invalid contained native display face inventory.");
        const expectedAnchors = new Map<string, [number, number]>();
        for (const part of source)
          for (const ring of part)
            for (const p of ring) {
              const numeric: [number, number] = [
                nativeRationalScalarToIEEE(p[0]),
                nativeRationalScalarToIEEE(p[1]),
              ];
              const dyadic = nativeRationalPoint(numeric);
              if (p.every((q, i) => q.n === dyadic[i].n && q.d === dyadic[i].d))
                expectedAnchors.set(JSON.stringify(numeric), numeric);
            }
        if (
          display.unchangedIEEEAnchorsFeet.length !== expectedAnchors.size ||
          new Set(
            display.unchangedIEEEAnchorsFeet.map((p) => JSON.stringify(p)),
          ).size !== expectedAnchors.size ||
          display.unchangedIEEEAnchorsFeet.some(
            (p) => !expectedAnchors.has(JSON.stringify(p)),
          )
        )
          throw new Error(
            "Published display changed or omitted an unchanged native IEEE anchor.",
          );
        if (
          !(
            residual.length === 0 &&
            nativeExactNumericIdentity(r.displayPartsFeet!, source)
          ) &&
          (nativeRationalOverlay("difference", r.displayPartsFeet!, source)
            .length ||
            nativeRationalOverlay(
              "xor",
              nativeRationalOverlay("difference", source, r.displayPartsFeet!),
              residual,
            ).length)
        )
          throw new Error(
            "Published render subset or exact positive residual does not match its native face.",
          );
      }
      regions.add(r.id);
    }
    if (exactIndex && exactIndex.ids().some((id) => !regions.has(id)))
      throw new Error(
        "Published native mapping omitted a positive exact face.",
      );
    if (
      residualIndex &&
      residualIndex
        .ids()
        .some(
          (id) =>
            !id.endsWith(":render-residual") ||
            !regions.has(id.slice(0, -":render-residual".length)),
        )
    )
      throw new Error(
        "Published display residual has no corresponding native face.",
      );
    for (const b of level.boundaries)
      if (
        !b ||
        !keys(b, ["id", "label", "pointsFeet", "closed"]) ||
        typeof b.id !== "string" ||
        !b.id ||
        b.id.length > 200 ||
        typeof b.label !== "string" ||
        b.label.length > 200 ||
        typeof b.closed !== "boolean" ||
        !Array.isArray(b.pointsFeet) ||
        b.pointsFeet.length < (b.closed ? 3 : 2) ||
        b.pointsFeet.length > 100 ||
        !b.pointsFeet.every(point)
      )
        throw new Error("Invalid published analytical boundary.");
  }
  if (
    new Set(v.unavailableLevelIds).size !== v.unavailableLevelIds.length ||
    v.unavailableLevelIds.some(
      (id) =>
        !Number.isSafeInteger(id) ||
        ids.has(id) ||
        !data.nativeLevels.some((l) => l.id === id),
    )
  )
    throw new Error("Invalid unavailable published level.");
  if (
    (await nativeExploreDatasetGeometrySha256(data, v.version)) !==
    v.datasetGeometrySha256
  )
    throw new Error(
      "Published native floor map has stale source geometry. Re-export the campus viewer from the current master.",
    );
  if ((await sha([v.levels, v.unavailableLevelIds])) !== v.mappingSha256)
    throw new Error(
      "Published native floor map geometry was changed or damaged.",
    );
}

function validExactCoverage(value: unknown, measured: number): boolean {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some(
      (v) =>
        typeof v !== "string" ||
        v.length > 4096 ||
        !/^(0|[1-9][0-9]*)$/.test(v),
    )
  )
    return false;
  const [n, d] = value.map(BigInt);
  if (!d || n > d || 2n * n <= d) return false;
  const q = new Rational(n, d);
  return (
    String(q.n) === value[0] &&
    String(q.d) === value[1] &&
    nativeRationalScalarToIEEE(q) === measured
  );
}
