import test from "node:test";
import assert from "node:assert/strict";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import type { Feature, Polygon, FeatureCollection } from "geojson";
import type { FilterSpecification, LayerSpecification } from "maplibre-gl";
import {
  basemapBuildingFilter,
  excludedBasemapBuildingIds,
  isBasemapBuildingLayer,
  validateBasemapBuildings,
  validateBasemapExclusionPolygon,
  defaultBasemapBuildings,
} from "../../app/indoor-project/basemap-buildings";

const rectangle = (
  id: number,
  x: number,
  y: number,
  width = 2,
): Feature<Polygon> => ({
  type: "Feature",
  id,
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + width, y],
        [x + width, y + width],
        [x, y + width],
        [x, y],
      ],
    ],
  },
});
const mask: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [rectangle(0, 0, 0, 10)],
};
test("concave polygon exclusions preserve buildings in the cut-out, rather than hiding the entire bounding box", () => {
  const points: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 4],
    [4, 4],
    [4, 10],
    [0, 10],
  ];
  validateBasemapExclusionPolygon(points);
  const areas: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
      },
    ],
  };
  assert.deepEqual(
    excludedBasemapBuildingIds(
      [rectangle(1, 1, 6), rectangle(2, 6, 1), rectangle(3, 6, 6)],
      areas,
    ),
    [1, 2],
  );
});
test("polygon validation allows either winding and rejects crossed edges, duplicate corners and insufficient points", () => {
  const points: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 4],
    [4, 4],
    [4, 10],
    [0, 10],
  ];
  validateBasemapExclusionPolygon(points);
  validateBasemapExclusionPolygon([...points].reverse());
  assert.throws(
    () =>
      validateBasemapExclusionPolygon([
        [0, 0],
        [1, 0],
      ]),
    /three corners/,
  );
  assert.throws(
    () =>
      validateBasemapExclusionPolygon([
        [0, 0],
        [4, 4],
        [0, 4],
        [4, 0],
        [6, 2],
      ]),
    /edges cannot cross/,
  );
  assert.throws(
    () =>
      validateBasemapExclusionPolygon([
        [0, 0],
        [4, 0],
        [4, 0],
        [0, 4],
      ]),
    /distinct/,
  );
});
test("building exclusions handle crossing boundaries, split tile IDs, multipolygons and holes", () => {
  const before = structuredClone(mask);
  const features = [
    rectangle(1, 2, 2),
    rectangle(2, 9, 9),
    rectangle(3, 20, 20),
    rectangle(2, 20, 20),
  ];
  assert.deepEqual(excludedBasemapBuildingIds(features, mask), [1, 2]);
  const multi: Feature = {
    ...rectangle(4, 20, 20),
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        rectangle(0, 20, 20).geometry.coordinates,
        rectangle(0, 5, 5).geometry.coordinates,
      ],
    },
  };
  assert.deepEqual(excludedBasemapBuildingIds([multi], mask), [4]);
  const holed = rectangle(5, -5, -5, 20);
  holed.geometry.coordinates.push(
    rectangle(0, -1, -1, 12).geometry.coordinates[0],
  );
  assert.deepEqual(excludedBasemapBuildingIds([holed], mask), []);
  const osm = { ...rectangle(6, 2, 2), properties: { osm_id: "osm-6" } };
  assert.deepEqual(excludedBasemapBuildingIds([osm], mask), ["osm-6"]);
  assert.deepEqual(mask, before);
});
test("building filters preserve legacy and expression conditions and restore show mode", () => {
  for (const original of [
    undefined,
    ["==", "kind", "building"],
    ["==", ["get", "kind"], "building"],
  ] as (FilterSpecification | undefined)[]) {
    const filter = basemapBuildingFilter(original, "areas", [1, "osm-2"])!;
    const compiled = featureFilter(filter);
    const evaluate = (id: number, kind = "building", osm_id?: string) =>
      compiled.filter(
        { zoom: 16 },
        {
          id,
          type: "Polygon",
          properties: { kind, ...(osm_id ? { osm_id } : {}) },
          geometry: [],
        },
      );
    assert.equal(evaluate(1), false);
    assert.equal(evaluate(2, "building", "osm-2"), false);
    assert.equal(evaluate(3), true);
    if (original) assert.equal(evaluate(3, "road"), false);
    assert.deepEqual(
      basemapBuildingFilter(original, "show", [1]),
      original ?? null,
    );
    assert.deepEqual(
      basemapBuildingFilter(original, "areas", []),
      original ?? null,
    );
    const hidden = featureFilter(basemapBuildingFilter(original, "hide", [])!);
    assert.equal(
      hidden.filter(
        { zoom: 16 },
        {
          id: 3,
          type: "Polygon",
          properties: { kind: "building" },
          geometry: [],
        },
      ),
      false,
    );
  }
});
test("only basemap building layers are affected", () => {
  const layer: LayerSpecification = {
    id: "building",
    type: "fill",
    source: "tiles",
    "source-layer": "building",
  };
  assert.equal(isBasemapBuildingLayer(layer), true);
  assert.equal(
    isBasemapBuildingLayer({ ...layer, id: "project-room-fill" }),
    false,
  );
  assert.equal(
    isBasemapBuildingLayer({
      ...layer,
      id: "road",
      "source-layer": "transportation",
    }),
    false,
  );
});
test("invalid exclusion settings and degenerate areas are rejected", () => {
  validateBasemapBuildings(defaultBasemapBuildings);
  for (const value of [
    { ...defaultBasemapBuildings, mode: "invalid" },
    { ...defaultBasemapBuildings, marginMetres: Number.NaN },
    {
      ...defaultBasemapBuildings,
      areas: [
        {
          id: "a",
          name: "A",
          pointsFeet: [
            [0, 0],
            [1, 0],
            [2, 0],
          ],
        },
      ],
    },
    {
      ...defaultBasemapBuildings,
      areas: [
        {
          id: "a",
          name: "A",
          pointsFeet: [
            [0, 0],
            [Number.NaN, 0],
            [2, 1],
          ],
        },
      ],
    },
  ])
    assert.throws(() => validateBasemapBuildings(value), /basemap/i);
});
