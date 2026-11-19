import type { SharedGuidePoint as XYZ } from "./shared-corridor-guides";

export type PathwayStation = {
  guideEdgeId: string;
  segment: number;
  fraction: number;
  previousStopId: string;
  previousPointFeet: XYZ;
};
export type PathwayCut = {
  id: string;
  node: string;
  point: XYZ;
  segment: number;
  fraction: number;
};

/** Split one stored core in original source order. Keep segment and fraction
 * separate so a near-vertex fraction does not disappear when added to a large
 * segment index. A directed reverse link receives these same pieces reversed. */
export function splitPathwayCore(
  points: readonly XYZ[],
  from: PathwayCut,
  to: PathwayCut,
  stations: PathwayCut[],
) {
  const cuts = [
    from,
    ...stations
      .slice()
      .sort(
        (a, b) =>
          a.segment - b.segment ||
          a.fraction - b.fraction ||
          a.id.localeCompare(b.id),
      ),
    to,
  ];
  return cuts.slice(1).flatMap((b, i) => {
    const a = cuts[i];
    if (a.id === b.id) return [];
    const intermediate = points.slice(a.segment + 1, b.segment + 1);
    const segment = [a.point, ...intermediate, b.point].filter(
      (p, j, all) => !j || p.some((x, k) => x !== all[j - 1][k]),
    );
    return [{ from: a, to: b, points: segment }];
  });
}
