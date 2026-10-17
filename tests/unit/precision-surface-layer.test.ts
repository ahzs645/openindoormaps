import assert from "node:assert/strict";
import test from "node:test";
import maplibregl from "maplibre-gl";
import * as THREE from "three";
import type {
  FeatureCollection,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";
import { precisionSurfaceUnionGeometry } from "../../app/indoor-project/precision-surface-union";
import {
  precisionFloorDepthPasses,
  precisionSurfaceColor,
  precisionSurfaceLayer,
  precisionSurfaceMesh,
} from "../../app/indoor-project/precision-surface-layer";

const { MercatorCoordinate } = maplibregl;
const origin: [number, number] = [-122, 53];
const anchor = MercatorCoordinate.fromLngLat(origin);
const unit = anchor.meterInMercatorCoordinateUnits();
const point = (x: number, y: number): [number, number] => {
  const geographic = new MercatorCoordinate(
    anchor.x + x * unit,
    anchor.y - y * unit,
  ).toLngLat();
  return [geographic.lng, geographic.lat];
};
const rectangle = (x: number, y: number, width: number, height: number) => [
  point(x, y),
  point(x + width, y),
  point(x + width, y + height),
  point(x, y + height),
  point(x, y),
];
const defaultProperties = {
  key: "room",
  base: 2.5,
  floorTop: 2.525,
  height: 4,
  color: "#2468ac",
};
const source = (
  properties: Record<string, unknown> = defaultProperties,
): FeatureCollection<Polygon | MultiPolygon> => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties,
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [rectangle(0, 0, 10, 10), rectangle(2, 2, 4, 4).reverse()],
          [rectangle(20, 0, 3, 3)],
        ],
      },
    },
  ],
});

test("precision surface caps preserve the original hole and disconnected footprint without filling between parts", () => {
  const input = source();
  const before = JSON.stringify(input);
  const mesh = precisionSurfaceMesh(input, origin, {
    kind: "floor",
    relativeHeights: true,
  });
  assert.equal(mesh.vertices % 3, 0);
  let area = 0;
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const p = mesh.positions;
    area +=
      Math.abs(
        (p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) -
          (p[i + 6] - p[i]) * (p[i + 4] - p[i + 1]),
      ) / 2;
    const x = (p[i] + p[i + 3] + p[i + 6]) / 3;
    const y = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
    const main = x >= 0 && x <= 10 && y >= 0 && y <= 10;
    const island = x >= 20 && x <= 23 && y >= 0 && y <= 3;
    const hole = x > 2 && x < 6 && y > 2 && y < 6;
    assert((main || island) && !hole, "every cap stays on original material");
    assert.equal(p[i + 2], Math.fround(2.525));
    assert.equal(p[i + 5], Math.fround(2.525));
    assert.equal(p[i + 8], Math.fround(2.525));
  }
  assert(Math.abs(area - 93) < 0.0001, `expected 93 m², received ${area}`);
  assert.equal(JSON.stringify(input), before);
});

test("shared cap edges retain a neighbouring part's collinear junction after triangulation", () => {
  const input: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: defaultProperties,
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [rectangle(0, 0, 10, 10)],
            [rectangle(10, 0, 10, 5)],
            [rectangle(10, 5, 10, 5)],
          ],
        },
      },
    ],
  };
  const before = JSON.stringify(input);
  const mesh = precisionSurfaceMesh(input, origin, {
    kind: "floor",
    relativeHeights: true,
  });
  let area = 0;
  let leftTrianglesAtJunction = 0;
  let rightTrianglesAtJunction = 0;
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 9) {
    area +=
      Math.abs(
        (p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) -
          (p[i + 6] - p[i]) * (p[i + 4] - p[i + 1]),
      ) / 2;
    const atJunction = [0, 3, 6].some(
      (offset) =>
        Math.abs(p[i + offset] - 10) < 1e-5 &&
        Math.abs(p[i + offset + 1] - 5) < 1e-5,
    );
    if (atJunction) {
      const centroidX = (p[i] + p[i + 3] + p[i + 6]) / 3;
      if (centroidX < 10) leftTrianglesAtJunction++;
      if (centroidX > 10) rightTrianglesAtJunction++;
    }
    for (const offset of [0, 3, 6]) {
      assert(p[i + offset] >= -1e-5 && p[i + offset] <= 20 + 1e-5);
      assert(p[i + offset + 1] >= -1e-5 && p[i + offset + 1] <= 10 + 1e-5);
      assert.equal(p[i + offset + 2], Math.fround(defaultProperties.floorTop));
    }
  }
  assert(leftTrianglesAtJunction >= 2, "the long edge retains both half edges");
  assert(
    rightTrianglesAtJunction >= 2,
    "both neighbouring parts retain their endpoint",
  );
  assert(Math.abs(area - 200) < 0.0001, `expected 200 m², received ${area}`);
  assert.equal(JSON.stringify(input), before);
});

