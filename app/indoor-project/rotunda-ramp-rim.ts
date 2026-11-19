import { hypot } from "./deterministic-math";
import type { IndoorDataset, IndoorEdge } from "./contract";

type XY = [number, number];

/** Propose an inward hallway direction from the original slab edge shared
 * with this native ramp's triangle cap. The caller must still check the full
 * proposed walking strip, eligible edge and hallway station in both directions. */
export function rotundaRampRimNormal(
  data: IndoorDataset,
  ramp: IndoorEdge,
  side: "upper" | "lower",
): XY | undefined {
  const source = data.source.modelSha256,
    id = ramp.nativeElementId;
  if (
    source !==
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" ||
    data.walkingSupport?.sourceModelSha256 !== source ||
    data.rampDisplay?.sourceModelSha256 !== source ||
    ![1586431, 1587605].includes(id ?? 0) ||
    !ramp.enabled ||
    ramp.kind !== "ramp" ||
    ramp.id !== "ramp:" + id ||
    ramp.from !== ramp.id + ":lower" ||
    ramp.to !== ramp.id + ":upper" ||
    ramp.pointsFeet.length < 2
  )
    return;
  const mesh = data.rampDisplay.ramps.find(
    (v) => v.nativeElementId === id && v.edgeId === ramp.id,
  );
  const upper = side === "upper",
    p = upper ? ramp.pointsFeet.at(-1)! : ramp.pointsFeet[0]!,
    previous = upper ? ramp.pointsFeet.at(-2)! : ramp.pointsFeet[1]!;
  const node = data.nodes.find((n) => n.id === (upper ? ramp.to : ramp.from));
  if (
    !mesh?.trianglesFeet.length ||
    !node ||
    !node.pointFeet.every((a, i) => a === p[i]) ||
    !mesh.levelIds.includes(node.levelId)
  )
    return;
  const slab = data.walkingSupport.floors.find(
    (f) =>
      f.nativeElementId === (upper ? 1582103 : 423406) &&
      f.elevationFeet === p[2],
  );
  if (!slab) return;
  const vertices = mesh.trianglesFeet.flat();
  // The curved ramp includes under-surface triangles below its lower cap.
  // Select the mesh cut nearest the original landing plane.
  const capZ = vertices.reduce(
    (z, v) => (Math.abs(v[2] - p[2]) < Math.abs(z - p[2]) ? v[2] : z),
    vertices[0]![2],
  );
  const cap = vertices.filter((v) => v[2] === capZ);
  const a = cap[0],
    b = cap.find((v) => a && (v[0] !== a[0] || v[1] !== a[1]));
  if (
    !a ||
    !b ||
    cap.some(
      (v) =>
        !(v[0] === a[0] && v[1] === a[1]) && !(v[0] === b[0] && v[1] === b[1]),
    )
  )
    return;
  // Bounds-to-mesh comparisons account solely for single-precision native
  // triangle coordinates. This never fills a gap or grants walking support.
  const scale = Math.max(1, ...a.map(Math.abs), ...b.map(Math.abs));
  const rounding = 4 * 2 ** -23 * scale;
  if (
    Math.abs(capZ - p[2]) > rounding ||
    hypot(b[0] - a[0], b[1] - a[1]) < 2
  )
    return;
  let normal: XY | undefined;
  for (const part of slab.partsFeet ?? [slab.ringsFeet]) {
    for (const ring of part)
      for (let i = 0; i < ring.length; i++) {
        const u = ring[i]!,
          v = ring[(i + 1) % ring.length]!,
          dx = v[0] - u[0],
          dy = v[1] - u[1],
          length = hypot(dx, dy);
        if (length < 2) continue;
        const along = (q: readonly number[]) =>
          ((q[0]! - u[0]) * dx + (q[1]! - u[1]) * dy) / length;
        const across = (q: readonly number[]) =>
          ((q[1]! - u[1]) * dx - (q[0]! - u[0]) * dy) / length;
        if (
          [a, b].some(
            (q) =>
              Math.abs(across(q)) > rounding ||
              along(q) < -rounding ||
              along(q) > length + rounding,
          )
        )
          continue;
        const t = along(p);
        if (
          t - 1 < Math.min(along(a), along(b)) ||
          t + 1 > Math.max(along(a), along(b))
        )
          continue;
        let n: XY = [-dy / length, dx / length];
        const direction =
          (p[0] - previous[0]) * n[0] + (p[1] - previous[1]) * n[1];
        if (!direction) continue;
        if (direction < 0) n = [-n[0], -n[1]];
        if (normal) return; // Competing native boundary matches need a new source review.
        normal = n;
      }
  }
  return normal;
}
