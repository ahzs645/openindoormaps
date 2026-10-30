import assert from "node:assert/strict";
import test from "node:test";
import { progressiveRouteOptions } from "../../app/indoor-project/progressive-route-options";

test("visitor requests default to inside arrival and hallway-only transit", () => {
  assert.deepEqual(progressiveRouteOptions(), {
    endpointMode: "inside",
    allowOtherRoomTransit: false,
  });
});

test("both arrival modes and explicit room-transit choices are copied", () => {
  for (const endpointMode of ["inside", "hallway"] as const)
    for (const allowOtherRoomTransit of [false, true]) {
      const input = { endpointMode, allowOtherRoomTransit };
      const output = progressiveRouteOptions(input);
      assert.deepEqual(output, input);
      assert.notEqual(output, input);
      input.allowOtherRoomTransit = !allowOtherRoomTransit;
      assert.equal(output.allowOtherRoomTransit, allowOtherRoomTransit);
    }
});

test("invalid shapes and ambiguous preference types refuse instead of coercing", () => {
  for (const value of [
    null,
    [],
    "hallway",
    true,
    { endpointMode: "outside" },
    { endpointMode: null },
    { allowOtherRoomTransit: "false" },
    { allowOtherRoomTransit: 1 },
    { allowOtherRoomTransit: null },
  ])
    assert.throws(() => progressiveRouteOptions(value));
});

test("visitor preferences cannot carry source overrides or compiler options", () => {
  for (const value of [
    { access: "public" },
    { mode: "staff" },
    { dataset: {} },
    { policy: {} },
    { excludedNativeStairIds: [123] },
    { useSharedCorridorGuides: false },
    { preferHallways: false },
  ])
    assert.throws(() => progressiveRouteOptions(value), /visitor routing/);
});
