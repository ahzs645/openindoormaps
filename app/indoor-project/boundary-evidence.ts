import type { IndoorDataset } from "./contract";
import type { ProjectRooms } from "./package";
import { nativeCirculationCells } from "./native-circulation";

/** Describe the geometry actually prepared for display and routing. A saved
 * source outline can remain as a place identity inside a shared native cell. */
export function projectBoundaryEvidence(
  data: IndoorDataset,
  rooms: ProjectRooms,
): Map<string, string> {
  const nativeKeys = new Set(
    nativeCirculationCells(data).flatMap((cell) => cell.roomKeys),
  );
  const annotations = new Map(
    rooms.annotations.map((area) => [area.key, area]),
  );
  const meshKeys = new Set(
    data.presentation?.rooms
      .filter((r) => r.boundarySource === "native-mesh-wall-enclosure")
      .map((r) => r.roomKey),
  );
  const displayKeys = new Set(
    data.presentation?.rooms.map((area) => area.roomKey),
  );
  return new Map(
    data.records.map((record) => {
      const area = annotations.get(record.key);
      const native = record.properties.nativeRoutingBoundary as
        | { sourceModelSha256?: string; boundarySource?: string }
        | undefined;
      const text =
        record.circulation && nativeKeys.has(record.key)
          ? "Native floor and wall circulation boundary · navigation regenerated"
          : area?.semanticInteriorProvenance
            ? "Imported Revit Finish boundary · navigation regenerated"
            : area?.nativeInteriorProvenance ||
                (native?.sourceModelSha256 === data.source.modelSha256 &&
                  native.boundarySource === "native-wall-enclosure")
              ? "Recovered native wall interior · navigation regenerated"
              : meshKeys.has(record.key)
                ? "Native 3D wall section · display only; original navigation interior"
                : displayKeys.has(record.key)
                  ? "Prepared native display block · original navigation interior"
                  : "Source outline · boundary review needed";
      return [record.key, text];
    }),
  );
}

/** Compiler rejections cannot supply certified room blocks. Retain the source
 * contour for review; the visitor preparation may separately prove a native
 * wall-face display mask with explicitly assumed doorway closures.
 * Packages without a current compiler audit keep their legacy presentation. */
export function unresolvedRoomBoundaryKeys(data: IndoorDataset): Set<string> {
  const presentation = data.presentation;
  if (presentation?.sourceModelSha256 !== data.source.modelSha256)
    return new Set();
  const prepared = new Set(presentation.rooms.map((r) => r.roomKey));
  const rejected = new Set(presentation.diagnostics.map((d) => d.roomKey));
  return new Set(
    data.records
      .filter(
        (r) =>
          r.walkable &&
          !r.circulation &&
          !r.stair &&
          rejected.has(r.key) &&
          !prepared.has(r.key),
      )
      .map((r) => r.key),
  );
}
