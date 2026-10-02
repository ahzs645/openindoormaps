import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import pc from "polygon-clipping";
import { readIndoorProject } from "../../app/indoor-project/package";
import { nativeWalkingRegion } from "../../../reviter/lib/reviter/native-circulation-links.ts";
import {
  routingFloorPlateRecords,
  nativeFloorPolygons,
} from "../../../reviter/lib/reviter/routing-floor-support.ts";
import { containsRoomPoint } from "../../../reviter/lib/reviter/room-directory.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import { nativeCirculationSurfaces } from "../../app/indoor-project/native-circulation";
import type { ReviewPin } from "../../app/indoor-project/review-pins";

type Point = [number, number];
type Polygon = Point[][];
type Multi = Polygon[];
const [zip, nativeCache, pinFile, output] = process.argv.slice(2);
assert.ok(
  zip && nativeCache && pinFile && output,
  "Usage: audit-pin-floor.ts project.zip native-cache.json pin-review.json output-directory",
);
const { dataset } = await readIndoorProject(await readFile(zip));
const context = JSON.parse(await readFile(pinFile, "utf8")) as {
  format: string;
  source: { modelSha256: string };
  pin: ReviewPin;
  nativeLevel: { id: number; elevationFeet: number };
};
assert.equal(context.format, "openindoormaps-pin-review");
const pin = context.pin;
assert.ok(pin, "Pin review must contain a pin");
const cache = JSON.parse(await readFile(nativeCache, "utf8")) as {
  sourceModelSha256: string;
  nativeModel: ConvertResult;
};
assert.equal(cache.sourceModelSha256, dataset.source.modelSha256);
assert.equal(context.source.modelSha256, dataset.source.modelSha256);
const originalDataset = JSON.stringify(dataset);
const point: Point = [...pin.pointFeet];
const z = context.nativeLevel.elevationFeet;
assert.equal(context.nativeLevel.id, pin.levelId);
assert.ok(
  dataset.nativeLevels.some(
    (l) => l.id === pin.levelId && Math.abs(l.elevationFeet - z) < 0.05,
  ),
);
assert.ok(Number.isFinite(z) && point.every((value) => Number.isFinite(value)));
const radius = 14;
const box: Polygon = [
  [
    [point[0] - radius, point[1] - radius],
    [point[0] + radius, point[1] - radius],
    [point[0] + radius, point[1] + radius],
    [point[0] - radius, point[1] + radius],
  ],
];
const area = (parts: Multi) =>
  parts.reduce(
    (s, poly) =>
      s +
      poly.reduce(
        (v, ring, i) =>
          v +
          (i ? -1 : 1) *
            Math.abs(
              ring.reduce(
                (a, p, j) =>
                  a +
                  p[0] * ring[(j + 1) % ring.length][1] -
                  p[1] * ring[(j + 1) % ring.length][0],
                0,
              ) / 2,
            ),
        0,
      ),
    0,
  );
const clip = (parts: Multi): Multi => {
  const local = parts.flatMap((poly) => pc.intersection(box, poly) as Multi);
  return local.length > 0
    ? (pc.union(local[0], ...local.slice(1)) as Multi)
    : [];
};
const has = (poly: Polygon) =>
  containsRoomPoint(point, poly[0]) &&
  !poly.slice(1).some((h) => containsRoomPoint(point, h));
const source = dataset.records.filter(
  (r) => Math.abs(r.elevationFeet - z) < 0.05,
);
// The viewer's optional display-only ramps have a wider wire type. This
// physical-floor query does not consume ramp presentation or modify it.
const physical = nativeWalkingRegion(
  cache.nativeModel,
  { ...dataset, rampDisplay: undefined },
  z,
  true,
);
const floors = clip(physical.floors);
const barriers = clip(physical.barriers);
const roomMasks = clip(
  source
    .filter((r) => !r.circulation || !r.walkable || r.access === "staff")
    .map((r) => r.ringsFeet),
);
const holes = clip(physical.masks);
const clearFloor =
  floors.length > 0
    ? (pc.difference(
        floors,
        ...[barriers, roomMasks, holes].filter((p) => p.length),
      ) as Multi)
    : [];
const circulation = clip(
  source
    .filter((r) => r.circulation && r.walkable && r.access !== "staff")
    .map((r) => r.ringsFeet),
);
const missing =
  clearFloor.length > 0
    ? (pc.difference(clearFloor, circulation) as Multi)
    : [];
const unsupported =
  circulation.length > 0 ? (pc.difference(circulation, floors) as Multi) : [];
const obstructed =
  circulation.length > 0 && barriers.length > 0
    ? (pc.intersection(circulation, barriers) as Multi)
    : [];
