import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { floorDisplayName } from "../../app/indoor-project/floor-display-name";
import { nativeSourceStairPhysicalEvidence } from "../../app/indoor-project/native-source-stair-material";

/** Hash the exact JSON object wire in source property order, keeping only
 * one field's text live. Wrapping each property preserves JSON's omission,
 * escaping and UTF-8 behavior for every present or future dataset field. */
export function nativeRegenerationDatasetSha256(data: IndoorDataset): string {
  const hash = createHash("sha256").update("{");
  let separator = "";
  for (const [key, value] of Object.entries(data)) {
    if (key === "nativeExploreMapping") continue;
    const field = JSON.stringify({ [key]: value });
    if (field === "{}") continue;
    hash.update(separator);
    hash.update(field.slice(1, -1));
    separator = ",";
  }
  return hash.update("}").digest("hex");
}

/** The visitor projection owns the containers it edits. Shared physical data
 * is read synchronously and never mutated. */
export function nativeRegenerationVisitorExpectedSha256(
  data: IndoorDataset,
  floorNames?: Readonly<Record<string, string>>,
): string {
  const expected = { ...data };
  expected.floors = expected.floors.map((floor) => ({
    ...floor,
    name: floorNames?.[floor.id] ?? floorDisplayName(floor.name),
  }));
  expected.nativeSourceStairMaterials = nativeSourceStairPhysicalEvidence(
    data.nativeSourceStairMaterials,
  );
  if (data.stairDisplay) {
    expected.stairDisplay = {
      ...data.stairDisplay,
      flights: data.stairDisplay.flights?.map(
        ({ historicalPreparedTreads: _, ...flight }) => flight,
      ),
      sourceFlights: data.stairDisplay.sourceFlights?.map(
        ({ historicalPreparedTreads: _, ...flight }) => flight,
      ),
    };
  }
  delete expected.selectionDoorThresholds;
  if (!expected.nativeIndoorEnvelopes) delete expected.doorAperturePatchState;
  delete expected.nativeDoorBoundaryClosures;
  if (expected.nativeIndoorEnvelopes && expected.nativeWallPositionRepairs)
    expected.nativeWallPositionRepairs = {
      ...expected.nativeWallPositionRepairs,
      walls: expected.nativeWallPositionRepairs.walls.map((wall) => ({
        ...wall,
        notes: "Source-bound physical wall placement.",
      })),
    };
  else delete expected.nativeWallPositionRepairs;
  delete expected.reviewedAreaPartitions;
  if (data.indoorExclusions)
    expected.indoorExclusions = {
      ...data.indoorExclusions,
      areas: data.indoorExclusions.areas.map(({ notes: _, ...area }) => area),
    };
  if (data.reviewedPlaceLabels)
    expected.reviewedPlaceLabels = {
      ...data.reviewedPlaceLabels,
      labels: data.reviewedPlaceLabels.labels.map(
        ({ notes: _, ...label }) => label,
      ),
    };
  if (expected.nativeSelectionContactRepairs)
    expected.nativeSelectionContactRepairs = {
      ...expected.nativeSelectionContactRepairs,
      repairs: expected.nativeSelectionContactRepairs.repairs
        .filter((repair) => repair.status === "applied")
        .map((repair) => ({
          ...repair,
          notes:
            "Provisional source-bound native selection contact; physical geometry and access unchanged. Revisit required.",
        })),
    };
  return nativeRegenerationDatasetSha256(expected);
}
