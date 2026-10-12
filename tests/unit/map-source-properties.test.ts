import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { FeatureCollection } from "geojson";
import {
  mapSourceFeatures,
  NATIVE_EXPLORE_PROPERTIES,
} from "../../app/indoor-project/map-source-properties";

test("render sources keep geometry objects and only the listed properties", () => {
  const geometry = {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  };
  const source: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: 7,
        geometry,
        properties: {
          color: "#abc",
          nativeRegionId: "r1",
          provenance: { big: [1, 2, 3] },
          circulation: false,
        },
      },
      { type: "Feature", geometry, properties: null },
    ],
  };
  const slim = mapSourceFeatures(source, NATIVE_EXPLORE_PROPERTIES);
  assert.equal(slim.features[0].geometry, geometry, "geometry is shared");
  assert.equal(slim.features[0].id, 7);
  assert.deepEqual(slim.features[0].properties, {
    color: "#abc",
    nativeRegionId: "r1",
    circulation: false,
  });
  assert.equal(slim.features[1].properties, null);
  assert.equal(
    mapSourceFeatures(source, NATIVE_EXPLORE_PROPERTIES),
    slim,
    "cached per collection",
  );
  assert.deepEqual(
    (source.features[0].properties as { provenance: unknown }).provenance,
    { big: [1, 2, 3] },
    "the original feature is untouched",
  );
});

test("native explore layers read no property outside the render list", () => {
  const text = readFileSync(
    new URL(
      "../../app/indoor-project/native-explore-layer.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const read = new Set(
    [...text.matchAll(/\["get",\s*"([^"]+)"\]/g)].map((m) => m[1]),
  );
  for (const name of read)
    assert(
      (NATIVE_EXPLORE_PROPERTIES as readonly string[]).includes(name),
      `native explore layers read "${name}" but its source omits it`,
    );
  // Picking uses worker-side native regions, never rendered properties.
  assert(
    !/\.properties\b/.test(text.replace(/\/\/.*$/gm, "")),
    "native explore layers must not read rendered feature properties",
  );
});
