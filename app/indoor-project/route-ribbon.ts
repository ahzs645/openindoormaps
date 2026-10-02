type Point3 = readonly [number, number, number];

/** A round stroke on the measured route, without moving its centreline.
 * Segment strips share circular joins/caps at their native endpoint heights;
 * this fills the outside wedge that independent quads leave at each turn. */
export function routeRibbonPositions(
  points: readonly Point3[],
  halfWidth = 0.09,
): number[] {
  const positions: number[] = [];
  const joints = new Map<string, Point3>();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 0.001) continue;
    const x = (-dy / length) * halfWidth,
      y = (dx / length) * halfWidth;
    const leftA = [a[0] + x, a[1] + y, a[2]],
      rightA = [a[0] - x, a[1] - y, a[2]];
    const leftB = [b[0] + x, b[1] + y, b[2]],
      rightB = [b[0] - x, b[1] - y, b[2]];
    positions.push(
      ...leftA,
      ...rightA,
      ...leftB,
      ...rightA,
      ...rightB,
      ...leftB,
    );
    joints.set(a.join(","), a);
    joints.set(b.join(","), b);
  }
  // Opaque overlapping faces have the same colour. The round union covers both
  // inner/outer corners and joins separately prepared route paths seamlessly.
  const divisions = 32;
  for (const point of joints.values()) {
    for (let i = 0; i < divisions; i++) {
      const a = (i / divisions) * Math.PI * 2,
        b = ((i + 1) / divisions) * Math.PI * 2;
      positions.push(
        ...point,
        point[0] + Math.cos(a) * halfWidth,
        point[1] + Math.sin(a) * halfWidth,
        point[2],
        point[0] + Math.cos(b) * halfWidth,
        point[1] + Math.sin(b) * halfWidth,
        point[2],
      );
    }
  }
  return positions;
}