test("room sides preserve exterior and hole walls at the original base and top without a bottom cap", () => {
  const input = source();
  const before = JSON.stringify(input);
  const mesh = precisionSurfaceMesh(input, origin, {
    kind: "room",
    relativeHeights: true,
  });
  const sides = mesh.sides;
  assert(sides.vertices > 0);
  let area = 0;
  for (let i = 0; i < sides.positions.length; i += 9) {
    const a = new THREE.Vector3().fromArray(sides.positions, i);
    const b = new THREE.Vector3().fromArray(sides.positions, i + 3);
    const c = new THREE.Vector3().fromArray(sides.positions, i + 6);
    area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    assert(
      a.z !== b.z || a.z !== c.z,
      "side geometry contains no horizontal top or bottom cap",
    );
    const center = a.clone().add(b).add(c).divideScalar(3);
    const onSegment = (x: number, y: number, width: number, height: number) =>
      ((Math.abs(center.x - x) < 1e-5 ||
        Math.abs(center.x - x - width) < 1e-5) &&
        center.y >= y - 1e-5 &&
        center.y <= y + height + 1e-5) ||
      ((Math.abs(center.y - y) < 1e-5 ||
        Math.abs(center.y - y - height) < 1e-5) &&
        center.x >= x - 1e-5 &&
        center.x <= x + width + 1e-5);
    assert(
      onSegment(0, 0, 10, 10) ||
        onSegment(2, 2, 4, 4) ||
        onSegment(20, 0, 3, 3),
      "every side remains on an original exterior or hole ring",
    );
  }
  // 40 m outside + 16 m hole + 12 m island, at 1.5 m source height.
  assert(Math.abs(area - 102) < 0.0002, `expected 102 m², received ${area}`);
  for (let i = 0; i < sides.vertices; i++)
    assert.equal(sides.positions[i * 3 + 2], sides.topVertices[i] ? 4 : 2.5);
  assert.equal(
    precisionSurfaceMesh(
      source({ ...defaultProperties, base: 0, height: 0 }),
      origin,
      {
        kind: "room",
        relativeHeights: true,
      },
    ).sides.vertices,
    0,
    "flat rooms retain only their source cap",
  );
  assert.equal(JSON.stringify(input), before);
});

test("derived room unions remove internal partition walls while retaining real hole and island walls", () => {
  const input = source();
  assert.equal(input.features[0].geometry.type, "MultiPolygon");
  (input.features[0].geometry as MultiPolygon).coordinates.push(
    [rectangle(10, 0, 5, 5)],
    [rectangle(10, 5, 5, 5)],
  );
  const before = JSON.stringify(input);
  const drawing = {
    ...input,
    features: input.features.map((feature) => ({
      ...feature,
      geometry: precisionSurfaceUnionGeometry(feature.geometry),
    })),
  };
  const mesh = precisionSurfaceMesh(drawing, origin, {
    kind: "room",
    relativeHeights: true,
  });
  let sideArea = 0;
  for (let i = 0; i < mesh.sides.positions.length; i += 9) {
    const a = new THREE.Vector3().fromArray(mesh.sides.positions, i);
    const b = new THREE.Vector3().fromArray(mesh.sides.positions, i + 3);
    const c = new THREE.Vector3().fromArray(mesh.sides.positions, i + 6);
    const center = a.clone().add(b).add(c).divideScalar(3);
    assert(
      Math.abs(center.x - 10) > 1e-5 ||
        Math.abs(center.y) < 1e-5 ||
        Math.abs(center.y - 10) < 1e-5,
      "no side wall follows the removed interior x=10 partition",
    );
    assert(
      Math.abs(center.y - 5) > 1e-5 || center.x < 10 || center.x > 15,
      "no side wall follows the removed interior y=5 partition",
    );
    sideArea += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
  }
  // 50 m united exterior + 16 m true hole + 12 m detached island, at 1.5 m.
  assert(Math.abs(sideArea - 117) < 0.0003, `received ${sideArea} m²`);
  for (let i = 0; i < mesh.sides.vertices; i++)
    assert.equal(
      mesh.sides.positions[i * 3 + 2],
      mesh.sides.topVertices[i] ? 4 : 2.5,
    );
  assert.equal(JSON.stringify(input), before);
});

