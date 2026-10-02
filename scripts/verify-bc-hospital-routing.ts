/** Hospital source route and directed multi-floor connector regressions. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import IndoorDirections from "../app/indoor-directions/directions/main";
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const routes = read("app/data/bc-hospital/indoor-routes.geojson");
const pois = read("app/data/bc-hospital/pois.geojson").features;
const noop = () => {};
const map = new Proxy(
  {},
  {
    get: (_, key) => {
      if (key === "getSource") return () => ({ setData: noop });
      if (key === "getStyle") return () => ({ layers: [] });
      if (key === "getCanvas") return () => ({ style: {} });
      return noop;
    },
  },
) as maplibregl.Map;
const engine = new IndoorDirections(map);
engine.loadMapData(routes);
engine.setLevelNames({ 0: "Level 1", 1: "Level 2" });
const origin = pois.find(
  (f: GeoJSON.Feature) =>
    f.properties?.name === "Breast Health Clinic & Bone Density",
);
const target = pois.find(
  (f: GeoJSON.Feature) => f.properties?.name === "Gift Shop",
);
for (const accessibleOnly of [false, true]) {
  engine.setPathfindingOptions({ accessibleOnly });
  engine.setWaypoints(
    [origin.geometry.coordinates, target.geometry.coordinates],
    [1, 0],
  );
  const rides = engine.routeInstructions.filter(
    (s) => s.type === "floor-change",
  );
  assert.equal(rides.length, 1);
  assert.equal(rides[0].networkType, "elevator");
  assert.equal(rides[0].fromLevel, 1);
  assert.equal(rides[0].toLevel, 0);
  assert.deepEqual(
    engine.routeInstructions
      .filter((s) => s.type === "building-change")
      .map((s) => s.buildingName),
    ["Shaughnessy AB Block", "BC Women's Hospital", "BC Children's Hospital"],
  );
}
// One source elevator and stair hop in each direction, across every shaft.
const tested = new Set<string>();
let cases = 2;
for (const f of routes.features) {
  const p = f.properties;
  if (
    f.geometry.type !== "LineString" ||
    !["elevator", "stairs"].includes(p.network_type)
  )
    continue;
  if (p.from_level_id === p.to_level_id) continue;
  const key = `${p.vertical_connection_id}:${p.from_level_id < p.to_level_id}`;
  if (tested.has(key)) continue;
  tested.add(key);
  engine.setPathfindingOptions({
    accessibleOnly: p.network_type === "elevator",
  });
  engine.setWaypoints(f.geometry.coordinates, [p.from_level_id, p.to_level_id]);
  assert.ok(engine.routeInstructions.length, key);
  assert.equal(engine.routeInstructions[0].toLevel, p.from_level_id, key);
  assert.equal(engine.routeInstructions.at(-1)?.toLevel, p.to_level_id, key);
  if (p.network_type === "elevator")
    assert.ok(
      !engine.routeInstructions.some((s) => s.networkType === "stairs"),
    );
  cases++;
}
// An isolated source room must not gain a fabricated route through its wall.
const isolated = pois.find(
  (f: GeoJSON.Feature) => f.properties?.name === "T2-605",
);
const originalError = console.error;
console.error = noop;
engine.setWaypoints(
  [origin.geometry.coordinates, isolated.geometry.coordinates],
  [1, 1],
);
console.error = originalError;
assert.equal(engine.routeInstructions.length, 0);
console.log(
  `PASS: ${cases} hospital route/connector cases; isolated source room stays unreachable.`,
);
