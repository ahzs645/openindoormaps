import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeProvisionalCornerSealIndex as index,
  resetDrawingBackedRowMemo,
} from "../../app/indoor-project/native-provisional-corner-seals";
import { createNativeProvisionalCornerSealIndex as reference } from "../../../reviter/lib/reviter/native-provisional-corner-seals";
import {
  drawingBackedSealFixture,
  rect,
} from "../fixtures/drawing-backed-seal";
import { nativeDerivedFrameHash } from "../../app/indoor-project/native-derived-frame-returns";

const door = {
  id: "same-door",
  nativeElementId: 9,
  levelId: 1,
  footprintFeet: rect(1.01, -0.55, 1.09, -0.45)[0][0],
};
const edge = (kind: "door" | "walk", enabled: boolean) => ({
  id: door.id,
  kind,
  enabled,
  pointsFeet: [[1.05, -0.5, 0]] as [number, number, number][],
});

test("door lookup keeps the first matching edge and distinguishes disabled physical doors", () => {
  for (const edges of [
    [edge("walk", true), edge("door", true)],
    [edge("door", false), edge("door", true)],
    [edge("door", true), edge("door", false)],
  ]) {
    resetDrawingBackedRowMemo();
    const f = drawingBackedSealFixture();
    f.data.doors!.push(door as never);
    f.data.edges.push(...(edges as never[]));
    f.rehash();
    if (edges[0].kind === "door" && edges[0].enabled) {
      assert.throws(() => index(f.data), /preserved physical doorway/);
      assert.throws(
        () => reference(f.data as never),
        /preserved physical doorway/,
      );
    } else {
      assert.deepEqual(
        index(f.data).partsAt(0.1),
        reference(f.data as never).partsAt(0.1),
      );
    }
  }
});

test("all sections of one native owner remain available, including a later duplicate's sole contact", () => {
  resetDrawingBackedRowMemo();
  const f = drawingBackedSealFixture(),
    sections = f.data.nativeMaterialSections!.levels[0].sections,
    original = structuredClone(sections[0]);
  // The first row with this owner is distant; only its later section contacts
  // the seal. A first/last-only owner index would change the physical check.
  sections[0].partsFeet = rect(20, 20, 21, 21);
  sections.push(original);
  const rehash = () => {
    const material = f.data.nativeMaterialSections!;
    material.geometrySha256 = nativeDerivedFrameHash([
      material.version,
      material.sourceModelSha256,
      material.levels,
    ]);
    f.data.nativeProvisionalCornerSeals!.sourceMaterialGeometrySha256 =
      material.geometrySha256;
    f.rehash();
  };
  rehash();
  const before = JSON.stringify(f.data);
  assert.deepEqual(
    index(f.data).partsAt(0.1),
    reference(f.data as never).partsAt(0.1),
  );
  assert.equal(JSON.stringify(f.data), before);
  // Removing that contacting duplicate must restore the original refusal.
  sections.pop();
  rehash();
  assert.throws(() => index(f.data), /no positive contact/);
  assert.throws(() => reference(f.data as never), /no positive contact/);
});

test("same-ID source floor entries are retained so duplicate bindings still reject", () => {
  resetDrawingBackedRowMemo();
  const f = drawingBackedSealFixture();
  f.rehash();
  assert(index(f.data).partsAt(0.1).length > 0);
  f.data.walkingSupport!.floors.push(
    structuredClone(f.data.walkingSupport!.floors[0]),
  );
  const before = JSON.stringify(f.data);
  assert.throws(() => index(f.data), /unsupported native floor/);
  assert.throws(() => reference(f.data as never), /unsupported native floor/);
  assert.equal(JSON.stringify(f.data), before);
});
