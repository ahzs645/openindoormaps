import test from "node:test";
import assert from "node:assert/strict";
import type { FeatureCollection, Point } from "geojson";
import type { IndoorRecord } from "../../app/indoor-project/contract";
import {
  visitorRoomLabels,
  visitorLabelPadding,
} from "../../app/indoor-project/visitor-labels";
import { labelOpacityAtZoom } from "../../app/indoor-project/zoom-presentation";

test("visitor labels reveal destinations before ordinary and service rooms while preserving source labels", () => {
  const records = ["Office", "Washroom", "Storage", "Lecture Theatre"].map(
    (name, i) =>
      ({ key: String(i), number: `05-${100 + i}`, name }) as IndoorRecord,
  );
  const labels: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: records.map((r) => ({
      type: "Feature",
      properties: { key: r.key, name: `${r.number}\n${r.name}`, priority: 1 },
      geometry: { type: "Point", coordinates: [0, 0] },
    })),
  };
  const before = JSON.stringify(labels);
  const result = visitorRoomLabels(labels, records, "");
  const props = result.features.map((f) => f.properties!);
  assert.deepEqual(
    props.map((p) => p.minZoom),
    [21, 20, 22, 20],
  );
  assert.equal(labelOpacityAtZoom(18, props[0].minZoom), 0);
  assert.equal(labelOpacityAtZoom(19, props[0].minZoom), 0);
  assert.equal(labelOpacityAtZoom(20, props[1].minZoom), 0.5);
  assert.equal(props[0].compactName, "05-100");
  assert.equal(props[0].fullNameZoom, 22);
  assert.equal(props[1].fullNameZoom, 0);
  assert.equal(JSON.stringify(labels), before);
  const chosen = visitorRoomLabels(labels, records, "2").features[2]
    .properties!;
  assert.equal(chosen.fullNameZoom, 0, "selected storage room keeps full name");
  assert.equal(chosen.minZoom, 18, "search destination stays discoverable");
  assert.equal(chosen.priority, -2, "selected label wins collisions");
  assert.ok(visitorLabelPadding(19) > visitorLabelPadding(22));
});

test("presets and custom values retain useful information while changing label density", async () => {
  const { LABEL_PRESETS, normalizeLabelSettings } = await import(
    "../../app/indoor-project/label-settings"
  );
  const room = {
    key: "office",
    name: "Office",
    number: "05-100",
  } as IndoorRecord;
  const labels: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { key: room.key, name: "05-100\nOffice" },
        geometry: { type: "Point", coordinates: [0, 0] },
      },
    ],
  };
  const minimal = visitorRoomLabels(labels, [room], "", LABEL_PRESETS.minimal)
    .features[0].properties!;
  const detailed = visitorRoomLabels(labels, [room], "", LABEL_PRESETS.detailed)
    .features[0].properties!;
  assert.ok(minimal.minZoom > detailed.minZoom);
  assert.ok(
    visitorLabelPadding(20, LABEL_PRESETS.minimal) >
      visitorLabelPadding(20, LABEL_PRESETS.detailed),
  );
  assert.equal(
    visitorRoomLabels(labels, [room], room.key, LABEL_PRESETS.minimal)
      .features[0].properties?.fullNameZoom,
    0,
  );
  const custom = normalizeLabelSettings({
    preset: "balanced",
    roomZoom: 22,
    fullNameZoom: 19,
    spacing: 100,
  });
  assert.equal(custom.preset, "custom");
  assert.equal(custom.fullNameZoom, 22, "names cannot precede room numbers");
  assert.equal(custom.spacing, 28);
  assert.equal(
    normalizeLabelSettings({
      roomZoom: Number.NaN,
      fullNameZoom: Infinity,
      spacing: -10,
    }).roomZoom,
    21,
  );
});