const localFloors = routingFloorPlateRecords(cache.nativeModel, z).filter(
  (r) => clip(nativeFloorPolygons(r)).length,
);
const stairObstacles = clip(
  cache.nativeModel.elementBounds.flatMap((r) =>
    (r.stairTreads ?? [])
      .filter(
        (t) =>
          Math.min(...t.map((p) => p[2])) > z + 0.05 &&
          Math.min(...t.map((p) => p[2])) < z + 6,
      )
      .map((t) => [t.map((p) => [p[0], p[1]] as Point)]),
  ),
);
const stairOverlap =
  circulation.length > 0 && stairObstacles.length > 0
    ? (pc.intersection(circulation, stairObstacles) as Multi)
    : [];
const preparedCirculation = clip(
  nativeCirculationSurfaces(
    dataset,
    source.filter((r) => r.circulation && r.walkable && r.access !== "staff"),
  ).rings,
);
const preparedMissing =
  clearFloor.length > 0
    ? (pc.difference(clearFloor, preparedCirculation) as Multi)
    : [];
const preparedObstructed =
  preparedCirculation.length > 0 && barriers.length > 0
    ? (pc.intersection(preparedCirculation, barriers) as Multi)
    : [];
const report = {
  modelSha256: dataset.source.modelSha256,
  pin: {
    id: pin.id,
    label: pin.label,
    levelId: pin.levelId,
    pointFeet: point,
    elevationFeet: z,
  },
  regionFeet: { radius, width: 2 * radius },
  nativeFloorIds: localFloors.map((r) => r.elementId),
  pinOnNativeFloor: floors.some((poly) => has(poly)),
  pinInsideNativeBarrier: barriers.some((poly) => has(poly)),
  sourceOwnersAtPin: source
    .filter((r) => has(r.ringsFeet))
    .map((r) => ({
      key: r.key,
      number: r.number,
      circulation: r.circulation,
      stair: r.stair,
      nativeRoutingBoundary: r.properties.nativeRoutingBoundary ?? null,
    })),
  localAreaSquareFeet: {
    nativeFloor: area(floors),
    sourceCirculation: area(circulation),
    physicalClearFloorOutsideRoomClaims: area(clearFloor),
    clearFloorMissingFromCirculation: area(missing),
    circulationOutsideNativeFloor: area(unsupported),
    circulationInsideNativeBarrier: area(obstructed),
    circulationInsideLowStairProjection: area(stairOverlap),
  },
  preparedAreaSquareFeet: {
    circulation: area(preparedCirculation),
    missingClearFloor: area(preparedMissing),
    obstacleOverlap: area(preparedObstructed),
  },
  sourceDatasetUnchanged: JSON.stringify(dataset) === originalDataset,
  caveat:
    "Physical clear floor is a diagnostic, not authorization to enter unlabelled areas. Clip edges are audit boundaries, not walls. Doors, headroom, source ownership and connector stops still require routing validation.",
};
assert.ok(
  report.sourceDatasetUnchanged,
  "Audit must not change source records or graph",
);
await mkdir(output, { recursive: true });
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
await writeFile(
  `${output}/geometry.json`,
  JSON.stringify({
    report,
    box,
    floors,
    barriers,
    roomMasks,
    holes,
    clearFloor,
    circulation,
    missing,
    unsupported,
    obstructed,
    preparedCirculation,
    preparedMissing,
  }),
);
const view = [point[0] - radius, -point[1] - radius, radius * 2, radius * 2];
const paths = (parts: Multi, fill: string, stroke = "none", opacity = 1) =>
  parts
    .map(
      (poly) =>
        `<path d="${poly.map((r) => r.map((p, i) => `${i ? "L" : "M"}${p[0]},${-p[1]}`).join(" ") + "Z").join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width=".07" fill-rule="evenodd" opacity="${opacity}"/>`,
    )
    .join("");
const panel = (title: string, shapes: string, x: number) =>
  `<g transform="translate(${x},0)"><text x="0" y="-1.2" font-size=".8" font-family="sans-serif">${title}</text>${shapes}<circle cx="${point[0] - view[0]}" cy="${-point[1] - view[1]}" r=".3" fill="#af24ce"/></g>`;
// Use identical coordinates in both panels, translating only the viewport.
const atOrigin = (shapes: string) =>
  `<g transform="translate(${-view[0]},${-view[1]})">${shapes}</g>`;
const base =
  paths(floors, "#f2eee5") +
  paths(roomMasks, "#c5dce9") +
  paths(barriers, "#404952");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -3 60 34" width="1200" height="680"><rect x="-1" y="-3" width="60" height="34" fill="white"/>${panel("Current traced circulation", atOrigin(base + paths(circulation, "#78c4b4", "none", 0.7)), 0)}${panel("Rebuilt native circulation", atOrigin(base + paths(preparedCirculation, "#78c4b4") + paths(preparedMissing, "#f6a641", "none", 0.85) + paths(preparedObstructed, "#d84148", "none", 0.9)), 31)}<text x="0" y="30" font-size=".65" font-family="sans-serif">Purple: pin · Orange: clear floor omitted by trace · Red: trace overlaps native obstacles · Dark: obstacles</text></svg>`;
await writeFile(`${output}/comparison.svg`, svg);
console.log(JSON.stringify(report, null, 2));
