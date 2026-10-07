import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import pc from "polygon-clipping";
import { readIndoorProject } from "../../app/indoor-project/package";
import { projectBoundaryEvidence } from "../../app/indoor-project/boundary-evidence";
import { registeredSingleDoorSwings } from "../../../reviter/lib/reviter/registered-single-door-swings";
import type { BoundaryReference } from "../../../reviter/lib/reviter/room-boundaries";
import { validRoomBoundary } from "../../../reviter/lib/reviter/room-directory";

const [input, output, ...extra] = process.argv.slice(2);
if (
  !input ||
  !output ||
  extra.length > 0 ||
  path.resolve(input) === path.resolve(output)
)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-room-display.ts project.zip report.json",
  );
const bytes = await readFile(input),
  project = await readIndoorProject(bytes),
  data = project.dataset;
const before = JSON.stringify(data),
  evidence = projectBoundaryEvidence(data, project.rooms);
const reference = project.rooms.boundaryReference as
  | BoundaryReference
  | undefined;
const sections = new Map(
  reference?.sections.map((s) => [
    s.sectionId,
    { section: s, swings: registeredSingleDoorSwings(s) },
  ]) ?? [],
);
const prepared = new Map(data.presentation?.rooms.map((r) => [r.roomKey, r]));
// Coplanar native faces can differ by floating-point roundoff. Match the
// compiler's 1e-7 ft boolean retry without repairing or moving source geometry.
const retryGridFeet = 1e-7;
const quantize = (rings: pc.Polygon): pc.Polygon =>
  rings.map((ring) =>
    ring.map(([x, y]) => [
      Math.round(x * 1e7) / 1e7,
      Math.round(y * 1e7) / 1e7,
    ]),
  );
const area = (parts: pc.MultiPolygon) =>
  parts.reduce(
    (sum, rings) =>
      sum +
      rings.reduce((s, ring, i) => {
        const origin = ring[0];
        return (
          s +
          ((i ? -1 : 1) *
            Math.abs(
              ring.reduce((s, p, j) => {
                const q = ring[(j + 1) % ring.length];
                return (
                  s +
                  (p[0] - origin[0]) * (q[1] - origin[1]) -
                  (q[0] - origin[0]) * (p[1] - origin[1])
                );
              }, 0),
            )) /
            2
        );
      }, 0),
    0,
  );
const records = data.records
  .map((record) => {
    const room = prepared.get(record.key),
      proof = room?.sourceProof;
    const section = proof && sections.get(proof.sectionId);
    const wallIndices = new Set(proof?.wallSegmentIndices);
    const unclosedSymbols =
      section?.swings.filter(
        (s) =>
          s.arcSegmentIndices.filter((i) => wallIndices.has(i)).length >= 8,
      ) ?? [];
    let unsupportedInteriorSquareFeet: number | null = null,
      topologyError: string | undefined,
      initialFloorComparisonError: string | undefined,
      floorComparisonRetried = false;
    if (room) {
      try {
        const floors =
          data.walkingSupport?.floors
            .filter(
              (f) => Math.abs(f.elevationFeet - record.elevationFeet) < 0.15,
            )
            .flatMap((f) => f.partsFeet ?? [f.ringsFeet]) ?? [];
        if (floors.length > 0) {
          try {
            unsupportedInteriorSquareFeet = area(
              pc.difference(room.interiorRingsFeet, ...floors),
            );
          } catch (error) {
            initialFloorComparisonError =
              error instanceof Error ? error.message : String(error);
            // Never round a genuine crossing or invalid original ring into an
            // apparently valid result. Retry only individually valid originals.
            if (
              ![room.interiorRingsFeet, ...floors].every((rings) =>
                rings.every((ring) => validRoomBoundary(ring, 1e-12)),
              )
            )
              throw error;
            floorComparisonRetried = true;
            unsupportedInteriorSquareFeet = area(
              pc.difference(
                quantize(room.interiorRingsFeet),
                ...floors.map(quantize),
              ),
            );
          }
        }
      } catch (error) {
        topologyError = error instanceof Error ? error.message : String(error);
      }
    }
    const finite = room?.interiorRingsFeet.every(
      (r) => r.length >= 3 && r.every((p) => p.every(Number.isFinite)),
    );
    return {
      key: record.key,
      number: record.number,
      name: record.name,
      building: record.building,
      levelId: record.levelId,
      evidence: evidence.get(record.key),
      boundarySource: room?.boundarySource,
      classification: record.stair
        ? "native-stair-display"
        : room
          ? topologyError || !finite
            ? "invalid-display-review"
            : unclosedSymbols.length > 0
              ? "door-swing-notch-review"
              : unsupportedInteriorSquareFeet === null ||
                  unsupportedInteriorSquareFeet > 0.002
                ? "floor-support-review"
                : "prepared-display-checked"
          : record.circulation
            ? "circulation"
            : "boundary-review-needed",
      sourceGeometryMatches: room
        ? room.sourceGeometryKey ===
          JSON.stringify([record.levelId, record.ringsFeet])
        : null,
      unsupportedInteriorSquareFeet,
      topologyError,
      floorComparisonRetried,
      floorComparisonGridFeet: floorComparisonRetried
        ? retryGridFeet
        : undefined,
      initialFloorComparisonError,
      closedDoorSwings: proof?.closedDoorSwings ?? [],
      unclosedDoorSwings: unclosedSymbols,
      arrivalNodeId: record.arrivalNodeId,
    };
  })
  .sort(
    (a, b) =>
      a.building.localeCompare(b.building) ||
      a.levelId - b.levelId ||
      a.number.localeCompare(b.number),
  );
if (JSON.stringify(data) !== before)
  throw new Error("Read-only audit changed the dataset.");
const counts = records.reduce<Record<string, number>>((s, r) => {
  s[r.classification] = (s[r.classification] ?? 0) + 1;
  return s;
}, {});
const report = {
  archive: path.resolve(input),
  archiveSha256: createHash("sha256").update(bytes).digest("hex"),
  revision: project.manifest.indoor.sha256,
  source: data.source,
  records: records.length,
  counts,
  sourceOutlineCount: records.filter(
    (r) => r.evidence === "Source outline · boundary review needed",
  ).length,
  datasetUnchanged: true,
  floorComparisonsRetried: records.filter((r) => r.floorComparisonRetried)
    .length,
  areas: records,
};
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      records: report.records,
      counts,
      sourceOutlineCount: report.sourceOutlineCount,
      report: path.resolve(output),
    },
    null,
    2,
  ),
);
