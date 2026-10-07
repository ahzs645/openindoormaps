import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { readIndoorProject } from "../../app/indoor-project/package";
import {
  projectBoundaryEvidence,
  unresolvedRoomBoundaryKeys,
} from "../../app/indoor-project/boundary-evidence";
import { wallFaceRoomFloorMasks } from "../../app/indoor-project/wall-face-floor-masks";
import { nativeCirculationCells } from "../../app/indoor-project/native-circulation";
import { isFlatArea } from "../../app/indoor-project/display-passages";

/** Inventory saved source boundaries and visitor-only native recovery without
 * changing room type, access, navigation, source geometry or the input archive. */
const [input, output, flag, reportPath, ...extra] = process.argv.slice(2);
if (
  !input ||
  !output ||
  extra.length > 0 ||
  (flag && (flag !== "--report" || !reportPath))
)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-outline-boundaries.ts project.zip report.json [--report report.txt]",
  );
const archive = path.resolve(input),
  jsonPath = path.resolve(output),
  textPath = reportPath ? path.resolve(reportPath) : undefined;
if (
  archive === jsonPath ||
  archive === textPath ||
  (textPath && textPath === jsonPath)
)
  throw new Error(
    "Input ZIP, output JSON and optional text report must use different paths.",
  );
const bytes = await readFile(archive),
  project = await readIndoorProject(bytes),
  { dataset: data, rooms, manifest } = project;
const sourceBefore = createHash("sha256")
  .update(JSON.stringify(data))
  .digest("hex");
const evidence = projectBoundaryEvidence(data, rooms);
const diagnostics = new Map(
  data.presentation?.diagnostics.map((d) => [d.roomKey, d]),
);
const unresolved = unresolvedRoomBoundaryKeys(data);
const nativeCells = nativeCirculationCells(data);
const cellKeys = new Set(nativeCells.flatMap((c) => c.roomKeys));
const outlineRecords = data.records.filter(
  (r) => evidence.get(r.key) === "Source outline · boundary review needed",
);
console.log(
  "outlined",
  outlineRecords.length,
  "compilerRejected",
  unresolved.size,
  "calculating wall-face masks",
);
const masks = wallFaceRoomFloorMasks(data, data.records);
const box = (rings: number[][][]) => {
  const p = rings.flat();
  return [
    Math.min(...p.map((p) => p[0])),
    Math.min(...p.map((p) => p[1])),
    Math.max(...p.map((p) => p[0])),
    Math.max(...p.map((p) => p[1])),
  ];
};
const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const walls = data.walls.map((w) => ({ wall: w, bounds: box(w.ringsFeet) }));
const entries = outlineRecords.map((r) => {
  const diag = diagnostics.get(r.key);
  const nativeStair =
    data.stairDisplay?.flights
      .filter((f) => f.roomKey === r.key)
      .map((f) => f.stairElementId) ?? [];
  const reason = r.walkable
    ? r.stair
      ? nativeStair.length > 0
        ? "stair-identity-with-native-flight-display"
        : "stair-area-needs-native-surround-review"
      : r.circulation
        ? "circulation-not-covered-by-current-native-cell"
        : (diag?.code ?? "no-prepared-enclosure-or-compiler-diagnostic")
    : "restricted-or-nonwalkable-semantic-area";
  const scope = box(r.ringsFeet).map((n, i) => n + (i < 2 ? -3 : 3));
  const nearbyWalls = walls.filter(
    (w) =>
      w.wall.levelId === r.levelId &&
      !w.wall.approximate &&
      overlaps(scope, w.bounds),
  );
  const displayEnclosed = !!masks.displayEnclosures?.has(r.key);
  const closures = masks.assumedOpenings?.get(r.key) ?? [];
  const canReviewAsOpenUse =
    !r.circulation &&
    !r.stair &&
    r.walkable &&
    /\b(?:lounge|commons?|alcove|gallery|waiting|open area|coffee|reception|vestibule|lobby|circulation|corridor|link)\b/i.test(
      r.name,
    );
  return {
    key: r.key,
    number: r.number,
    name: r.name,
    building: r.building,
    levelId: r.levelId,
    nativeFloor: data.nativeLevels.find((l) => l.id === r.levelId)?.name,
    elevationFeet: r.elevationFeet,
    campusFloor: data.floors.find((f) => f.levelIds.includes(r.levelId))?.name,
    walkable: r.walkable,
    circulation: r.circulation,
    stair: r.stair,
    access: r.access,
    flatDisplay: isFlatArea(r),
    reason,
    compilerDiagnostic: diag ?? null,
    nativeWallCountWithin3Feet: nearbyWalls.length,
    nativeDoorIds: (data.doors ?? [])
      .filter((d) => d.roomKeys.includes(r.key))
      .map((d) => d.nativeElementId),
    nativeStairIds: nativeStair,
    wallFaceFloorMask: !!masks.get(r.key),
    fullNativeDisplayEnclosure: displayEnclosed,
    assumedOpeningCount: closures.length,
    cornerContinuation: !!masks.cornerContinuations?.has(r.key),
    promotionClass: displayEnclosed
      ? closures.length > 0 || masks.cornerContinuations?.has(r.key)
        ? "display-enclosure-with-explicit-closure-assumptions"
        : "native-wall-display-enclosure-candidate"
      : masks.get(r.key)
        ? "partial-native-wall-face-tint-only"
        : "no-native-display-enclosure-recovered",
    openUseSemanticReviewCandidate: canReviewAsOpenUse,
  };
});
const count = (
  rows: typeof entries,
  key: (r: (typeof entries)[number]) => string,
) =>
  Object.fromEntries(
    [...new Set(rows.map(key))]
      .sort()
      .map((k) => [k, rows.filter((r) => key(r) === k).length]),
  );
