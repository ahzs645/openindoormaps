import test from "node:test";
import assert from "node:assert/strict";
import { arrivalFixture } from "../fixtures/route-endpoint-fixture";
import {
  findProjectRoute,
  projectRoutingOptionsKey,
} from "../../app/indoor-project/viewer-routing";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import {
  loadArrivalMode,
  saveArrivalMode,
} from "../../app/indoor-project/viewer-endpoint-preferences";
import {
  checkedStairPreferences,
  loadExcludedStairs,
} from "../../app/indoor-project/stair-exclusions";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
const rect = (
  a: number,
  b: number,
  c: number,
  d: number,
): [number, number][] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
function fixture() {
  const data = arrivalFixture(),
    hall = data.records[0];
  data.records.push({
    ...hall,
    key: "start",
    circulation: false,
    number: "S",
    name: "Start room",
    arrivalNodeId: "start-inside",
    ringsFeet: [rect(-10, 0, -0.2, 10)],
  });
  data.nodes.push(
    {
      ...data.nodes[0],
      id: "start-inside",
      roomKey: "start",
      pointFeet: [-5, 5, 0],
    },
    {
      ...data.nodes[0],
      id: "start-door-in",
      roomKey: "start",
      pointFeet: [-1, 5, 0],
    },
    { ...data.nodes[0], id: "start-door-out", pointFeet: [1, 5, 0] },
  );
  const edge = data.edges[0];
  data.edges.push(
    {
      ...edge,
      id: "start-walk",
      from: "start-inside",
      to: "start-door-in",
      roomKeys: ["start"],
      pointsFeet: [
        [-5, 5, 0],
        [-1, 5, 0],
      ],
      lengthMetres: 4 * 0.3048,
    },
    {
      ...edge,
      id: "start-door",
      kind: "door",
      from: "start-door-in",
      to: "start-door-out",
      roomKeys: ["start", "hall"],
      pointsFeet: [
        [-1, 5, 0],
        [1, 5, 0],
      ],
      lengthMetres: 2 * 0.3048,
    },
    {
      ...edge,
      id: "start-hall",
      from: "start-door-out",
      to: "a",
      pointsFeet: [
        [1, 5, 0],
        [2, 5, 0],
      ],
      lengthMetres: 0.3048,
    },
  );
  data.doors!.push({
    ...data.doors![0],
    id: "start-door",
    nativeElementId: 103,
    roomKeys: ["start", "hall"],
    pointFeet: [0, 5],
    footprintFeet: rect(-0.2, 4, 0.2, 6),
  });
  data.walls.push({
    ...data.walls[0],
    nativeElementId: 104,
    ringsFeet: [rect(-0.2, 0, 0.2, 10)],
  });
  data.walkingSupport!.floors[0].ringsFeet = [rect(-10, 0, 20, 40)];
  return data;
}
test("hallway endpoints use both original outside door nodes, in either direction, without mutating the map", () => {
  const data = fixture(),
    before = JSON.stringify(data);
  for (const [start, end] of [
    ["start", "room"],
    ["room", "start"],
  ]) {
    const r = findProjectRoute(data, start, end, "public", {
      endpointMode: "hallway",
    })!;
    assert.ok(r);
    assert.equal(
      r.edges.some((e) => e.kind === "door"),
      false,
    );
    assert.equal(
      data.nodes.find((n) => n.id === r.nodeIds[0])!.roomKey,
      "hall",
    );
    assert.equal(
      data.nodes.find((n) => n.id === r.nodeIds.at(-1))!.roomKey,
      "hall",
    );
    assert.equal(
      r.departure!.entranceEdgeId,
      start === "start" ? "start-door" : "door",
    );
    assert.equal(
      r.arrival!.entranceEdgeId,
      end === "start" ? "start-door" : "door",
    );
    assert.deepEqual(r.paths[0].pointsFeet[0], r.departure!.pointFeet);
    assert.deepEqual(r.paths.at(-1)!.pointsFeet.at(-1), r.arrival!.pointFeet);
  }
  assert.equal(JSON.stringify(data), before);
  assert.equal(
    findProjectRoute(data, "start", "room")!.nodeIds[0],
    "start-inside",
  );
});
test("an explicit hallway request needs no interior approach or unused endpoint variants and describes both outside endpoints", () => {
  const data = fixture();
  data.edges.find((e) => e.id === "start-walk")!.enabled = false;
  const result = createWorkerRouteCalculator(data)("start", "room", "public", {
    endpointMode: "hallway",
  });
  assert.ok(result.route);
  assert.equal(
    result.route.edges.some((e) => e.kind === "door"),
    false,
  );
  assert.equal(result.arrivals!.hallway!.route, result.route);
  assert.equal(result.arrivals!.doorway, undefined);
  assert.equal(
    result.reachable,
    undefined,
    "interior reachability must not disable valid outside-door selections",
  );
  assert.equal(findProjectRoute(data, "start", "room"), null);
  const steps = projectNavigationSteps(
    data,
    result.route,
    "First room",
    "Second room",
  );
  assert.match(steps[0].message, /Start outside First room/);
  assert.match(steps.at(-1)!.message, /Arrive outside Second room/);
});
test("multiple entrances are chosen by the hallway route rather than the saved interior arrival distance", () => {
  const data = fixture(),
    original = data.edges.find((e) => e.id === "start-walk")!,
    template = data.edges[0];
  data.nodes.find((n) => n.id === "start-inside")!.pointFeet = [-5, 9, 0];
  original.pointsFeet = [
    [-5, 9, 0],
    [-1, 5, 0],
  ];
  original.lengthMetres = Math.hypot(4, 4) * 0.3048;
  data.nodes.push(
    {
      ...data.nodes[0],
      id: "upper-in",
      roomKey: "start",
      pointFeet: [-1, 9, 0],
    },
    { ...data.nodes[0], id: "upper-out", pointFeet: [1, 9, 0] },
  );
  data.edges.push(
    {
      ...template,
      id: "upper-interior",
      from: "start-inside",
      to: "upper-in",
      roomKeys: ["start"],
      pointsFeet: [
        [-5, 9, 0],
        [-1, 9, 0],
      ],
      lengthMetres: 4 * 0.3048,
    },
    {
      ...template,
      id: "upper-door",
      kind: "door",
      from: "upper-in",
      to: "upper-out",
      roomKeys: ["start", "hall"],
      pointsFeet: [
        [-1, 9, 0],
        [1, 9, 0],
      ],
      lengthMetres: 2 * 0.3048,
    },
    {
      ...template,
      id: "upper-hall",
      from: "upper-out",
      to: "out",
      roomKeys: ["hall"],
      pointsFeet: [
        [1, 9, 0],
        [9, 5, 0],
      ],
      lengthMetres: Math.hypot(8, 4) * 0.3048,
    },
  );
  data.doors!.push({
    ...data.doors!.find((d) => d.id === "start-door")!,
    id: "upper-door",
    nativeElementId: 105,
    pointFeet: [0, 9],
    footprintFeet: rect(-0.2, 8.5, 0.2, 9.5),
  });
  assert.ok(
    findProjectRoute(data, "start", "room")!.edges.some(
      (e) => e.id === "upper-door",
    ),
  );
  const outside = findProjectRoute(data, "start", "room", "public", {
    endpointMode: "hallway",
  })!;
  assert.equal(outside.departure!.entranceEdgeId, "start-door");
  assert.equal(outside.nodeIds[0], "start-door-out");
});
test("selected-mode response caches stay separate from legacy requests for all endpoint choices", () => {
  for (const selectedFirst of [true, false]) {
    const run = createWorkerRouteCalculator(fixture());
    if (!selectedFirst)
      assert.ok(run("start", "room", "public").arrivals?.hallway);
    const selected = run("start", "room", "public", { endpointMode: "inside" });
    assert.equal(selected.arrivals?.hallway, undefined);
    assert.ok(run("start", "room", "public").arrivals?.hallway);
    assert.equal(
      run("start", "room", "public", { endpointMode: "inside" }).arrivals
        ?.hallway,
      undefined,
    );
  }
});
test("a long hallway wins over a shorter ordinary-room shortcut, with a checked fallback when no hallway remains", () => {
  const data = fixture();
  data.records.push({
    ...data.records[0],
    key: "office",
    circulation: false,
    arrivalNodeId: undefined,
    ringsFeet: [rect(3, 4, 7, 6)],
  });
  const walk = data.edges.find((e) => e.id === "walk-in")!;
  walk.pointsFeet = [
    [2, 5, 0],
    [2, 30, 0],
    [9, 30, 0],
    [9, 5, 0],
  ];
  walk.lengthMetres = 57 * 0.3048;
  data.edges.push({
    ...walk,
    id: "office-shortcut",
    roomKeys: ["office"],
    pointsFeet: [
      [2, 5, 0],
      [9, 5, 0],
    ],
    lengthMetres: 7 * 0.3048,
  });
  assert.equal(
    findProjectRoute(data, "start", "room")!.edges.some(
      (e) => e.id === "office-shortcut",
    ),
    false,
  );
  assert.equal(
    findProjectRoute(data, "start", "room", "public", {
      preferHallways: false,
    })!.edges.some((e) => e.id === "office-shortcut"),
    true,
  );
  walk.enabled = false;
  assert.equal(
    findProjectRoute(data, "start", "room")!.edges.some(
      (e) => e.id === "office-shortcut",
    ),
    true,
  );
  data.records.find((r) => r.key === "office")!.access = "staff";
  assert.equal(findProjectRoute(data, "start", "room"), null);
});
test("hallway choices preserve portal direction, accessibility, source geometry and original ownership", () => {
  const edits: ((d: IndoorDataset) => void)[] = [
    (d) => {
      d.edges.find((e) => e.id === "start-door")!.enabled = false;
    },
    (d) => {
      d.edges.find((e) => e.id === "start-door")!.direction = "to-from";
    },
    (d) => {
      d.edges.find((e) => e.id === "door")!.accessible = "unknown";
    },
    (d) => {
      d.records[0].circulation = false;
    },
    (d) => {
      d.doors = [];
    },
    (d) => {
      d.records.find((r) => r.key === "start")!.access = "staff";
    },
  ];
  for (const edit of edits) {
    const d = fixture();
    edit(d);
    assert.equal(
      findProjectRoute(d, "start", "room", "accessible", {
        endpointMode: "hallway",
      }),
      null,
    );
  }
});
test("a doorway elsewhere on the same infinite wall plane cannot supply a hallway endpoint", () => {
  const data = fixture();
  data.doors!.find((d) => d.id === "door")!.footprintFeet = rect(
    9.8,
    7,
    10.2,
    9,
  );
  assert.equal(
    findProjectRoute(data, "start", "room", "public", {
      endpointMode: "hallway",
    }),
    null,
  );
  assert.equal(
    findProjectRoute(data, "room", "start", "public", {
      endpointMode: "hallway",
    }),
    null,
  );
});
test("hallway endpoints cannot bypass a real floor opening at the outside approach", () => {
  const data = fixture();
  data.walkingSupport!.floors[0].ringsFeet.push(rect(0.7, 4.5, 1.3, 5.5));
  assert.equal(
    findProjectRoute(data, "start", "room", "public", {
      endpointMode: "hallway",
    }),
    null,
  );
  assert.equal(
    findProjectRoute(data, "room", "start", "public", {
      endpointMode: "hallway",
    }),
    null,
  );
});
test("stair exclusions apply to both directions and options invalidate warm results", () => {
  const d = fixture();
  d.edges.find((e) => e.id === "walk-in")!.kind = "local-steps";
  d.edges.find((e) => e.id === "walk-in")!.nativeElementId = 987;
  for (const [a, b] of [
    ["start", "room"],
    ["room", "start"],
  ]) {
    assert.ok(findProjectRoute(d, a, b));
    assert.equal(
      findProjectRoute(d, a, b, "public", { excludedNativeStairIds: [987] }),
      null,
    );
    assert.ok(
      findProjectRoute(d, a, b, "public", { excludedNativeStairIds: [] }),
    );
  }
  const run = createWorkerRouteCalculator(d);
  assert.ok(run("start", "room", "public").arrivals?.hallway?.route);
  assert.equal(
    run("start", "room", "public", { excludedNativeStairIds: [987] }).route,
    null,
  );
  assert.ok(run("start", "room", "public").route);
});
test("hallway is the default on both ends; an explicit inside choice persists and exclusions are model-scoped", () => {
  const storage = new Map<string, string>(),
    before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  try {
    storage.set("indoor-project-arrival-mode", "inside");
    assert.equal(loadArrivalMode(), "hallway");
    saveArrivalMode("inside");
    assert.equal(loadArrivalMode(), "inside");
    const model = "a".repeat(64);
    assert.deepEqual(loadExcludedStairs(model, [987]), [987]);
    storage.set("indoor-route-stairs:" + model, "[]");
    assert.deepEqual(loadExcludedStairs(model, [987]), []);
    assert.deepEqual(loadExcludedStairs("b".repeat(64), [123]), [123]);
    assert.throws(() =>
      checkedStairPreferences({
        sourceModelSha256: model,
        excludedNativeStairIds: [-1],
      }),
    );
    assert.equal(
      projectRoutingOptionsKey({ excludedNativeStairIds: [2, 1, 2] }),
      projectRoutingOptionsKey({ excludedNativeStairIds: [1, 2] }),
    );
  } finally {
    if (before) Object.defineProperty(globalThis, "localStorage", before);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
