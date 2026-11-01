import test from "node:test";
import assert from "node:assert/strict";
import {
  corridorDoorNormalHit,
  corridorTerminalApproachProposals,
} from "../../app/indoor-project/corridor-terminal-approach";
import {
  createCorridorCenterline,
  type CorridorXY,
} from "../../app/indoor-project/corridor-centerline";
import {
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import {
  nativeExactPartsForProposals,
  nativeRationalFootprintSupported,
  nativeRationalPathSupported,
} from "../../app/indoor-project/native-exact-planar-topology";

const rect = (x: number, y: number, w: number, h: number): CorridorXY[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
function clearance(parts: NativeRationalParts) {
  return (path: CorridorXY[]) =>
    path.slice(1).every((b, i) => {
      const a = path[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy);
      if (length === 0) return nativeRationalPathSupported([a, b], parts);
      const nx = -dy / length,
        ny = dx / length;
      const footprint = nativeRationalOverlay("union", [
        [
          [
            [a[0] + nx, a[1] + ny],
            [b[0] + nx, b[1] + ny],
            [b[0] - nx, b[1] - ny],
            [a[0] - nx, a[1] - ny],
          ],
        ],
      ]);
      return nativeRationalFootprintSupported(footprint, parts);
    });
}
const turn = (a: CorridorXY, b: CorridorXY, c: CorridorXY) => {
  const u = [b[0] - a[0], b[1] - a[1]],
    v = [c[0] - b[0], c[1] - b[1]];
  return (
    (Math.abs(
      Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]),
    ) *
      180) /
    Math.PI
  );
};
const maxTurn = (path: readonly CorridorXY[]) =>
  Math.max(0, ...path.slice(2).map((c, i) => turn(path[i], path[i + 1], c)));

test("legacy approach proposals are unchanged when shaping is off", () => {
  const terminal = {
    point: [10, 0] as CorridorXY,
    approachDirection: [0, 2] as CorridorXY,
  };
  const legacy = corridorTerminalApproachProposals(
    terminal,
    [0, 0.9],
    [40, 0.9],
    { shaped: false, maxFeet: 12 },
  );
  assert.deepEqual(
    legacy.map((proposal) => proposal.path),
    [
      [
        [10, 0],
        [10, 0.9],
      ],
      ...[0.5, 1, 2, 3].map((d) => [
        [10, 0],
        [10, d],
        [10, 0.9],
      ]),
    ],
  );
  assert.ok(legacy.every((proposal) => proposal.shape !== "door-normal"));
  // Without a doorway normal only the straight projection is proposed.
  assert.deepEqual(
    corridorTerminalApproachProposals({ point: [10, 0] }, [0, 4], [40, 4], {
      shaped: true,
      maxFeet: 12,
    }).map((proposal) => proposal.shape),
    ["straight"],
  );
});

test("shaped proposals put a door-normal branch first and never a sawtooth before the legacy ones", () => {
  const terminal = {
    point: [10, 0] as CorridorXY,
    approachDirection: [1, Math.sqrt(3)] as CorridorXY,
  };
  // An oblique doorway close to its receiving line: legacy elbows of 1-3 ft
  // run past the line and come back.
  const shaped = corridorTerminalApproachProposals(
    terminal,
    [0, 1.5],
    [40, 1.5],
    { shaped: true, maxFeet: 12 },
  );
  assert.equal(shaped[0].shape, "door-normal");
  assert.equal(shaped[0].path.length, 2);
  const [, x] = shaped[0].path;
  assert.ok(Math.abs(x[1] - 1.5) < 1e-12);
  assert.ok(Math.abs(x[0] - (10 + 1.5 / Math.sqrt(3))) < 1e-12);
  const firstSawtooth = shaped.findIndex(
    (proposal) => proposal.path.length === 3 && maxTurn(proposal.path) > 90,
  );
  assert.ok(firstSawtooth > 0);
  assert.ok(
    shaped
      .slice(0, firstSawtooth)
      .every(
        (proposal) =>
          proposal.shape !== "elbow" || maxTurn(proposal.path) <= 90,
      ),
  );
  for (const proposal of shaped.filter((p) => p.shape === "projected-elbow")) {
    assert.ok(maxTurn(proposal.path) < 90);
    // The second leg is perpendicular to the receiving segment.
    assert.equal(proposal.path[1][0], proposal.point[0]);
  }
  // Every legacy proposal is still present as a fallback.
  const legacy = corridorTerminalApproachProposals(
    terminal,
    [0, 1.5],
    [40, 1.5],
    { shaped: false, maxFeet: 12 },
  );
  for (const proposal of legacy)
    assert.ok(
      shaped.some(
        (candidate) =>
          JSON.stringify(candidate.path) === JSON.stringify(proposal.path),
      ),
    );
});