test("room sides use only their matching post-cut perimeter while cap paint and other surfaces stay untouched", () => {
  const input = source();
  (input.features[0].geometry as MultiPolygon).coordinates.push(
    [rectangle(10, 0, 5, 5)],
    [rectangle(10, 5, 5, 5)],
  );
  const perimeters: FeatureCollection<MultiLineString> = {
    type: "FeatureCollection",
    features: [
      {
        ...input.features[0],
        geometry: {
          type: "MultiLineString",
          coordinates: [
            rectangle(0, 0, 15, 10),
            rectangle(2, 2, 4, 4).reverse(),
            rectangle(20, 0, 3, 3),
          ],
        },
      },
    ],
  };
  const before = JSON.stringify([input, perimeters]);
  const options = { kind: "room" as const, relativeHeights: true };
  const original = precisionSurfaceMesh(input, origin, options);
  const mesh = precisionSurfaceMesh(input, origin, { ...options, perimeters });
  assert.notEqual(mesh, original, "boundary identity scopes the mesh cache");
  assert.deepEqual(
    mesh.positions,
    original.positions,
    "cap paint is unchanged",
  );
  const sideArea = (positions: Float32Array) => {
    let area = 0;
    for (let i = 0; i < positions.length; i += 9) {
      const a = new THREE.Vector3().fromArray(positions, i);
      const b = new THREE.Vector3().fromArray(positions, i + 3);
      const c = new THREE.Vector3().fromArray(positions, i + 6);
      area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    }
    return area;
  };
  assert(Math.abs(sideArea(mesh.sides.positions) - 117) < 0.0003);
  assert(sideArea(original.sides.positions) > 117 + 1);
  const otherBoundary = structuredClone(perimeters);
  otherBoundary.features[0].properties!.key = "another-room";
  assert.deepEqual(
    precisionSurfaceMesh(input, origin, {
      ...options,
      perimeters: otherBoundary,
    }).sides,
    original.sides,
    "a different room's boundary cannot replace these side walls",
  );
  assert.equal(JSON.stringify([input, perimeters]), before);
});

