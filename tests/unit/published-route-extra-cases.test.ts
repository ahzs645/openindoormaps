import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseExtraRouteCases,
  routeCaseCalculatorOptions,
} from "../../scripts/indoor/published-route-extra-cases";

const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
const base = { name: "a", start: "rm-1", end: "rm-2", mode: "public" };

test("legacy extra route cases parse and record exactly as before", () => {
  const raw = readFileSync(
    new URL(
      "../../docs/continuation/unbc-20261102/visitor/EXTRA-CASES.json",
      import.meta.url,
    ),
  );
  const cases = parseExtraRouteCases(raw);
  // route-cases.json is JSON.stringify of these objects: no field is added.
  assert.equal(
    JSON.stringify(cases, null, 2),
    JSON.stringify(JSON.parse(raw.toString()), null, 2),
  );
  for (const c of cases) assert.equal(routeCaseCalculatorOptions(c), undefined);
});

test("explicit visitor options are accepted, recorded and passed through", () => {
  const options = { endpointMode: "inside", allowOtherRoomTransit: false };
  const [c] = parseExtraRouteCases(
    bytes([{ ...base, mode: "accessible", options }]),
  );
  assert.deepEqual(c.options, options);
  assert.deepEqual(routeCaseCalculatorOptions(c!), options);
  assert.equal(
    JSON.stringify(c),
    JSON.stringify({ ...base, mode: "accessible", options }),
  );
  const [h] = parseExtraRouteCases(
    bytes([
      {
        ...base,
        options: { endpointMode: "hallway", allowOtherRoomTransit: true },
      },
    ]),
  );
  assert.deepEqual(routeCaseCalculatorOptions(h!), {
    endpointMode: "hallway",
    allowOtherRoomTransit: true,
  });
});

test("explicit options must be complete and valid", () => {
  for (const options of [
    {},
    { endpointMode: "inside" },
    { allowOtherRoomTransit: false },
    { endpointMode: "door", allowOtherRoomTransit: false },
    { endpointMode: "inside", allowOtherRoomTransit: "no" },
    {
      endpointMode: "inside",
      allowOtherRoomTransit: false,
      preferHallways: false,
    },
    null,
    [],
  ])
    assert.throws(() => parseExtraRouteCases(bytes([{ ...base, options }])));
  assert.throws(() =>
    parseExtraRouteCases(bytes([{ ...base, endpointMode: "inside" }])),
  );
});
