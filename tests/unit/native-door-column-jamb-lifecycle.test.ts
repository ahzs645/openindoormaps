import assert from "node:assert/strict";
import nodeTest from "node:test";
import * as runtime from "../../app/indoor-project/native-door-boundary-closures.ts";
import { simpleOriginalNativeColumnJambRing as simple } from "../../app/indoor-project/native-column-jamb-profile.ts";
// A sibling compiler can be exercised explicitly without making the app's unit
// suite depend on a second checkout at an absolute workspace path.
const mirrors: [string, typeof runtime][] = [["runtime", runtime]];
if (process.env.NATIVE_DOOR_CLOSURE_COMPILER_MODULE) {
  mirrors.push([
    "compiler",
    await import(process.env.NATIVE_DOOR_CLOSURE_COMPILER_MODULE),
  ]);
}
const rect = (x: number, y: number, w: number, h: number) =>
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ] as [number, number][];
function fixture() {
  const left = [
      [-2, -0.5],
      [-1.05, -0.5],
      [-1.05, 1.5],
      [-1.2, 1.7],
      [-2, 1.7],
    ] as [number, number][],
    right = left.map(([x, y]) => [-x, y] as [number, number]),
    original = {
      pointFeet: [0, 0.5],
      normalFeet: [0, 1],
      footprintFeet: rect(-1, 0, 2, 1),
      roomKeys: ["a", "b"],
    },
    door = {
      id: "door:1:10",
      levelId: 1,
      nativeElementId: 10,
      state: "connected",
      ...original,
    },
    data: any = {
      source: { modelSha256: "a".repeat(64) },
      nativeLevels: [{ id: 1, elevationFeet: 0 }],
      walkingSupport: {
        sourceModelSha256: "a".repeat(64),
        floors: [{ elevationFeet: 0, ringsFeet: [rect(-10, -10, 20, 20)] }],
      },
      doors: [door],
      edges: [
        {
          id: door.id,
          enabled: true,
          kind: "door",
          nativeElementId: 10,
          roomKeys: ["a", "b"],
        },
      ],
      walls: [
        {
          levelId: 1,
          nativeElementId: 11,
          kind: "column",
          approximate: false,
          ringsFeet: [left],
        },
        {
          levelId: 1,
          nativeElementId: 12,
          kind: "column",
          approximate: false,
          ringsFeet: [right],
        },
      ],
      records: [],
    },
    saved: any = {
      id: "test",
      levelId: 1,
      nativeElementId: 10,
      originalDoor: structuredClone(original),
      footprintFeet: rect(-1.1, 0, 2.2, 1),
      jambEvidence: [
        {
          nativeElementId: 11,
          ringsFeet: [structuredClone(left)],
          sourceNativeColumnProfile: true,
        },
        {
          nativeElementId: 12,
          ringsFeet: [structuredClone(right)],
          sourceNativeColumnProfile: true,
        },
      ],
      evidenceSha256: "b".repeat(64),
      notes: "Exact complete native column profiles in a scoped test",
    },
    value = {
      version: 1 as const,
      sourceModelSha256: "a".repeat(64),
      doors: [saved],
    };
  return { data, value, saved };
}
for (const [
  mirror,
  {
    closedBoundaryDoors,
    validateNativeDoorBoundaryClosures,
    activeNativeDoorBoundaryClosures,
    nativeDoorBoundaryClosureFootprints,
  },
] of mirrors) {
  const test = (name: string, fn: () => void) =>
    nodeTest(mirror + ": " + name, fn);
  test("simple full native column preserves concave notch and either winding", () => {
    const ring = [
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ];
    assert(simple(ring));
    assert(simple(ring.toReversed()));
  });
  test("self-cross, repeated vertices, backtracking, nonfinite and zero-area rings refuse", () => {
    for (const r of [
      [
        [0, 0],
        [3, 3],
        [0, 4],
        [4, 0],
        [5, 5],
      ],
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [2, 0],
      ],
      [
        [0, 0],
        [2, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [Infinity, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    ])
      assert.equal(simple(r), false);
  });
  test("whole native simple profiles pass all unchanged closure guards", () => {
    const f = fixture();
    const result = closedBoundaryDoors(f.data, 1, f.value);
    assert.deepEqual(result[0]!.footprintFeet, f.saved.footprintFeet);
    assert.deepEqual(
      f.data.doors[0].footprintFeet,
      f.saved.originalDoor.footprintFeet,
    );
  });
  test("legacy shape contract and source kind, exact profile, uniqueness and holes remain enforced", () => {
    let f = fixture();
    delete f.saved.jambEvidence[0].sourceNativeColumnProfile;
    assert.throws(
      () => closedBoundaryDoors(f.data, 1, f.value),
      /geometry evidence/,
    );
    f = fixture();
    f.data.walls[0].kind = "wall";
    assert.throws(() => closedBoundaryDoors(f.data, 1, f.value), /stale jamb/);
    f = fixture();
    f.data.walls.push(structuredClone(f.data.walls[0]));
    assert.throws(() => closedBoundaryDoors(f.data, 1, f.value), /stale jamb/);
    f = fixture();
    f.saved.jambEvidence[0].ringsFeet.push(rect(-1.5, 0, 0.01, 0.01));
    assert.throws(
      () => closedBoundaryDoors(f.data, 1, f.value),
      /geometry evidence/,
    );
  });
  test("tiny changed jamb source profile is stale and cannot bridge a positive gap", () => {
    const f = fixture();
    f.saved.jambEvidence[0].ringsFeet[0][0][0] += 1e-10;
    assert.throws(() => closedBoundaryDoors(f.data, 1, f.value), /stale jamb/);
  });
  test("real inner floor hole and foreign obstacle in extension remain vetoes", () => {
    let f = fixture();
    f.data.walkingSupport.floors[0].ringsFeet.push(rect(-1.08, 0.2, 0.06, 0.6));
    assert.throws(
      () => closedBoundaryDoors(f.data, 1, f.value),
      /native slab opening/,
    );
    f = fixture();
    f.data.walls.push({
      levelId: 1,
      nativeElementId: 99,
      kind: "wall",
      approximate: false,
      ringsFeet: [rect(-1.095, 0.1, 0.02, 0.4)],
    });
    assert.throws(
      () => closedBoundaryDoors(f.data, 1, f.value),
      /foreign wall/,
    );
  });
  test("disabled portal, missing full end contact and widened normal depth still refuse", () => {
    let f = fixture();
    f.data.edges[0].enabled = false;
    assert.throws(
      () => closedBoundaryDoors(f.data, 1, f.value),
      /supported door portal/,
    );
    f = fixture();
    f.data.walls[0].ringsFeet[0] = f.data.walls[0].ringsFeet[0].map(
      ([x, y]: number[]) => [x! - 0.1, y],
    );
    f.saved.jambEvidence[0].ringsFeet = structuredClone(
      f.data.walls[0].ringsFeet,
    );
    assert.throws(
      () => closedBoundaryDoors(f.data, 1, f.value),
      /threshold ends/,
    );
    f = fixture();
    f.saved.footprintFeet = f.saved.footprintFeet.map(([x, y]: number[]) => [
      x,
      y + 1e-5,
    ]);
    assert.throws(
      () => validateNativeDoorBoundaryClosures(f.value),
      /tangent extension/,
    );
  });

  test("legacy rectangular jambs retain deterministic original first-owner semantics", () => {
    const f = fixture();
    for (let i = 0; i < 2; i++) {
      const r = rect(i === 0 ? -2 : 1.05, -0.5, 0.95, 2.2);
      f.data.walls[i].ringsFeet = [r];
      f.saved.jambEvidence[i].ringsFeet = structuredClone([r]);
      delete f.saved.jambEvidence[i].sourceNativeColumnProfile;
    }
    f.data.walls.push({
      ...structuredClone(f.data.walls[0]),
      ringsFeet: [rect(-20, -20, 1, 1)],
    });
    assert.deepEqual(
      closedBoundaryDoors(f.data, 1, f.value)[0]!.footprintFeet,
      f.saved.footprintFeet,
    );
  });
  test("one ULP stale source, approximate, derived and wrong-owner columns refuse", () => {
    let f = fixture();
    const a = new Float64Array([-2]),
      b = new BigUint64Array(a.buffer);
    b[0] = b[0]! + 1n;
    f.saved.jambEvidence[0].ringsFeet[0][0][0] = a[0];
    assert.throws(() => closedBoundaryDoors(f.data, 1, f.value), /stale jamb/);
    for (const change of [
      { approximate: true },
      { reviewPatchId: "derived" },
      { nativeElementId: 13 },
    ]) {
      f = fixture();
      Object.assign(f.data.walls[0], change);
      assert.throws(
        () => closedBoundaryDoors(f.data, 1, f.value),
        /stale jamb/,
      );
    }
  });
  test("closed duplicate, nonadjacent edge self-contact, malformed finite points and flag values refuse", () => {
    for (const r of [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [1, 0],
        [0, 2],
      ],
      [
        [0, 0],
        [2, 0],
        [2, 2, 3],
        [0, 2],
      ],
      [[0, 0], [2, 0], [2], [0, 2]],
    ])
      assert.equal(simple(r), false);
    for (const flag of [false, null, "true"]) {
      const f = fixture();
      f.saved.jambEvidence[0].sourceNativeColumnProfile = flag;
      assert.throws(
        () => validateNativeDoorBoundaryClosures(f.value),
        /geometry evidence/,
      );
    }
  });
  test("only absent review state is active; held/superseded preserve complete valid source history", () => {
    const f = fixture(),
      original = structuredClone(f.data);
    const held = {
        ...structuredClone(f.saved),
        id: "held",
        reviewState: "held",
      },
      superseded = {
        ...structuredClone(f.saved),
        id: "superseded",
        reviewState: "superseded",
      };
    f.value.doors = [held, superseded, f.saved];
    assert.deepEqual(activeNativeDoorBoundaryClosures(f.value), [f.saved]);
    assert.deepEqual(
      closedBoundaryDoors(f.data, 1, f.value)[0]!.footprintFeet,
      f.saved.footprintFeet,
    );
    f.value.doors = [held, superseded];
    f.data.nativeDoorBoundaryClosures = f.value;
    f.data.walls = [];
    f.data.edges = [];
    assert.deepEqual(closedBoundaryDoors(f.data, 1, f.value), original.doors);
    assert.deepEqual(nativeDoorBoundaryClosureFootprints(f.data, 1), []);
    held.originalDoor.footprintFeet = [];
    assert.throws(
      () => closedBoundaryDoors(f.data, 1, f.value),
      /geometry evidence/,
    );
  });
  test("unknown lifecycle states, duplicate row IDs and duplicate active native identities refuse", () => {
    for (const state of [
      null,
      false,
      true,
      "active",
      "applied",
      "proposed",
      0,
    ]) {
      const f = fixture();
      f.saved.reviewState = state;
      assert.throws(
        () => activeNativeDoorBoundaryClosures(f.value),
        /geometry evidence/,
      );
    }
    let f = fixture();
    f.value.doors.push({ ...structuredClone(f.saved), id: "another" });
    assert.throws(
      () => activeNativeDoorBoundaryClosures(f.value),
      /duplicate door/,
    );
    f = fixture();
    f.value.doors.push({ ...structuredClone(f.saved), reviewState: "held" });
    assert.throws(
      () => activeNativeDoorBoundaryClosures(f.value),
      /duplicate door/,
    );
  });
}

nodeTest(
  "inactive closure history is absent from local partition evidence",
  async () => {
    const { reviewedAreaPartitionLocalEvidence } = await import(
      "../../app/indoor-project/reviewed-area-partition-evidence.ts"
    );
    const f = fixture();
    const partition = {
      id: "local",
      levelId: 1,
      elevationFeet: 0,
      kind: "shutter",
      pointsFeet: [
        [0, 0],
        [0, 1],
      ] as [number, number][],
      closed: false,
      evidence: {
        kind: "native-endpoints",
        nativeElementIds: [11, 12],
        reason: "Original profile contacts",
      },
    };
    const original = await reviewedAreaPartitionLocalEvidence(
      f.data,
      partition,
    );
    f.data.nativeDoorBoundaryClosures = f.value;
    const active = await reviewedAreaPartitionLocalEvidence(f.data, partition);
    assert.equal(
      active.records.filter((r) => r.collection === "doorBoundaryClosures")
        .length,
      1,
    );
    assert.notEqual(active.sha256, original.sha256);
    for (const state of ["held", "superseded"]) {
      f.saved.reviewState = state;
      const inactive = await reviewedAreaPartitionLocalEvidence(
        f.data,
        partition,
      );
      assert.equal(
        inactive.records.filter((r) => r.collection === "doorBoundaryClosures")
          .length,
        0,
      );
      assert.equal(inactive.sha256, original.sha256);
    }
    f.saved.reviewState = "active";
    await assert.rejects(
      reviewedAreaPartitionLocalEvidence(f.data, partition),
      /geometry evidence/,
    );
  },
);
