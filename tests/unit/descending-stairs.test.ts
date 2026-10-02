import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";
import { stairFloorApertures } from "../../app/indoor-project/stair-floor-apertures";
import { stairsAboveDisplayedGround } from "../../app/indoor-project/stair-ground-occlusion";
import { stairPlaceGround } from "../../app/indoor-project/stair-place-ground";
import polygonClipping from "polygon-clipping";
import { geographicPoint } from "../../app/indoor-project/routing";
import { projectConnectorMarkers } from "../../app/indoor-project/connector-markers";

const zip = process.env.INDOOR_PROJECT_ZIP;
test(
  "08-S101 retains descending tread depths and a marker for each separate native flight without changing graph data",
  { skip: !zip },
  () => {
    const d: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const before = JSON.stringify(d);
    const room = d.records.find((r) => r.number === "08-S101")!;
    const treads = projectStairDisplay(
      d,
      [room.levelId],
      room.building,
    ).features.filter((f) => f.properties?.key === room.key);
    const down = treads.filter(
      (f) => f.properties?.stairElementId === 1_949_419,
    );
    assert.equal(down.length, 5);
    assert.ok(down.every((f) => f.properties?.descending));
    assert.ok(
      Math.min(...down.map((f) => Number(f.properties?.topMetres))) < -0.6,
    );
    for (const f of down) {
      assert.ok(
        Number(f.properties?.baseMetres) < Number(f.properties?.topMetres),
      );
      assert.ok(
        Math.abs(
          Number(f.properties?.topMetres) -
            Number(f.properties?.baseMetres) -
            0.05,
        ) < 1e-6,
      );
    }
    assert.ok(
      treads.some(
        (f) => !f.properties?.descending && Number(f.properties?.topMetres) > 3,
      ),
    );
    for (const f of down) {
      assert.ok(
        Math.abs(
          Number(f.properties?.topMetres) -
            Number(f.properties?.displayBaseMetres) -
            1 / 6,
        ) < 1e-6,
      );
    }
    const markers = projectConnectorMarkers(
      d,
      [room.levelId],
      room.building,
    ).features.filter((f) => f.properties?.key === room.key);
    assert.deepEqual(
      markers.map((f) => f.properties?.stairElementId).sort(),
      [1_949_419, 1_982_431],
    );
    assert.notDeepEqual(
      markers[0].geometry.coordinates,
      markers[1].geometry.coordinates,
    );
    assert.equal(JSON.stringify(d), before);
  },
);

test(
  "combined native floors keep a clear door throat through every copy of the physical wall",
  { skip: !zip },
  () => {
    const d: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const before = JSON.stringify(d);
    const shown = projectDisplayGeometry(d, [311, 1_487_816], "all");
    const door = d.doors!.find((door) => door.nativeElementId === 1_948_987)!;
    for (const walls of [shown.walls, shown.exposedWalls]) {
      for (const f of walls.features.filter(
        (f) => f.properties?.kind === "wall",
      ))
        assert.equal(
          pointInPolygon(
            { type: "Point", coordinates: geographicPoint(d, door.pointFeet) },
            f.geometry,
          ),
          false,
        );
    }
    const treads = projectStairDisplay(d, [311, 1_487_816], "all");
    const floors = stairFloorApertures(shown.areas, treads);
    assert.deepEqual(
      floors,
      shown.areas,
      "Steps must not create openings in solid floor",
    );
    const ground = stairPlaceGround(d, floors);
    const visible = stairsAboveDisplayedGround(treads, ground);
    for (const step of visible.features.filter(
      (f) => Number(f.properties?.topMetres) < -0.003,
    )) {
      // A polygon centroid can fall in a hole or outside a concave fragment.
      // Check actual covered material, allowing geographic rounding only.
      for (const f of ground.features.filter((f) => !f.properties?.openDrop)) {
        const parts = polygonClipping.intersection(
          step.geometry.coordinates as [number, number][][],
          f.geometry.coordinates as [number, number][][][],
        );
        const origin = step.geometry.coordinates[0][0];
        const area = parts.reduce(
          (sum, p) =>
            sum +
            p.reduce(
              (s, r, i) =>
                s +
                ((i ? -1 : 1) *
                  Math.abs(
                    r.reduce((a, q, j) => {
                      const b = r[(j + 1) % r.length];
                      return (
                        a +
                        (q[0] - origin[0]) * (b[1] - origin[1]) -
                        (b[0] - origin[0]) * (q[1] - origin[1])
                      );
                    }, 0),
                  )) /
                  2,
              0,
            ),
          0,
        );
        assert.ok(area < 1e-14, `Covered descending tread: ${area}`);
      }
    }
    assert.equal(door.state, "unmatched");
    assert.equal(JSON.stringify(d), before);
  },
);
