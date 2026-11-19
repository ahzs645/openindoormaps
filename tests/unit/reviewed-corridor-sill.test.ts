import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import {
  reviewedCorridorSillSupport,
  corridorSill,
} from "../../app/indoor-project/reviewed-corridor-sill";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import type { SharedGuidePoint } from "../../app/indoor-project/shared-corridor-guides";

const carrier = process.env.UNBC_PRINT_ENTRANCE_DATASET;
test(
  "both native corridor faces admit the original 50 mm sill; nearby office and threshold changes stay blocked",
  { skip: !carrier },
  async () => {
    await initializeNativeExactGeosOverlay();
    const d: IndoorDataset = JSON.parse(readFileSync(carrier!, "utf8"));
    const z = 14.435695538057743,
      y = 484.8917254283297;
    const path: SharedGuidePoint[] = [
      [45.66190358981945, y, z],
      [45.871155412500585, y, z],
      [51.1519953075137, y, z],
      [62.21889862362756, y, z],
      [67.75235028168449, 487.8663975460291, z],
    ];
    const run = (data: IndoorDataset, p = path) =>
      createImmutableRoutingSession(data)(() =>
        reviewedCorridorSillSupport(data, p),
      );
    createImmutableRoutingSession(d)(() => {
      assert.ok(run(d));
      assert.ok(run(d, path.toReversed()));
      assert.ok(Math.abs((corridorSill.topFeet - z) * 304.8 - 50) < 1e-8);
      assert.ok(
        Math.abs((corridorSill.eastX - corridorSill.westX) * 304.8 - 150) <
          1e-8,
      );
      const earlierBend = structuredClone(path);
      earlierBend[3]![0] = 59.45217279459909;
      assert.equal(run(d, earlierBend), false);
      assert.equal(
        run(
          d,
          path.map(([x, y, z]) => [x, y + 3, z]),
        ),
        false,
      );
      assert.equal(
        run(
          d,
          path.map(([x, y, z]) => [x, y, z - 0.02]),
        ),
        false,
      );
    });
    const authority = d.nativeMaterialSections!;
    const changedHeight: IndoorDataset = {
      ...d,
      nativeMaterialSections: {
        ...authority,
        levels: authority.levels.map((r) =>
          r.levelId !== 694 || r.cutElevationFeet !== z + 0.1
            ? r
            : {
                ...r,
                sections: r.sections.map((s) =>
                  s.nativeElementId !== 1513455
                    ? s
                    : { ...s, topElevationFeet: s.topElevationFeet + 0.1 },
                ),
              },
        ),
      },
    };
    assert.equal(run(changedHeight), false);
    const bounds: [number, number][][][] = [
      [
        [
          [59, 484.6],
          [59.7, 484.6],
          [59.7, 485.0],
          [59, 485.0],
        ],
      ],
    ];
    const exclusions = d.indoorExclusions!;
    const masked: IndoorDataset = {
      ...d,
      indoorExclusions: {
        ...exclusions,
        areas: [
          ...exclusions.areas,
          {
            ...exclusions.areas[0]!,
            id: "test-restricted-corridor-footprint",
            label: "Closed",
            reason: "off-limits",
            levelId: 694,
            elevationFeet: z,
            partsFeet: bounds,
          },
        ],
      },
    };
    assert.equal(run(masked), false);
  },
);
