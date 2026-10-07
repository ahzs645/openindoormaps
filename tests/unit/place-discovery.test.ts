import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlaceSearchCandidate } from "../../app/indoor-project/place-discovery";
import type { IndoorRecord } from "../../app/indoor-project/contract";

const area = (
  name: string,
  overrides: Partial<IndoorRecord> = {},
): IndoorRecord => ({
  key: "test",
  number: "05-161",
  name,
  building: "05",
  levelId: 311,
  elevationFeet: 0,
  elevationEvidence: "Native slab",
  surfaceId: "floor",
  circulation: true,
  stair: false,
  access: "unknown",
  walkable: true,
  confidence: 1,
  ringsFeet: [
    [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
    ],
  ],
  properties: {},
  ...overrides,
});

test("functional destinations remain discoverable on native circulation floors", () => {
  for (const name of [
    "Reception",
    "Library Services Desk",
    "Admin Area",
    "Waiting",
    "Coffee",
  ])
    assert.equal(isPlaceSearchCandidate(area(name), "", false), true, name);
});
test("ordinary hallways are not visitor destinations even for an explicit query", () => {
  assert.equal(isPlaceSearchCandidate(area("Corridor"), "", false), false);
  assert.equal(
    isPlaceSearchCandidate(
      area("Corridor", { stair: true }),
      "Corridor",
      false,
    ),
    false,
  );
  assert.equal(
    isPlaceSearchCandidate(area("Circulation"), "05-164", false),
    false,
  );
});
test("walking classification never exposes staff or nonwalkable places", () => {
  assert.equal(
    isPlaceSearchCandidate(
      area("Reception", { access: "staff" }),
      "05-161",
      true,
    ),
    false,
  );
  assert.equal(
    isPlaceSearchCandidate(
      area("Reception", { walkable: false }),
      "05-161",
      true,
    ),
    false,
  );
});
test("vestibule discovery continues to respect the pass-through preference", () => {
  assert.equal(
    isPlaceSearchCandidate(area("Vestibule"), "05-165", false),
    false,
  );
  assert.equal(isPlaceSearchCandidate(area("Vestibule"), "05-165", true), true);
});
