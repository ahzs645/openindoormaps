import test from "node:test";
import assert from "node:assert/strict";
import { createNativeRoutingMaterialQuery } from "../../app/indoor-project/native-routing-material";
import { validateNativeMaterialSectionSupplement, nativeMaterialSectionSupplementHash } from "../../app/indoor-project/native-material-section-supplement";
import { createNativeRoutingMaterialQuery as sourceQuery } from "../../../reviter/lib/reviter/native-routing-material";
import { nativeDerivedFrameHash } from "../../app/indoor-project/native-derived-frame-returns";

type P = [number, number];
const sha = "a".repeat(64);
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function fixture() {
  const levels = [{ levelId: 7, elevationFeet: 0, cutElevationFeet: 4, evidenceSha256: "0".repeat(64), sourceElementIds: [1],
    sections: [{ nativeElementId: 1, categoryId: -2000011, kind: "wall" as const, baseElevationFeet: 0, topElevationFeet: 10, partsFeet: [[rect(0, 0, 10, 0.5)]] }] }];
  const material = { version: 1 as const, sourceModelSha256: sha, geometrySha256: "", levels };
  material.geometrySha256 = nativeDerivedFrameHash([material.version, material.sourceModelSha256, material.levels]);
  const body = { version: 1 as const, method: "production-native-mesh-barrier-cuts-v1" as const, sourceModelSha256: sha, sourceMaterialGeometrySha256: material.geometrySha256,
    levels: [{ levelId: 7, elevationFeet: 0, cutElevationFeet: 4, sections: [{ nativeElementId: 2, categoryId: -2000011, kind: "wall" as const, baseElevationFeet: 0, topElevationFeet: 10, partsFeet: [[rect(10, 0, 10.5, 8)]], provenance: { kind: "production-native-mesh-cutter" as const, reason: "census-omission" as const } }] }] };
  return { source: { modelSha256: sha }, nativeMaterialSections: material, nativeMaterialSectionSupplement: { ...body, geometrySha256: nativeMaterialSectionSupplementHash(body) } };
}
test("runtime and compiler read the derived material supplement identically, appended after original rows", () => {
  const data = fixture();
  const runtime = createNativeRoutingMaterialQuery(data as never)(0, 4), source = sourceQuery(data as never)(0, 4);
  assert.deepEqual(JSON.stringify(runtime.parts), JSON.stringify(source.parts));
  assert.deepEqual(runtime.parts.map((p) => p.nativeElementId), [1, 2]);
  assert.ok(runtime.known.has(2));
  const stale = { ...data, nativeMaterialSectionSupplement: { ...data.nativeMaterialSectionSupplement, sourceMaterialGeometrySha256: "c".repeat(64) } };
  assert.throws(() => createNativeRoutingMaterialQuery(stale as never), /stale|bound/);
  assert.throws(() => validateNativeMaterialSectionSupplement(data.nativeMaterialSectionSupplement, undefined, sha), /stale|bound/);
});