test("door-normal hits ignore parallel, backward and grazing segments", () => {
  assert.equal(corridorDoorNormalHit([0, 0], [0, 1], [-1, -2], [1, -2]), null);
  assert.equal(corridorDoorNormalHit([0, 0], [0, 1], [0, 1], [0, 5]), null);
  assert.equal(corridorDoorNormalHit([0, 0], [0, 1], [1, 2], [3, 2]), null);
  assert.deepEqual(corridorDoorNormalHit([0, 0], [0, 2], [-1, 3], [1, 3]), {
    t: 3,
    point: [0, 3],
    fraction: 0.5,
  });
  // A very oblique crossing is longer than 1.5x the perpendicular plus 1 ft.
  const grazing = corridorTerminalApproachProposals(
    { point: [0, 0], approachDirection: [10, 1] },
    [-20, 1],
    [40, 1],
    { shaped: true, maxFeet: 12 },
  );
  assert.ok(grazing.every((proposal) => proposal.shape !== "door-normal"));
});

test("an oblique doorway beside a narrow hallway gets a straight checked door branch instead of a sawtooth", () => {
  const corridor = rect(0, 0, 40, 3);
  const base = nativeRationalOverlay("union", [[corridor]]);
  const withDoor = nativeRationalOverlay("union", [
    [corridor],
    [rect(4, -3, 12, 3)],
    [rect(24, -3, 12, 3)],
  ]);
  const core = clearance(base),
    approach = clearance(withDoor);
  const normals: Record<string, CorridorXY> = {
    a: [Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)],
    b: [-Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)],
  };
  const terminals = [
    { id: "a", point: [10, 0] as CorridorXY, approachDirection: normals.a },
    { id: "b", point: [30, 0] as CorridorXY, approachDirection: normals.b },
  ];
  // Emulated door jambs: the first 1.5 ft of a terminal approach must follow
  // its own doorway normal. A legacy straight branch or short elbow fails.
  const jamb = (path: CorridorXY[], terminal: string) => {
    const [a, b] = path,
      normal = normals[terminal],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along = (b[0] - a[0]) * normal[0] + (b[1] - a[1]) * normal[1];
    return length >= 1.5 && Math.abs(along - length) < 1e-9;
  };
  const supported = (path: CorridorXY[], terminal?: string) =>
    terminal ? jamb(path, terminal) && approach(path) : core(path);
  const before = JSON.stringify(terminals);
  const build = (shapedApproaches: boolean) =>
    createCorridorCenterline([corridor], terminals, supported, {
      shapedApproaches,
      requiredEdges: [{ from: "a", to: "b" }],
    });
  const legacy = build(false).routeDetails("a", "b")!;
  const shaped = build(true).routeDetails("a", "b")!;
  assert.ok(legacy && shaped);
  // The legacy geometry reverses at its 2-ft elbow beyond the hallway axis.
  assert.ok(maxTurn(legacy.points) > 120);
  assert.ok(maxTurn(shaped.points) < 90);
  assert.equal(shaped.hallwayJoins[0], 1, "one straight door branch");
  assert.equal(shaped.points.length - 1 - shaped.hallwayJoins[1], 1);
  for (const route of [legacy, shaped]) {
    const [first, last] = route.hallwayJoins;
    assert.ok(supported(route.points.slice(0, first + 1), "a"));
    assert.ok(supported(route.points.slice(first, last + 1)));
    assert.ok(supported(route.points.slice(last).toReversed(), "b"));
    assert.deepEqual(route.points[0], terminals[0].point);
    assert.deepEqual(route.points.at(-1), terminals[1].point);
  }
  assert.equal(JSON.stringify(terminals), before);
});

test("shaped approaches in a junction keep exact support, original endpoints and no reversals", () => {
  const parts = nativeRationalOverlay("union", [
    [rect(0, 0, 40, 8)],
    [rect(16, 0, 8, 30)],
  ]);
  const check = clearance(parts);
  const terminals = [
    {
      id: "left",
      point: [6, 0.5] as CorridorXY,
      approachDirection: [0.3, 1] as CorridorXY,
    },
    {
      id: "right",
      point: [34, 7.5] as CorridorXY,
      approachDirection: [-0.2, -1] as CorridorXY,
    },
    {
      id: "top",
      point: [16.5, 25] as CorridorXY,
      approachDirection: [1, 0.1] as CorridorXY,
    },
  ];
  const network = createCorridorCenterline(
    [
      [
        [0, 0],
        [40, 0],
        [40, 8],
        [24, 8],
        [24, 30],
        [16, 30],
        [16, 8],
        [0, 8],
      ],
    ],
    terminals,
    (path) => check(path),
    { shapedApproaches: true },
  );
  assert.deepEqual(network.missing, []);
  for (const [a, b] of [
    ["left", "right"],
    ["left", "top"],
    ["right", "top"],
  ]) {
    const route = network.routeDetails(a, b)!;
    assert.ok(route);
    assert.ok(check(route.points));
    const [first, last] = route.hallwayJoins;
    for (const approach of [
      route.points.slice(0, first + 1),
      route.points.slice(last).toReversed(),
    ])
      assert.ok(maxTurn(approach) <= 90);
    assert.deepEqual(route.points[0], terminals.find((t) => t.id === a)!.point);
    assert.deepEqual(
      route.points.at(-1),
      terminals.find((t) => t.id === b)!.point,
    );
  }
});

