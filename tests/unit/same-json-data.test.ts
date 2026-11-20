import test from "node:test";
import assert from "node:assert/strict";
import { sameJsonData } from "../../app/indoor-project/same-json-data";

test("source comparison retains exact native JSON equality for plain data", () => {
  const sparse = Array.from({ length: 2 });
  sparse[1] = 3;
  const values: unknown[] = [
    null,
    undefined,
    true,
    false,
    0,
    -0,
    1,
    Number.NaN,
    Infinity,
    -Infinity,
    "",
    "0",
    'native "source"\\\n\uD800',
    "\uD83C\uDFEB",
    [],
    [null],
    [undefined],
    [Number.NaN],
    sparse,
    [null, 3],
    {},
    { omitted: undefined },
    { a: 1, b: 2 },
    { b: 2, a: 1 },
    { a: 1, omitted: undefined, b: 2 },
    { a: [1, null, 3], b: { native: "original" } },
    { a: [1, undefined, 3], b: { native: "original" } },
    { "10": "ten", "2": "two", name: "source" },
    Object.assign(Object.create(null), { a: 1, b: 2 }),
    { ignored: Symbol("source"), alsoIgnored: () => 1 },
    [Symbol("source"), () => 1],
  ];
  for (const left of values)
    for (const right of values)
      assert.equal(
        sameJsonData(left, right),
        JSON.stringify(left) === JSON.stringify(right),
        `${JSON.stringify(left)} versus ${JSON.stringify(right)}`,
      );
});

test("exotic values retain native toJSON keys, boxed values and accessor serialization", () => {
  const custom = {
    toJSON(key: string) {
      return { calledFor: key };
    },
  };
  const callable = Object.assign(() => {}, {
    toJSON(key: string) {
      return { calledFor: key };
    },
  });
  const samples: [unknown, unknown][] = [
    [{ native: custom }, { native: { calledFor: "native" } }],
    [[custom], [{ calledFor: "0" }]],
    [{ native: callable }, { native: { calledFor: "native" } }],
    [[callable], [{ calledFor: "0" }]],
    [callable, { calledFor: "" }],
    [
      {
        x: {
          toJSON() {
            return;
          },
        },
      },
      {},
    ],
    [new Date("2026-11-20T00:00:00.000Z"), "2026-11-20T00:00:00.000Z"],
    [new Object(4), 4],
    [new Object("native"), "native"],
    [new Object(false), false],
    [
      {
        get source() {
          return { exact: 0.123_456_789_012_345 };
        },
      },
      { source: { exact: 0.123_456_789_012_345 } },
    ],
  ];
  for (const [left, right] of samples) {
    assert.equal(sameJsonData(left, right), true);
    assert.equal(sameJsonData(right, left), true);
  }
  const cycle: { source?: unknown } = {};
  cycle.source = cycle;
  assert.throws(() => sameJsonData(cycle, cycle), TypeError);
  assert.throws(() => sameJsonData({ value: 1n }, { value: 1n }), TypeError);
});

test("large native arrays compare without a whole-source JSON string and reject a late mutation", () => {
  const left = {
    source: "complete native data",
    levels: [
      { partsFeet: Array.from({ length: 50_000 }, (_, i) => [i / 7, i / 11]) },
    ],
    reviews: { first: "retained", second: "retained" },
  };
  const right = structuredClone(left);
  const stringify = JSON.stringify;
  JSON.stringify = ((value: unknown, ...args: unknown[]) => {
    assert.ok(
      !value || typeof value !== "object",
      "plain source comparison must not serialize a container",
    );
    return (stringify as (...parameters: unknown[]) => string | undefined)(
      value,
      ...args,
    );
  }) as typeof JSON.stringify;
  try {
    assert.equal(sameJsonData(left, right), true);
    right.levels[0].partsFeet.at(-1)![1] += 0.000_01;
    assert.equal(sameJsonData(left, right), false);
    right.levels[0].partsFeet.at(-1)![1] = left.levels[0].partsFeet.at(-1)![1];
    right.reviews = { second: "retained", first: "retained" };
    assert.equal(sameJsonData(left, right), false);
  } finally {
    JSON.stringify = stringify;
  }
});
