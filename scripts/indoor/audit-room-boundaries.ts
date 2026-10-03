import assert from "node:assert/strict";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import { architecturalPlanGeometry } from "../../../reviter/lib/reviter/architectural-plan.ts";
import { directoryDoors } from "../../../reviter/lib/reviter/directory-navigation.ts";
import { readFile, writeFile } from "node:fs/promises";
import { readIndoorProject } from "../../app/indoor-project/package";
import { nativeCirculationCells } from "../../app/indoor-project/native-circulation";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";
import { isFlatArea } from "../../app/indoor-project/display-passages";
const [input, output, nativeCache] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-room-boundaries.ts project.zip report.json [native-cache.json]",
  );
const { dataset: d, rooms } = await readIndoorProject(await readFile(input));
const prepared = new Map(d.presentation?.rooms.map((r) => [r.roomKey, r]));
const nativeKeys = new Set(
  nativeCirculationCells(d).flatMap((c) => c.roomKeys),
);
const diagnostics = new Map(
  d.presentation?.diagnostics.map((r) => [r.roomKey, r]),
);
const annotations = new Map(rooms.annotations.map((r) => [r.key, r]));
let nativeModelCheck: unknown = null;
if (nativeCache) {
  const cache: { sourceModelSha256: string; nativeModel: ConvertResult } =
    JSON.parse(await readFile(nativeCache, "utf8"));
  assert.equal(
    cache.sourceModelSha256,
    d.source.modelSha256,
    "Native model cache must match the project",
  );
  const nativeIds = new Set(
    cache.nativeModel.elementBounds.map((r) => r.elementId),
  );
  const checks = [...new Set(d.records.map((r) => r.levelId))].map(
    (levelId) => {
      const native = architecturalPlanGeometry(cache.nativeModel, levelId);
      const nativeWalls = new Set(native.walls.map((w) => w.elementId));
      const nativeDoors = new Set(native.doors.map((w) => w.elementId));
      const normalized = (rings: number[][][]) =>
        rings.map((ring) =>
          ring.map(
            ([x, y]) =>
              [
                Math.round(x * 10_000) / 10_000,
                Math.round(y * 10_000) / 10_000,
              ] as [number, number],
          ),
        );
      const shapeKey = (rings: number[][][]) =>
        JSON.stringify(
          normalized(rings)
            .map((ring) => [...new Set(ring.map((p) => p.join(",")))].sort())
            .sort(),
        );
      const nativeShapes = new Set(
        native.walls.map((w) => `${w.elementId}:${shapeKey([w.polygon])}`),
      );
      const compiledDoorShapes = new Map(
        directoryDoors(cache.nativeModel, levelId)
          .filter((door) => door.footprint)
          .map((door) => [door.id, shapeKey([door.footprint!])]),
      );
      const compiledDoorShapeDifferences = (d.doors ?? [])
        .filter(
          (door) =>
            door.levelId === levelId &&
            door.footprintFeet &&
            compiledDoorShapes.get(door.nativeElementId) !==
              shapeKey([door.footprintFeet]),
        )
        .map((door) => door.nativeElementId);
      const nativeDoorShapes = new Map(
        native.doors.map((w) => [w.elementId, shapeKey([w.polygon])]),
      );
      const wallShapeDifferences = d.walls
        .filter(
          (w) =>
            w.levelId === levelId &&
            w.kind === "wall" &&
            !nativeShapes.has(`${w.nativeElementId}:${shapeKey(w.ringsFeet)}`),
        )
        .map((w) => w.nativeElementId);
      const doorShapeDifferences = (d.doors ?? [])
        .filter(
          (w) =>
            w.levelId === levelId &&
            w.footprintFeet &&
            nativeDoorShapes.get(w.nativeElementId) !==
              shapeKey([w.footprintFeet]),
        )
        .map((w) => w.nativeElementId);
      return {
        levelId,
        cutElevationFeet: native.cutElevation,
        nativeWalls: native.walls.length,
        wallShapeDifferencesAtNativePrecision: wallShapeDifferences,
        doorShapeDifferencesAtNativePrecision: doorShapeDifferences,
        doorShapeDifferencesFromNativeHostAdjustedApertures:
          compiledDoorShapeDifferences,
        nativeDoors: native.doors.length,
        packagedWallIdsAbsentFromNativeCut: [
          ...new Set(
            d.walls
              .filter((w) => w.levelId === levelId && w.kind === "wall")
              .map((w) => w.nativeElementId),
          ),
        ].filter((id) => !nativeWalls.has(id)),
        packagedDoorIdsAbsentFromNativeCut: (d.doors ?? [])
          .filter(
            (w) => w.levelId === levelId && !nativeDoors.has(w.nativeElementId),
          )
          .map((w) => w.nativeElementId),
      };
    },
  );
  nativeModelCheck = {
    sourceModelHashMatches: true,
    levels: checks,
    unknownBoundaryElementIds: [
      ...new Set(
        (d.presentation?.rooms ?? []).flatMap((r) => r.boundaryElementIds),
      ),
    ].filter((id) => !nativeIds.has(id)),
  };
}
const byBuilding: Record<string, Record<string, number>> = {};
const rows = [];
for (const building of [...new Set(d.records.map((r) => r.building))].sort()) {
  const records = d.records.filter((r) => r.building === building);
  const levels = [...new Set(records.map((r) => r.levelId))];
  const surfaces = new Map<string, { boundarySource?: string }>();
  for (const level of levels) {
    const display = projectDisplayGeometry(
      d,
      [level],
      building,
      "",
      false,
      false,
    );
    for (const feature of [
      ...display.areas.features,
      ...display.roomBlocks.features,
    ]) {
      if (feature.properties?.key)
        surfaces.set(feature.properties.key, feature.properties);
    }
  }
  for (const r of records) {
    const p = prepared.get(r.key),
      a = annotations.get(r.key),
      diag = diagnostics.get(r.key);
    const state =
      r.circulation && nativeKeys.has(r.key)
        ? "native-circulation"
        : (p?.boundarySource ??
          (r.properties.nativeRoutingBoundary
            ? "native-routing-boundary"
            : surfaces.get(r.key)?.boundarySource === "native-walls"
              ? "runtime-native-walls"
              : "source-outline"));
    const count = (byBuilding[building] ??= { total: 0 });
    count.total++;
    count[state] = (count[state] ?? 0) + 1;
    rows.push({
      key: r.key,
      number: r.number,
      name: r.name,
      building,
      levelId: r.levelId,
      elevationFeet: r.elevationFeet,
      stair: r.stair,
      circulation: r.circulation,
      access: r.access,
      walkable: r.walkable,
      flat: isFlatArea(r),
      state,
      renderedBoundary: surfaces.get(r.key)?.boundarySource ?? null,
      diagnostic: diag ?? null,
      preparedBindingCurrent: p
        ? d.presentation?.sourceModelSha256 === d.source.modelSha256 &&
          p.sourceGeometryKey === JSON.stringify([r.levelId, r.ringsFeet])
        : null,
      boundaryElementIds: p?.boundaryElementIds ?? [],
      sourceHasNativeInteriorProvenance: !!a?.nativeInteriorProvenance,
    });
  }
  console.log(building, JSON.stringify(byBuilding[building]));
}
const unresolved = rows.filter((r) => r.state === "source-outline");
const result = {
  input,
  sourceModelSha256: d.source.modelSha256,
  total: rows.length,
  nativeModelCheck,
  byBuilding,
  stalePrepared: rows.filter((r) => r.preparedBindingCurrent === false),
  sourceOutlineCount: unresolved.length,
  ordinarySourceRooms: unresolved.filter(
    (r) => r.walkable && !r.circulation && !r.stair,
  ).length,
  sourceOutlineReasons: Object.fromEntries(
    [
      ...new Set(
        unresolved.map(
          (r) => r.diagnostic?.code ?? "no-room-enclosure-request",
        ),
      ),
    ].map((k) => [
      k,
      unresolved.filter(
        (r) => (r.diagnostic?.code ?? "no-room-enclosure-request") === k,
      ).length,
    ]),
  ),
  rows,
};
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
