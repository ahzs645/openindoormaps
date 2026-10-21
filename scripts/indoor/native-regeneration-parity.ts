import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { floorDisplayName } from "../../app/indoor-project/floor-display-name";
import { nativeSourceStairPhysicalEvidence } from "../../app/indoor-project/native-source-stair-material";

/** This is parity evidence only, never imported-validation authority. Own one
 * temporary clone per call and return only its exact legacy JSON/UTF8 digest. */
function ownedDatasetSha256(snapshot: IndoorDataset): string {
  delete snapshot.nativeExploreMapping;
  return createHash("sha256")
    .update(new TextEncoder().encode(JSON.stringify(snapshot)))
    .digest("hex");
}

/** Preserve the former structuredClone/delete/JSON/UTF8/SHA operation while
 * keeping the full comparison tree out of the regeneration module's scope. */
export function nativeRegenerationDatasetSha256(data: IndoorDataset): string {
  return ownedDatasetSha256(structuredClone(data));
}

/** Match the visitor export's authoring projections on an owned clone.
 * Every physical field outside those existing visitor projections is retained. */
export function nativeRegenerationVisitorExpectedSha256(
  data: IndoorDataset,
  floorNames?: Readonly<Record<string, string>>,
): string {
  const expected = structuredClone(data);
  expected.floors = expected.floors.map((floor) => ({
    ...floor,
    name: floorNames?.[floor.id] ?? floorDisplayName(floor.name),
  }));
  expected.nativeSourceStairMaterials = nativeSourceStairPhysicalEvidence(
    data.nativeSourceStairMaterials,
  );
  for (const flight of expected.stairDisplay?.sourceFlights ?? [])
    delete flight.historicalPreparedTreads;
  for (const flight of expected.stairDisplay?.flights ?? [])
    delete flight.historicalPreparedTreads;
  delete expected.selectionDoorThresholds;
  if (!expected.nativeIndoorEnvelopes) delete expected.doorAperturePatchState;
  delete expected.nativeDoorBoundaryClosures;
  if (expected.nativeIndoorEnvelopes && expected.nativeWallPositionRepairs)
    expected.nativeWallPositionRepairs.walls =
      expected.nativeWallPositionRepairs.walls.map((wall) => ({
        ...wall,
        notes: "Source-bound physical wall placement.",
      }));
  else delete expected.nativeWallPositionRepairs;
  delete expected.reviewedAreaPartitions;
  for (const area of expected.indoorExclusions?.areas ?? []) delete area.notes;
  for (const label of expected.reviewedPlaceLabels?.labels ?? [])
    delete label.notes;
  if (expected.nativeSelectionContactRepairs)
    expected.nativeSelectionContactRepairs.repairs =
      expected.nativeSelectionContactRepairs.repairs
        .filter((repair) => repair.status === "applied")
        .map((repair) => ({
          ...repair,
          notes:
            "Provisional source-bound native selection contact; physical geometry and access unchanged. Revisit required.",
        }));
  return ownedDatasetSha256(expected);
}
