import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures/native-area-project";
import type { IndoorEdge } from "../../app/indoor-project/contract";
import type { ProjectRoute } from "../../app/indoor-project/routing";
import { routeTransitRooms } from "../../app/indoor-project/route-review-summary";
import { throughNavigationGeometryKey } from "../../app/indoor-project/through-navigation";

const edge = (
  id: string,
  roomKeys: string[],
  kind: IndoorEdge["kind"] = "walk",
) => ({ id, roomKeys, kind }) as IndoorEdge;
const route = (edges: IndoorEdge[], doorEdgeIds?: string[]) =>
  ({ edges, doorEdgeIds }) as ProjectRoute;

test("transit disclosure counts hidden doorway owners once and excludes endpoints and circulation", () => {
  const data = fixture();
  const interior = { ...data.records[0], key: "inside", number: "01-99" };
  data.records.push(interior);
  data.edges = [edge("hidden-door", ["inside", "1"])];
  assert.deepEqual(
    routeTransitRooms(
      data,
      route([edge("walk", ["0", "1", "3", "inside"])], ["hidden-door"]),
      "0",
      "3",
    ).map((room) => room.key),
    ["inside"],
  );
  assert.deepEqual(
    routeTransitRooms(data, route([], ["hidden-door"]), "0", "3").map(
      (room) => room.key,
    ),
    ["inside"],
  );
});

test("only current geometry-bound through-navigation review removes ordinary transit disclosure", () => {
  const data = fixture();
  const room = data.records[0];
  const path = route([edge("walk", ["0"])]);
  room.properties.throughNavigationReview = {
    geometryKey: throughNavigationGeometryKey(data.source.modelSha256, room),
    notes: "Reviewed internal passage",
  };
  assert.deepEqual(routeTransitRooms(data, path, "1", "3"), []);
  room.ringsFeet = [
    [
      [0, 0],
      [15, 0],
      [15, 10],
      [0, 10],
    ],
  ];
  assert.deepEqual(
    routeTransitRooms(data, path, "1", "3").map((r) => r.key),
    ["0"],
  );
});

test("connector ownership, staff and non-walkable records do not imply ordinary transit", () => {
  const data = fixture();
  assert.deepEqual(
    routeTransitRooms(
      data,
      route([
        edge("lift", ["0"], "elevator"),
        edge("walk", ["2", "4", "missing"]),
      ]),
      "1",
      "3",
    ),
    [],
  );
});
