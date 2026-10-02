import { readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";
import { visitorWallGeometry } from "../../app/indoor-project/visitor-wall-geometry";
import {
  compactWallDetails,
  simpleRoomGeometry,
  simpleWallGeometry,
} from "../../app/indoor-project/simple-wall-geometry";
import {
  buildingOverviewGeometry,
  buildingOverviewLabels,
} from "../../app/indoor-project/zoom-presentation";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import { stairPlaceGround } from "../../app/indoor-project/stair-place-ground";
import { stairsAboveDisplayedGround } from "../../app/indoor-project/stair-ground-occlusion";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: node --import tsx scripts/indoor/profile-floor-rendering.ts INPUT.zip REPORT.json",
  );
const bytes = readFileSync(input),
  entries = unzipSync(bytes);
if (!entries["viewer/indoor.json"])
  throw new Error(
    "Provide a prepared project or campus viewer with viewer/indoor.json.",
  );
const d: IndoorDataset = JSON.parse(strFromU8(entries["viewer/indoor.json"]));
const sourceBefore = createHash("sha256")
  .update(JSON.stringify(d))
  .digest("hex");
const reports = [];
for (const f of [...d.floors].sort(
  (a, b) => b.elevationFeet - a.elevationFeet,
)) {
  const name = f.name;
  const times: Record<string, number> = {};
  const phase = <T>(name: string, fn: () => T) => {
    const start = performance.now(),
      v = fn();
    times[name] = performance.now() - start;
    return v;
  };
  const start = performance.now();
  const display = phase("display", () =>
    projectDisplayGeometry(d, f.levelIds, "all", "", false, true, false, false),
  );
  const walls = phase("visitorWalls", () =>
    visitorWallGeometry(d, display.exposedWalls, display.records),
  );
  const details = phase("compactDetails", () =>
    compactWallDetails(d, display.records),
  );
  const simpleWalls = phase("simpleWalls", () =>
    simpleWallGeometry(d, walls, details),
  );
  const simpleRooms = phase("simpleRooms", () =>
    simpleRoomGeometry(d, display.roomBlocks, details),
  );
  const simpleAreas = phase("simpleAreas", () =>
    simpleRoomGeometry(d, display.areas, details),
  );
  const overview = phase("overview", () =>
    buildingOverviewGeometry(d, display.records),
  );
  phase("overviewLabels", () => buildingOverviewLabels(d, display.records));
  const stairs = phase("stairs", () =>
    projectStairDisplay(d, f.levelIds, "all", false),
  );
  const ground = phase("stairGround", () => stairPlaceGround(d, simpleAreas));
  const visible = phase("groundOcclusion", () =>
    stairsAboveDisplayedGround(stairs, ground, false),
  );
  const totalMs = performance.now() - start;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        display,
        walls,
        details,
        simpleWalls,
        simpleRooms,
        simpleAreas,
        overview,
        stairs,
        ground,
        visible,
      }),
    )
    .digest("hex");
  const result = {
    fingerprint,
    floor: name,
    totalMs,
    times,
    records: display.records.length,
    wallParts: display.exposedWalls.features.reduce(
      (n, f) => n + f.geometry.coordinates.length,
      0,
    ),
    stairs: stairs.features.length,
    visibleStairs: visible.features.length,
  };
  reports.push(result);
  console.log(JSON.stringify(result));
}
const sourceAfter = createHash("sha256")
  .update(JSON.stringify(d))
  .digest("hex");
if (sourceAfter !== sourceBefore)
  throw new Error("Profiling changed the dataset");
writeFileSync(
  output,
  JSON.stringify(
    {
      input,
      packageSha256: createHash("sha256").update(bytes).digest("hex"),
      source: d.source,
      datasetUnchanged: true,
      mode: "3D rooms; all buildings; default visitor settings; fresh geometry per floor",
      note: "CPU geometry timings in Node, not browser frame or camera timings. Times vary with machine and load.",
      floors: reports,
    },
    null,
    2,
  ) + "\n",
);
