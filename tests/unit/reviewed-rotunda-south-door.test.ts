import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import {
  rotundaSouthDoor,
  rotundaSouthSillSupported,
} from "../../app/indoor-project/reviewed-rotunda-south-door";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import type { SharedGuidePoint } from "../../app/indoor-project/shared-corridor-guides";

const source = process.env.UNBC_ROTUNDA_DATASET;
test(
  "the public rotunda door accepts its surveyed sill and keeps the enclosed office and jambs closed",
  { skip: !source },
  async () => {
    const data: IndoorDataset = JSON.parse(readFileSync(source!, "utf8"));
    await initializeNativeExactGeosOverlay();
    createImmutableRoutingSession(data)(() => {
      const spec = rotundaSouthDoor(data);
      const [north, gate, south] = spec.paths;
      const points = [north[0]!, gate[0]!, gate.at(-1)!, south.at(-1)!];
      assert.ok(spec.supported());
      assert.ok(rotundaSouthSillSupported(data, points.toReversed()));
      assert.ok(Math.abs(spec.reviewedSillHeightFeet! * 304.8 - 50) < 1e-9);
      assert.equal(gate[1]![0], gate[2]![0]);
      assert.equal(gate[1]![1], gate[2]![1]);
      assert.equal(gate[4]![2], gate[1]![2]);
      const intoOffice: SharedGuidePoint = [-75, 301.5, points[0]![2]];
      assert.equal(
        rotundaSouthSillSupported(data, [
          ...points.slice(0, 3),
          intoOffice,
          points[3]!,
        ]),
        false,
      );
      assert.equal(
        rotundaSouthSillSupported(
          data,
          points.map(([x, y, z]) => [x + 2, y, z]),
        ),
        false,
      );
      const changed = {
        ...data,
        doors: data.doors!.map((d) =>
          d.nativeElementId === 2093121
            ? { ...d, hostWallNativeElementId: undefined }
            : d,
        ),
      };
      assert.equal(rotundaSouthSillSupported(changed, points), false);
    });
  },
);
