import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { nativeRenderExactParts } from "./native-render-parts.ts";
import {
  nativeRationalOverlay,
  type NativeRationalParts,
} from "./native-rational-overlay.ts";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase.ts";
import { createNativeContainedDisplay } from "./native-contained-display.ts";
import { geographicPoint } from "./routing.ts";
import type { IndoorDataset } from "./contract.ts";
import type { PreparedFloor } from "./prepared-floor.ts";
export const STRICT_OVERVIEW_FLOOR_PROJECTION_VERSION =
  "prepared-exact-native-exclusion-overview-v1";
const digest = (v: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(v))));
const stored = (p: NativeRationalParts) =>
  p.map((part) =>
    part.map((ring) => ring.map((point) => point.map((v) => `${v.n}/${v.d}`))),
  );
/** Export projection only. Caller must first normally decode and verify its
 * prepared display payload and matching dataset; this grants no source/routing
 * authority. Operands are those prepared POST-ramp/stair-cut exact carriers.
 * No geographic clipping, uncut fallback, coordinate grid or hole deletion. */
export function projectStrictOverviewFloor(
  data: IndoorDataset,
  prepared: Pick<PreparedFloor, "stairCutAreas">,
  expectedModelSha256: string,
  onProgress?: (id: number) => void,
) {
  if (
    data.source.modelSha256 !== expectedModelSha256 ||
    !/^[a-f0-9]{64}$/.test(expectedModelSha256) ||
    (data.indoorExclusions &&
      data.indoorExclusions.sourceModelSha256 !== expectedModelSha256)
  )
    throw new Error("Overview projection model/exclusion binding mismatch");
  const input = prepared.stairCutAreas.features.filter(
    (f) =>
      f.properties?.nativeFloor === true &&
      f.properties?.nativePhysical === true,
  );
  const before = digest(input),
    features: FeatureCollection<MultiPolygon>["features"] = [],
    proof = [];
  for (const f of input) {
    const id = Number(f.properties?.nativeFloorId),
      levelId = Number(f.properties?.levelId);
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !Number.isSafeInteger(levelId) ||
      f.geometry.type !== "MultiPolygon"
    )
      throw new Error("Invalid prepared physical floor projection identity");
    onProgress?.(id);
    if (!Array.isArray(f.properties?.nativeDisplayExactParts))
      throw new Error(
        "Prepared physical floor lacks its retained exact carrier",
      );
    const source = nativeRenderExactParts(f.properties);
    if (!source)
      throw new Error("Prepared physical floor lacks retained exact carrier");
    const exclusions = (data.indoorExclusions?.areas ?? []).filter(
        (a) => a.levelId === levelId,
      ),
      masks = exclusions.flatMap((a) => a.partsFeet),
      localMasks = nativeRationalIntersectionOperand(source, masks);
    const cut =
      localMasks.length > 0
        ? nativeRationalOverlay("difference", source, localMasks)
        : source;
    if (
      nativeRationalOverlay("difference", cut, source).length > 0 ||
      (localMasks.length > 0 &&
        nativeRationalOverlay("intersection", cut, localMasks).length > 0)
    )
      throw new Error(
        "Exact overview projection escaped source or retained exclusion material",
      );
    const drawing = createNativeContainedDisplay(cut);
    const coordinates = drawing.partsFeet.map((part) =>
      part.map((ring) =>
        [...ring, ring[0]].map((p) => geographicPoint(data, p)),
      ),
    );
    if (coordinates.length > 0)
      features.push({
        type: "Feature",
        properties: { levelId, nativeFloorId: id },
        geometry: { type: "MultiPolygon", coordinates },
      });
    proof.push({
      nativeFloorId: id,
      levelId,
      exclusionIds: exclusions.map((a) => a.id),
      sourceExactSha256: digest(stored(source)),
      cutExactSha256: digest(stored(cut)),
      originalNumericParts: f.geometry.coordinates.length,
      outputNumericParts: coordinates.length,
      sourceRings: source.reduce((n, p) => n + p.length, 0),
      cutRings: cut.reduce((n, p) => n + p.length, 0),
      sourceOutsideEmpty: true,
      exclusionIntersectionEmpty: true,
      containedDisplayCertificate: drawing.certificate,
      retainedExactParts: stored(cut),
      retainedExactResidualParts: stored(drawing.exactResidualParts),
    });
  }
  if (before !== digest(input))
    throw new Error(
      "Prepared physical floors mutated during overview projection",
    );
  return {
    floor: { type: "FeatureCollection" as const, features },
    receipt: {
      version: 1,
      algorithm: STRICT_OVERVIEW_FLOOR_PROJECTION_VERSION,
      sourceModelSha256: expectedModelSha256,
      inputPhysicalFloorCount: input.length,
      outputPhysicalFloorCount: features.length,
      preparedPhysicalFloorsSha256: before,
      preparedPhysicalFloorsUnchanged: true,
      features: proof,
    },
  };
}
