import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { readIndoorProject } from "../../app/indoor-project/package";
import { nativeEditPoint } from "../../app/indoor-project/map-edits";
import { prepareFloor } from "../../app/indoor-project/prepared-floor";
import { auditWallRenderGeometry } from "../../app/indoor-project/wall-render-audit";
const [input, output] = process.argv.slice(2);
if (!input || !output || path.resolve(input) === path.resolve(output))
  throw new Error(
    "Usage: npm run indoor:audit-rendering -- project.zip report.json",
  );
const project = await readIndoorProject(await readFile(input)),
  data = project.dataset,
  before = JSON.stringify(data),
  hash = (s: string) => createHash("sha256").update(s).digest("hex");
const scopes = [
  ...data.floors.map((f) => ({ ...f, scope: "campus-floor" as const })),
  ...data.nativeLevels.map((l) => ({
    id: `native:${l.id}`,
    name: `Native ${l.name}`,
    levelIds: [l.id],
    scope: "native-level" as const,
  })),
];
const views = scopes.flatMap((scope) =>
  [false, true].map((relativeHeights) => {
    const p = prepareFloor(data, scope.levelIds, "all", {
      review: false,
      simplifyGeometry: false,
      relativeHeights,
      showPillars: false,
      showPassThroughPlaces: false,
      showVestibuleDoors: false,
      showStructures: false,
    });
    const audit = auditWallRenderGeometry(
        p.presentation.visitorWalls,
        p.stairCutRooms,
      ),
      counts: Record<string, number> = {};
    for (const r of audit.repairs)
      counts[r.reason] = (counts[r.reason] ?? 0) + r.count;
    const risk = scope.scope === "campus-floor" ? audit.faceRisks : [];
    const view = {
      scopeId: scope.id,
      scope: scope.scope,
      name: scope.name,
      levelIds: scope.levelIds,
      relativeHeights,
      buildings: [
        ...new Set(p.presentation.display.records.map((r) => r.building)),
      ].sort(),
      sourceWallParts: p.presentation.visitorWalls.features.reduce(
        (s, f) => s + f.geometry.coordinates.length,
        0,
      ),
      cleanWallParts: audit.cleaned.features.length,
      repairCounts: counts,
      repairs: audit.repairs.filter(
        (r) =>
          ![
            "collinear-vertex",
            "duplicate-vertex",
            "winding-normalized",
          ].includes(r.reason),
      ),
      beforeCleanupFindings: audit.issues.filter(
        (i) => i.stage === "before-cleanup",
      ),
      unresolved: audit.unresolved.map((i) => {
        const pointFeet = i.pointGeographic
          ? nativeEditPoint(data, i.pointGeographic)
          : undefined;
        const nearby = pointFeet
          ? data.records
              .filter((r) => r.levelId === i.levelId)
              .map((r) => ({
                key: r.key,
                number: r.number,
                name: r.name,
                building: r.building,
                distanceFeet: Math.min(
                  ...r.ringsFeet
                    .flat()
                    .map((p) =>
                      Math.hypot(p[0] - pointFeet[0], p[1] - pointFeet[1]),
                    ),
                ),
              }))
              .sort((a, b) => a.distanceFeet - b.distanceFeet)
              .slice(0, 3)
          : [];
        return {
          ...i,
          pointFeet,
          nearbyPlaces: nearby,
          locationEvidence:
            "Component reference point and nearest source contours; proximity is not a verified native wall attachment.",
        };
      }),
      coverage:
        audit.cleaned.features.length > 0
          ? "audited-visitor-wall-surfaces"
          : "no-visitor-wall-surfaces",
      browserCandidates:
        scope.scope === "campus-floor" && !relativeHeights
          ? p.stairCutRooms.features
              .filter(
                (f) => f.properties?.key && f.properties?.color === "#f5f5f4",
              )
              .map((f) => {
                const r = data.records.find(
                  (r) => r.key === f.properties?.key,
                )!;
                return {
                  key: r.key,
                  number: r.number,
                  building: r.building,
                  levelId: r.levelId,
                  score: r.ringsFeet.flat().length,
                };
              })
              .filter((r) => r.number)
              .slice(0, 20)
          : [],
      faceRiskCount: risk.length,
      faceRisks: risk.slice(0, 200),
      mitigatedBy:
        "Visitor 3D precision wall mesh and shared depth bias; flat 2D uses cleaned polygons. Coplanar contacts are not native-boundary errors.",
    };
    console.log(
      `${scope.name} ${relativeHeights ? "relative" : "flat"}: ${view.sourceWallParts} → ${view.cleanWallParts} parts, ${view.repairs.length} cleanup events, ${view.unresolved.length} unresolved geometry findings, ${view.faceRiskCount} adjacent-face risks`,
    );
    return view;
  }),
);
assert.equal(
  JSON.stringify(data),
  before,
  "Audit must not alter geometry, routing or reviews",
);
const report = {
  format: "openindoormaps-rendering-audit",
  version: 1,
  createdAt: new Date().toISOString(),
  input: path.resolve(input),
  sourceModelSha256: data.source.modelSha256,
  sourceRoomsSha256: data.source.roomsSha256,
  datasetSha256: hash(before),
  inputUnchanged: true,
  precisionMetres: 1e-5,
  views,
  summary: {
    campusFloors: data.floors.length,
    nativeLevels: data.nativeLevels.length,
    views: views.length,
    unresolvedFindings: views.reduce((s, v) => s + v.unresolved.length, 0),
    uniqueUnresolvedFindings: [
      ...new Map(
        views
          .flatMap((v) => v.unresolved)
          .map((i) => [
            JSON.stringify([i.levelId, i.code, i.pointGeographic]),
            i,
          ]),
      ).values(),
    ],
    nativeLevelsWithoutVisitorWalls: data.nativeLevels
      .filter(
        (l) =>
          !views.some(
            (v) =>
              v.scope === "native-level" &&
              v.levelIds.includes(l.id) &&
              v.sourceWallParts,
          ),
      )
      .map((l) => ({ id: l.id, name: l.name })),
    scope:
      "All campus floors and every native level; detailed visitor geometry with pillars hidden, in normal and relative-height modes.",
    limitations:
      "Geometry findings detect causes, not every possible GPU-specific visual artifact. Face risks are normal adjacency mitigated by the renderer; browser zoom/pitch checks provide independent visual evidence.",
  },
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(`Saved ${path.resolve(output)}`);
if (report.summary.unresolvedFindings) process.exitCode = 2;
