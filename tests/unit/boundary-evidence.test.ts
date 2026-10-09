import test from "node:test";
import assert from "node:assert/strict";
import desk from "../fixtures/unbc-library-services-desk-display.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectRooms } from "../../app/indoor-project/package";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import { projectBoundaryEvidence } from "../../app/indoor-project/boundary-evidence";
const source = (data: IndoorDataset) =>
  ({ annotations: data.records.map((r) => ({ key: r.key })) }) as ProjectRooms;
test("a shared native circulation cell is reported as native even when place outlines are retained", () => {
  const data = structuredClone(desk) as unknown as IndoorDataset;
  const record = data.records[0];
  record.circulation = true;
  data.circulationGeometry = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: nativeCirculationGeometryKey(data),
    cells: [
      {
        id: "shared",
        roomKeys: [record.key],
        levelIds: [record.levelId],
        elevationFeet: record.elevationFeet,
        ringsFeet: record.ringsFeet,
        nativeFloorIds: [100],
        sourceCoverage: 1,
      },
    ],
  };
  const rooms = source(data);
  assert.match(
    projectBoundaryEvidence(data, rooms).get(record.key)!,
    /^Native floor and wall circulation/,
  );
  data.circulationGeometry.sourceModelSha256 = "foreign";
  assert.doesNotMatch(
    projectBoundaryEvidence(data, rooms).get(record.key)!,
    /^Native floor and wall circulation/,
  );
  data.circulationGeometry.sourceModelSha256 = data.source.modelSha256;
  record.ringsFeet = record.ringsFeet.map((r) => r.map(([x, y]) => [x + 1, y]));
  assert.doesNotMatch(
    projectBoundaryEvidence(data, rooms).get(record.key)!,
    /^Native floor and wall circulation/,
  );
});
test("compiler-recovered routing enclosures are distinguished from display-only blocks", () => {
  const data = structuredClone(desk) as unknown as IndoorDataset;
  const record = data.records[0],
    rooms = source(data);
  record.circulation = false;
  record.properties.nativeRoutingBoundary = {
    sourceModelSha256: data.source.modelSha256,
    boundarySource: "native-wall-enclosure",
  };
  assert.match(
    projectBoundaryEvidence(data, rooms).get(record.key)!,
    /^Recovered native wall interior/,
  );
  record.properties.nativeRoutingBoundary = {
    sourceModelSha256: "foreign",
    boundarySource: "native-wall-enclosure",
  };
  assert.doesNotMatch(
    projectBoundaryEvidence(data, rooms).get(record.key)!,
    /^Recovered native wall interior/,
  );
});
test("registered door-symbol closure is described as display evidence without claiming native routing", () => {
  const data = structuredClone(desk) as unknown as IndoorDataset;
  const record = data.records[0];
  record.circulation = false;
  record.properties.nativeRoutingBoundary = undefined;
  data.presentation = {
    version: 1,
    generator: "reviter/native-room-presentation-1",
    sourceModelSha256: data.source.modelSha256,
    junctionToleranceFeet: 0.08,
    diagnostics: [],
    rooms: [
      {
        roomKey: record.key,
        levelId: record.levelId,
        sourceGeometryKey: JSON.stringify([record.levelId, record.ringsFeet]),
        interiorRingsFeet: record.ringsFeet,
        blockPartsFeet: [record.ringsFeet],
        boundarySource: "registered-source-wall-enclosure",
        boundaryElementIds: [],
        sourceCoverage: 1,
        cellCoverage: 1,
        sourceProof: {
          sourceSha256: "survey",
          sectionId: "sheet",
          registrationErrorFeet: 0,
          wallSegmentIndices: [],
          doorSegmentIndices: [],
          nativeFloorCoveredSquareFeet: 100,
          closedDoorSwings: [
            {
              arcSegmentIndices: [1, 2, 3],
              leafSegmentIndices: [4],
              supportingWallSegmentIndices: [5, 6],
              hingeFeet: [0, 0],
              radiusFeet: 3,
              closedLeafFeet: [
                [0, 0],
                [3, 0],
              ],
              thresholdSegments: [
                [
                  [0, 0],
                  [3, 0],
                ],
              ],
            },
          ],
        },
      },
    ],
  };
  assert.match(
    projectBoundaryEvidence(data, source(data)).get(record.key)!,
    /^Registered architectural walls · door swings closed for display; original navigation interior$/,
  );
  data.presentation!.rooms[0].sourceProof!.closedDoorSwings = [];
  assert.match(
    projectBoundaryEvidence(data, source(data)).get(record.key)!,
    /^Registered architectural walls · display only/,
  );
});
