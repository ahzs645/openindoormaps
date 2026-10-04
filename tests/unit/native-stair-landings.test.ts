import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import polygonClipping from "polygon-clipping";
import {
  nativeStairRunTreads,
  nativeStairRunEndpoints,
} from "../../../reviter/lib/reviter/indoor-stair-run-surfaces.ts";
import { nativeStairLandings } from "../../../reviter/lib/reviter/indoor-stair-landings.ts";
import { prepareIndoorStairDisplay } from "../../../reviter/lib/reviter/indoor-stair-display.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import { visibleTreadPolygons } from "../../app/indoor-project/stair-occlusion";
const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
  );
const native = (): ConvertResult => read("unbc-native-stair-landings.json");
const dataset = (): IndoorDataset => read("unbc-pinned-native-stairs.json");
const area = (ring: number[][]) =>
  Math.abs(
    ring.reduce((n, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return n + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
test("all 22 native turning landings survive omitted assembly lists through persisted ownership", () => {
  const model = native(),
    before = JSON.stringify(model),
    inventory = nativeStairLandings(model);
  assert.equal(inventory.size, 22);
  for (const [stair, id, z] of [
    [2_474_568, 2_474_574, 10.717_410_323_709_537],
    [1_500_191, 1_500_197, 20.997_375_328_083_99],
  ]) {
    assert.ok(
      !model
        .nativeStairAssemblies!.find((a) => a.stairElementId === stair)!
        .runAndLandingIds.includes(id),
    );
    const landing = inventory.get(stair)![0];
    assert.equal(landing.nativeElementId, id);
    assert.equal(landing.elevationFeet, z);
    assert.ok(Math.abs(area(landing.ringsFeet[0]) - 52.82) < 0.01);
    assert.ok(
      Math.abs(landing.thicknessFeet - 0.164_041_994_750_656_17) < 1e-8,
    );
  }
  assert.equal(JSON.stringify(model), before);
  assert.equal(
    nativeStairLandings({ ...model, elementOwnership: undefined }).size,
    0,
  );
  model.meshes[0].source = "display-proxy";
  assert.equal(nativeStairLandings(model).size, 0);
});
test("preparation and floor views keep real landing outlines, thickness and both flights without modifying routes", () => {
  const data = dataset(),
    before = JSON.stringify(data);
  const model = native();
  const display = prepareIndoorStairDisplay(model, data);
  for (const id of [2_474_568, 1_500_191])
    assert.equal(
      display.sourceFlights!.find((f) => f.stairElementId === id)!.landings!
        .length,
      1,
    );
  assert.equal(JSON.stringify(data), before);
  // Use the reviewed bindings/occluders already saved in the source package.
  const inventory = nativeStairLandings(model);
  for (const f of [
    ...data.stairDisplay!.sourceFlights!,
    ...data.stairDisplay!.flights,
  ]) {
    f.landings = inventory.get(f.stairElementId);
    f.treads = [...new Set(f.treads.map((t) => t.runElementId))].flatMap(
      (id) =>
        nativeStairRunTreads(model).get(id) ??
        f.treads.filter((t) => t.runElementId === id),
    );
    f.runs = nativeStairRunEndpoints(model, f.treads);
  }
  const unchanged = JSON.stringify(data);
  for (const relative of [false, true]) {
    const features = projectStairDisplay(data, [694], "all", relative).features;
    for (const id of [2_474_568, 1_500_191]) {
      const landings = features.filter(
        (f) =>
          f.properties!.stairElementId === id &&
          f.properties!.surfaceKind === "landing",
      );
      assert.ok(landings.length > 0);
      assert.ok(
        features.some(
          (f) =>
            f.properties!.stairElementId === id &&
            f.properties!.surfaceKind === "tread",
        ),
      );
      for (const f of landings) {
        assert.ok(
          Math.abs(f.properties!.topMetres - f.properties!.baseMetres - 0.05) <
            1e-8,
        );
        assert.equal(f.properties!.displayBaseMetres, f.properties!.baseMetres);
        assert.deepEqual(f.properties!.endpointRisers, []);
        assert.equal(f.properties!.descending, id === 2_474_568);
      }
    }
  }
  assert.equal(JSON.stringify(data), unchanged);
});
test("a platform hole stays open and a solid upper floor hides lower platforms", () => {
  const outer: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    hole: [number, number][] = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ];
  const platform = {
    runElementId: 1,
    elevationFeet: 5,
    ringFeet: outer,
    ringsFeet: [outer, hole],
  };
  assert.deepEqual(
    polygonClipping.xor(visibleTreadPolygons({}, platform), [outer, hole]),
    [],
  );
  assert.deepEqual(
    visibleTreadPolygons(
      {
        floorOccluders: [
          { nativeElementId: 2, elevationFeet: 10, ringsFeet: [outer] },
        ],
      },
      platform,
    ),
    [],
  );
});

test("return flights meet their platform and floor at native elevations instead of a one-riser sketch offset", () => {
  const model = native(),
    treads = nativeStairRunTreads(model),
    data = dataset();
  for (const [id, z, landing] of [
    [2_474_572, 11.337_124, 10.717_410_323_709_537],
    [1_500_195, 21.544_182, 20.997_375_328_083_99],
  ]) {
    const steps = treads.get(id)!;
    assert.equal(steps.length, 5);
    assert.ok(Math.abs(steps[0].elevationFeet - z) < 0.0001);
    assert.ok(steps[0].elevationFeet - landing < 0.63);
    const source = data.stairDisplay!.sourceFlights!.find((f) =>
      f.treads.some((t) => t.runElementId === id),
    )!;
    source.treads = source.treads.map((t) =>
      t.runElementId === id
        ? steps[source.treads.filter((s) => s.runElementId === id).indexOf(t)]
        : t,
    );
    source.runs = nativeStairRunEndpoints(model, source.treads);
    const features = projectStairDisplay(
      data,
      [694],
      "all",
      true,
    ).features.filter((f) => f.properties!.runElementId === id);
    const first = features.find(
      (f) =>
        Math.abs(f.properties!.elevationFeet - steps[0].elevationFeet) < 0.0001,
    )!;
    assert.ok(
      first.properties!.displayBaseMetres <=
        (landing - 14.435_695_538_057_743) *
          data.alignment.verticalMetresPerFoot +
          0.0001,
    );
    assert.ok(
      features.some((f) => f.properties!.endpointRisers.length === 1),
      "Terminal riser must reach the native upper floor",
    );
  }
  const partial = structuredClone(model);
  const mesh = partial.meshes[0];
  mesh.elementIds = Uint32Array.from(mesh.elementIds!, (id, i) => {
    const vertex = mesh.indices[i * 3];
    const z = mesh.positions[vertex * 3 + 2];
    return id === 2_474_572 && Math.abs(z - 11.3371) < 0.0001 ? 999 : id;
  });
  assert.ok(!nativeStairRunTreads(partial).has(2_474_572));
});
