import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { createCorridorGuideSupport } from "../../app/indoor-project/corridor-guide-support";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";

test("a terminal's own finite half cannot support the core or another terminal approach", () => {
  const data = JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  ) as IndoorDataset;
  const rect = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): [number, number][][] => [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  ];
  const face = nativeRationalOverlay("union", [rect(0, 0, 20, 10)]);
  const ownHalf = rect(3, -2, 5, 0);
  const edge = { ...data.edges[0], from: "A", to: "B", kind: "walk" as const };
  const support = createCorridorGuideSupport(
    face,
    0,
    [edge],
    (_edge, onlyNodeIds) =>
      onlyNodeIds?.has("A")
        ? [
            {
              z: 0,
              rings: ownHalf,
              exactParts: nativeRationalOverlay("union", [ownHalf]),
            },
          ]
        : [],
  );
  const approach: [number, number][] = [
    [4, -1],
    [4, 5],
  ];
  assert.equal(support.supported(approach, "A"), true);
  assert.equal(support.supported(approach, "B"), false);
  assert.equal(support.supported(approach), false);
  assert.equal(
    support.supported(
      [
        [4, -3],
        [4, 5],
      ],
      "A",
    ),
    false,
  );
  assert.equal(
    support.supported([
      [4, 5],
      [16, 5],
    ]),
    true,
  );
});
