import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection, Point } from "geojson";
import {
  createPropertyExpression,
  latest,
} from "@maplibre/maplibre-gl-style-spec";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import { preparedDeliveryFixture } from "../fixtures/prepared-delivery-small";
import {
  decodeProgressiveFloor,
  type ProgressivePresentationContext,
} from "../../app/indoor-project/progressive-delivery";
import { projectPublishedVisitorPlan } from "../../app/indoor-project/published-visitor-plan-projection";
import {
  publishedVisitorPlanLabels,
  publishedVisitorPlanLabelStyle,
} from "../../app/indoor-project/published-visitor-plan-labels";
import {
  visitorRoomLabels,
  visitorLabelTextExpression,
  visitorLabelOpacityExpression,
} from "../../app/indoor-project/visitor-labels";
import { DEFAULT_LABEL_SETTINGS } from "../../app/indoor-project/label-settings";

function labelsFixture() {
  const original = progressiveRoutingFixture().records[0];
  const records = [
    "Office",
    "Washroom",
    "Storage",
    "Meeting Room",
    "Reception",
    "Landmark",
  ].map((name, i) => ({
    ...structuredClone(original),
    key: `label-${i}`,
    number: `05-${100 + i}`,
    name,
    circulation: name === "Reception",
  }));
  const raw: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: records.map((record, i) => ({
      type: "Feature",
      properties: {
        key: record.key,
        name: `${record.number}\n${record.name}`,
        nativeRegionId: "shared-region",
        landmark: i === 5,
        priority: 10,
      },
      geometry: { type: "Point", coordinates: [-122.8 + i * 0.000_01, 53.8] },
    })),
  };
  const overview: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          key: "building:05",
          name: "Library",
          landmark: true,
          minZoom: 0,
          maxZoom: 18,
          priority: -1,
        },
        geometry: { type: "Point", coordinates: [-122.8, 53.8] },
      },
    ],
  };
  const base: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [],
    bbox: [-123, 53, -122, 54],
  };
  return { records, raw, overview, base };
}

test("neutral published labels match the active viewer and retain every source anchor", () => {
  const { records, raw, overview, base } = labelsFixture();
  const unchanged = JSON.stringify({ records, raw, overview, base });
  const result = publishedVisitorPlanLabels(raw, records, overview, base);
  assert.deepEqual(result, {
    ...base,
    features: [
      ...overview.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          maxZoom: DEFAULT_LABEL_SETTINGS.roomZoom - 1,
        },
      })),
      ...visitorRoomLabels(raw, records, "", DEFAULT_LABEL_SETTINGS).features,
    ],
  });
  assert.equal(result.features[0].geometry, overview.features[0].geometry);
  for (const [i, feature] of raw.features.entries())
    assert.equal(result.features[i + 1].geometry, feature.geometry);
  assert.deepEqual(
    result.features.slice(1).map((feature) => feature.properties?.minZoom),
    [21, 20, 22, 20, 20, 19.5],
  );
  assert.equal(JSON.stringify({ records, raw, overview, base }), unchanged);
});

test("selected label text, opacity and collision priority equal the full viewer at every zoom boundary", () => {
  const { records, raw, overview, base } = labelsFixture();
  const neutral = publishedVisitorPlanLabels(raw, records, overview, base);
  const unchanged = JSON.stringify(neutral);
  const baselineText = createPropertyExpression(
    visitorLabelTextExpression(),
    latest.layout_symbol["text-field"],
  );
  const baselineOpacity = createPropertyExpression(
    visitorLabelOpacityExpression(),
    latest.paint_symbol["text-opacity"],
  );
  assert.equal(baselineText.result, "success");
  assert.equal(baselineOpacity.result, "success");
  if (baselineText.result !== "success" || baselineOpacity.result !== "success")
    return;
  for (const selected of ["", ...records.map((record) => record.key)]) {
    const style = publishedVisitorPlanLabelStyle(selected);
    const text = createPropertyExpression(
      style.textField,
      latest.layout_symbol["text-field"],
    );
    const opacity = createPropertyExpression(
      style.textOpacity,
      latest.paint_symbol["text-opacity"],
    );
    const priority = createPropertyExpression(
      style.sortKey,
      latest.layout_symbol["symbol-sort-key"],
    );
    assert.equal(text.result, "success");
    assert.equal(opacity.result, "success");
    assert.equal(priority.result, "success");
    if (
      text.result !== "success" ||
      opacity.result !== "success" ||
      priority.result !== "success"
    )
      continue;
    const expected = [
      neutral.features[0],
      ...visitorRoomLabels(raw, records, selected, DEFAULT_LABEL_SETTINGS)
        .features,
    ];
    for (const zoom of [
      17, 17.5, 18, 18.5, 19.5, 20, 20.5, 21, 21.5, 22, 22.5, 23,
    ]) {
      for (const [index, feature] of neutral.features.entries()) {
        const actualFeature = {
          type: 1 as const,
          properties: feature.properties!,
        };
        const expectedFeature = {
          type: 1 as const,
          properties: expected[index].properties!,
        };
        assert.equal(
          String(text.value.evaluate({ zoom }, actualFeature)),
          String(baselineText.value.evaluate({ zoom }, expectedFeature)),
        );
        assert.equal(
          opacity.value.evaluate({ zoom }, actualFeature),
          baselineOpacity.value.evaluate({ zoom }, expectedFeature),
        );
        assert.equal(
          priority.value.evaluate({ zoom }, actualFeature),
          expectedFeature.properties.priority ?? 2,
        );
      }
    }
  }
  assert.equal(
    JSON.stringify(neutral),
    unchanged,
    "selection must never rewrite admitted label data",
  );
});

test("the actual plan projection includes processed room labels and building labels", async () => {
  const f = preparedDeliveryFixture();
  const scope = f.manifest.scopes[0];
  const display = structuredClone(
    await decodeProgressiveFloor(
      f.manifest,
      scope,
      async (id) => f.logical.get(id)!,
    ),
  );
  const { raw, records, overview, base } = labelsFixture();
  const empty = { type: "FeatureCollection" as const, features: [] };
  Object.assign(display.preparedFloor.presentation, {
    visitorWalls: empty,
    nativeWindows: empty,
    overviewLabels: overview,
  });
  Object.assign(display.preparedFloor.presentation.display, {
    records,
    labels: base,
    roomBlocks: empty,
    doorFootprints: empty,
  });
  const context: ProgressivePresentationContext = {
    version: 1,
    format: "openindoormaps-visitor-presentation-context-v1",
    binding: scope.display.descriptor.binding,
    connectorMarkers: empty,
    relativeConnectorMarkers: empty,
    visitorLabels: raw,
    extrusionWalls: empty,
    rampEdges: [],
    rampNodes: [],
    floorDatumFeet: 0,
    portals: empty,
    stairSelectionKeys: {},
  };
  const before = JSON.stringify({ display, context });
  const plan = projectPublishedVisitorPlan(
    f.manifest,
    scope,
    display,
    context,
    {
      nativeIndoorEnvelopes: false,
      nativeMaterialSections: false,
      windowMode: "simplified",
    },
  );
  assert.deepEqual(
    plan.layers.labels,
    publishedVisitorPlanLabels(raw, records, overview, base),
  );
  assert.equal(JSON.stringify({ display, context }), before);
  assert.equal(plan.layers.labels.features.length, records.length + 1);
});