test("ordinary and native floor surfaces retain the established top planes and room caps retain their actual height", () => {
  const input = source({
    key: "slab",
    nativeFloor: true,
    base: -0.5,
    floorTop: -0.495,
    height: 2,
    color: "#faf9f5",
  });
  input.features.push({
    type: "Feature",
    properties: {
      key: "hallway",
      circulation: true,
      base: 1.25,
      floorTop: 1.275,
      height: 1.75,
      color: "#bdd5c9",
    },
    geometry: { type: "Polygon", coordinates: [rectangle(30, 0, 3, 3)] },
  });
  const checkPlanes = (
    kind: "floor" | "room",
    relativeHeights: boolean,
    expected: [number, number][],
  ) => {
    const mesh = precisionSurfaceMesh(input, origin, { kind, relativeHeights });
    const planes = new Map([
      ["slab", expected[0]],
      ["hallway", expected[1]],
    ]);
    assert.deepEqual(
      new Set(mesh.ranges.map((range) => range.properties.key)),
      new Set(planes.keys()),
    );
    mesh.ranges.forEach((range) => {
      const plane = planes.get(String(range.properties.key));
      assert(plane);
      assert.equal(range.base, plane[0]);
      assert.equal(range.top, plane[1]);
      for (
        let vertex = range.start;
        vertex < range.start + range.count;
        vertex++
      )
        assert.equal(mesh.positions[vertex * 3 + 2], Math.fround(plane[1]));
    });
    for (const range of mesh.sides.ranges) {
      const plane = planes.get(String(range.properties.key));
      assert(plane);
      for (let i = range.start; i < range.start + range.count; i++)
        assert.equal(
          mesh.sides.positions[i * 3 + 2],
          Math.fround(mesh.sides.topVertices[i] ? plane[1] : plane[0]),
        );
    }
  };
  checkPlanes("floor", false, [
    [0, 0.005],
    [0, 0.025],
  ]);
  checkPlanes("floor", true, [
    [-0.5, -0.495],
    [1.25, 1.275],
  ]);
  checkPlanes("room", false, [
    [0, 2],
    [0, 1.75],
  ]);
  checkPlanes("room", true, [
    [-0.5, 2],
    [1.25, 1.75],
  ]);
});

test("surface colours preserve access and circulation meaning while selected rooms reveal through the same RGB transition", () => {
  const selected = "selected";
  const color = (
    properties: Parameters<typeof precisionSurfaceColor>[0],
    kind: "floor" | "room",
    progress: number,
  ) => precisionSurfaceColor(properties, kind, selected, progress);
  const equals = (actual: THREE.Color, expected: string) =>
    assert.equal(
      actual.getHex(THREE.SRGBColorSpace),
      new THREE.Color(expected).getHex(THREE.SRGBColorSpace),
    );
  equals(
    color({ key: selected, access: "staff", color: "#123456" }, "floor", 1),
    "#dfb6bd",
  );
  equals(
    color({ key: selected, access: "staff", color: "#123456" }, "room", 1),
    "#dfb6bd",
  );
  equals(
    color({ key: selected, circulation: true, color: "#123456" }, "floor", 1),
    "#bdd5c9",
  );
  equals(
    color({ key: selected, circulation: true, color: "#123456" }, "floor", 0),
    "#bdd5c9",
  );
  for (const progress of [0, 0.5, 1])
    equals(
      color(
        { key: selected, nativeFloor: true, color: "#123456" },
        "floor",
        progress,
      ),
      "#faf9f5",
    );
  equals(color({ key: selected, color: "#2468ac" }, "room", 1), "#ffe09d");
  equals(color({ key: "other", color: "#2468ac" }, "room", 1), "#2468ac");
  equals(color({ key: "other", color: "#2468ac" }, "room", 0), "#8d9395");
  const middle = color({ key: "other", color: "#2468ac" }, "room", 0.5).getRGB(
    { r: 0, g: 0, b: 0 },
    THREE.SRGBColorSpace,
  );
  const expected = [(141 + 36) / 510, (147 + 104) / 510, (149 + 172) / 510];
  [middle.r, middle.g, middle.b].forEach((value, index) =>
    assert(
      Math.abs(value - expected[index]) < 3e-5,
      "CSS RGB interpolation remains continuous",
    ),
  );
});

test("selection reuses immutable surface triangulation while actual floor and height scopes remain separate", () => {
  const input = source();
  const before = JSON.stringify(input);
  const firstOptions = {
    kind: "floor" as const,
    relativeHeights: true,
    circulationOnly: false,
    selected: "first",
  };
  const secondOptions = { ...firstOptions, selected: "second" };
  const first = precisionSurfaceMesh(input, origin, firstOptions);
  assert.equal(
    precisionSurfaceMesh(input, origin, secondOptions),
    first,
    "selection changes paint, never the geometry cache identity",
  );
  assert.notEqual(
    precisionSurfaceMesh(input, origin, {
      kind: "room",
      relativeHeights: true,
    }),
    first,
  );
  assert.notEqual(
    precisionSurfaceMesh(input, origin, {
      kind: "floor",
      relativeHeights: false,
    }),
    first,
  );
  const circulation = precisionSurfaceMesh(input, origin, {
    kind: "floor",
    relativeHeights: true,
    circulationOnly: true,
  });
  assert.notEqual(circulation, first);
  assert.equal(
    circulation.vertices,
    0,
    "circulation filter cannot retain a room cap",
  );
  assert.notEqual(
    precisionSurfaceMesh(input, [origin[0] + 0.001, origin[1]], firstOptions),
    first,
  );
  const copy = precisionSurfaceMesh(
    structuredClone(input),
    origin,
    firstOptions,
  );
  assert.notEqual(
    copy,
    first,
    "a replacement prepared floor owns its own mesh",
  );
  assert.deepEqual(copy.positions, first.positions);
  assert.equal(JSON.stringify(input), before);
});

