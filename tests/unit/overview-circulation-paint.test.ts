import test from "node:test";
import assert from "node:assert/strict";
import type { FeatureCollection } from "geojson";
import { consistentOverviewCirculation } from "../../app/indoor-project/overview-circulation-paint";
import { applyPublishedOverviewCirculationPaint } from "../../app/indoor-project/published-circulation-paint";
import { preparedDeliveryFixture } from "../fixtures/prepared-delivery-small";
import type { ProgressiveOverview } from "../../app/indoor-project/progressive-delivery";

test("coincident grey/mint overview copies agree only on an already green exact native drawing", () => {
  const feature = {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 0],
        ],
      ],
    },
    properties: {
      nativeRegionId: "face",
      levelId: 311,
      color: "#bdd5c9",
      circulation: false,
      restricted: false,
    },
  };
  const original: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      feature,
      {
        ...structuredClone(feature),
        properties: { ...feature.properties, circulation: true },
      },
      {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      },
      {
        ...feature,
        properties: { ...feature.properties, nativeRegionId: "other" },
      },
      { ...feature, properties: { ...feature.properties, restricted: true } },
    ],
  };
  const result = consistentOverviewCirculation(original);
  assert.equal(result.features[0].properties?.circulation, true);
  assert.equal(original.features[0].properties?.circulation, false);
  for (let i = 0; i < original.features.length; i++)
    assert.equal(result.features[i].geometry, original.features[i].geometry);
  for (const i of [2, 3, 4])
    assert.equal(result.features[i], original.features[i]);
  assert.equal(consistentOverviewCirculation(result), result);
});
test("the small verified overview uses the same bounded landing review without changing its asset or geometry", () => {
  const { manifest } = preparedDeliveryFixture(),
    scope = manifest.scopes[0];
  const geometry: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 0],
            ],
          ],
        },
        properties: {
          nativeRegionId: "landing",
          levelId: 311,
          roomKeys: ["room"],
          color: "#e9edef",
          circulation: false,
        },
      },
    ],
  };
  const original = {
    format: "openindoormaps-visitor-overview-v1",
    version: 1,
    binding: scope.display.descriptor.binding,
    geometry,
  } as ProgressiveOverview;
  const review = {
    format: "openindoormaps-published-circulation-paint-v1",
    datasetSha256: manifest.provenance.datasetSha256,
    engineSha256: manifest.provenance.enginePreparationSha256,
    revisionSha256: manifest.revisionSha256,
    scopeId: scope.id,
    preparedLogicalSha256: scope.display.descriptor.logicalJsonSha256,
    decisions: [
      {
        nativeRegionId: "landing",
        levelId: 311,
        roomKeys: ["room"],
        color: "#bdd5c9",
      },
    ],
  };
  const after = applyPublishedOverviewCirculationPaint(
    original,
    manifest,
    scope,
    review,
  );
  assert.equal(after.binding, original.binding);
  assert.equal(
    after.geometry.features[0].geometry,
    original.geometry.features[0].geometry,
  );
  assert.equal(after.geometry.features[0].properties?.circulation, true);
  assert.equal(original.geometry.features[0].properties?.circulation, false);
  assert.equal(
    applyPublishedOverviewCirculationPaint(original, manifest, scope, {
      ...review,
      revisionSha256: "stale",
    }),
    original,
  );
});
