/** Refresh display boundaries from exact-model evidence without rebuilding or
 * authorizing navigation. Originals are retained; output paths must be new. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import { readProjectPackage } from "../../../reviter/lib/reviter/project-package.ts";
import {
  routingFloorPlateRecords,
  nativeFloorPolygons,
} from "../../../reviter/lib/reviter/routing-floor-support.ts";
import { recoverNativeMeshRoomInteriors } from "../../../reviter/lib/reviter/native-mesh-room-presentation.ts";
import { prepareRoomBlocks } from "../../../reviter/lib/reviter/room-block-presentation.ts";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
const [input, cachePath, out] = process.argv.slice(2);
if (!input || !cachePath || !out)
  throw new Error(
    "Usage: regenerate-presentation-from-native-cache.ts master.zip native-cache.json new-output-directory",
  );
const bytes = await readFile(input),
  source = await readProjectPackage(new Uint8Array(bytes)),
  project = await readIndoorProject(bytes);
const cache: { sourceModelSha256: string; nativeModel: ConvertResult } =
  JSON.parse(await readFile(cachePath, "utf8"));
assert.equal(
  cache.sourceModelSha256,
  source.manifest.model.sha256,
  "Cache must belong to this exact model",
);
assert.equal(cache.sourceModelSha256, project.dataset.source.modelSha256);
const d = project.dataset,
  oldPresentation = d.presentation;
const { presentation: _presentation, ...before } = d;
const sourceAndRouting = JSON.stringify([before, project.rooms]);
assert.ok(
  oldPresentation,
  "Prepare baseline room boundaries before refreshing native mesh joins",
);
assert.equal(oldPresentation.sourceModelSha256, d.source.modelSha256);
for (const room of oldPresentation.rooms) {
  const record = d.records.find((r) => r.key === room.roomKey);
  assert.ok(record);
  assert.equal(
    room.sourceGeometryKey,
    JSON.stringify([record.levelId, record.ringsFeet]),
    "Prepared room must match its current source identity",
  );
}
const candidateKeys = new Set(
  oldPresentation.diagnostics.map((r) => r.roomKey),
);
const floorsByRecord = new Map(
  d.records.map((r) => [
    r.key,
    routingFloorPlateRecords(cache.nativeModel, r.elevationFeet).flatMap(
      nativeFloorPolygons,
    ),
  ]),
);
const recovered = recoverNativeMeshRoomInteriors(
  d,
  source.rooms.annotations,
  cache.nativeModel,
  candidateKeys,
  floorsByRecord,
);
const interiors = [
  ...oldPresentation.rooms.map((r) => ({
    ...r,
    ringsFeet: r.interiorRingsFeet,
  })),
  ...recovered.rooms,
];
const protectedAreas = d.records.filter((r) => r.circulation || !r.walkable);
const blocks = prepareRoomBlocks(
  interiors,
  [...d.walls, ...recovered.walls],
  d.doors ?? [],
  protectedAreas,
);
const newRooms = recovered.rooms.flatMap((room) => {
  const record = d.records.find((r) => r.key === room.roomKey)!,
    blockPartsFeet = blocks.get(room.roomKey);
  return blockPartsFeet?.length
    ? [
        {
          ...room,
          boundarySource: "native-mesh-wall-enclosure" as const,
          sourceGeometryKey: JSON.stringify([record.levelId, record.ringsFeet]),
          interiorRingsFeet: room.ringsFeet,
          blockPartsFeet,
        },
      ]
    : [];
});
const addedKeys = new Set(newRooms.map((r) => r.roomKey));
d.presentation = {
  ...oldPresentation,
  rooms: [...oldPresentation.rooms, ...newRooms],
  diagnostics: oldPresentation.diagnostics.filter(
    (r) => !addedKeys.has(r.roomKey),
  ),
};
const { presentation: newPresentation, ...after } = d;
assert.equal(
  JSON.stringify([after, project.rooms]),
  sourceAndRouting,
  "Only presentation may change",
);
assert.deepEqual(
  oldPresentation?.rooms
    .filter((r) => !newPresentation.rooms.some((n) => n.roomKey === r.roomKey))
    .map((r) => r.roomKey) ?? [],
  [],
  "Existing prepared rooms must survive",
);
const additions = newPresentation.rooms.filter(
  (r) => !oldPresentation?.rooms.some((o) => o.roomKey === r.roomKey),
);
const report = {
  input: path.resolve(input),
  inputSha256: createHash("sha256").update(bytes).digest("hex"),
  source: d.source,
  sourceAndGraphUnchanged: true,
  existingPreparedRoomsUnchanged: true,
  mode: "incremental-certified-native-mesh-joins",
  previousRooms: oldPresentation?.rooms.length,
  preparedRooms: newPresentation.rooms.length,
  additions: additions.map((r) => ({
    number: d.records.find((x) => x.key === r.roomKey)?.number,
    ...r,
  })),
  unresolved: newPresentation.diagnostics.length,
};
await mkdir(out, { recursive: true });
await writeFile(path.join(out, "compiled-dataset.json"), JSON.stringify(d), {
  flag: "wx",
});
await writeFile(
  path.join(out, "presentation-report.json"),
  JSON.stringify(report, null, 2),
  { flag: "wx" },
);
await writeFile(
  path.join(out, "UNBC.master.reviter.zip"),
  await exportIndoorProject(project),
  { flag: "wx" },
);
await writeFile(
  path.join(out, "UNBC.campus-viewer.zip"),
  await exportCampusViewer(project),
  { flag: "wx" },
);
console.log(
  JSON.stringify(
    {
      ...report,
      additions: report.additions.map((r) => ({
        number: r.number,
        key: r.roomKey,
        source: r.boundarySource,
      })),
    },
    null,
    2,
  ),
);
