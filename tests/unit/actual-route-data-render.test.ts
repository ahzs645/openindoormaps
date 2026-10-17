import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  renderActualRouteSvg,
  type RecordedRouteRow,
} from "../../scripts/indoor/render-actual-route-data";
const outer = [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
  ],
  hole = [
    [8, 8],
    [12, 8],
    [12, 12],
    [8, 12],
  ];
function fixture() {
  const data = {
    source: { modelSha256: "a".repeat(64) },
    nativeLevels: [1, 2].map((id) => ({
      id,
      name: `Floor ${id}`,
      elevationFeet: (id - 1) * 10,
    })),
    records: [1, 2].map((id) => ({
      key: `r${id}`,
      number: `R${id}`,
      name: "Room",
      levelId: id,
      elevationFeet: (id - 1) * 10,
      ringsFeet: [outer],
      circulation: false,
      stair: false,
      properties: {},
      arrivalNodeId: `n${id}`,
    })),
    nodes: [
      { id: "n1", pointFeet: [2, 2, 0] },
      { id: "n2", pointFeet: [18, 18, 10] },
    ],
    edges: [{ id: "ramp", kind: "ramp" }],
    nativeExploreMapping: {
      levels: [1, 2].map((levelId) => ({
        levelId,
        regions: [
          {
            id: `floor${levelId}`,
            ringsFeet: [outer, hole],
            displayPartsFeet: [[outer, hole]],
          },
        ],
      })),
    },
  } as unknown as IndoorDataset;
  const row: RecordedRouteRow = {
    start: "r1",
    end: "r2",
    mode: "public",
    route: {
      nodeIds: ["n1", "n2"],
      edgeIds: ["walk1", "ramp", "walk2"],
      distanceMetres: 10,
      paths: [
        {
          edgeIds: ["walk1"],
          levelIds: [1],
          pointsFeet: [
            [2, 2, 0],
            [4, 2, 0],
          ],
        },
        {
          edgeIds: ["ramp"],
          levelIds: [1, 2],
          pointsFeet: [
            [4, 2, 0],
            [16, 18, 10],
          ],
          sourceReason: "vertical-transition",
        },
        {
          edgeIds: ["walk2"],
          levelIds: [2],
          pointsFeet: [
            [16, 18, 10],
            [18, 18, 10],
          ],
        },
      ],
    },
  };
  return { data, row };
}
test("actual path figures retain complete floor holes and only project recorded transitions on their served levels", () => {
  const { data, row } = fixture(),
    before = JSON.stringify({ data, row }),
    rendered = renderActualRouteSvg(data, row, "baseline");
  assert.deepEqual(rendered.statistics.levels, [1, 2]);
  assert.equal(rendered.statistics.nativeHoles, 2);
  assert.equal(rendered.statistics.originalRoutePaths, 3);
  assert.equal(rendered.statistics.originalRoutePoints, 6);
  assert.equal(rendered.statistics.projectedTransitionCopies, 2);
  assert.equal(rendered.statistics.drawnPaths, 4);
  assert.equal(rendered.statistics.newRouteSegmentsGenerated, false);
  assert.equal(rendered.statistics.browserScreenshot, false);
  assert.match(rendered.svg, /M8,8L12,8L12,12L8,12Z/);
  assert.match(rendered.svg, /clip-rule="evenodd"/);
  assert.match(rendered.svg, /BASELINE/);
  assert.match(rendered.svg, /plan projection/);
  assert.equal(JSON.stringify({ data, row }), before);
});
test("a blocked calculation, malformed actual coordinates or recorded QA failure cannot be turned into a route figure", () => {
  for (const change of [
    (r: RecordedRouteRow) => {
      r.route = null;
    },
    (r: RecordedRouteRow) => {
      r.route!.paths[0].pointsFeet[0][0] = NaN;
    },
    (r: RecordedRouteRow) => {
      r.errors = ["graph-vs-calculator-availability"];
    },
  ]) {
    const { data, row } = fixture();
    change(row);
    assert.throws(() => renderActualRouteSvg(data, row, "candidate"));
  }
});

test("only complete stored displayed ramp triangles are projected, without a hull or underside fill", () => {
  const { data, row } = fixture();
  data.rampDisplay = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    ramps: [
      {
        nativeElementId: 10,
        edgeId: "ramp",
        levelIds: [1, 2],
        anchorPointFeet: [4, 2, 0],
        trianglesFeet: [
          [
            [4, 2, 0],
            [16, 18, 10],
            [18, 16, 10],
          ],
        ],
        bodyTrianglesFeet: [
          [
            [6.123, 7.3, -1],
            [7.123, 7.3, -1],
            [6.123, 8.3, -1],
          ],
        ],
      },
    ],
  };
  const result = renderActualRouteSvg(data, row, "baseline");
  assert.equal(result.statistics.rampTriangles, 2);
  assert.match(result.svg, /M4,2L16,18L18,16Z/);
  assert.doesNotMatch(result.svg, /M6\.123,7\.3/);
  data.rampDisplay.sourceModelSha256 = "f".repeat(64);
  assert.equal(
    renderActualRouteSvg(data, row, "baseline").statistics.rampTriangles,
    0,
  );
});
