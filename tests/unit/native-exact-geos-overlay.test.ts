import {
  nativeFloorDifference,
  nativeFloorIntersection,
  nativeFloorUnion,
} from "../../../reviter/lib/reviter/native-circulation-clearance.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  initializeNativeExactGeosOverlay,
  nativeExactGeosOverlay,
  nativeExactGeosOverlayInitialized,
  setNativeExactGeosOverlayRecorder,
  setNativeExactGeosOverlayInputRecorder,
  type NativeExactOverlayEvidence,
} from "../../app/indoor-project/native-exact-geos-overlay";
import {
  initializeNativeExactGeosOverlay as initializeSource,
  nativeExactGeosOverlay as sourceOverlay,
} from "../../../reviter/lib/reviter/native-exact-geos-overlay";
const replayDirectory = new URL(
  "../../work/native-navigation-finalization-20261007/performance/",
  import.meta.url,
);
const localReplay = { skip: !fs.existsSync(replayDirectory) };
type Rings = [number, number][][];
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
test("native exact overlay fails closed before its checked engine is initialized", () => {
  assert.equal(nativeExactGeosOverlayInitialized(), false);
  assert.throws(
    () => nativeExactGeosOverlay("union", [[rect(0, 0, 1, 1)]], []),
    /initializ/i,
  );
});
test("native overlay diagnostics retain a failed-call input and cannot mutate operands", async () => {
  await initializeNativeExactGeosOverlay();
  const subject: Rings[] = [[rect(0, 0, 4, 4)]];
  const operands: Rings[][] = [[[rect(1, 1, 2, 2)]]];
  const before = JSON.stringify([subject, operands]);
  let calls = 0;
  const previous = setNativeExactGeosOverlayInputRecorder((input) => {
    calls++;
    assert.equal(input.operation, "difference");
    assert.deepEqual(input.subject, subject);
    input.subject[0][0][0][0] = 999;
    input.operands[0][0][0].splice(0);
  });
  try {
    const result = nativeExactGeosOverlay("difference", subject, operands);
    assert.equal(result[0].length, 2);
    assert.equal(JSON.stringify([subject, operands]), before);
    assert.equal(calls, 1);
  } finally {
    setNativeExactGeosOverlayInputRecorder(previous);
  }
  let captured: unknown;
  const restore = setNativeExactGeosOverlayInputRecorder((input) => {
    captured = input;
  });
  try {
    assert.throws(
      () =>
        nativeExactGeosOverlay(
          "union",
          [
            [
              [
                [0, 0],
                [2, 2],
                [0, 2],
                [2, 0],
              ],
            ],
            [rect(1, 1, 3, 3)],
          ],
          [],
        ),
      /TopologyException|invalid/i,
    );
    assert.ok(
      captured,
      "An engine rejection must still leave the original input available.",
    );
  } finally {
    setNativeExactGeosOverlayInputRecorder(restore);
  }
});
test("checked native ABI retains finite sub-square-foot and sub-ULP-distinct holes", async () => {
  await initializeNativeExactGeosOverlay();
  await initializeSource();
  for (const [origin, gap] of [
    [1000, 1e-10],
    [0, 3.8e-14],
  ]) {
    const y = origin === 0 ? -20 : origin,
      subject = [
        rect(origin, y, origin + 10, y + 10),
        rect(origin + 3, y + 1, origin + 3 + gap, y + 2),
      ],
      other = [[rect(origin + 8, y + 8, origin + 9, y + 9)]];
    const before = JSON.stringify([subject, other]),
      parts = nativeExactGeosOverlay("difference", [subject], [other]);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].length, 3);
    assert.deepEqual(parts, sourceOverlay("difference", [subject], [other]));
    assert.equal(JSON.stringify([subject, other]), before);
  }
  const parts = nativeExactGeosOverlay(
    "union",
    [
      [rect(1000, 1000, 1005 - 5e-11, 1010)],
      [rect(1005 + 5e-11, 1000, 1010, 1010)],
    ],
    [],
  );
  assert.equal(parts.length, 2);
  assert.deepEqual(
    nativeExactGeosOverlay(
      "intersection",
      [[rect(0, 0, 1, 1)]],
      [[[rect(1, 0, 2, 1)]]],
    ),
    [],
  );
});
test(
  "actual3606 unchanged native operands complete with source/runtime exact ABI and bounded cumulative contacts",
  localReplay,
  async () => {
    await initializeNativeExactGeosOverlay();
    await initializeSource();
    const filename = new URL(
      "../../work/native-navigation-finalization-20261007/performance/exact-native-overlay-inputs-0.json",
      import.meta.url,
    );
    const fixtures = JSON.parse(fs.readFileSync(filename, "utf8")) as {
      subject: Rings;
      parts: Rings[];
      gridFeet?: number;
    }[];
    const f = fixtures.find((f) => f.gridFeet === undefined)!;
    assert.equal(f.parts.length, 3606);
    const before = JSON.stringify(f);
    let evidence: NativeExactOverlayEvidence | undefined;
    const restore = setNativeExactGeosOverlayRecorder((r) => (evidence = r));
    try {
      const result = nativeExactGeosOverlay(
        "difference",
        [f.subject],
        [f.parts],
      );
      assert.equal(result.length, 365);
      assert.deepEqual(nativeFloorDifference(f.subject, f.parts), result);
      assert.deepEqual(
        result,
        sourceOverlay("difference", [f.subject], [f.parts]),
      );
      assert.equal(JSON.stringify(f), before);
      assert.ok(evidence);
      assert.ok(evidence.declined > 0);
      assert.ok(evidence.originalVertexClustersChecked > 0);
      assert.ok(
        evidence.adjustments.every((r) => !r.accepted || r.distance <= r.bound),
      );
    } finally {
      setNativeExactGeosOverlayRecorder(restore);
    }
  },
);
test(
  "original1450417 generated intersections re-node without broadening contact bounds",
  localReplay,
  async () => {
    await initializeNativeExactGeosOverlay();
    await initializeSource();
    const f = JSON.parse(
      fs.readFileSync(
        new URL(
          "../../work/native-navigation-finalization-20261007/performance/v25-walking1450417-operands-0.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { subject: Rings; parts: Rings[] };
    assert.equal(f.parts.length, 598);
    const original = JSON.stringify(f);
    let evidence: NativeExactOverlayEvidence | undefined;
    const previous = setNativeExactGeosOverlayRecorder((e) => {
      evidence = e;
    });
    try {
      const result = nativeExactGeosOverlay(
        "difference",
        [f.subject],
        [f.parts],
      );
      assert.equal(result.length, 121);
      assert.deepEqual(
        result,
        sourceOverlay("difference", [f.subject], [f.parts]),
      );
      assert.equal(JSON.stringify(f), original);
      assert.ok(evidence?.originalVertexClustersChecked);
      assert.ok(
        evidence.adjustments.every((r) => !r.accepted || r.distance <= r.bound),
      );
    } finally {
      setNativeExactGeosOverlayRecorder(previous);
    }
  },
);
test(
  "Main311 failed fragment union rederives original floors and obstacles without losing native holes",
  localReplay,
  async () => {
    await initializeNativeExactGeosOverlay();
    await initializeSource();
    const d = new URL(
      "../../work/native-navigation-finalization-20261007/performance/",
      import.meta.url,
    );
    const f = JSON.parse(
      fs.readFileSync(
        new URL("v25-main311-original-free-query-operands.json", d),
        "utf8",
      ),
    ) as {
      subject: Rings[];
      operands: Rings[][];
    };
    const bad = JSON.parse(
      fs.readFileSync(
        new URL("v25-local-main311-failed-exact-overlay-input.json", d),
        "utf8",
      ),
    );
    assert.equal(bad.subject.length, 943);
    assert.throws(
      () => nativeExactGeosOverlay("union", bad.subject, []),
      /Result area inconsistent/,
    );
    const original = JSON.stringify(f);
    const result = nativeExactGeosOverlay("difference", f.subject, f.operands);
    assert.deepEqual(
      result,
      sourceOverlay("difference", f.subject, f.operands),
    );
    assert.equal(JSON.stringify(f), original);
    assert.equal(result.length, 906);
    for (const floor of f.subject)
      for (const hole of floor.slice(1))
        assert.deepEqual(
          nativeExactGeosOverlay("intersection", result, [[[hole]]]),
          [],
          "Every complete original native floor hole remains unsupported.",
        );
    const gap = 1e-10;
    const narrowHole = [
      rect(1000, 1000, 1010, 1010),
      rect(1003, 1001, 1003 + gap, 1002),
    ];
    const distinctFloors = [narrowHole, [rect(1008, 1008, 1012, 1012)]];
    const masks = [[[rect(1007, 1007, 1007.5, 1007.5)]]];
    const preserved = nativeExactGeosOverlay(
      "difference",
      distinctFloors,
      masks,
    );
    assert.deepEqual(
      nativeExactGeosOverlay("intersection", preserved, [[[narrowHole[1]]]]),
      [],
    );
    const divided = nativeExactGeosOverlay(
      "difference",
      [[rect(0, 0, 10, 10)]],
      [[[rect(5, 0, 5 + gap, 10)]]],
    );
    assert.equal(
      divided.length,
      2,
      "A distinct thin actual barrier cannot become a joined floor.",
    );
  },
);
test(
  "Floor3.5 original obstacle union failure uses sequential source masks with ABI and hole parity",
  localReplay,
  async () => {
    await initializeNativeExactGeosOverlay();
    await initializeSource();
    const f = JSON.parse(
      fs.readFileSync(
        new URL(
          "../../work/native-navigation-finalization-20261007/performance/v25-v2-inner-query-original-input.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { subject: Rings[]; operands: Rings[][] };
    assert.equal(f.operands[0].length, 666);
    const before = JSON.stringify(f);
    assert.throws(
      () => nativeExactGeosOverlay("difference", f.subject, f.operands),
      /side location conflict/,
    );
    let evidence: NativeExactOverlayEvidence | undefined;
    const previous = setNativeExactGeosOverlayRecorder((e) => {
      evidence = e;
    });
    try {
      const options = { strategy: "sequential-difference" } as const;
      const result = nativeExactGeosOverlay(
        "difference",
        f.subject,
        f.operands,
        options,
      );
      assert.equal(result.length, 75);
      assert.deepEqual(
        result,
        sourceOverlay("difference", f.subject, f.operands, options),
      );
      assert.equal(JSON.stringify(f), before);
      assert.equal(evidence?.strategy, "sequential-difference");
      assert.ok(evidence?.originalVertexClustersChecked);
      assert.ok(
        evidence.adjustments.every((r) => !r.accepted || r.distance <= r.bound),
      );
      for (const floor of f.subject)
        for (const hole of floor.slice(1))
          assert.deepEqual(
            nativeExactGeosOverlay("intersection", result, [[[hole]]]),
            [],
            "An original source floor hole must remain completely unsupported.",
          );
    } finally {
      setNativeExactGeosOverlayRecorder(previous);
    }
  },
);
test("sequential masks preserve thin barriers, real holes, line contacts and repeat lifetime", async () => {
  await initializeNativeExactGeosOverlay();
  await initializeSource();
  const strategy = { strategy: "sequential-difference" } as const;
  const gap = 1e-10;
  const floor: Rings = [
    rect(1000, 1000, 1010, 1010),
    rect(1003, 1001, 1003 + gap, 1002),
  ];
  const masks: Rings[][] = [
    [
      [rect(1005, 1000, 1005 + gap, 1010)],
      [rect(1010, 1000, 1011, 1010)], // zero-area outer contact
      [rect(1008, 1008, 1009, 1009)],
    ],
  ];
  const before = JSON.stringify([floor, masks]);
  const result = nativeExactGeosOverlay("difference", [floor], masks, strategy);
  assert.equal(result.length, 2);
  assert.equal(
    result.reduce((n, p) => n + p.length - 1, 0),
    2,
  );
  assert.deepEqual(
    nativeExactGeosOverlay("intersection", result, [[[floor[1]]]]),
    [],
  );
  assert.deepEqual(
    nativeExactGeosOverlay("intersection", result, [[masks[0][0]]]),
    [],
  );
  for (let i = 0; i < 25; i++) {
    assert.deepEqual(
      nativeExactGeosOverlay("difference", [floor], masks, strategy),
      result,
    );
    assert.deepEqual(
      sourceOverlay("difference", [floor], masks, strategy),
      result,
    );
  }
  assert.equal(JSON.stringify([floor, masks]), before);
  assert.throws(
    () => nativeExactGeosOverlay("union", [floor], [], strategy),
    /only defined for difference/,
  );
});

test(
  "strict floor helpers use raw operands and never legacy buffer repair",
  localReplay,
  async () => {
    await initializeSource();
    const strict = { strict: true } as const;
    const d = new URL(
      "../../work/native-navigation-finalization-20261007/performance/",
      import.meta.url,
    );
    const f = JSON.parse(
      fs.readFileSync(
        new URL("v25-v2-inner-query-original-input.json", d),
        "utf8",
      ),
    );
    const original = JSON.stringify(f);
    assert.deepEqual(
      nativeFloorDifference(f.subject[0], f.operands[0], strict),
      sourceOverlay("difference", f.subject, f.operands, {
        strategy: "sequential-difference",
      }),
    );
    assert.equal(JSON.stringify(f), original);
    const fragments = JSON.parse(
      fs.readFileSync(
        new URL("v25-local-main311-failed-exact-overlay-input.json", d),
        "utf8",
      ),
    );
    assert.throws(
      () => nativeFloorUnion(fragments.subject, strict),
      /Result area inconsistent/,
      "An unclassifiable strict union must not be repaired with a zero-distance buffer.",
    );
    const gap = 1e-10;
    const floor: Rings = [
      rect(1000, 1000, 1010, 1010),
      rect(1003, 1001, 1003 + gap, 1002),
    ];
    const parts = nativeFloorIntersection(
      floor,
      [[rect(1000, 1000, 1010, 1010)]],
      strict,
    );
    assert.equal(parts.length, 1);
    assert.equal(parts[0].length, 2);
    assert.deepEqual(
      nativeFloorIntersection(parts[0], [[floor[1]]], strict),
      [],
    );
    const split = nativeFloorDifference(
      [rect(0, 0, 10, 10)],
      [[rect(5, 0, 5 + gap, 10)]],
      strict,
    );
    assert.equal(split.length, 2);
    assert.equal(
      nativeFloorUnion(
        [[rect(0, 0, 5, 10)], [rect(5 + gap, 0, 10, 10)]],
        strict,
      ).length,
      2,
    );
  },
);
test(
  "Floor3 exact subtraction reverse retry retains original mask coordinates and holes",
  localReplay,
  async () => {
    await initializeNativeExactGeosOverlay();
    await initializeSource();
    const f = JSON.parse(
      fs.readFileSync(
        new URL(
          "../../work/native-navigation-finalization-20261007/performance/v25-v3-inner-query-original-input.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { subject: Rings[]; operands: Rings[][] };
    assert.equal(f.operands[0].length, 756);
    const before = JSON.stringify(f);
    assert.throws(
      () =>
        nativeExactGeosOverlay("difference", f.subject, f.operands, {
          strategy: "sequential-difference",
        }),
      /side location conflict/,
    );
    const options = {
      strategy: "sequential-difference",
      maskOrder: "reverse",
    } as const;
    let evidence: NativeExactOverlayEvidence | undefined;
    const previous = setNativeExactGeosOverlayRecorder((e) => {
      evidence = e;
    });
    try {
      const result = nativeExactGeosOverlay(
        "difference",
        f.subject,
        f.operands,
        options,
      );
      assert.equal(result.length, 110);
      assert.deepEqual(
        result,
        sourceOverlay("difference", f.subject, f.operands, options),
      );
      assert.deepEqual(
        nativeFloorDifference(f.subject[0], f.operands[0], { strict: true }),
        result,
      );
      assert.equal(JSON.stringify(f), before);
      assert.equal(evidence?.maskOrder, "reverse");
      assert.ok(evidence?.originalVertexClustersChecked);
      assert.ok(
        evidence.adjustments.every((r) => !r.accepted || r.distance <= r.bound),
      );
      for (const floor of f.subject)
        for (const hole of floor.slice(1))
          assert.deepEqual(
            nativeExactGeosOverlay("intersection", result, [[[hole]]]),
            [],
          );
      const gap = 1e-10;
      const floor: Rings = [
        rect(1000, 1000, 1010, 1010),
        rect(1003, 1001, 1003 + gap, 1002),
      ];
      const masks: Rings[][] = [
        [[rect(1005, 1000, 1005 + gap, 1010)], [rect(1010, 1000, 1011, 1010)]],
      ];
      for (let i = 0; i < 25; i++) {
        const a = nativeExactGeosOverlay("difference", [floor], masks, options);
        assert.equal(a.length, 2);
        assert.equal(
          a.reduce((n, p) => n + p.length - 1, 0),
          1,
        );
        assert.deepEqual(
          a,
          sourceOverlay("difference", [floor], masks, options),
        );
      }
    } finally {
      setNativeExactGeosOverlayRecorder(previous);
    }
  },
);
