import test from "node:test";
import assert from "node:assert/strict";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import type { IndoorDataset } from "../../app/indoor-project/contract";

function fixture() {
  const ring = (y: number): [number, number][] => [
    [0, y],
    [0, y + 1],
    [4, y + 1],
    [4, y],
  ];
  return {
    source: { modelSha256: "model" },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    nativeLevels: [{ id: 10, elevationFeet: 10 }],
    // The campus floor has a lower native section, even when filtering buildings.
    records: [{ levelId: 10, elevationFeet: 0 }],
    stairDisplay: {
      sourceModelSha256: "model",
      flights: [],
      sourceFlights: [
        {
          stairElementId: 100,
          levelIds: [10],
          buildings: ["08"],
          floorElevationFeet: 10,
          runs: [
            {
              runElementId: 101,
              bottomElevationFeet: 10,
              topElevationFeet: 12,
              beginWithRiser: true,
              endWithRiser: true,
            },
          ],
          treads: [
            { runElementId: 101, elevationFeet: 10.5, ringFeet: ring(0) },
            { runElementId: 101, elevationFeet: 11, ringFeet: ring(1) },
            { runElementId: 101, elevationFeet: 11.5, ringFeet: ring(2) },
          ],
        },
      ],
    },
  } as unknown as IndoorDataset;
}

test("mixed-height campus floor stair ends remain one riser tall in flat and native-height modes", () => {
  const data = fixture();
  const original = JSON.stringify(data);
  for (const relative of [false, true]) {
    for (const building of ["all", "08"]) {
      const steps = projectStairDisplay(
        data,
        [10],
        building,
        relative,
      ).features;
      assert.equal(steps.length, 3);
      const first = steps.find((f) => f.properties!.elevationFeet === 10.5)!;
      const last = steps.find((f) => f.properties!.elevationFeet === 11.5)!;
      const scale = data.alignment.verticalMetresPerFoot;
      assert.ok(
        Math.abs(
          first.properties!.topMetres -
            first.properties!.displayBaseMetres -
            0.5 * scale,
        ) < 1e-9,
        "First tread closes only the native starting riser",
      );
      assert.equal(last.properties!.endpointRisers.length, 1);
      const cap = last.properties!.endpointRisers[0];
      assert.equal(cap.bottom, last.properties!.topMetres);
      assert.ok(
        Math.abs(cap.top - cap.bottom - 0.5 * scale) < 1e-9,
        "Terminal face closes one step, independent of campus floor datum",
      );
      assert.ok(Math.abs(cap.top - (relative ? 12 : 2) * scale) < 1e-9);
    }
  }
  assert.equal(
    JSON.stringify(data),
    original,
    "Native elevations and source runs remain untouched",
  );
});

test("stairs descending from an elevated native section use the same signed end heights", () => {
  const data = fixture();
  data.nativeLevels[0].elevationFeet = 12;
  for (const relative of [false, true]) {
    const steps = projectStairDisplay(data, [10], "08", relative).features;
    const last = steps.find((f) => f.properties!.elevationFeet === 11.5)!;
    const cap = last.properties!.endpointRisers[0];
    assert.ok(Math.abs(cap.top - cap.bottom - 0.1524) < 1e-9);
    if (!relative) {
      assert.equal(cap.top, 0);
      assert.equal(last.properties!.descending, true);
    }
  }
});
