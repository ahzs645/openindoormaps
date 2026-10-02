import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import { createFloorPresentationCache } from "../../app/indoor-project/floor-presentation";
import { projectConnectorMarkers } from "../../app/indoor-project/connector-markers";
import {
  findProjectRoute,
  validateIndoorDataset,
  geographicPoint,
} from "../../app/indoor-project/routing";
import pointInPolygon from "@turf/boolean-point-in-polygon";
const zip = process.env.INDOOR_PLATFORM_ZIP;
const project = zip
  ? await readIndoorProject(new Uint8Array(readFileSync(zip)))
  : undefined;
const levels = [1_450_417, 311, 1_487_816];

test(
  "ramp has its native underside and nearby supporting walls, not just a painted surface",
  { skip: !project },
  () => {
    const d = project!.dataset,
      ramp = d.rampDisplay!.ramps[0];
    assert(ramp.bodyTrianglesFeet!.length > ramp.trianglesFeet.length);
    assert(Math.min(...ramp.bodyTrianglesFeet!.flat().map((p) => p[2])) < -0.4);
    assert.equal(ramp.platforms!.length, 6);
    for (const p of ramp.platforms!) {
      assert(d.walls.some((w) => w.nativeElementId === p.nativeElementId));
      assert(p.trianglesFeet.length > 0);
    }
    const invalid = structuredClone(d);
    invalid.rampDisplay!.ramps[0].bodyTrianglesFeet = [
      [
        [0, 0, Number.NaN],
        [1, 0, 0],
        [0, 1, 0],
      ],
    ];
    assert.throws(() => validateIndoorDataset(invalid), /platform geometry/);
  },
);

test(
  "simplified curved staircase retains all 25 native curved tread pieces at five heights with one connection icon",
  { skip: !project },
  () => {
    const d = project!.dataset,
      before = JSON.stringify(d);
    const treads = projectStairDisplay(d, levels, "all", true).features.filter(
      (f) => f.properties?.stairElementId === 1_620_957,
    );
    assert.equal(treads.length, 25);
    assert.equal(
      new Set(treads.map((t) => Number(t.properties?.elevationFeet).toFixed(5)))
        .size,
      5,
    );
    assert(
      treads.every(
        (t) => Number(t.properties?.height) > Number(t.properties?.displayBase),
      ),
    );
    const markers = projectConnectorMarkers(d, levels, "all").features.filter(
      (f) =>
        f.properties?.nativeElementId === 1_620_957 ||
        f.properties?.stairElementId === 1_620_957,
    );
    assert.equal(markers.length, 1);
    assert.equal(
      markers[0].properties?.id,
      "local:local:07:311:08:1487816:1620957",
    );
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
  "native platform replaces every flattened wall copy in relative 3D",
  { skip: !project },
  () => {
    const d = project!.dataset,
      build = createFloorPresentationCache(),
      settings = {
        showPillars: false,
        showPassThroughPlaces: true,
        showVestibuleDoors: true,
        showStructures: true,
      };
    const flat = build(d, levels, "all", settings),
      relative = build(d, levels, "all", {
        ...settings,
        relativeHeights: true,
      });
    let checked = 0;
    for (const support of d.rampDisplay!.ramps[0].platforms!) {
      const w = d.walls.find(
        (w) => w.nativeElementId === support.nativeElementId,
      )!;
      const point = [0, 0];
      for (const q of w.ringsFeet[0]) {
        point[0] += q[0] / w.ringsFeet[0].length;
        point[1] += q[1] / w.ringsFeet[0].length;
      }
      const p = {
        type: "Point" as const,
        coordinates: geographicPoint(d, point),
      };
      if (
        !flat.display.exposedWalls.features.some(
          (f) =>
            f.geometry.coordinates.length > 0 && pointInPolygon(p, f.geometry),
        )
      )
        continue;
      assert(
        !relative.display.exposedWalls.features.some(
          (f) =>
            f.geometry.coordinates.length > 0 && pointInPolygon(p, f.geometry),
        ),
      );
      checked++;
    }
    assert(checked >= 3);
  },
);

test(
  "editable master and lightweight viewer preserve platform faces and simplified stairs",
  { skip: !project },
  async () => {
    for (const bytes of [
      await exportIndoorProject(project!),
      await exportCampusViewer(project!),
    ]) {
      const restored = await readIndoorProject(bytes);
      assert.deepEqual(
        restored.dataset.rampDisplay,
        project!.dataset.rampDisplay,
      );
      assert.deepEqual(
        restored.dataset.stairDisplay,
        project!.dataset.stairDisplay,
      );
    }
  },
);
