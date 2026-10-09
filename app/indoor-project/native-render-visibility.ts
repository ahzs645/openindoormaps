import {
  nativeRationalOverlay,
  type NativeRationalParts,
  type NativeRationalPoint,
} from "./native-rational-overlay";
import { nativeRationalPointInParts } from "./native-exact-planar-topology";
import { compare } from "./vendor/native-rational-overlay-arithmetic.mjs";

type Box = [
  NativeRationalPoint[0],
  NativeRationalPoint[0],
  NativeRationalPoint[0],
  NativeRationalPoint[0],
];
type Part = NativeRationalParts[number];
const bounds = (points: NativeRationalPoint[]): Box => {
  let [x0, y0] = points[0],
    [x1, y1] = points[0];
  for (const [x, y] of points) {
    if (compare(x, x0) < 0) x0 = x;
    if (compare(y, y0) < 0) y0 = y;
    if (compare(x, x1) > 0) x1 = x;
    if (compare(y, y1) > 0) y1 = y;
  }
  return [x0, y0, x1, y1];
};
const disjoint = (a: Box, b: Box) =>
  compare(a[0], b[2]) > 0 ||
  compare(a[2], b[0]) < 0 ||
  compare(a[1], b[3]) > 0 ||
  compare(a[3], b[1]) < 0;
const contains = (a: Box, b: Box) =>
  compare(a[0], b[0]) <= 0 &&
  compare(a[1], b[1]) <= 0 &&
  compare(a[2], b[2]) >= 0 &&
  compare(a[3], b[3]) >= 0;

/** Index original opaque drawing parts once. Bounds remain rational, including
 * every hole and positive residual; this is temporary visibility work only. */
export function indexNativeOpaqueDrawing(parts: NativeRationalParts) {
  return parts
    .filter((part) => part[0]?.length)
    .map((part) => ({
      part,
      box: bounds(part[0]),
      holes: part.slice(1).map((ring) => ({ ring, box: bounds(ring) })),
      edges: part.flatMap((ring) =>
        ring.map((p, i) => bounds([p, ring[(i + 1) % ring.length]])),
      ),
    }));
}
export type NativeOpaqueDrawingIndex = ReturnType<
  typeof indexNativeOpaqueDrawing
>;

/** Restrict each temporary opaque operand to this exact tread's bounding box.
 * Strictly distant components/holes cannot affect its difference. A boundary-
 * free box inside one source component proves full cover without a Boolean.
 * Touching boundaries and arbitrarily narrow holes always take the exact path. */
export function nativeVisibleDrawingParts(
  source: NativeRationalParts,
  opaque: NativeOpaqueDrawingIndex[],
): NativeRationalParts {
  if (!source.length) return source;
  const box = bounds(source.flat(2));
  const nearby = opaque.flatMap((index) =>
    index.filter((part) => !disjoint(part.box, box)),
  );
  if (!nearby.length) return source;
  for (const component of nearby) {
    if (
      contains(component.box, box) &&
      component.edges.every((edge) => disjoint(edge, box)) &&
      nativeRationalPointInParts([box[0], box[1]], [component.part])
    )
      return [];
  }
  const rectangle: NativeRationalParts = [
    [
      [
        [box[0], box[1]],
        [box[2], box[1]],
        [box[2], box[3]],
        [box[0], box[3]],
      ],
    ],
  ];
  const cuts = nearby
    .map((component) => {
      const local: Part = [
        component.part[0],
        ...component.holes
          .filter((hole) => !disjoint(hole.box, box))
          .map((hole) => hole.ring),
      ];
      return nativeRationalOverlay("intersection", rectangle, [local]);
    })
    .filter((parts) => parts.length);
  return cuts.length
    ? nativeRationalOverlay("difference", source, ...cuts)
    : source;
}
