import test from "node:test";
import assert from "node:assert/strict";
import { matchingDoorSeams } from "../../app/indoor-project/native-door-seams";
type P = [number, number];
const jamb: P[] = [
  [0, 0],
  [5, 0],
  [5, 1],
  [0, 1],
];
const edge = (start: number, end: number, y: number): P[][] => [
  [
    [start, y],
    [end, y],
    [end, y + 2],
    [start, y + 2],
  ],
];
test("matches the complete measured jamb in either orientation", () => {
  for (const ring of [edge(0, 5, 2.8e-11), edge(5, 0, 2.8e-11)])
    assert.equal(matchingDoorSeams(jamb, [ring]).length, 1);
});
test("leaves physical gaps, unmatched ends and slab holes intact", () => {
  for (const rings of [
    edge(0, 5, 0.001),
    edge(0, 4.5, 2.8e-11),
    edge(0, 5, 0),
    [...edge(-2, 8, -3), ...edge(0, 5, 2.8e-11)],
  ])
    assert.deepEqual(matchingDoorSeams(jamb, [rings]), []);
});
