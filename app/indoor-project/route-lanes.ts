import * as DMath from "./deterministic-math";
type XY = [number, number];

/** Search sparse corridor lanes, with direction in the state so short grid
 * stair-steps cost more than a continuous leg. Every link needs native clearance. */
export function routeLanes(
  xs: number[],
  ys: number[],
  start: XY,
  end: XY,
  valid: (a: XY, b: XY) => boolean,
  budget: number,
): XY[] | null {
  const nx = xs.length,
    ny = ys.length;
  if (nx * ny > 2500) return null;
  const points = ys.flatMap((y) => xs.map((x): XY => [x, y]));
  const allowed = points.map((p) => valid(p, p));
  const startIndex = points.findIndex(
      (p) => p[0] === start[0] && p[1] === start[1],
    ),
    endIndex = points.findIndex((p) => p[0] === end[0] && p[1] === end[1]);
  if (
    startIndex === -1 ||
    endIndex === -1 ||
    !allowed[startIndex] ||
    !allowed[endIndex]
  )
    return null;
  const links: { to: number; axis: number; length: number }[][] = points.map(
    () => [],
  );
  const connect = (a: number, b: number, axis: number) => {
    if (!valid(points[a], points[b])) return;
    const length = DMath.hypot(
      points[a][0] - points[b][0],
      points[a][1] - points[b][1],
    );
    links[a].push({ to: b, axis, length });
    links[b].push({ to: a, axis, length });
  };
  for (let row = 0; row < ny; row++) {
    let previous = -1;
    for (let col = 0; col < nx; col++) {
      const i = row * nx + col;
      if (!allowed[i]) continue;
      if (previous >= 0) connect(previous, i, 0);
      previous = i;
    }
  }
  for (let col = 0; col < nx; col++) {
    let previous = -1;
    for (let row = 0; row < ny; row++) {
      const i = row * nx + col;
      if (!allowed[i]) continue;
      if (previous >= 0) connect(previous, i, 1);
      previous = i;
    }
  }
  // Prefer the fewest turns inside the accepted walking-distance budget. Keep
  // both a shorter approach and a straighter approach to the same lane state:
  // discarding the shorter one can incorrectly exhaust the remaining budget.
  type Label = {
    state: number;
    turns: number;
    length: number;
    previous: Label | null;
    active: boolean;
  };
  const labels: Label[][] = points.flatMap(() => [[], []]);
  const heap: Label[] = [];
  const compare = (a: Label, b: Label) =>
    a.turns - b.turns || a.length - b.length;
  const push = (label: Label) => {
    heap.push(label);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compare(heap[parent], label) <= 0) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = (): Label => {
    const first = heap[0],
      last = heap.pop();
    if (heap.length > 0 && last) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let next = i;
        const left = i * 2 + 1,
          right = left + 1;
        if (left < heap.length && compare(heap[left], heap[next]) < 0)
          next = left;
        if (right < heap.length && compare(heap[right], heap[next]) < 0)
          next = right;
        if (next === i) break;
        [heap[i], heap[next]] = [heap[next], heap[i]];
        i = next;
      }
    }
    return first;
  };
  const insert = (label: Label) => {
    const frontier = labels[label.state];
    if (
      frontier.some(
        (previous) =>
          previous.turns <= label.turns &&
          previous.length <= label.length + 1e-8,
      )
    )
      return;
    for (let i = frontier.length - 1; i >= 0; i--)
      if (
        label.turns <= frontier[i].turns &&
        label.length <= frontier[i].length + 1e-8
      ) {
        frontier[i].active = false;
        frontier.splice(i, 1);
      }
    frontier.push(label);
    push(label);
  };
  for (const axis of [0, 1])
    insert({
      state: startIndex * 2 + axis,
      turns: 0,
      length: 0,
      previous: null,
      active: true,
    });
  let target: Label | null = null;
  // Pathological source geometry retains its source route instead of blocking
  // interaction indefinitely. This limit is well above normal sparse lanes.
  let expanded = 0;
  while (heap.length > 0 && expanded++ < 100_000) {
    const current = pop();
    if (!current.active) continue;
    const index = current.state >> 1,
      axis = current.state % 2;
    if (index === endIndex) {
      target = current;
      break;
    }
    for (const link of links[index]) {
      const walking = current.length + link.length;
      if (walking <= budget + 1e-8)
        insert({
          state: link.to * 2 + link.axis,
          turns: current.turns + (axis === link.axis ? 0 : 1),
          length: walking,
          previous: current,
          active: true,
        });
    }
  }
  if (!target) return null;
  const path: XY[] = [];
  for (let label: Label | null = target; label; label = label.previous)
    path.push(points[label.state >> 1]);
  path.reverse();
  return path.filter((p, i) => {
    if (!i || i === path.length - 1) return true;
    const a = path[i - 1],
      b = path[i + 1];
    return (
      Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) >
      1e-8
    );
  });
}
