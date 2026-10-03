import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import type { IndoorDataset } from "../../app/indoor-project/contract";
test("native inventory shows an unbound flight in both room views without changing routing", () => {
  const data: IndoorDataset = JSON.parse(
    readFileSync(
      new URL("../fixtures/unbc-pass-through-display.json", import.meta.url),
      "utf8",
    ),
  );
  data.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: data.source.modelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 100,
        levelIds: [311],
        buildings: ["07"],
        floorElevationFeet: 0,
        sourceGeometry: "native-cache",
        treads: [
          {
            runElementId: 101,
            elevationFeet: 0.5,
            ringFeet: [
              [0, 0],
              [2, 0],
              [2, 1],
              [0, 1],
            ],
          },
        ],
      },
    ],
  };
  const before = JSON.stringify(data);
  for (const relative of [false, true]) {
    const features = projectStairDisplay(data, [311], "07", relative).features;
    assert.equal(features.length, 1);
    assert.equal(features[0].properties!.stairElementId, 100);
    assert.ok(Number.isFinite(features[0].properties!.topMetres));
  }
  assert.equal(projectStairDisplay(data, [694], "07").features.length, 0);
  assert.equal(projectStairDisplay(data, [311], "08").features.length, 0);
  assert.equal(JSON.stringify(data), before);
});