test("surface layers retain depth testing and writing and release their materials without destroying cached geometry", () => {
  const input = source();
  const options = { kind: "floor" as const, relativeHeights: true };
  const cached = precisionSurfaceMesh(input, origin, options);
  const originalDispose = THREE.Material.prototype.dispose;
  const released: { depthTest: boolean; depthWrite: boolean }[] = [];
  THREE.Material.prototype.dispose = function () {
    released.push({ depthTest: this.depthTest, depthWrite: this.depthWrite });
    return originalDispose.call(this);
  };
  try {
    const layer = precisionSurfaceLayer(input, origin, options);
    assert.equal(
      layer.renderingMode,
      "3d",
      "floors still occlude lower geometry",
    );
    layer.onRemove?.({} as never, {} as WebGL2RenderingContext);
    assert(released.length > 0);
    assert(
      released.every((material) => material.depthTest && material.depthWrite),
    );
  } finally {
    THREE.Material.prototype.dispose = originalDispose;
  }
  assert.equal(precisionSurfaceMesh(input, origin, options), cached);
  assert(
    cached.vertices > 0,
    "GPU teardown leaves immutable triangulation reusable",
  );
});

test("floor depth passes retain physical depth and draw raised source bases after lower floors", () => {
  const input = source({ ...defaultProperties, base: 1.7 });
  input.features.push(
    ...source({
      ...defaultProperties,
      nativeFloor: true,
      base: 1.7,
      floorTop: 1.705,
    }).features,
    ...source({ ...defaultProperties, base: 0, floorTop: 0.025 }).features,
    ...source({
      ...defaultProperties,
      nativeFloor: true,
      base: 0,
      floorTop: 0.005,
    }).features,
    ...source({
      ...defaultProperties,
      nativeFloor: true,
      base: 3,
      floorTop: 3.005,
    }).features,
    ...source({ ...defaultProperties, base: 4, floorTop: 4.025 }).features,
  );
  const before = JSON.stringify(input);
  const mesh = precisionSurfaceMesh(input, origin, {
    kind: "floor",
    relativeHeights: true,
  });
  assert.deepEqual(precisionFloorDepthPasses(mesh), [
    { base: 0, source: "physical", depthWrite: false, colorWrite: true },
    { base: 0, source: "area", depthWrite: true, colorWrite: true },
    { base: 0, source: "physical", depthWrite: true, colorWrite: false },
    { base: 1.7, source: "physical", depthWrite: false, colorWrite: true },
    { base: 1.7, source: "area", depthWrite: true, colorWrite: true },
    { base: 1.7, source: "physical", depthWrite: true, colorWrite: false },
    { base: 3, source: "physical", depthWrite: true, colorWrite: true },
    { base: 4, source: "area", depthWrite: true, colorWrite: true },
  ]);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(
    new Set(mesh.ranges.map((range) => range.top)),
    new Set([2.525, 1.705, 0.025, 0.005, 3.005, 4.025]),
    "depth ordering never raises a source plane",
  );
});

test("removing an unmounted surface settles readiness without retaining a pending render", async () => {
  const layer = precisionSurfaceLayer(source(), origin, { kind: "floor" });
  assert.equal(layer.unionStatus, "pending");
  layer.onRemove?.({} as never, {} as WebGL2RenderingContext);
  await layer.whenReady;
  assert.equal(layer.unionStatus, "cancelled");
});
