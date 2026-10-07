import type { IndoorDataset, IndoorRecord } from "./contract";
import { buildingOverviewGeometry } from "./zoom-presentation";
import { nativeEditPoint } from "./map-edits";
import polygonClipping from "polygon-clipping";
import buffer from "@turf/buffer";
import { geographicPoint } from "./routing";

/** Restore narrow, supported portions of an existing named native face that
 * metadata holes shave away. Never expand the coverage's outer perimeter or
 * render unlabelled components. Native barriers, openings and exclusions remain
 * authoritative. Wide unclaimed internal areas still require enclosure review.
 * The width bound matches the existing overview's 1.22m closing radius. */
export function nativeExploreScopedParts(
  data: IndoorDataset,
  native: [number, number][][],
  coverage: [number, number][][][],
): [number, number][][][] {
  const visible = polygonClipping.intersection(native, coverage);
  const holes = coverage.flatMap((part) => part.slice(1).map((ring) => [ring]));
  if (!holes.length) return visible;
  const residuals = polygonClipping.intersection(native, holes);
  const recovered = residuals.filter((part) => {
    try {
      const inset = buffer(
        {
          type: "Polygon",
          coordinates: part.map((ring) =>
            [...ring, ring[0]].map((point) => geographicPoint(data, point)),
          ),
        },
        -1.22,
        { units: "meters", steps: 8 },
      );
      return !inset || inset.geometry.coordinates.length === 0;
    } catch {
      return false;
    }
  });
  return recovered.length
    ? polygonClipping.union(visible, ...recovered)
    : visible;
}

/** Remove only tiny internal gaps in the temporary metadata coverage. Native
 * polygons subsequently intersect this scope, so their real holes remain exact.
 * Large unclaimed courtyards and the outer apron boundary remain conservative. */
export function closeSmallCoverageHoles(coverage: [number, number][][][]) {
  const area = (ring: [number, number][]) => {
    const origin = ring[0];
    return (
      Math.abs(
        ring.reduce((sum, a, i) => {
          const b = ring[(i + 1) % ring.length];
          return (
            sum +
            (a[0] - origin[0]) * (b[1] - origin[1]) -
            (b[0] - origin[0]) * (a[1] - origin[1])
          );
        }, 0),
      ) / 2
    );
  };
  return coverage.map((rings) => [
    rings[0],
    ...rings.slice(1).filter((r) => area(r) >= 1),
  ]);
}

/** Temporary visitor presentation scope for an open native component. Registered
 * building coverage hides unclaimed slab apron/terrain, without classifying it
 * outdoors or replacing the recovered native enclosure. Review keeps full slabs.
 * Use all place types, never the old hallway outline alone. */
export function nativeExploreDisplayCoverage(
  data: IndoorDataset,
  records: IndoorRecord[],
): [number, number][][][] {
  if (!records.length) return [];
  const coverage = buildingOverviewGeometry(data, records)
    .features.filter((f) => f.properties?.circulation === false)
    .flatMap((f) =>
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates,
    )
    .map((rings) =>
      rings.map((ring) =>
        ring.map((point) => {
          const xy = nativeEditPoint(data, [point[0], point[1]]);
          // Geographic round trips introduce nanometre noise at shared vertices.
          return xy.map((n) => Math.round(n * 1e7) / 1e7) as [number, number];
        }),
      ),
    );
  // Buffer closing must not shave a registered room's original corner. Actual
  // openings and reviewed exclusions are subtracted by the native face itself.
  return closeSmallCoverageHoles(
    polygonClipping.union(
      records[0].ringsFeet,
      ...records.slice(1).map((r) => r.ringsFeet),
      ...coverage,
    ),
  );
}
