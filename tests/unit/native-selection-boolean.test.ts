import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import pc from "polygon-clipping";
import { nativeSelectionBoolean } from "../../app/indoor-project/native-selection-boolean";
import { exactNativeSelectionOverlay } from "../../app/indoor-project/native-selection-exact-overlay";
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../fixtures/native-current-contact/native694-selection-difference.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const area = (parts: [number, number][][][]) =>
  parts.reduce(
    (total, rings) =>
      total +
      rings.reduce((sum, ring, hole) => {
        const [ox, oy] = ring[0];
        return (
          sum +
          ((hole ? -1 : 1) *
            Math.abs(
              ring.reduce((a, p, i) => {
                const q = ring[(i + 1) % ring.length];
                return (
                  a + (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy)
                );
              }, 0),
            )) /
            2
        );
      }, 0),
    0,
  );
test("actual native694 failed global sweep retries without losing physical holes or components", () => {
  const before = JSON.stringify(fixture);
  assert.throws(
    () => pc.difference(fixture.subject, ...fixture.masks),
    /SweepLine/,
  );
  const after = nativeSelectionBoolean(
    "difference",
    fixture.subject,
    ...fixture.masks,
  );
  assert.ok(
    Math.abs(area(after) - fixture.independentExpected.areaSquareFeet) < 1e-7,
  );
  assert.equal(after.length, fixture.independentExpected.componentCount);
  assert.equal(
    after.reduce((n, r) => n + r.length - 1, 0),
    fixture.independentExpected.holeCount,
  );
  assert.equal(JSON.stringify(fixture), before);
});
test("independent failed-sweep replay retains a distinct sub-nanometre gap and original hole", () => {
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
  ): [number, number][] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const gap = 1e-10,
    origin = 1000;
  const subject = [
    [rect(origin, origin, 10, 10), rect(origin + 1, origin + 1, 1, 1)],
  ];
  const masks = [
    [[rect(origin, origin + 4, 5, 1)]],
    [[rect(origin + 5 + gap, origin + 4, 5 - gap, 1)]],
  ];
  const before = JSON.stringify({ subject, masks });
  const output = exactNativeSelectionOverlay("difference", subject, masks);
  assert.equal(
    output.length,
    1,
    "the two halves remain connected through their real narrow gap",
  );
  assert.equal(output[0].length, 2, "the original inner opening remains");
  const gapFace = exactNativeSelectionOverlay("intersection", output, [
    [[rect(origin + 5, origin + 4, gap, 1)]],
  ]);
  assert.ok(area(gapFace) > 0, "the distinct gap cannot be normalized away");
  assert.equal(JSON.stringify({ subject, masks }), before);
  const touching = exactNativeSelectionOverlay(
    "intersection",
    [[rect(0, 0, 1, 1)]],
    [[[rect(1, 0, 1, 1)]]],
  );
  assert.deepEqual(
    touching,
    [],
    "line-only contact cannot manufacture a floor face",
  );
});
