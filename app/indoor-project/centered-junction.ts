type XY = [number, number];
const length = (points: XY[]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
      0,
    );
const interpolate = (a: XY, b: XY, t: number): XY => [
  a[0] + t * (b[0] - a[0]),
  a[1] + t * (b[1] - a[1]),
];

/** A shortest native-axis join can put an obtuse elbow at the outside of a
 * junction. Recover a stable centre lane in the approaching corridor instead
 * of beveling the rendered line. Fixed anchors and exact clearance still apply. */
export function centeredJunctions(
  points: XY[],
  directions: XY[],
  crossSection: (point: XY, normal: XY) => { point: XY; width: number } | null,
  supported: (a: XY, b: XY) => boolean,
): XY[] {
  const result = [...points];
  for (let i = 1; i < result.length - 1; i++) {
    const reversed =
      length([result[i - 1], result[i]]) > length([result[i], result[i + 1]]);
    const a = result[reversed ? i + 1 : i - 1],
      b = result[i],
      c = result[reversed ? i - 1 : i + 1];
    const incomingLength = length([a, b]),
      outgoingLength = length([b, c]);
    if (incomingLength < 6 || outgoingLength < 6) continue;
    const incoming: XY = [
      (b[0] - a[0]) / incomingLength,
      (b[1] - a[1]) / incomingLength,
    ];
    const outgoing: XY = [
      (c[0] - b[0]) / outgoingLength,
      (c[1] - b[1]) / outgoingLength,
    ];
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(1, incoming[0] * outgoing[0] + incoming[1] * outgoing[1]),
      ),
    );
    if (
      angle < (100 * Math.PI) / 180 ||
      angle > (165 * Math.PI) / 180 ||
      !directions.some(
        (d) =>
          Math.abs(d[0] * outgoing[0] + d[1] * outgoing[1]) >
          Math.cos(Math.PI / 180),
      )
    )
      continue;
    const offsets: {
      value: number;
      width: number;
      samples: number;
      first: number;
      last: number;
    }[] = [];
    const limit = Math.min(32, incomingLength - 1);
    for (let distance = 2; distance <= limit; distance++) {
      const p = interpolate(b, a, distance / incomingLength);
      const section = crossSection(p, outgoing);
      if (!section || section.width < 3 || section.width > 24) continue;
      const value =
        section.point[0] * outgoing[0] + section.point[1] * outgoing[1];
      const group = offsets.find(
        (o) =>
          Math.abs(o.value - value) <= 0.25 &&
          Math.abs(o.width - section.width) <= o.width * 0.2 &&
          distance - o.last <= 1.01,
      );
      if (group) {
        group.value =
          (group.value * group.samples + value) / (group.samples + 1);
        group.width =
          (group.width * group.samples + section.width) / (group.samples + 1);
        group.samples++;
        group.last = distance;
      } else
        offsets.push({
          value,
          width: section.width,
          samples: 1,
          first: distance,
          last: distance,
        });
    }
    const alternatives: { points: XY[]; error: number; distance: number }[] =
      [];
    for (const lane of offsets.filter(
      (o) => o.samples >= 3 && o.last - o.first >= 2,
    )) {
      const projection = (p: XY) => p[0] * outgoing[0] + p[1] * outgoing[1];
      const t = (lane.value - projection(a)) / (projection(b) - projection(a));
      if (t <= 0.05 || t >= 0.95) continue;
      const entry = interpolate(a, b, t);
      const along = (lane.value - projection(b)) / outgoingLength;
      if (along <= 0.01 || along >= 0.95) continue;
      const elbow = interpolate(b, c, along);
      const replacement = [a, entry, elbow, c];
      if (
        length([entry, elbow]) < 2 ||
        length(replacement) > incomingLength + outgoingLength + 1e-6 ||
        !replacement.slice(1).every((p, j) => supported(replacement[j], p))
      )
        continue;
      // Measure the actual corridor sections along this proposed lane. Junction
      // openings and broad plazas do not define a narrow corridor centre.
      let error = 0,
        count = 0;
      for (let j = 1; j <= 7; j++) {
        const p = interpolate(entry, elbow, j / 8),
          section = crossSection(p, outgoing);
        if (!section || section.width < 3 || section.width > 24) continue;
        error +=
          Math.hypot(p[0] - section.point[0], p[1] - section.point[1]) /
          section.width;
        count++;
      }
      if (count >= 3)
        alternatives.push({
          points: replacement,
          error: error / count,
          distance: length(replacement),
        });
    }
    alternatives.sort((a, b) => a.error - b.error || a.distance - b.distance);
    if (alternatives.length > 0) {
      result.splice(
        i,
        1,
        ...(reversed
          ? alternatives[0].points.slice(1, -1).reverse()
          : alternatives[0].points.slice(1, -1)),
      );
      i++;
    }
  }
  return result;
}
