/** Actual engine regressions against captured vendor targets, not its own graph. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import IndoorDirections from "../app/indoor-directions/directions/main";
import { summarizeRoute } from "../app/utils/route-summary";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const routes = read("app/data/harrods/indoor-routes.geojson");
const pois = read("app/data/harrods/pois.geojson").features;
const references = read("tests/fixtures/harrods-reference-routes.json");
const noop = () => {};
const map = new Proxy(
  {},
  {
    get: (_, p) => {
      switch (p) {
        case "getSource": {
          return () => ({ setData: noop });
        }
        case "getLayer": {
          return () => {};
        }
        case "getStyle": {
          return () => ({ layers: [] });
        }
        case "getCanvas": {
          return () => ({ style: {} });
        }
        default: {
          return noop;
        }
      }
    },
  },
);
const engine = new IndoorDirections(map as maplibregl.Map);
engine.loadMapData(routes);
const outputs: object[] = [];

function verify(
  name: string,
  start: [number, number],
  end: [number, number],
  levels: number[],
  accessible = false,
) {
  engine.setPathfindingOptions({ accessibleOnly: accessible });
  engine.setWaypoints([start, end], levels);
  assert.ok(engine.routeInstructions.length, `No route: ${name}`);
  assert.equal(engine.routeInstructions[0].toLevel, levels[0]);
  assert.equal(engine.routeInstructions.at(-1)?.toLevel, levels[1]);
  const rides = engine.routeInstructions.filter(
    (s) => s.type === "floor-change",
  );
  if (accessible) assert.ok(rides.every((s) => s.networkType === "elevator"));
  outputs.push({
    name,
    accessible,
    lines: engine.routelinesCoordinates[0],
    instructions: engine.routeInstructions,
  });
  return rides;
}
for (const ref of references) {
  const first = ref.nodes[0],
    last = ref.nodes.at(-1);
  const rides = verify(ref.name, first.coordinate, last.coordinate, [
    first.level,
    last.level,
  ]);
  assert.deepEqual(
    rides.map((s) => [s.networkType, s.fromLevel, s.toLevel]),
    ref.transitions.map(
      (s: { type: string; from_level: number; to_level: number }) => [
        s.type,
        s.from_level,
        s.to_level,
      ],
    ),
  );
  // Matching connector kinds alone can hide a route using the wrong shaft.
  for (const [i, ride] of rides.entries()) {
    const observed = ref.transitions[i];
    if (ride.networkType === "elevator") {
      assert.equal(ride.travelTimeSeconds, 120);
      assert.equal(summarizeRoute([ride]).durationSeconds, 120);
    }
    for (const [position, coordinate, level] of [
      [ride.position, observed.from_coordinate, observed.from_level],
      [ride.arrivalPosition, observed.to_coordinate, observed.to_level],
    ] as [GeoJSON.Position | undefined, GeoJSON.Position, number][]) {
      assert.ok(position);
      const dx = (position[0] - level * 2e-7 - coordinate[0]) * 69_300;
      const dy = (position[1] - coordinate[1]) * 111_320;
      assert.ok(
        Math.hypot(dx, dy) < 0.025,
        `Wrong connector landing: ${ref.name}`,
      );
    }
  }
}
// Exercise both directions at every attached source stair landing. A nearby
// escalator can legitimately win; at least some trips must actually use stairs.
let stairTrips = 0;
for (const edge of routes.features.filter(
  (f: GeoJSON.Feature) => f.properties?.network_type === "stairs",
)) {
  const p = edge.properties;
  const [a, b] = edge.geometry.coordinates.map((c: number[], i: number) => [
    c[0] - (i === 0 ? p.from_level_id : p.to_level_id) * 2e-7,
    c[1],
  ]);
  for (const reverse of [false, true]) {
    const rides = verify(
      `${p.shaft_id} ${p.from_level_id} to ${p.to_level_id} reverse=${reverse}`,
      reverse ? b : a,
      reverse ? a : b,
      reverse
        ? [p.to_level_id, p.from_level_id]
        : [p.from_level_id, p.to_level_id],
    );
    if (rides.some((ride) => ride.networkType === "stairs")) stairTrips++;
  }
}
assert.ok(stairTrips > 0, "No source stairs were usable");

// Two separate escalator flights must expose the intermediate landing in
// both the instructions and the rendered floor tags, including in reverse.
const flightEngine = new IndoorDirections(map as maplibregl.Map);
const positions: [number, number][] = [
  [-0.164, 51.499],
  [-0.163_99, 51.499],
  [-0.163_98, 51.499],
];
flightEngine.loadMapData({
  type: "FeatureCollection",
  features: [
    ...positions.map((c, level) => ({
      type: "Feature",
      properties: {
        network_type: "destination",
        level_id: level,
        source_coordinate: c,
        is_routable: true,
      },
      geometry: { type: "Point", coordinates: c },
    })),
    ...[0, 1].map((level) => ({
      type: "Feature",
      properties: {
        network_type: "escalator",
        level_id: null,
        cost: 45,
        is_accessible: false,
        from_level_id: level,
        to_level_id: level + 1,
        vertical_connection_id: `flight-${level}`,
      },
      geometry: {
        type: "LineString",
        coordinates: positions.slice(level, level + 2),
      },
    })),
  ],
} as GeoJSON.FeatureCollection);
for (const reverse of [false, true]) {
  flightEngine.setWaypoints(
    reverse ? [positions[2], positions[0]] : [positions[0], positions[2]],
    reverse ? [2, 0] : [0, 2],
  );
  const rides = flightEngine.routeInstructions.filter(
    (i) => i.type === "floor-change",
  );
  assert.deepEqual(
    rides.map((i) => [i.fromLevel, i.toLevel]),
    reverse
      ? [
          [2, 1],
          [1, 0],
        ]
      : [
          [0, 1],
          [1, 2],
        ],
  );
  assert.equal(summarizeRoute(rides).floorChanges, 2);
  assert.equal(summarizeRoute(rides).durationSeconds, 90);
  assert.deepEqual(
    flightEngine.routelinesCoordinates[0].map((f) => [
      f.properties?.level_a,
      f.properties?.level_b,
    ]),
    reverse
      ? [
          [2, 1],
          [1, 0],
        ]
      : [
          [0, 1],
          [1, 2],
        ],
  );
}
const poi = (id: number) =>
  pois.find((p: GeoJSON.Feature) => p.properties?.id === id);
for (const [a, b] of [
  [37, 10],
  [10, 37],
  [29, 37],
  [661, 678],
]) {
  for (const accessible of [false, true]) {
    const from = poi(a),
      to = poi(b);
    verify(
      `${a} to ${b}`,
      from.geometry.coordinates,
      to.geometry.coordinates,
      [from.properties.floor, to.properties.floor],
      accessible,
    );
  }
}
// A registered unreachable destination must clear a previously valid route.
const isolated = routes.features.find(
  (f: GeoJSON.Feature) =>
    f.geometry.type === "Point" && f.properties?.is_routable === false,
);
assert.ok(isolated);
const savedError = console.error;
try {
  console.error = noop;
  const from = poi(661);
  engine.setWaypoints(
    [from.geometry.coordinates, isolated.properties.source_coordinate],
    [from.properties.floor, isolated.properties.level_id],
  );
  assert.equal(engine.routeInstructions.length, 0);
  assert.equal(engine.routelinesCoordinates.length, 0);
  // An arbitrary remote point is also rejected rather than snapping across a room.
  engine.setWaypoints([from.geometry.coordinates, [-0.17, 51.5]], [0, 0]);
  assert.equal(engine.routeInstructions.length, 0);
  // A rejected snap must not fall back to an existing vertex on another floor.
  const groundTarget = routes.features.find(
    (f: GeoJSON.Feature) =>
      f.geometry.type === "Point" &&
      f.properties?.level_id === 0 &&
      f.properties?.is_routable === true,
  );
  engine.setWaypoints(
    [from.geometry.coordinates, groundTarget.geometry.coordinates],
    [0, 99],
  );
  assert.equal(engine.routeInstructions.length, 0);
} finally {
  console.error = savedError;
}
const out = process.argv.find((arg) => arg.startsWith("--out="));
if (out) writeFileSync(out.slice(6), JSON.stringify(outputs));
console.log(
  `PASS: ${outputs.length} Harrods routes (${stairTrips} using stairs); captured connector sequences and fixed elevator time; separate escalator flights; accessible/reverse trips; unreachable destinations clear the route.`,
);