test("doorway spurs are removed so the trunk refits straight, and a terminal that cannot reattach keeps its checked join", () => {
  // An L hallway with door recesses on alternating sides. Sampled spurs into
  // each recess pin a junction (and a kink) on the trunk.
  const parts = nativeRationalOverlay("union", [
    [rect(0, 0, 60, 6)],
    [rect(54, 0, 6, 30)],
    [rect(8, -1, 3, 1)],
    [rect(20, 6, 3, 1.2)],
    [rect(32, -1.2, 3, 1.2)],
    [rect(44, 6, 3, 1)],
  ]);
  const rings = nativeExactPartsForProposals(parts)[0];
  const check = clearance(parts);
  const terminals = [
    {
      id: "a",
      point: [9.5, -0.5] as CorridorXY,
      approachDirection: [0, 1] as CorridorXY,
    },
    {
      id: "b",
      point: [21.5, 6.5] as CorridorXY,
      approachDirection: [0, -1] as CorridorXY,
    },
    {
      id: "c",
      point: [33.5, -0.5] as CorridorXY,
      approachDirection: [0, 1] as CorridorXY,
    },
    {
      id: "d",
      point: [45.5, 6.5] as CorridorXY,
      approachDirection: [0, -1] as CorridorXY,
    },
    { id: "e", point: [57, 28] as CorridorXY },
    { id: "f", point: [1, 3] as CorridorXY },
  ];
  const requiredEdges = ["a", "b", "c", "d", "e"].map((id) => ({
    from: "f",
    to: id,
  }));
  const bends = (route: {
    points: CorridorXY[];
    hallwayJoins: [number, number];
  }) => {
    const core = route.points.slice(
      route.hallwayJoins[0],
      route.hallwayJoins[1] + 1,
    );
    return core.slice(2).filter((c, i) => turn(core[i], core[i + 1], c) > 5)
      .length;
  };
  const fixed = createCorridorCenterline(rings, terminals, (p) => check(p), {
    slideJoins: false,
    requiredEdges,
  });
  const slid = createCorridorCenterline(rings, terminals, (p) => check(p), {
    slideJoins: true,
    requiredEdges,
  });
  const statistics = slid.statistics().joinSliding;
  assert.ok(statistics.spurJoins >= 4);
  assert.ok(statistics.slidTerminals >= 4);
  assert.equal(statistics.retained, null);
  let fixedBends = 0,
    slidBends = 0;
  for (const { to } of requiredEdges) {
    const before = fixed.routeDetails("f", to)!,
      after = slid.routeDetails("f", to)!;
    assert.ok(before && after);
    fixedBends += bends(before);
    slidBends += bends(after);
    assert.ok(check(after.points));
    const [first, last] = after.hallwayJoins;
    assert.ok(check(after.points.slice(first, last + 1)));
    assert.deepEqual(after.points[0], terminals.at(-1)!.point);
    assert.deepEqual(
      after.points.at(-1),
      terminals.find((t) => t.id === to)!.point,
    );
    for (const approach of [
      after.points.slice(0, first + 1),
      after.points.slice(last).toReversed(),
    ])
      assert.ok(maxTurn(approach) <= 90);
  }
  assert.ok(slidBends < fixedBends, `${slidBends} < ${fixedBends}`);
  // If only the already chosen approaches are supported, nothing can move:
  // every terminal keeps its join and the network is unchanged.
  const chosen = new Set(
    [...fixed.joins.values()].map((join) => JSON.stringify(join.approach)),
  );
  const strict = (path: CorridorXY[], terminal?: string) =>
    terminal ? chosen.has(JSON.stringify(path)) && check(path) : check(path);
  const kept = createCorridorCenterline(rings, terminals, strict, {
    slideJoins: false,
    requiredEdges,
  });
  const retained = createCorridorCenterline(rings, terminals, strict, {
    slideJoins: true,
    requiredEdges,
  });
  assert.equal(retained.statistics().joinSliding.slidTerminals, 0);
  for (const { to } of requiredEdges)
    assert.deepEqual(
      retained.routeDetails("f", to),
      kept.routeDetails("f", to),
    );
});
