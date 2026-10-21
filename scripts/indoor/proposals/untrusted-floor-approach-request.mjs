// Request generation only. Every returned position/whole walking footprint must
// be independently exact-replayed against original source; no support authority.
const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const on = (p, a, b) =>
  cross(a, b, p) === 0 &&
  p[0] >= Math.min(a[0], b[0]) &&
  p[0] <= Math.max(a[0], b[0]) &&
  p[1] >= Math.min(a[1], b[1]) &&
  p[1] <= Math.max(a[1], b[1]);
const touch = (a, b, c, d) => {
  const u = cross(a, b, c),
    v = cross(a, b, d),
    w = cross(c, d, a),
    z = cross(c, d, b);
  return (
    (u < 0 !== v < 0 &&
      w < 0 !== z < 0 &&
      u !== 0 &&
      v !== 0 &&
      w !== 0 &&
      z !== 0) ||
    on(a, c, d) ||
    on(b, c, d) ||
    on(c, a, b) ||
    on(d, a, b)
  );
};
const edges = (r) => r.map((p, i) => [p, r[(i + 1) % r.length]]);
const winding = (p, r) => {
  let w = 0;
  for (const [a, b] of edges(r)) {
    if (on(p, a, b)) return NaN;
    if (a[1] <= p[1] && b[1] > p[1] && cross(a, b, p) > 0) w++;
    if (a[1] > p[1] && b[1] <= p[1] && cross(a, b, p) < 0) w--;
  }
  return w;
};
const inPart = (p, part) =>
  winding(p, part[0]) !== 0 && part.slice(1).every((r) => winding(p, r) === 0);
