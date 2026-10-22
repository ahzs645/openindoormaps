import test from "node:test";
import assert from "node:assert/strict";
import { chooseCorridorTerminalAttachments } from "../../app/indoor-project/corridor-terminal-attachments";

test("a complete original component chooses a common checked lane beyond nearby isolated fragments", () => {
  const candidates = new Map(
    Array.from(
      { length: 12 },
      (_, i) =>
        [
          `terminal-${i.toString().padStart(2, "0")}`,
          [
            { component: i, distance: 0.2, preferred: true },
            { component: 100, distance: 2 + i / 10 },
          ],
        ] as const,
    ),
  );
  const ids = [...candidates.keys()];
  const requirements = ids.slice(1).map((to) => ({ from: ids[0], to }));
  const before = JSON.stringify([...candidates]);
  const selected = chooseCorridorTerminalAttachments(candidates, requirements);
  assert.equal(selected.size, 12);
  assert.ok([...selected.values()].every((join) => join.component === 100));
  assert.equal(JSON.stringify([...candidates]), before);
  assert.deepEqual(
    [
      ...chooseCorridorTerminalAttachments(
        new Map([...candidates].reverse()),
        requirements
          .toReversed()
          .map(({ from, to }) => ({ from: to, to: from })),
      ),
    ],
    [...selected],
  );
});

test("separate source components retain their own checked lanes instead of choosing the largest fragment", () => {
  const candidates = new Map([
    [
      "a",
      [
        { component: 1, distance: 1 },
        { component: 9, distance: 9 },
      ],
    ],
    [
      "b",
      [
        { component: 1, distance: 1 },
        { component: 9, distance: 9 },
      ],
    ],
    [
      "c",
      [
        { component: 2, distance: 1 },
        { component: 9, distance: 9 },
      ],
    ],
    [
      "d",
      [
        { component: 2, distance: 1 },
        { component: 9, distance: 9 },
      ],
    ],
  ]);
  const selected = chooseCorridorTerminalAttachments(candidates, [
    { from: "a", to: "b" },
    { from: "c", to: "d" },
  ]);
  assert.deepEqual(
    [...selected.values()].map((join) => join.component),
    [1, 1, 2, 2],
  );
});

test("incomplete alternatives cannot sacrifice an already checked source requirement", () => {
  const candidates = new Map([
    ["a", [{ component: 0, distance: 1 }]],
    [
      "b",
      [
        { component: 0, distance: 1, preferred: true },
        { component: 1, distance: 0.5 },
      ],
    ],
    ["c", [{ component: 1, distance: 1 }]],
    ["missing", []],
  ]);
  const selected = chooseCorridorTerminalAttachments(candidates, [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "missing" },
  ]);
  assert.equal(selected.get("a")!.component, selected.get("b")!.component);
  assert.notEqual(selected.get("b")!.component, selected.get("c")!.component);
  assert.equal(selected.has("missing"), false);
});

test("a shorter approach in the same component does not move an already checked join", () => {
  const oldJoin = { component: 1, distance: 2, preferred: true };
  const candidates = new Map([
    ["a", [{ component: 1, distance: 1 }, oldJoin]],
    ["b", [{ component: 1, distance: 1, preferred: true }]],
  ]);
  const selected = chooseCorridorTerminalAttachments(candidates, [
    { from: "a", to: "b" },
  ]);
  assert.equal(selected.get("a"), oldJoin);
});
