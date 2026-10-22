import assert from "node:assert/strict";
import test from "node:test";
import {
  corridorChainTopologyConflicts,
  fitCheckedCorridorChains,
  type CorridorChainPoint,
  type CorridorFitChain,
} from "../../app/indoor-project/corridor-chain-fit";
import { createTwoFootCorridorSupport } from "../../app/indoor-project/corridor-guide-support";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";

const chain = (
  id: string,
  points: CorridorChainPoint[],
  from: string = `${id}:a`,
  to: string = `${id}:b`,
): CorridorFitChain => ({ id, from, to, points });

test("a shared jittered chain fits once, reverses identically and preserves input coordinates", () => {
  const input = chain("jitter", [
    [0, 0],
    [2, 0.1],
    [5, -0.05],
    [7, 0.1],
    [10, 0],
  ]);
  const before = JSON.stringify(input);
  const result = fitCheckedCorridorChains([input], () => true);
  assert.deepEqual(result.chains, [
    [
      [0, 0],
      [10, 0],
    ],
  ]);
  assert.equal(result.statistics.originalVertices, 5);
  assert.equal(result.statistics.fittedVertices, 2);
  const reverse = fitCheckedCorridorChains(
    [
      {
        ...input,
        from: input.to,
        to: input.from,
        points: input.points.toReversed(),
      },
    ],
    () => true,
  );
  assert.deepEqual(reverse.chains[0], result.chains[0]!.toReversed());
  result.chains[0]![0][0] = 900;
  assert.equal(JSON.stringify(input), before);
});

test("protected terminal joins survive a chord that could otherwise remove them", () => {
  const input = {
    ...chain("protected", [
      [0, 0],
      [2, 0.1],
      [5, 0],
      [8, 0.1],
      [10, 0],
    ]),
    protectedIndices: [2],
  };
  const result = fitCheckedCorridorChains([input], () => true);
  assert.deepEqual(result.chains[0], [
    [0, 0],
    [5, 0],
    [10, 0],
  ]);
});

test("exact two-foot demand retains the bend around a positive thin hole", () => {
  const face = nativeRationalOverlay(
    "difference",
    [
      [
        [
          [-3, -3],
          [13, -3],
          [13, 6],
          [-3, 6],
        ],
      ],
    ],
    [
      [
        [
          [4.999, -0.01],
          [5.001, -0.01],
          [5.001, 0.01],
          [4.999, 0.01],
        ],
      ],
    ],
  );
  const supported = createTwoFootCorridorSupport(face, 0);
  const input = chain("hole", [
    [0, 0],
    [5, 3],
    [10, 0],
  ]);
  assert.equal(
    supported([
      [0, 0],
      [10, 0],
    ]),
    false,
  );
  assert.equal(supported(input.points as CorridorChainPoint[]), true);
  const result = fitCheckedCorridorChains([input], supported, {
    maxDeviationFeet: 4,
  });
  assert.deepEqual(result.chains[0], input.points);
});

test("a supported chord can replace unsupported sampled intermediate proposals", () => {
  const result = fitCheckedCorridorChains(
    [
      chain("raw", [
        [0, 0],
        [5, 0.1],
        [10, 0],
      ]),
    ],
    (points) => points.every((point) => point[1] === 0),
  );
  assert.deepEqual(result.chains[0], [
    [0, 0],
    [10, 0],
  ]);
  const refused = fitCheckedCorridorChains(
    [
      chain("raw", [
        [0, 0],
        [5, 0.1],
        [10, 0],
      ]),
    ],
    () => false,
  );
  assert.equal(refused.chains[0], null);
  assert.equal(refused.refusals[0].reason, "unsupported-chain");
});

test("the batch checks final chords and restores a checked chain that would create a crossing", () => {
  const input = [
    chain("bend", [
      [0, 0],
      [5, 2],
      [10, 0],
    ]),
    chain("vertical", [
      [5, -1],
      [5, 1],
    ]),
  ];
  const result = fitCheckedCorridorChains(input, () => true, {
    maxDeviationFeet: 3,
  });
  assert.deepEqual(
    result.chains,
    input.map((item) => item.points),
  );
  assert.equal(result.statistics.retainedOriginals, 1);
  assert.deepEqual(result.refusals, [
    { chainId: "bend", reason: "intersection-retained-original" },
  ]);
  const reverse = fitCheckedCorridorChains(input.toReversed(), () => true, {
    maxDeviationFeet: 3,
  });
  assert.deepEqual(reverse.chains.toReversed(), result.chains);
});

