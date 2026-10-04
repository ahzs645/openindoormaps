import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { nearbySourceStairs } from "../../app/indoor-project/source-stairs";
import { projectConnectorMarkers } from "../../app/indoor-project/connector-markers";
import { reviewPinContext } from "../../app/indoor-project/review-pins";
const load = (): IndoorDataset =>
  JSON.parse(
    readFileSync(
      new URL("../fixtures/unbc-pinned-native-stairs.json", import.meta.url),
      "utf8",
    ),
  );
test("both railing pins find actual nearby native stairs and preserve their different routing states", () => {
  const data = load(),
    before = JSON.stringify(data);
  const cases = [
    {
      point: [84.702_256_808_402_61, 752.587_754_478_742_2] as [number, number],
      id: 2_024_027,
      connected: false,
    },
    {
      point: [56.148_288_978_804_47, 766.732_753_884_199_4] as [number, number],
      id: 2_474_568,
      connected: true,
    },
  ];
  for (const c of cases) {
    const context = reviewPinContext(data, {
      id: "pin",
      label: "Railing review",
      notes: "",
      pointFeet: c.point,
      levelId: 694,
    });
    const hit = context.nearbyStairs.find((s) => s.stairElementId === c.id);
    assert.ok(hit);
    assert.equal(hit.routeConnectionAvailable, c.connected);
    assert.ok(hit.distanceFeet <= 8);
    assert.deepEqual(context.pin.pointFeet, c.point);
  }
  assert.equal(
    JSON.stringify(data),
    before,
    "Discovery cannot create a stair edge or move a pin",
  );
});
test("source connectors have one selectable identity in flat, raised and relative views", () => {
  const data = load(),
    before = JSON.stringify(data);
  for (const relative of [false, true]) {
    const features = projectConnectorMarkers(
      data,
      [694],
      "all",
      undefined,
      relative,
    ).features;
    for (const id of [2_024_027, 2_474_568, 1_500_191]) {
      const markers = features.filter(
        (f) => f.properties?.stairElementId === id,
      );
      assert.equal(markers.length, 1);
      assert.equal(markers[0].properties?.id, `source-stair:${id}`);
      assert.equal(markers[0].properties?.review, id === 2_024_027);
    }
  }
  assert.equal(JSON.stringify(data), before);
});
test("stale inventories, other levels, distant pins and disabled routes never confer a connection", () => {
  const data = load(),
    point: [number, number] = [56.148_288_978_804_47, 766.732_753_884_199_4];
  assert.deepEqual(nearbySourceStairs(data, 999, point), []);
  assert.deepEqual(nearbySourceStairs(data, 694, [500, 500]), []);
  data.edges.forEach((e) => {
    e.enabled = false;
  });
  const context = reviewPinContext(data, {
    id: "pin",
    label: "Pin",
    notes: "",
    pointFeet: point,
    levelId: 694,
  });
  assert.ok(context.nearbyStairs.length);
  assert.ok(context.nearbyStairs.every((s) => !s.routeConnectionAvailable));
  data.stairDisplay!.sourceModelSha256 = "foreign";
  assert.deepEqual(nearbySourceStairs(data, 694, point), []);
});
