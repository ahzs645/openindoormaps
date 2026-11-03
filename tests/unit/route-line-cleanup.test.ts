import assert from "node:assert/strict";
import test from "node:test";
import { cleanRouteLine } from "../../app/indoor-project/route-line-cleanup";

type XY = [number, number];
const always = () => true;
const length = (points: XY[]) =>
  points
    .slice(1)
    .reduce(
      (s, p, i) => s + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
      0,
    );

test("a near out-and-back hook is replaced by its supported shortcut", () => {
  // Trunk east, a 1 m V into an intermediate side-door anchor, trunk again.
  const line: XY[] = [
    [0, 0],
    [10, 0],
    [10.2, 1],
    [10.5, 0],
    [20, 0],
  ];
  const result = cleanRouteLine(line, {
    metresPerFoot: 1,
    shortcutSupported: always,
  });
  assert.deepEqual(result.points, [
    [0, 0],
    [10, 0],
    [10.5, 0],
    [20, 0],
  ]);
  assert.equal(result.hooks, 1);
  assert.ok(length(result.points) < length(line));
});

test("a hook stays when its shortcut is not physically supported", () => {
  const line: XY[] = [
    [0, 0],
    [10, 0],
    [10.2, 1],
    [10.5, 0],
    [20, 0],
  ];
  const checked: [XY, XY][] = [];
  const result = cleanRouteLine(line, {
    metresPerFoot: 1,
    shortcutSupported: (a, b) => {
      checked.push([a, b]);
      return false;
    },
  });
  assert.deepEqual(result.points, line);
  assert.equal(result.hooks, 0);
  // Every proposed shortcut went through the support predicate.
  assert.ok(checked.length > 0);
  assert.deepEqual(checked[0], [
    [10, 0],
    [10.5, 0],
  ]);
});

test("a supported shortcut over a wider window is used when the nearest fails", () => {
  const line: XY[] = [
    [0, 0],
    [10, 0],
    [10.2, 1],
    [10.5, 0],
    [20, 0],
  ];
  const result = cleanRouteLine(line, {
    metresPerFoot: 1,
    // Only the shortcut that skips the trunk vertex at x = 10 is supported.
    shortcutSupported: (a, b) => a[0] === 0 && b[0] === 10.5,
  });
  assert.deepEqual(result.points, [
    [0, 0],
    [10.5, 0],
    [20, 0],
  ]);
});

test("protected anchors (door crossings, stops) are never removed or bypassed", () => {
  const line: XY[] = [
    [0, 0],
    [10, 0],
    [10.2, 1],
    [10.5, 0],
    [20, 0],
  ];
  const result = cleanRouteLine(line, {
    metresPerFoot: 1,
    protectedIndex: (i) => i === 2,
    shortcutSupported: always,
  });
  assert.deepEqual(result.points, line);
  // Protected vertices may end a shortcut, but no wider window may bypass
  // them: with the [10, 0] to [10.5, 0] chord unsupported the hook stays.
  const second = cleanRouteLine(line, {
    metresPerFoot: 1,
    protectedIndex: (i) => i === 1 || i === 3,
    shortcutSupported: (a, b) => !(a[0] === 10 && b[0] === 10.5),
  });
  assert.deepEqual(second.points, line);
  const third = cleanRouteLine(line, {
    metresPerFoot: 1,
    protectedIndex: (i) => i === 1 || i === 3,
    shortcutSupported: always,
  });
  assert.equal(third.points.length, 4);
});

test("an excursion that the caller's policy rejects stays", () => {
  const line: XY[] = [
    [0, 0],
    [10, 0],
    [10.2, 1],
    [10.5, 0],
    [20, 0],
  ];
  const result = cleanRouteLine(line, {
    metresPerFoot: 1,
    shortcutSupported: always,
    excursionAllowed: () => false,
  });
  assert.deepEqual(result.points, line);
});

test("tiny zigzags go, real corners and long excursions stay", () => {
  const jog: XY[] = [
    [0, 0],
    [10, 0],
    [10.3, 0.3],
    [10.6, 0],
    [20, 0],
  ];
  const cleaned = cleanRouteLine(jog, {
    metresPerFoot: 1,
    shortcutSupported: always,
  });
  assert.deepEqual(cleaned.points, [
    [0, 0],
    [10, 0],
    [10.6, 0],
    [20, 0],
  ]);
  const sideways: XY[] = [
    [0, 0],
    [10, 0],
    [10.5, 0.5],
    [20, 0.5],
  ];
  // Opposite 45 degree bends joined by a 0.7 m leg: a sideways jog.
  assert.deepEqual(
    cleanRouteLine(sideways, { metresPerFoot: 1, shortcutSupported: always })
      .points,
    [
      [0, 0],
      [10, 0],
      [20, 0.5],
    ],
  );
  const corner: XY[] = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];
  assert.deepEqual(
    cleanRouteLine(corner, { metresPerFoot: 1, shortcutSupported: always })
      .points,
    corner,
  );
  // A real out-and-back of 5 m (beyond the 2 m hook rule) is not a hook.
  const spur: XY[] = [
    [0, 0],
    [10, 0],
    [10, 5],
    [10.5, 0],
    [20, 0],
  ];
  assert.deepEqual(
    cleanRouteLine(spur, { metresPerFoot: 1, shortcutSupported: always })
      .points,
    spur,
  );
});

test("metres per foot scales the rules; endpoints always stay", () => {
  // In feet: a 3 ft (0.91 m) hook is a hook; a 9 ft (2.7 m) one is not.
  const hook = (size: number): XY[] => [
    [0, 0],
    [30, 0],
    [30.5, size],
    [31, 0],
    [60, 0],
  ];
  const opts = { metresPerFoot: 0.3048, shortcutSupported: always };
  assert.equal(cleanRouteLine(hook(3), opts).points.length, 4);
  assert.equal(cleanRouteLine(hook(9), opts).points.length, 5);
  const end: XY[] = [
    [0, 0],
    [10, 0],
    [9.5, 0.2],
  ];
  // The overshoot before the end goes; both endpoints stay exactly.
  assert.deepEqual(cleanRouteLine(end, opts).points, [end[0], end[2]]);
});

test("the cleaned line does not depend on travel direction", () => {
  const line: XY[] = [
    [0, 0],
    [10, 0],
    [11, 0.2],
    [10.5, 0],
    [20, 0],
    [20.3, 0.3],
    [20.6, 0],
    [30, 0],
  ];
  const options = { metresPerFoot: 1, shortcutSupported: always };
  const forward = cleanRouteLine(line, options).points;
  const backward = cleanRouteLine(line.toReversed(), options).points;
  assert.deepEqual(backward, forward.toReversed());
  // The hook's tip goes, not the trunk vertex beside it.
  assert.ok(forward.some((p) => p[0] === 10.5 && p[1] === 0));
  assert.ok(!forward.some((p) => p[0] === 11));
});

test("a zigzag bump goes only while it stays within 0.6 m of the shortcut", () => {
  const bump = (offset: number): XY[] => [
    [0, 0],
    [10, 0],
    [10.9, offset],
    [11.8, 0],
    [20, 0],
  ];
  const options = { metresPerFoot: 1, shortcutSupported: always };
  assert.deepEqual(cleanRouteLine(bump(0.4), options).points, [
    [0, 0],
    [10, 0],
    [11.8, 0],
    [20, 0],
  ]);
  assert.deepEqual(cleanRouteLine(bump(0.9), options).points, bump(0.9));
});
