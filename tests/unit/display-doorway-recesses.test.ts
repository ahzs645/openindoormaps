import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import pc from "polygon-clipping";
import {
  fillMeasuredDoorwayRecesses,
  type DisplayDoorwayRecessInput,
} from "../../app/indoor-project/display-doorway-recesses";

type Point = [number, number];
type Rings = Point[][];
const rect = (x: number, y: number, w: number, h: number): Rings => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
];
const area = (parts: Rings[]) =>
  parts.reduce(
    (sum, p) =>
      sum +
      p.reduce(
        (a, r, i) =>
          a +
          ((i ? -1 : 1) *
            Math.abs(
              r.reduce((s, p, j) => {
                const q = r[(j + 1) % r.length];
                return s + p[0] * q[1] - q[0] * p[1];
              }, 0),
            )) /
            2,
        0,
      ),
    0,
  );
function fixture(): DisplayDoorwayRecessInput {
  return {
    roomKey: "room",
    levelId: 1,
    partsFeet: [
      [
        [
          [0, 0],
          [4, 0],
          [4, 0.5],
          [6, 0.5],
          [6, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        rect(2, 3, 1, 1)[0],
      ],
    ],
    doors: [
      {
        id: "door",
        levelId: 1,
        nativeElementId: 10,
        pointFeet: [5, 0],
        footprintFeet: rect(4, -0.5, 2, 1)[0],
        normalFeet: [0, 1],
        roomKeys: ["room", "hall"],
        state: "connected",
      },
    ],
    floorSupportPartsFeet: [rect(-1, -1, 12, 12)],
    wallPartsFeet: [rect(0, -0.5, 4, 0.5), rect(6, -0.5, 4, 0.5)],
  };
}

test("actual UNBC 10-2036 measured doorway recess fills to native wall faces without touching source evidence", () => {
  const actual = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/unbc-office-2036-doorway-recess.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    actual.provenance.masterSha256,
    "a511f03ce34f8acf5a852104644282d56cd975ab8f10c01249324d31f32a90c6",
  );
  const before = JSON.stringify(actual.input),
    result = fillMeasuredDoorwayRecesses(actual.input);
  assert.equal(result.closures.length, 1);
  assert.equal(result.closures[0].nativeDoorId, 2200058);
  assert.ok(Math.abs(result.closures[0].recessDepthFeet - 0.081987) < 0.00001);
  assert.ok(Math.abs(result.closures[0].addedSquareFeet - 0.286834) < 0.0001);
  assert.equal(JSON.stringify(actual.input), before);
  const added = pc.difference(result.partsFeet, actual.input.partsFeet);
  assert.ok(
    area(pc.difference(added, [[actual.input.doors[0].footprintFeet]])) <
      0.000001,
  );
  assert.ok(
    area(pc.intersection(added, actual.input.wallPartsFeet)) < 0.000001,
  );
  assert.equal(result.partsFeet.length, actual.input.partsFeet.length);
});

test("bounded roomward threshold tint preserves holes, native wall faces and the entire opposite corridor", () => {
  const input = fixture(),
    before = JSON.stringify(input),
    result = fillMeasuredDoorwayRecesses(input);
  assert.equal(result.closures.length, 1);
  assert.ok(Math.abs(result.closures[0].addedSquareFeet - 1) < 1e-8);
  assert.equal(JSON.stringify(input), before);
  assert.ok(area(pc.intersection(result.partsFeet, [rect(2, 3, 1, 1)])) < 1e-8);
  assert.ok(
    area(
      pc.intersection(result.closures[0].addedPartsFeet, [rect(0, -1, 10, 1)]),
    ) < 1e-8,
  );
  assert.ok(
    area(
      pc.intersection(result.closures[0].addedPartsFeet, input.wallPartsFeet!),
    ) < 1e-8,
  );
  assert.equal(
    fillMeasuredDoorwayRecesses({ ...input, partsFeet: result.partsFeet })
      .closures.length,
    0,
  );
});

test("real floor openings, protected stair/ramp apertures and neighbouring room ownership stay unfilled", () => {
  for (const kind of ["support", "protected", "neighbour"]) {
    const input = fixture(),
      opening = rect(4.5, 0.1, 1, 0.3);
    if (kind === "support")
      input.floorSupportPartsFeet = [
        [
          [
            [-1, -1],
            [11, -1],
            [11, 11],
            [-1, 11],
          ],
          opening[0],
        ],
      ];
    if (kind === "protected") input.protectedPartsFeet = [opening];
    if (kind === "neighbour") input.neighbouringPartsFeet = [opening];
    const result = fillMeasuredDoorwayRecesses(input);
    assert.equal(result.closures.length, 1);
    assert.ok(area(pc.intersection(result.partsFeet, [opening])) < 1e-8, kind);
    assert.ok(result.closures[0].addedSquareFeet < 1, kind);
  }
  const input = fixture();
  input.floorSupportPartsFeet = [];
  assert.equal(fillMeasuredDoorwayRecesses(input).closures.length, 0);
});

test("missing measured portals, ambiguous identities and actual open passages are not filled", () => {
  for (const change of [
    (p: DisplayDoorwayRecessInput) => {
      p.doors = [];
    },
    (p: DisplayDoorwayRecessInput) => {
      p.doors[0].roomKeys = ["other", "hall"];
    },
    (p: DisplayDoorwayRecessInput) => {
      p.doors[0].roomKeys = ["room", "room"];
    },
    (p: DisplayDoorwayRecessInput) => {
      p.doors[0].state = "review-needed" as never;
    },
    (p: DisplayDoorwayRecessInput) => {
      p.doors[0].footprintFeet = undefined;
    },
    (p: DisplayDoorwayRecessInput) => {
      p.doors[0].levelId = 2;
    },
    (p: DisplayDoorwayRecessInput) => {
      p.partsFeet = [rect(0, -3, 10, 13)];
    },
  ]) {
    const input = fixture();
    change(input);
    assert.equal(fillMeasuredDoorwayRecesses(input).closures.length, 0);
  }
});

test("a real asymmetric alcove or indentation beyond the measured aperture stays intact", () => {
  const input = fixture();
  input.partsFeet[0][0][2] = [4, 2];
  input.partsFeet[0][0][3] = [6, 2];
  assert.equal(fillMeasuredDoorwayRecesses(input).closures.length, 0);
  const asym = fixture();
  asym.partsFeet[0][0][4] = [6, 0.25];
  asym.partsFeet[0][0][5] = [10, 0.25];
  assert.equal(fillMeasuredDoorwayRecesses(asym).closures.length, 0);
});

test("multiple supported measured doors fill independently without combining separate rooms", () => {
  const input = fixture();
  input.partsFeet[0][0] = [
    [0, 0],
    [2, 0],
    [2, 0.5],
    [4, 0.5],
    [4, 0],
    [6, 0],
    [6, 0.5],
    [8, 0.5],
    [8, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  input.wallPartsFeet = [];
  input.doors = [
    {
      ...input.doors[0],
      pointFeet: [3, 0],
      footprintFeet: rect(2, -0.5, 2, 1)[0],
    },
    {
      ...input.doors[0],
      id: "door2",
      nativeElementId: 11,
      pointFeet: [7, 0],
      footprintFeet: rect(6, -0.5, 2, 1)[0],
    },
  ];
  const result = fillMeasuredDoorwayRecesses(input);
  assert.deepEqual(
    result.closures.map((c) => c.nativeDoorId),
    [10, 11],
  );
  assert.ok(
    Math.abs(area(result.partsFeet) - area(input.partsFeet) - 2) < 1e-8,
  );
});
