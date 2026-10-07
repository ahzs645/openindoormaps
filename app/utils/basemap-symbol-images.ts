import type { Map, MapStyleImageMissingEvent } from "maplibre-gl";

type Point = [number, number];
type Stroke = Point[];
const size = 42;
const pixelRatio = 2;

/** The basemap's data-driven POI classes include these meanings, but its
 * current sprite lacks them. Draw visible symbols rather than empty images. */
function symbolStrokes(id: string): Stroke[] | undefined {
  if (id === "gate")
    return [
      [
        [3, 4],
        [3, 18],
      ],
      [
        [18, 4],
        [18, 18],
      ],
      [
        [3, 6],
        [18, 6],
      ],
      [
        [3, 15],
        [18, 15],
      ],
      ...[6, 10.5, 15].map(
        (x): Stroke => [
          [x, 6],
          [x, 15],
        ],
      ),
    ];
  if (id === "recycling")
    return [
      [
        [7, 3],
        [12, 3],
        [14.5, 7.3],
      ],
      [
        [11.4, 6.5],
        [14.5, 7.3],
        [15.3, 4.2],
      ],
      [
        [17, 8.5],
        [19, 12.3],
        [16.3, 16.4],
        [12, 16.4],
      ],
      [
        [14.2, 18.6],
        [12, 16.4],
        [14.2, 14.2],
      ],
      [
        [9, 17],
        [4.5, 17],
        [2, 12.6],
        [4.3, 8.7],
      ],
      [
        [1.4, 9.6],
        [4.3, 8.7],
        [5.2, 11.5],
      ],
    ];
  if (id === "sports_centre") {
    const circle: Stroke = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return [10.5 + Math.cos(a) * 7, 10.5 + Math.sin(a) * 7];
    });
    return [
      circle,
      [
        [3.5, 10.5],
        [17.5, 10.5],
      ],
      [
        [10.5, 3.5],
        [10.5, 17.5],
      ],
      [
        [5.5, 5.5],
        [7.2, 8],
        [7.7, 10.5],
        [7.2, 13],
        [5.5, 15.5],
      ],
      [
        [15.5, 5.5],
        [13.8, 8],
        [13.3, 10.5],
        [13.8, 13],
        [15.5, 15.5],
      ],
    ];
  }
  return undefined;
}

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
    ),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Retina-sized neutral ink with a white halo, matching the bright basemap's
 * POI scale. Pure rasterization also works without a canvas or async loading. */
export function basemapSymbolImage(id: string) {
  const strokes = symbolStrokes(id);
  if (!strokes) return undefined;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p: Point = [(x + 0.5) / pixelRatio, (y + 0.5) / pixelRatio];
      let distance = Infinity;
      for (const stroke of strokes)
        for (let i = 1; i < stroke.length; i++)
          distance = Math.min(
            distance,
            segmentDistance(p, stroke[i - 1], stroke[i]),
          );
      const halo = Math.max(0, Math.min(1, (1.35 - distance) * pixelRatio));
      const ink = Math.max(0, Math.min(1, (0.8 - distance) * pixelRatio));
      const offset = (y * size + x) * 4;
      const colour = Math.round(255 - 169 * ink);
      data[offset] = data[offset + 1] = data[offset + 2] = colour;
      data[offset + 3] = Math.round(halo * 255);
    }
  return { width: size, height: size, data };
}

/** Re-register on demand after a style/theme replacement. Unknown missing
 * names remain visible to MapLibre's diagnostics; existing sprites win. */
export function registerBasemapSymbolImages(
  map: Pick<Map, "on" | "off" | "hasImage" | "addImage">,
) {
  const handleMissing = ({ id }: MapStyleImageMissingEvent) => {
    if (map.hasImage(id)) return;
    const image = basemapSymbolImage(id);
    if (image) map.addImage(id, image, { pixelRatio });
  };
  map.on("styleimagemissing", handleMissing);
  return () => map.off("styleimagemissing", handleMissing);
}
