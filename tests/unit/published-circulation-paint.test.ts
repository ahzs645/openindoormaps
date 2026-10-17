import test from "node:test";
import assert from "node:assert/strict";
import { applyPublishedCirculationPaint } from "../../app/indoor-project/published-circulation-paint";
import { decodeProgressiveFloor } from "../../app/indoor-project/progressive-delivery";
import { preparedDeliveryFixture } from "../fixtures/prepared-delivery-small";

test("bound circulation paint changes only reviewed feature paint, preserving native geometry, associations and elevations", async () => {
  const { manifest, logical } = preparedDeliveryFixture(),
    scope = manifest.scopes[0];
  const original = await decodeProgressiveFloor(
    manifest,
    scope,
    async (id) => logical.get(id)!,
  );
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
  const feature = {
    type: "Feature" as const,
    geometry,
    properties: {
      nativeRegionId: "region-a",
      color: "#e9edef",
      circulation: false,
      base: 3.28,
      height: 3.305,
      roomKeys: ["landing"],
    },
  };
  const region = { id: "region-a", levelId: 311, roomKeys: ["landing"] };
  const before = {
    ...original,
    nativeFaces: {
      ...original.nativeFaces,
      regions: [region],
      fills: { type: "FeatureCollection" as const, features: [feature] },
    },
  } as unknown as typeof original;
  const review = {
    format: "openindoormaps-published-circulation-paint-v1",
    datasetSha256: manifest.provenance.datasetSha256,
    engineSha256: manifest.provenance.enginePreparationSha256,
    revisionSha256: manifest.revisionSha256,
    preparedLogicalSha256: scope.display.descriptor.logicalJsonSha256,
    scopeId: scope.id,
    decisions: [
      {
        nativeRegionId: "region-a",
        levelId: 311,
        roomKeys: ["landing"],
        color: "#bdd5c9",
      },
    ],
  };
  const after = applyPublishedCirculationPaint(before, manifest, scope, review),
    f = after.nativeFaces.fills.features[0];
  assert.equal(f.geometry, geometry);
  assert.equal(after.nativeFaces.regions, before.nativeFaces.regions);
  assert.equal(
    after.nativeFaces.exactTopologies,
    before.nativeFaces.exactTopologies,
  );
  assert.equal(after.preparedFloor, before.preparedFloor);
  assert.deepEqual(f.properties, {
    ...feature.properties,
    color: "#bdd5c9",
    circulation: true,
  });
  assert.deepEqual(feature.properties, {
    nativeRegionId: "region-a",
    color: "#e9edef",
    circulation: false,
    base: 3.28,
    height: 3.305,
    roomKeys: ["landing"],
  });
  assert.equal(
    applyPublishedCirculationPaint(before, manifest, scope, {
      ...review,
      revisionSha256: "0".repeat(64),
    }),
    before,
  );
  const combined = { ...scope, id: "combined-scope" };
  assert.equal(
    applyPublishedCirculationPaint(before, manifest, combined, review),
    before,
  );
  const reviewedCombined = applyPublishedCirculationPaint(
    before,
    manifest,
    combined,
    {
      ...review,
      additionalScopes: [
        {
          scopeId: combined.id,
          preparedLogicalSha256: scope.display.descriptor.logicalJsonSha256,
        },
      ],
    },
  );
  assert.equal(
    reviewedCombined.nativeFaces.fills.features[0].properties?.color,
    "#bdd5c9",
  );
  assert.throws(
    () =>
      applyPublishedCirculationPaint(before, manifest, scope, {
        ...review,
        decisions: [{ ...review.decisions[0], roomKeys: ["different"] }],
      }),
    /no longer matches/,
  );
});
