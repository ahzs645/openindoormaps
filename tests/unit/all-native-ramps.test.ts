import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import {
  readIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { physicalWallCopies } from "../../app/indoor-project/physical-walls";
import { rampFloorApertures } from "../../app/indoor-project/ramp-floor-apertures";
import { createFloorPresentationCache } from "../../app/indoor-project/floor-presentation";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";
import {
  geographicPoint,
  validateIndoorDataset,
  findProjectRoute,
} from "../../app/indoor-project/routing";
const input = process.env.INDOOR_ALL_RAMPS_ZIP;
const project = input
  ? await readIndoorProject(new Uint8Array(readFileSync(input)))
  : undefined;
const levels = [1_450_417, 311, 1_487_816];
const ids = [
  1_586_431, 1_587_605, 1_622_190, 1_643_796, 2_081_718, 2_081_980, 2_082_004,
  2_082_028, 2_082_052, 2_082_076, 2_374_473, 2_375_155,
];

test(
  "all twelve physical ramps have native solids, exact one metre rises and no duplicate helper geometry",
  { skip: !project },
  () => {
    const d = project!.dataset,
      ramps = d.rampDisplay!.ramps;
    assert.deepEqual(
      ramps.map((r) => r.nativeElementId).sort((a, b) => a - b),
      ids,
    );
    for (const r of ramps) {
      const z = r.trianglesFeet.flat().map((p) => p[2]);
      assert(Math.abs((Math.max(...z) - Math.min(...z)) * 0.3048 - 1) < 0.005);
      assert(r.bodyTrianglesFeet!.length > r.trianglesFeet.length);
      assert(r.levelIds.length === 2);
      assert(r.buildings!.length > 0);
      if (r.nativeElementId !== 1_622_190) {
        assert.equal(r.displayOnly, true);
        assert.equal(r.edgeId, undefined);
      }
    }
    const bad = structuredClone(d);
    bad.rampDisplay!.ramps.push(bad.rampDisplay!.ramps[0]);
    assert.throws(() => validateIndoorDataset(bad), /source connection/);
  },
);
test(
  "new ramps do not silently approve wheelchair entrances or change existing routes",
  { skip: !project },
  async () => {
    const d = project!.dataset;
    const before = await readIndoorProject(
      new Uint8Array(
        readFileSync(
          "/Users/ahmadjalil/Downloads/UNBC.indoor.before-all-ramps.reviter.zip",
        ),
      ),
    );
    for (const f of [
      "records",
      "nodes",
      "edges",
      "walls",
      "doors",
      "floors",
      "connectors",
    ] as const)
      assert.deepEqual(d[f], before.dataset[f]);
    assert.deepEqual(project!.rooms, before.rooms);
    assert.equal(project!.rooms.reviewPins!.pins.length, 2);
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
  },
);
test(
  "relative presentation draws each native wall footprint once, preserving distinct elements",
  { skip: !project },
  () => {
    const d = project!.dataset,
      before = JSON.stringify(d.walls),
      selected = physicalWallCopies(d, levels);
    const keys = new Set<string>();
    for (const w of selected) {
      const k = `${w.nativeElementId}:${JSON.stringify(w.ringsFeet)}`;
      assert(!keys.has(k));
      keys.add(k);
    }
    assert(
      selected.size <
        d.walls.filter((w) => levels.includes(w.levelId)).length / 2,
    );
    assert.equal(JSON.stringify(d.walls), before);
    const w = d.walls.find(
      (w) =>
        w.levelId === 311 &&
        d.wallDisplay!.elements.some(
          (n) => n.nativeElementId === w.nativeElementId && n.levelId === 311,
        ),
    )!;
    const synthetic = {
      ...d,
      walls: [
        { ...w, levelId: 1_450_417 },
        w,
        { ...w, levelId: 1_487_816 },
        { ...w, nativeElementId: 999_999_999, levelId: 1_487_816 },
      ],
      wallDisplay: {
        ...d.wallDisplay!,
        elements: [
          ...d.wallDisplay!.elements,
          {
            nativeElementId: 999_999_999,
            levelId: 1_487_816,
            baseElevationFeet: 3.28,
            topElevationFeet: 8,
          },
        ],
      },
    };
    const walls = [...physicalWallCopies(synthetic, levels)];
    assert.equal(walls.length, 2);
    assert(walls.includes(w));
    assert(walls.some((x) => x.nativeElementId === 999_999_999));
  },
);
test(
  "flat floors cannot cap any native ramp; an actual floor above the ramp remains intact",
  { skip: !project },
  () => {
    const d = project!.dataset;
    for (const r of d.rampDisplay!.ramps) {
      const t = r.trianglesFeet.find(
        (t) =>
          Math.max(...t.map((p) => p[2])) - Math.min(...t.map((p) => p[2])) >
          0.1,
      )!;
      const center = [0, 0];
      for (const p of t) {
        center[0] += p[0] / 3;
        center[1] += p[1] / 3;
      }
      const p = {
        type: "Point" as const,
        coordinates: geographicPoint(d, center),
      };
      const coordinates = [[[...t, t[0]].map((p) => geographicPoint(d, p))]];
      const low =
        (Math.min(...r.trianglesFeet.flat().map((p) => p[2])) +
          3.280_839_895_013_123_5) *
        0.3048;
      const f = {
        type: "Feature" as const,
        properties: { base: low },
        geometry: { type: "MultiPolygon" as const, coordinates },
      };
      const cut = rampFloorApertures(d, levels, {
        type: "FeatureCollection",
        features: [f, { ...f, properties: { base: 20 } }],
      });
      assert(
        cut.features[0].geometry.coordinates.length === 0 ||
          !pointInPolygon(p, cut.features[0].geometry),
      );
      assert(pointInPolygon(p, cut.features[1].geometry));
    }
  },
);
test(
  "wall duplication is removed from combined floors and retained in the original flat presentation",
  { skip: !project },
  () => {
    const d = project!.dataset,
      build = createFloorPresentationCache(),
      options = {
        showPillars: false,
        showPassThroughPlaces: true,
        showVestibuleDoors: true,
        showStructures: true,
      };
    const flat = build(d, levels, "all", options),
      relative = build(d, levels, "all", { ...options, relativeHeights: true });
    const id = 978_605,
      w = d.walls.find((w) => w.nativeElementId === id)!,
      center = [0, 0];
    for (const p of w.ringsFeet[0]) {
      center[0] += p[0] / w.ringsFeet[0].length;
      center[1] += p[1] / w.ringsFeet[0].length;
    }
    const p = {
      type: "Point" as const,
      coordinates: geographicPoint(d, center),
    };
    const contains = (f: (typeof flat.display.walls.features)[number]) =>
      f.geometry.coordinates.length > 0 && pointInPolygon(p, f.geometry);
    assert.equal(
      flat.display.walls.features.filter((f) => contains(f)).length,
      3,
    );
    assert.equal(
      relative.display.walls.features.filter((f) => contains(f)).length,
      1,
    );
  },
);
test(
  "an upper sublevel room owns its wall material without a second lower wall band",
  { skip: !project },
  () => {
    const original = project!.dataset;
    const wall = original.walls.find(
      (w) => w.nativeElementId === 978_605 && w.levelId === 311,
    )!;
    const roof = original.presentation!.rooms.find((room) =>
      original.records.some(
        (r) =>
          r.key === room.roomKey && r.levelId === 1_487_816 && !r.circulation,
      ),
    )!;
    const room = original.records.find((r) => r.key === roof.roomKey)!;
    const d = {
      ...original,
      records: [{ ...room, walkable: true, circulation: false }],
      walls: [wall],
      doors: [],
      presentation: {
        ...original.presentation!,
        rooms: [{ ...roof, blockPartsFeet: [wall.ringsFeet] }],
      },
    };
    const center = [0, 0];
    for (const v of wall.ringsFeet[0]) {
      center[0] += v[0] / wall.ringsFeet[0].length;
      center[1] += v[1] / wall.ringsFeet[0].length;
    }
    const p = {
      type: "Point" as const,
      coordinates: geographicPoint(d, center),
    };
    const flat = projectDisplayGeometry(d, levels, "all");
    const relative = projectDisplayGeometry(
      d,
      levels,
      "all",
      "",
      false,
      true,
      false,
      false,
      new Set([wall]),
    );
    assert(
      flat.exposedWalls.features.some(
        (f) =>
          f.geometry.coordinates.length > 0 && pointInPolygon(p, f.geometry),
      ),
    );
    assert(
      !relative.exposedWalls.features.some(
        (f) =>
          f.geometry.coordinates.length > 0 && pointInPolygon(p, f.geometry),
      ),
    );
  },
);
test(
  "lightweight viewer preserves all ramps and physical wall ownership",
  { skip: !project },
  async () => {
    const restored = await readIndoorProject(
      await exportCampusViewer(project!),
    );
    assert.deepEqual(
      restored.dataset.rampDisplay,
      project!.dataset.rampDisplay,
    );
    assert.deepEqual(
      restored.dataset.wallDisplay,
      project!.dataset.wallDisplay,
    );
  },
);