test("new positive overlap is refused without replacing a neighboring checked chain", () => {
  const input = [
    chain("bend", [
      [0, 0],
      [5, 1],
      [10, 0],
    ]),
    chain("middle", [
      [3, 0],
      [7, 0],
    ]),
  ];
  const result = fitCheckedCorridorChains(input, () => true, {
    maxDeviationFeet: 2,
  });
  assert.deepEqual(
    result.chains,
    input.map((item) => item.points),
  );
  assert.equal(result.statistics.retainedOriginals, 1);
});

test("restoring one original triggers a fresh final-versus-final check", () => {
  const input = [
    chain("low", [
      [0, 0],
      [5, 2],
      [10, 0],
    ]),
    chain("high", [
      [4, 2],
      [4, 4],
      [6, 4],
      [6, 2],
    ]),
    chain("vertical", [
      [5, -1],
      [5, 1],
    ]),
  ];
  const result = fitCheckedCorridorChains(input, () => true, {
    maxDeviationFeet: 3,
  });
  assert.deepEqual(
    result.chains,
    input.map((item) => item.points),
  );
  assert.equal(result.statistics.retainedOriginals, 2);
});

test("original contacts retain their separate identities without introducing a graph junction", () => {
  const allowed = [
    chain(
      "a",
      [
        [0, 0],
        [5, 0],
      ],
      "start",
      "junction",
    ),
    chain(
      "b",
      [
        [5, 0],
        [5, 5],
      ],
      "junction",
      "end",
    ),
  ];
  assert.deepEqual(
    fitCheckedCorridorChains(allowed, () => true).chains,
    allowed.map((item) => item.points),
  );
  const coincident = [{ ...allowed[0] }, { ...allowed[1], from: "unrelated" }];
  const retained = fitCheckedCorridorChains(coincident, () => true);
  assert.deepEqual(
    retained.chains,
    coincident.map((item) => item.points),
  );
  assert.equal(retained.statistics.retainedOriginalContacts, 1);
  assert.equal(coincident[1].from, "unrelated");
  assert.deepEqual(corridorChainTopologyConflicts(coincident), [0, 1]);
  const unsplit = [
    chain(
      "a",
      [
        [0, 0],
        [10, 0],
      ],
      "start",
      "junction",
    ),
    chain(
      "b",
      [
        [5, 0],
        [5, 5],
      ],
      "junction",
      "end",
    ),
  ];
  assert.deepEqual(
    fitCheckedCorridorChains(unsplit, () => true).chains,
    unsplit.map((item) => item.points),
  );
  assert.deepEqual(corridorChainTopologyConflicts(unsplit), [0, 1]);
});

test("a closed branch cycle cannot collapse into a retraced line", () => {
  const input = chain(
    "loop",
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    "junction",
    "junction",
  );
  const result = fitCheckedCorridorChains([input], () => true, {
    maxDeviationFeet: 20,
  });
  assert.deepEqual(result.chains[0], input.points);
  assert.equal(result.statistics.retainedOriginals, 1);
  const reversed = fitCheckedCorridorChains(
    [{ ...input, points: input.points.toReversed() }],
    () => true,
    { maxDeviationFeet: 20 },
  );
  assert.deepEqual(reversed.chains[0], result.chains[0]!.toReversed());
});

test("an explicit checked zero edge retains contact between its distinct auxiliary endpoints", () => {
  const input = [
    chain(
      "a",
      [
        [0, 0],
        [5, 0],
      ],
      "start",
      "one",
    ),
    chain(
      "zero",
      [
        [5, 0],
        [5, 0],
      ],
      "one",
      "two",
    ),
    chain(
      "b",
      [
        [5, 0],
        [5, 5],
      ],
      "two",
      "end",
    ),
  ];
  assert.deepEqual(
    fitCheckedCorridorChains(input, () => true).chains,
    input.map((item) => item.points),
  );
});

