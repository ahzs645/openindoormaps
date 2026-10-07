import type { ExpressionSpecification } from 'maplibre-gl';
import { ROOM_DETAIL_START, ROOM_DETAIL_END } from './zoom-presentation';

/** MapLibre requires zoom to be the input of a top-level camera expression.
 * Keep native stair values constant through zoom, while other levels retain
 * their ordinary overview/detail presentation. */
export function nativeStairZoomStyle(
  levels: readonly number[],
  nativeValue: number | string | ExpressionSpecification,
  overview: number | string | ExpressionSpecification,
  detail: number | string | ExpressionSpecification,
  review: boolean,
): ExpressionSpecification {
  const at = (fallback: typeof detail): ExpressionSpecification => [
    'case', ['in', ['get', 'levelId'], ['literal', levels]],
    nativeValue, fallback,
  ];
  return review ? at(detail) : [
    'interpolate', ['linear'], ['zoom'],
    ROOM_DETAIL_START, at(overview), ROOM_DETAIL_END, at(detail),
  ];
}
