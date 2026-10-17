import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { createNativeMaterialSectionIndex } from "./native-material-sections";
import { nativeRationalOverlay } from "./native-rational-overlay";
import { nativeContainedWallDrawing } from "./native-wall-contained-display";
import { preparedReviewedDoorApertures } from "./reviewed-door-apertures";
import { geographicPoint } from "./routing";

/** Overview paint for physical columns and walls below the normal 4 ft plan
 * cut. Read the original ankle sections, never an uncut historical wall host.
 * The caller still clips paint to its checked floor scope and exclusions. */
export function overviewPhysicalMaterial(
  data: IndoorDataset,
  levelIds: number[],
): FeatureCollection<MultiPolygon> {
  const features: FeatureCollection<MultiPolygon>["features"] = [];
  const source = data.nativeMaterialSections;
  if (!source || source.sourceModelSha256 !== data.source.modelSha256)
    return { type: "FeatureCollection", features };
  const index = createNativeMaterialSectionIndex(
    source,
    data.source.modelSha256,
  );
  const repairs = new Map(
    data.nativeWallPositionRepairs?.sourceModelSha256 ===
    data.source.modelSha256
      ? data.nativeWallPositionRepairs.walls.map((repair) => [
          repair.nativeElementId,
          repair,
        ])
      : [],
  );
  const apertures = preparedReviewedDoorApertures(data)?.patches ?? [];
  for (const levelId of new Set(levelIds)) {
    const level = data.nativeLevels.find(
      (candidate) => candidate.id === levelId,
    );
    if (!level) continue;
    const cut = level.elevationFeet + 0.1;
    const sections = index
      .at(level.elevationFeet, cut, levelId)
      .flatMap((row) => row.sections)
      .filter(
        (section) =>
          section.baseElevationFeet <= cut &&
          section.topElevationFeet > cut &&
          (section.kind === "column" ||
            (section.kind === "wall" &&
              section.topElevationFeet <= level.elevationFeet + 4)),
      );
    if (sections.length === 0) continue;
    for (const material of sections) {
      const repair = repairs.get(material.nativeElementId),
        original = repair?.originalRingsFeet[0]?.[0],
        target = repair?.ringsFeet[0]?.[0],
        dx = original && target ? target[0] - original[0] : 0,
        dy = original && target ? target[1] - original[1] : 0;
      const placed =
        dx || dy
          ? material.partsFeet.map((rings) =>
              rings.map((ring) =>
                ring.map(([x, y]) => [x + dx, y + dy] as [number, number]),
              ),
            )
          : material.partsFeet;
      const cuts = apertures.filter(
        (aperture) =>
          aperture.levelId === levelId &&
          aperture.wallEvidence.some(
            (wall) => wall.nativeElementId === material.nativeElementId,
          ),
      );
      // Native source parts already retain native door cuts and inner rings.
      // Only an active reviewed host aperture needs a new contained drawing.
      const parts =
        cuts.length > 0
          ? nativeContainedWallDrawing(
              nativeRationalOverlay(
                "difference",
                placed,
                cuts.map((aperture) => [aperture.apertureFeet]),
              ),
            )
          : placed;
      if (parts.length === 0) continue;
      features.push({
        type: "Feature",
        properties: {
          levelId,
          nativeElementId: material.nativeElementId,
          nativePhysical: true,
          overviewLow: true,
          kind: material.kind,
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: parts.map((rings) =>
            rings.map((ring) =>
              [...ring, ring[0]].map((point) => geographicPoint(data, point)),
            ),
          ),
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
