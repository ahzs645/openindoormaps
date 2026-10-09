import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures/native-area-project";
import {
  preparedDisplayScopes,
  visitorDisplayDefaultOptions,
} from "../../scripts/indoor/prepare-display-assets";
import type { IndoorDataset } from "../../app/indoor-project/contract";
function data() {
  const d = fixture();
  d.nativeLevels.push(
    { id: 2, name: "Floor 1.25", elevationFeet: 3 },
    { id: 3, name: "Floor 1.5", elevationFeet: 9 },
    { id: 4, name: "Unprepared", elevationFeet: 12 },
  );
  d.floors[0].levelIds = [1, 2, 3];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 9,
        ringsFeet: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
          ],
        ],
      },
    ],
  };
  d.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: d.source.modelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 200,
        levelIds: [1, 3],
        buildings: [],
        floorElevationFeet: 0,
        sourceGeometry: "native-brep",
        treads: [],
      },
    ],
  };
  d.nativePhysicalLevels = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    levels: d.nativeLevels.map((l) => ({
      nativeLevelId: l.id,
      sourceName: l.name,
      elevationFeet: l.elevationFeet,
      nativeFloorElementIds: l.id === 3 ? [100] : [],
      nativeStairElementIds: l.id === 3 ? [200] : [],
      annotationLevel: l.id === 1,
    })),
    displayAliases: [
      {
        nativeLevelId: 3,
        displayFloorId: d.floors[0].id,
        sourceName: "Floor 1.5",
        elevationFeet: 9,
        evidence: "original-fractional-level-name",
        provisional: true,
      },
    ],
  };
  // Only inventory is exercised here; package reader separately validates each
  // real exact mapping before the CLI admits a scope for preparation.
  d.nativeExploreMapping = {
    version: 3,
    levels: [1, 2, 3].map((levelId) => ({ levelId })),
  } as unknown as IndoorDataset["nativeExploreMapping"];
  return d;
}
test("pregenerator includes actual 2D main subset, public composite and offset native plane", () => {
  const d = data(),
    before = JSON.stringify(d);
  assert.deepEqual(preparedDisplayScopes(d).scopes, [[1, 2, 3], [1, 2], [3]]);
  assert.deepEqual(preparedDisplayScopes(d, true).scopes, [
    [1, 2, 3],
    [1, 2],
    [3],
    [1],
    [2],
  ]);
  assert.equal(JSON.stringify(d), before);
  assert.equal(visitorDisplayDefaultOptions.showPillars, true);
  assert.equal(visitorDisplayDefaultOptions.showDoorwayRecesses, false);
});
test("missing published scopes stay unavailable rather than fabricated empty assets", () => {
  const d = data();
  d.nativeExploreMapping!.levels = d.nativeExploreMapping!.levels.filter(
    (l) => l.levelId !== 3,
  );
  const result = preparedDisplayScopes(d, true);
  assert.deepEqual(result.scopes, [[1, 2], [1], [2]]);
  assert.deepEqual(result.unavailableScopes, [[1, 2, 3], [3]]);
  assert.ok(result.scopes.every((ids) => !ids.includes(3) && !ids.includes(4)));
  d.nativeExploreMapping = undefined;
  assert.throws(
    () => preparedDisplayScopes(d),
    /validated exact native mapping/,
  );
});
