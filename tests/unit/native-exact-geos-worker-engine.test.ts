import assert from "node:assert/strict";
import test from "node:test";
import {
  afterNativeExactGeosOverlay,
  nativeExactGeosOverlay,
  nativeExactGeosOverlayInitialized,
} from "../../app/indoor-project/native-exact-geos-overlay";

test("a wrapped worker handler runs after the checked engine is ready, in message order", async () => {
  const seen: [number, boolean][] = [];
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const handle = afterNativeExactGeosOverlay((n: number) => {
    seen.push([n, nativeExactGeosOverlayInitialized()]);
    // A drawn-material check runs exact overlays synchronously in the handler.
    const square = [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ] as [number, number][][];
    assert.ok(nativeExactGeosOverlay("union", [square], []));
    if (n === 3) done();
  });
  handle(1);
  handle(2);
  handle(3);
  await finished;
  assert.deepEqual(seen, [
    [1, true],
    [2, true],
    [3, true],
  ]);
});
