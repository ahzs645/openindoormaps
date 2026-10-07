import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import pc from "polygon-clipping";
import { readIndoorProject } from "../../app/indoor-project/package";
import { nativeCirculationCells } from "../../app/indoor-project/native-circulation";
import { findProjectRoute } from "../../app/indoor-project/routing";
import {
  nativeSlabsCoverSegment,
  type FloorPolygon,
} from "./native-floor-proof";
const [zip, priorPinGeometry, output] = process.argv.slice(2);
const { dataset: data } = await readIndoorProject(await readFile(zip));
const cells = nativeCirculationCells(data);
assert.equal(cells.length, data.circulationGeometry!.cells.length);
const byId = new Map(cells.map((c) => [c.id, c]));
let branches = 0,
  segments = 0;
for (const e of data.edges.filter((e) => e.nativeCellId)) {
  const cell = byId.get(e.nativeCellId!);
  assert.ok(cell);
  const from = data.nodes.find((n) => n.id === e.from)!,
    to = data.nodes.find((n) => n.id === e.to)!;
  assert.deepEqual(e.pointsFeet[0], from.pointFeet);
  assert.deepEqual(e.pointsFeet.at(-1), to.pointFeet);
  for (let i = 1; i < e.pointsFeet.length; i++) {
    assert.ok(
      nativeSlabsCoverSegment(
        e.pointsFeet[i - 1].slice(0, 2) as [number, number],
        e.pointsFeet[i].slice(0, 2) as [number, number],
        [cell.ringsFeet],
      ),
      `${e.id}: native cell chord ${i}`,
    );
    segments++;
  }
  branches++;
}
const old = JSON.parse(await readFile(priorPinGeometry, "utf8"));
const pin = old.report.pin;
const rounded = (poly: FloorPolygon) =>
  poly.map((r) =>
    r.map(
      (p) =>
        [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6] as [
          number,
          number,
        ],
    ),
  );
const area = (parts: FloorPolygon[]) =>
  parts.reduce(
    (sum, poly) =>
      sum +
      poly.reduce(
        (s, r, i) =>
          s +
          (i ? -1 : 1) *
            Math.abs(
              r.reduce(
                (a, p, j) =>
                  a +
                  p[0] * r[(j + 1) % r.length][1] -
                  p[1] * r[(j + 1) % r.length][0],
                0,
              ) / 2,
            ),
        0,
      ),
    0,
  );
const native = cells
  .filter((c) => c.levelIds.includes(pin.levelId))
  .flatMap(
    (c) =>
      pc.intersection(rounded(old.box), rounded(c.ringsFeet)) as FloorPolygon[],
  );
const overlap = (parts: FloorPolygon[]) =>
  native.length > 0 && parts.length > 0
    ? area(pc.intersection(native, parts.map(rounded)) as FloorPolygon[])
    : 0;
const obstacles = overlap(old.barriers),
  unsupported =
    native.length > 0
      ? area(pc.difference(native, old.floors.map(rounded)) as FloorPolygon[])
      : 0;
assert.ok(
  obstacles < 0.001,
  `Native circulation intersects ${obstacles} sq ft native barriers`,
);
assert.ok(
  unsupported < 0.001,
  `Native circulation extends beyond native slabs: ${unsupported} sq ft`,
);
assert.ok(
  native.some((p) =>
    nativeSlabsCoverSegment(pin.pointFeet, pin.pointFeet, [p]),
  ),
  "Pin must lie in rebuilt native circulation",
);
const recovered = overlap(old.missing);
assert.ok(
  recovered > 0,
  "Recover clear floor missing from the source trace at pin",
);
const cases: readonly (readonly [string, string, number, string, number])[] = [
  ["Library corridor to upper stair", "05-120", 311, "05-S203", 694],
  ["Library stair", "05-S101", 311, "05-S201", 694],
  ["Tea Lab stair", "08-S101", 1_487_816, "08-S201", 694],
  ["Conference stair", "06-S204", 694, "06-S204", 1_487_353],
  ["Meeting to classroom", "03-015", 311, "05-154", 311],
];
const routes = cases.map(([name, a, al, b, bl]) => {
  const from = data.records.find((r) => r.number === a && r.levelId === al)!,
    to = data.records.find((r) => r.number === b && r.levelId === bl)!;
  assert.ok(from && to);
  const r = findProjectRoute(data, from.key, to.key);
  return {
    name,
    from: a,
    to: b,
    available: !!r,
    levels: r ? [...new Set(r.paths.flatMap((p) => p.levelIds))] : [],
    nativeCirculationLegs:
      r?.paths.filter((p) => p.nativeCirculationUsed).length ?? 0,
    stairs: r?.edges.filter((e) => e.kind === "stairs").length ?? 0,
    metres: r?.distanceMetres,
  };
});
for (const c of data.connectors ?? []) {
  const a = c.entrances[0],
    b = c.entrances.at(-1)!;
  const r = findProjectRoute(data, a.roomKey, b.roomKey);
  assert.ok(r, `Elevator ${c.id}`);
  assert.ok(r.edges.some((e) => e.kind === "elevator"));
  routes.push({
    name: c.id,
    from: a.roomKey,
    to: b.roomKey,
    available: true,
    levels: [...new Set(r.paths.flatMap((p) => p.levelIds))],
    nativeCirculationLegs: r.paths.filter((p) => p.nativeCirculationUsed)
      .length,
    stairs: 0,
    metres: r.distanceMetres,
  });
}
assert.ok(
  routes.some((r) => r.available && r.stairs > 0 && r.levels.length > 1),
  "A native stair route must still cross physical levels",
);
const result = {
  zip,
  nativeCells: cells.length,
  branches,
  checkedNativeCellSegments: segments,
  branchBoundaryViolations: 0,
  fixedBranchEndpointsPreserved: true,
  pin: {
    id: pin.id,
    nativeCellAtPin: true,
    recoveredClearFloorSquareFeet: recovered,
    obstacleOverlapSquareFeet: obstacles,
    unsupportedSquareFeet: unsupported,
    sourceTraceMissingSquareFeet:
      old.report.localAreaSquareFeet.clearFloorMissingFromCirculation,
    sourceTraceObstacleOverlapSquareFeet:
      old.report.localAreaSquareFeet.circulationInsideNativeBarrier,
  },
  routes,
};
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
