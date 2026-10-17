import assert from "node:assert/strict";
import test from "node:test";
import { progressiveRoutingDisclosureFixture } from "../fixtures/progressive-routing";
import { createVerifiedProgressiveRouteCalculator } from "../../app/indoor-project/progressive-route-validation";
import { progressiveRouteSummary } from "../../app/indoor-project/progressive-route-summary";
import { throughNavigationGeometryKey } from "../../app/indoor-project/through-navigation";

test("worker disclosure keeps actual unknown access and ordinary room transit facts without inferring permission", () => {
  const data = progressiveRoutingDisclosureFixture(),
    original = JSON.stringify(data);
  const route = createVerifiedProgressiveRouteCalculator(data)(
    "0",
    "1",
    "public",
  ).route;
  assert(route);
  assert.deepEqual(route.unknownAccessAreas, ["middle"]);
  assert.equal(route.unknownAccessibilityEdges, 2);
  assert.deepEqual(progressiveRouteSummary(data, route, "0", "1"), {
    transitPlaces: [
      { key: "middle", label: "01-2 · Unconfirmed transit room" },
    ],
  });
  assert.deepEqual(progressiveRouteSummary(data, null, "0", "1"), {
    transitPlaces: [],
  });
  assert.equal(JSON.stringify(data), original);
});
test("the shared geometry-bound passage review suppresses only the ordinary-transit disclosure", () => {
  const data = progressiveRoutingDisclosureFixture(),
    room = data.records.find((record) => record.key === "middle")!;
  room.properties.throughNavigationReview = {
    geometryKey: throughNavigationGeometryKey(data.source.modelSha256, room),
    notes: "Explicit synthetic passage review",
  };
  const route = createVerifiedProgressiveRouteCalculator(data)(
    "0",
    "1",
    "public",
  ).route;
  assert(route);
  assert.deepEqual(progressiveRouteSummary(data, route, "0", "1"), {
    transitPlaces: [],
  });
  assert.deepEqual(route.unknownAccessAreas, ["middle"]);
});