const hull = (points) => {
  const a = [...new Map(points.map((p) => [p.join(":"), p])).values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  );
  const half = (q) => {
    const h = [];
    for (const p of q) {
      while (h.length > 1 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop();
      h.push(p);
    }
    return h;
  };
  return [...half(a).slice(0, -1), ...half([...a].reverse()).slice(0, -1)];
};
const square = (p) => [
  [p[0] - 1, p[1] - 1],
  [p[0] + 1, p[1] - 1],
  [p[0] + 1, p[1] + 1],
  [p[0] - 1, p[1] + 1],
];
const strip = (a, b) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    s = Math.max(Math.abs(dx), Math.abs(dy));
  return [
    [a[0] - dy / s, a[1] + dx / s],
    [a[0] + dy / s, a[1] - dx / s],
    [b[0] + dy / s, b[1] - dx / s],
    [b[0] - dy / s, b[1] + dx / s],
  ];
};
const box = (r) => [
  Math.min(...r.map((p) => p[0])),
  Math.min(...r.map((p) => p[1])),
  Math.max(...r.map((p) => p[0])),
  Math.max(...r.map((p) => p[1])),
];
const overlap = (a, b) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
export function proposeUntrustedFloorDetour({
  referenceRings,
  boundaryParts,
  closedSegments,
  from,
  to,
  lateralDirection,
  marginFeet = 12,
  gridFeet = 0.5,
  maxNodes = 50000,
}) {
  if (
    !Number.isFinite(gridFeet) ||
    gridFeet <= 0 ||
    gridFeet > 4 ||
    !Number.isFinite(marginFeet) ||
    marginFeet < 0 ||
    marginFeet > 128 ||
    !Number.isSafeInteger(maxNodes) ||
    maxNodes < 1 ||
    maxNodes > 100000 ||
    ![from, to, lateralDirection].every(
      (p) => Array.isArray(p) && p.length === 2,
    ) ||
    ![...from, ...to, ...lateralDirection].every(Number.isFinite) ||
    !lateralDirection.some((x) => x !== 0)
  )
    throw Error("Invalid untrusted floor request");
  const parts = boundaryParts.map((p) => ({ rings: p, bounds: box(p.flat()) })),
    segments = closedSegments.map((r) => ({ line: r, bounds: box(r) }));
  const clear = (ring) => {
    const bounds = box(ring),
      e = edges(ring);
    if (
      Math.abs(winding(ring[0], referenceRings[0])) !== 1 ||
      !referenceRings.slice(1).every((r) => winding(ring[0], r) === 0)
    )
      return false;
    for (const { rings, bounds: b } of parts) {
      if (!overlap(bounds, b)) continue;
      if (
        rings.some((r) =>
          edges(r).some(([a, b]) => e.some(([c, d]) => touch(a, b, c, d))),
        ) ||
        ring.some((p) => inPart(p, rings)) ||
        rings[0].some((p) => winding(p, ring) !== 0)
      )
        return false;
    }
    for (const { line, bounds: b } of segments) {
      if (!overlap(bounds, b)) continue;
      if (
        line.some((p) => winding(p, ring) !== 0) ||
        line
          .slice(1)
          .some((p, i) => e.some(([a, b]) => touch(a, b, line[i], p)))
      )
        return false;
    }
    return true;
  };
  const scale = Math.max(...lateralDirection.map(Math.abs)),
    lat = [
      to.map((v, i) => v - lateralDirection[i] / scale),
      to.map((v, i) => v + lateralDirection[i] / scale),
    ];
  const transfer = (a, b, final = false) =>
    clear(hull([...square(a), ...strip(a, b), ...(final ? lat : square(b))]));
  if (!clear(square(from)))
    return {
      found: false,
      reason: "original-start-square-fails-request-mask",
      sourceAuthorityGranted: false,
    };
  if (transfer(from, to, true))
    return { found: true, path: [from, to], sourceAuthorityGranted: false };
  const min = [
      Math.min(from[0], to[0]) - marginFeet,
      Math.min(from[1], to[1]) - marginFeet,
    ],
    max = [
      Math.max(from[0], to[0]) + marginFeet,
      Math.max(from[1], to[1]) + marginFeet,
    ],
    valid = new Map(),
    open = [{ p: from, k: "0:0", g: 0, f: 0 }],
    dist = new Map([["0:0", 0]]),
    prior = new Map(),
    points = new Map([["0:0", from]]);
  let visited = 0,
    goal;
  const good = (p, k) => {
    if (!valid.has(k)) valid.set(k, clear(square(p)));
    return valid.get(k);
  };
  while (open.length && visited < maxNodes) {
    open.sort((a, b) => b.f - a.f);
    const c = open.pop();
    if (c.g !== dist.get(c.k)) continue;
    visited++;
    if (
      Math.max(Math.abs(c.p[0] - to[0]), Math.abs(c.p[1] - to[1])) <=
        gridFeet * 3 &&
      transfer(c.p, to, true)
    ) {
      goal = c;
      break;
    }
    const ij = c.k.split(":").map(Number);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const ni = ij[0] + dx,
        nj = ij[1] + dy,
        k = `${ni}:${nj}`,
        p = [from[0] + ni * gridFeet, from[1] + nj * gridFeet];
      if (
        p.some((v, i) => v < min[i] || v > max[i]) ||
        !good(p, k) ||
        !transfer(c.p, p)
      )
        continue;
      const g = c.g + gridFeet * Math.hypot(dx, dy);
      if (g >= (dist.get(k) ?? Infinity)) continue;
      dist.set(k, g);
      prior.set(k, c.k);
      points.set(k, p);
      open.push({ p, k, g, f: g + Math.hypot(p[0] - to[0], p[1] - to[1]) });
    }
  }
  if (!goal)
    return {
      found: false,
      reason: "bounded-untrusted-search-exhausted",
      visited,
      sourceAuthorityGranted: false,
    };
  const path = [to];
  for (let k = goal.k; k !== undefined; k = prior.get(k))
    path.push(points.get(k));
  path.reverse();
  const compact = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !transfer(path[i], path[j], j === path.length - 1)) j--;
    compact.push(path[j]);
    i = j;
  }
  return {
    found: true,
    path: compact,
    visited,
    sourceAuthorityGranted: false,
    physicalBodyOrRouteApproved: false,
  };
}
