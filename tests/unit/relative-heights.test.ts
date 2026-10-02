import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  floorHeightDatum,
  relativeHeightGeometry,
  surfaceElevationFeet,
} from "../../app/indoor-project/relative-heights";
import { createFloorPresentationCache } from "../../app/indoor-project/floor-presentation";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import { findProjectRoute } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_RAMP_ZIP;
const data: IndoorDataset | undefined = zip
  ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
  : undefined;
const levels = [311, 1_487_816];
const options = {
  showPillars: false,
  showPassThroughPlaces: true,
  showVestibuleDoors: true,
  showStructures: true,
};

test(
  "native ramp endpoints meet their floor surfaces and retain a one metre rise",
  { skip: !data },
  () => {
    const d = data!,
      before = JSON.stringify(d);
    const presentation = createFloorPresentationCache()(d, levels, "all", {
      ...options,
      relativeHeights: true,
    });
    const ramp = d.edges.find((e) => e.id === "ramp:1622190")!;
    const datum = floorHeightDatum(d, levels),
      scale = d.alignment.verticalMetresPerFoot;
    for (const id of [ramp.from, ramp.to]) {
      const node = d.nodes.find((n) => n.id === id)!;
      const room = d.records.find((r) => r.key === node.roomKey)!;
      const floor = presentation.display.areas.features.find(
        (f) => f.properties?.key === room.key,
      )!;
      assert(floor, `Missing floor at ${id}`);
      assert(
        Math.abs(
          Number(floor.properties?.floorTop) -
            ((node.pointFeet[2] - datum) * scale + 0.025),
        ) < 1e-7,
      );
    }
    assert(
      Math.abs(
        (ramp.pointsFeet.at(-1)![2] - ramp.pointsFeet[0][2]) * scale - 1,
      ) < 1e-7,
    );
    for (const room of presentation.display.roomBlocks.features) {
      const r = d.records.find((r) => r.key === room.properties?.key)!;
      assert(
        Math.abs(
          Number(room.properties?.base) - (r.elevationFeet - datum) * scale,
        ) < 1e-7,
      );
    }
    const route = findProjectRoute(
      d,
      "rm-311-86e02816d8fe",
      "landing:local:07:311:08:1487816:1620957:1",
      "accessible",
    )!;
    assert.deepEqual(
      route.edges.map((e) => e.kind),
      ["walk", "ramp", "walk"],
    );
    assert.equal(JSON.stringify(d), before);
  },
);

test(
  "floor presentation cache isolates flat/relative modes and building filters preserve the datum",
  { skip: !data },
  () => {
    const cache = createFloorPresentationCache(),
      d = data!;
    const flat = cache(d, levels, "all", options);
    const relative = cache(d, levels, "all", {
      ...options,
      relativeHeights: true,
    });
    assert.equal(cache(d, levels, "all", options), flat);
    assert.notEqual(relative, flat);
    assert(
      flat.display.areas.features.every(
        (f) => f.properties?.base === undefined,
      ),
    );
    const building = cache(d, levels, "08", {
      ...options,
      relativeHeights: true,
    });
    for (const f of building.display.areas.features) {
      assert.equal(
        f.properties?.base,
        relative.display.areas.features.find(
          (r) => r.properties?.key === f.properties?.key,
        )?.properties?.base,
      );
    }
    assert.equal(
      floorHeightDatum(d, levels),
      floorHeightDatum(d, levels.toReversed()),
    );
  },
);

test(
  "native stairs, door thresholds and review pins share the floor's heights",
  { skip: !data },
  () => {
    const d = data!,
      datum = floorHeightDatum(d, levels),
      scale = d.alignment.verticalMetresPerFoot;
    const flat = projectStairDisplay(d, levels, "all"),
      relative = projectStairDisplay(d, levels, "all", true);
    if (d.stairDisplay?.sourceFlights) {
      for (const id of new Set(
        flat.features.map((f) => f.properties?.stairElementId),
      ))
        assert(
          relative.features.some((f) => f.properties?.stairElementId === id),
        );
    } else assert.equal(relative.features.length, flat.features.length);
    for (const f of relative.features) {
      assert(
        Math.abs(
          Number(f.properties?.topMetres) -
            (Number(f.properties?.elevationFeet) - datum) * scale,
        ) < 1e-7,
      );
      assert(
        Number(f.properties?.displayBaseMetres) <
          Number(f.properties?.topMetres),
      );
    }
    const p = createFloorPresentationCache()(d, levels, "all", options);
    const doors = relativeHeightGeometry(
      d,
      levels,
      p.display.doorFootprints,
      "door",
    );
    const high = doors.features.find(
      (f) =>
        d.doors!.find((door) => door.id === f.properties?.id)?.levelId ===
        1_487_816,
    )!;
    assert(high);
    assert(Number(high.properties?.base) >= 1);
    assert(
      Math.abs(
        Number(high.properties?.height) - Number(high.properties?.base) - 0.025,
      ) < 1e-7,
    );
    const ramp = d.rampDisplay!.ramps[0];
    assert(
      Math.abs(
        surfaceElevationFeet(d, 311, ramp.anchorPointFeet) -
          ramp.anchorPointFeet[2],
      ) < 1e-6,
    );
  },
);
