import test from "node:test";
import assert from "node:assert/strict";
import { arrivalFixture } from "../fixtures/route-endpoint-fixture";
import {
  projectConnectorMarkers,
  stairDisplayPoint,
} from "../../app/indoor-project/connector-markers";
import pointInPolygon from "@turf/boolean-point-in-polygon";
test("an unconnected source-labelled stair landing remains locatable without creating treads or directions", () => {
  const data = arrivalFixture(),
    room = data.records[1];
  room.stair = true;
  room.arrivalNodeId = undefined;
  data.nativeIndoorEnvelopes = {} as NonNullable<
    typeof data.nativeIndoorEnvelopes
  >;
  room.ringsFeet = [
    [
      [10.2, 0],
      [20, 0],
      [20, 10],
      [10.2, 10],
    ],
    [
      [12, 2],
      [18, 2],
      [18, 8],
      [12, 8],
    ],
  ];
  const before = JSON.stringify(data),
    point = stairDisplayPoint(data, room)!;
  assert.equal(
    pointInPolygon(point, {
      type: "Polygon",
      coordinates: room.ringsFeet.map((r) => [...r, r[0]]),
    }),
    true,
  );
  const marker = projectConnectorMarkers(data, [1], "B").features.find(
    (f) => f.properties?.key === room.key,
  )!;
  assert.ok(marker);
  assert.equal(marker.properties!.review, true);
  assert.match(
    marker.properties!.name,
    /Stair landing.*connection unavailable/,
  );
  assert.equal(projectConnectorMarkers(data, [2], "B").features.length, 0);
  assert.equal(
    projectConnectorMarkers(data, [1], "different").features.length,
    0,
  );
  assert.equal(JSON.stringify(data), before);
  assert.equal(room.arrivalNodeId, undefined);
  assert.equal(data.stairDisplay, undefined);
});
