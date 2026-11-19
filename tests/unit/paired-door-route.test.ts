import test from "node:test";
import assert from "node:assert/strict";
import {
  pairedDoorCandidates,
  centeredDoorCandidate,
  commonDoorCenter,
} from "../../app/indoor-project/paired-door-route";
import { createTwoFootCorridorSupport } from "../../app/indoor-project/corridor-guide-support";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";

type XY = [number, number];
const box = (x0: number, y0: number, x1: number, y1: number): XY[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
test("the same straight rendered walk passes through two offset native door openings in either direction", async () => {
  await initializeNativeExactGeosOverlay();
  const gates = [
    {
      id: "A",
      normal: [0, 1] as XY,
      center: [0, 0.25] as XY,
      ring: box(-1.7, 0, 1.7, 0.5),
    },
    {
      id: "B",
      normal: [0, 1] as XY,
      center: [0.2, 7.75] as XY,
      ring: box(-1.5, 7.5, 1.9, 8),
    },
  ];
  const forward: XY[][] = [
    [
      [-0.3, -6],
      [0, 0],
    ],
    [
      [0, 0],
      [0, 0.5],
    ],
    [
      [0, 0.5],
      [0.2, 7.5],
    ],
    [
      [0.2, 7.5],
      [0.2, 8],
    ],
    [
      [0.2, 8],
      [0.4, 17],
    ],
  ];
  const floor = [
    box(-4, -8, 4, 0),
    gates[0].ring,
    box(-4, 0.5, 4, 7.5),
    gates[1].ring,
    box(-4, 8, 4, 18),
  ];
  // At each threshold a slanted, two-foot swept footprint straddles the
  // threshold plane. Allow only the floor and the two explicit apertures.
  const surface = nativeRationalOverlay(
    "union",
    floor.map((r) => [r]),
  );
  const supported = createTwoFootCorridorSupport(surface, 0);
  const solve = (pts: XY[][], ds: typeof gates) =>
    pairedDoorCandidates(pts, ds, [true, true]).find((c) =>
      c.legs.every((p) => supported(p)),
    )!.legs;
  const result = solve(forward, gates),
    back = solve(
      forward.toReversed().map((p) => p.toReversed()),
      gates.toReversed(),
    );
  assert.deepEqual(
    back,
    result.toReversed().map((p) => p.toReversed()),
  );
  const points = result.flatMap((p, i) => (i ? p.slice(1) : p)),
    [x, y] = points[0],
    last = points.at(-1)!;
  for (const [px, py] of points) {
    const residual = Math.abs(
      (px - x) * (last[1] - y) - (py - y) * (last[0] - x),
    );
    assert.ok(residual <= 1e-12, "Only IEEE interpolation residual is allowed");
  }
  assert.deepEqual(points[0], forward[0][0]);
  assert.deepEqual(points.at(-1), forward.at(-1)!.at(-1));
  const blocked = structuredClone(floor);
  blocked[1] = box(-0.4, 0, 0.4, 0.5);
  const narrow = createTwoFootCorridorSupport(
    nativeRationalOverlay(
      "union",
      blocked.map((r) => [r]),
    ),
    0,
  );
  assert.ok(
    pairedDoorCandidates(forward, gates, [true, true]).every(
      (c) => !c.legs.every((p) => narrow(p)),
    ),
  );
});

test("the centerline uses the overlap of both jambs and retains the attachment of a fixed point", async () => {
  await initializeNativeExactGeosOverlay();
  const gates = [
    {
      id: "A",
      normal: [0, 1] as XY,
      center: [0, 0.25] as XY,
      ring: box(-1.7, 0, 1.7, 0.5),
    },
    {
      id: "B",
      normal: [0, -1] as XY,
      center: [0.2, 7.75] as XY,
      ring: box(-1.5, 7.5, 1.9, 8),
    },
  ];
  const original: XY[][] = [
    [
      [-0.3, -6],
      [0, 0],
    ],
    [
      [0, 0],
      [0, 0.5],
    ],
    [
      [0, 0.5],
      [0.2, 7.5],
    ],
    [
      [0.2, 7.5],
      [0.2, 8],
    ],
    [
      [0.2, 8],
      [0.4, 17],
    ],
  ];
  const a = centeredDoorCandidate(original, gates)!,
    b = centeredDoorCandidate(
      original.toReversed().map((p) => p.toReversed()),
      gates.toReversed(),
    )!;
  assert(a && b);
  assert.deepEqual(
    a.legs,
    b.legs.toReversed().map((p) => p.toReversed()),
  );
  assert.deepEqual(a.sources, [original[0][0], original.at(-1)!.at(-1)]);
  assert.equal(a.width, 3.2);
  assert.ok(a.stations.every(([x]) => Math.abs(x - 0.1) < 1e-14));
  assert.deepEqual(a.legs[0].slice(0, 2), [original[0][0], a.stations[0]]);
  assert.deepEqual(a.legs.at(-1)!.slice(-2), [
    a.stations[1],
    original.at(-1)!.at(-1),
  ]);
  assert.deepEqual(
    a.stations.map((p) => p[1]),
    [-6, 17],
  );
  const surface = nativeRationalOverlay(
    "union",
    [
      box(-4, -8, 4, 0),
      gates[0].ring,
      box(-4, 0.5, 4, 7.5),
      gates[1].ring,
      box(-4, 8, 4, 18),
    ].map((r) => [r]),
  );
  const support = createTwoFootCorridorSupport(surface, 0);
  assert.ok(a.legs.every((p) => support(p)));
  assert.equal(
    commonDoorCenter([gates[0], { ...gates[1], ring: box(1, 7.5, 3, 8) }]),
    undefined,
  );
  assert.equal(
    commonDoorCenter([gates[0], { ...gates[1], normal: [1, 0] }]),
    undefined,
  );
  const outOfBounds = structuredClone(original);
  outOfBounds[0][0][0] = -6;
  assert.equal(centeredDoorCandidate(outOfBounds, gates), undefined);
  const reversedApproach = structuredClone(original);
  reversedApproach[0][0][1] = 1;
  assert.equal(centeredDoorCandidate(reversedApproach, gates), undefined);
});
