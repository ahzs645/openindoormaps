import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  calculateRoute,
  createWorkerRouteCalculator,
} from "../../app/indoor-project/route-calculation";

for (const state of ["boundary", "door"] as const)
  test(`pending ${state} review skips warmup, reachability and directions`, () => {
    const data = (
      state === "boundary"
        ? {
            boundaryPatchState: {
              patchIds: ["checked-source-patch"],
              regenerated: false,
            },
          }
        : {
            doorAperturePatchState: {
              sourceGeometryKey: "pending",
              regenerated: false,
            },
          }
    ) as IndoorDataset;
    // The absence of graph/geometry fields proves these paths never inspect it.
    const run = createWorkerRouteCalculator(data);
    for (const mode of ["public", "accessible"] as const) {
      for (const [a, b] of [
        ["", ""],
        ["start", ""],
        ["start", "end"],
      ]) {
        const result = run(a, b, mode);
        assert.equal(result.route, null);
        assert.equal(result.reachable?.size, 0);
        assert.equal(result.diagnostic?.kind, "blocked");
        assert.match(result.diagnostic!.message, /Regenerate/);
      }
      assert.equal(calculateRoute(data, "start", "end", mode).route, null);
    }
  });