const groups = [
  ...new Set(data.records.map((r) => JSON.stringify([r.building, r.levelId]))),
]
  .sort()
  .map((group) => {
    const [building, level] = JSON.parse(group) as [string, number];
    const all = data.records.filter(
      (r) => r.building === building && r.levelId === level,
    );
    const remaining = entries.filter(
      (r) => r.building === building && r.levelId === level,
    );
    return {
      building,
      levelId: level,
      nativeFloor: data.nativeLevels.find((l) => l.id === level)?.name,
      elevationFeet: all[0]?.elevationFeet,
      campusFloor: data.floors.find((f) => f.levelIds.includes(level))?.name,
      totalRecords: all.length,
      sourceOutlines: remaining.length,
      reasons: count(remaining, (r) => r.reason),
      fullNativeDisplayEnclosures: remaining.filter(
        (r) => r.fullNativeDisplayEnclosure,
      ).length,
      partialWallFaceMasks: remaining.filter(
        (r) => r.wallFaceFloorMask && !r.fullNativeDisplayEnclosure,
      ).length,
      semanticOpenUseCandidates: remaining.filter(
        (r) => r.openUseSemanticReviewCandidate,
      ).length,
    };
  });
const summary = {
  totalRecords: data.records.length,
  evidence: Object.fromEntries(
    [...new Set(evidence.values())]
      .sort()
      .map((k) => [k, [...evidence.values()].filter((v) => v === k).length]),
  ),
  sourceOutlines: entries.length,
  reasons: count(entries, (r) => r.reason),
  compilerDiagnostics: count(
    entries.filter((r) => r.compilerDiagnostic),
    (r) => r.compilerDiagnostic!.code,
  ),
  fullNativeDisplayEnclosures: entries.filter(
    (r) => r.fullNativeDisplayEnclosure,
  ).length,
  displayEnclosuresWithAssumedClosures: entries.filter(
    (r) =>
      r.fullNativeDisplayEnclosure &&
      (r.assumedOpeningCount || r.cornerContinuation),
  ).length,
  partialWallFaceMasks: entries.filter(
    (r) => r.wallFaceFloorMask && !r.fullNativeDisplayEnclosure,
  ).length,
  outlineAreasAlreadyNativeStairDisplay: entries.filter(
    (r) => r.nativeStairIds.length,
  ).length,
  semanticOpenUseCandidates: entries.filter(
    (r) => r.openUseSemanticReviewCandidate,
  ).length,
  nativeCirculationCellCount: nativeCells.length,
  nativeCirculationRecordCount: cellKeys.size,
};
const sourceUnchanged =
  sourceBefore ===
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
const report = {
  createdAt: new Date().toISOString(),
  archive,
  archiveSha256: createHash("sha256").update(bytes).digest("hex"),
  indoorSha256: manifest.indoor.sha256,
  sourceUnchanged,
  summary,
  byBuildingFloor: groups,
  displayEnclosureCandidates: entries.filter(
    (r) => r.fullNativeDisplayEnclosure,
  ),
  semanticOpenUseReviewCandidates: entries.filter(
    (r) => r.openUseSemanticReviewCandidate,
  ),
  entries,
  limits: [
    "Semantic open-use review candidates include staff areas; existing staff restrictions remain authoritative.",
    "Display mask recovery cannot certify routing or public access. Known doors remain routing thresholds.",
    "Short assumed jamb closures and corner continuations are explicitly display-only, requiring review before promotion.",
    "Open-use names are review candidates, not automatic hallway reclassification.",
    "Stair room identities may retain semantic outlines while native treads/platforms are already displayed.",
  ],
};
if (!sourceUnchanged)
  throw new Error("The audit changed source data; no report was written.");
await mkdir(path.dirname(jsonPath), { recursive: true });
await writeFile(jsonPath, JSON.stringify(report, null, 2));
const lines = [
  `Archive: ${archive}`,
  `Revision: ${manifest.indoor.sha256}`,
  `Read-only source unchanged: ${sourceUnchanged}`,
  JSON.stringify(summary, null, 2),
  "Building/native-level outline counts:",
  ...groups
    .filter((g) => g.sourceOutlines)
    .map(
      (g) =>
        `${g.building} / #${g.levelId} ${g.nativeFloor}: ${g.sourceOutlines}/${g.totalRecords}; complete display candidates ${g.fullNativeDisplayEnclosures}; partial masks ${g.partialWallFaceMasks}`,
    ),
  "Native display candidates:",
  ...report.displayEnclosureCandidates.map(
    (r) =>
      `${r.number} ${r.name} | ${r.key} | ${r.reason} | assumed openings ${r.assumedOpeningCount}, corner ${r.cornerContinuation}`,
  ),
  "Open-use semantic review candidates:",
  ...report.semanticOpenUseReviewCandidates.map(
    (r) => `${r.number} ${r.name} | ${r.key} | ${r.reason}`,
  ),
  ...report.limits,
];
if (textPath) {
  await mkdir(path.dirname(textPath), { recursive: true });
  await writeFile(textPath, lines.join("\n") + "\n");
}
console.log(
  JSON.stringify(
    { output: jsonPath, textReport: textPath, ...summary },
    null,
    2,
  ),
);