test("a crossing candidate without a supported original is refused conservatively", () => {
  const input = [
    chain("bend", [
      [0, 0],
      [5, 2],
      [10, 0],
    ]),
    chain("vertical", [
      [5, -1],
      [5, 1],
    ]),
  ];
  const result = fitCheckedCorridorChains(
    input,
    (points) => points.every((point) => point[1] !== 2),
    { maxDeviationFeet: 3 },
  );
  assert.equal(result.chains[0], null);
  assert.deepEqual(result.chains[1], input[1].points);
  assert.deepEqual(result.refusals, [
    { chainId: "bend", reason: "intersection-without-checked-fallback" },
  ]);
});

test("invalid parameters, duplicate chains and broken protected indices are rejected", () => {
  const input = chain("a", [
    [0, 0],
    [10, 0],
  ]);
  assert.throws(
    () =>
      fitCheckedCorridorChains([input], () => true, { maxDeviationFeet: -1 }),
    /Invalid/,
  );
  assert.throws(
    () => fitCheckedCorridorChains([input, input], () => true),
    /Duplicate/,
  );
  assert.throws(
    () =>
      fitCheckedCorridorChains(
        [{ ...input, protectedIndices: [2] }],
        () => true,
      ),
    /Invalid/,
  );
});

test("topology-only replay checks all selected approaches against the final split core", () => {
  const input = [
    chain(
      "left",
      [
        [0, 5],
        [3, 5],
      ],
      "start",
      "join-3",
    ),
    chain(
      "middle",
      [
        [3, 5],
        [5, 5],
      ],
      "join-3",
      "join-5",
    ),
    chain(
      "right",
      [
        [5, 5],
        [10, 5],
      ],
      "join-5",
      "end",
    ),
    chain(
      "approach-x",
      [
        [5, 0],
        [5, 5],
      ],
      "terminal-x",
      "join-5",
    ),
    chain(
      "approach-y",
      [
        [7, 3],
        [3, 3],
        [3, 5],
      ],
      "terminal-y",
      "join-3",
    ),
  ];
  const before = JSON.stringify(input);
  assert.deepEqual(corridorChainTopologyConflicts(input), [3, 4]);
  assert.deepEqual(corridorChainTopologyConflicts(input.slice(0, -1)), []);
  assert.equal(JSON.stringify(input), before);
});

test("an exact original crossing is retained under its original separate identities", () => {
  const input = [
    chain("horizontal", [
      [0, 0],
      [10, 0],
    ]),
    chain("vertical", [
      [5, -2],
      [5, 2],
    ]),
  ];
  const result = fitCheckedCorridorChains(input, () => true);
  assert.deepEqual(
    result.chains,
    input.map((item) => item.points),
  );
  assert.equal(result.statistics.originalContacts, 1);
  assert.equal(result.statistics.retainedOriginalContacts, 1);
  assert.equal(result.statistics.newTopologyContacts, 0);
  assert.deepEqual(result.refusals, []);
});

test("a previous contact between the same chains cannot authorize moving its actual crossing", () => {
  const input = [
    chain("bend", [
      [0, 2],
      [5, 2],
      [10, -2],
    ]),
    chain("vertical", [
      [5, -3],
      [5, 3],
    ]),
  ];
  const result = fitCheckedCorridorChains(input, () => true, {
    maxDeviationFeet: 3,
  });
  assert.deepEqual(
    result.chains,
    input.map((item) => item.points),
  );
  assert.equal(result.statistics.retainedOriginalContacts, 1);
  assert.equal(result.statistics.newTopologyContacts, 1);
  assert.deepEqual(result.refusals, [
    { chainId: "bend", reason: "intersection-retained-original" },
  ]);
});

test("a previous overlap cannot authorize a larger new overlap between the same chains", () => {
  const input = [
    chain("bend", [
      [0, 0],
      [2, 2],
      [4, 0],
      [6, 0],
      [8, 2],
      [10, 0],
    ]),
    chain("overlap", [
      [2, 0],
      [8, 0],
    ]),
  ];
  const result = fitCheckedCorridorChains(input, () => true, {
    maxDeviationFeet: 3,
  });
  assert.deepEqual(
    result.chains,
    input.map((item) => item.points),
  );
  assert.ok(result.statistics.retainedOriginalContacts > 0);
  assert.ok(result.statistics.newTopologyContacts > 0);
});
