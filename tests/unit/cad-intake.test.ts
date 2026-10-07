import assert from "node:assert/strict";
import test from "node:test";
import { validateCadIntake } from "../../app/indoor-project/cad-intake";
const source = { name: "floor.dwg", sha256: "a".repeat(64), sizeBytes: 100 };
const campusSource = {
  name: "campus.dwg",
  sha256: "b".repeat(64),
  sizeBytes: 100,
};
function fixture() {
  const room = (key: string) => ({
    key,
    number: "02-101",
    name: "Office",
    anchorMetres: [1, 1],
    ringsMetres: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
      ],
    ],
    matchMode: "contains",
    enclosureVerified: false,
    routingEligible: false,
    source: {
      handle: "A1",
      sheet: "Building",
      anchorDrawing: [1, -1300000],
      roomNumberFloor: 1,
    },
  });
  const floor = (id: string, key: string, ordinal: number) => ({
    id,
    ordinal,
    name: id,
    elevationMetres: null,
    nativeLevelId: null,
    alignment: {
      rotationDegrees: 0,
      translationMetres: [0, 0],
      status: "provisional",
      overlapScore: 0.8,
      alternativeScore: 0.5,
    },
    rooms: [room(key)],
    linework: [
      {
        sourceHandle: "AA",
        type: "LINE",
        layer: "Walls",
        pointsMetres: [
          [0, 0],
          [4, 0],
        ],
      },
    ],
    stairSymbols: [],
  });
  return {
    format: "openindoormaps-cad-intake",
    version: 1,
    sourceSha256: source.sha256,
    evidenceSha256: "c".repeat(64),
    sourceFiles: [source, campusSource],
    unitEvidence: {
      metresPerDrawingUnit: 0.001,
      registrationCount: 3,
      method: "saved registration",
    },
    appliedToNativeGeometry: false,
    graphEdges: [],
    buildings: [
      {
        id: "b2",
        code: "02",
        name: "Building 2",
        placement: null,
        coordinateSystem: "building-local-metres",
        floors: [floor("f1", "r1", 1), floor("f2", "r2", 2)],
        connectors: [
          {
            id: "c1",
            kind: "stair",
            fromFloor: "f1",
            toFloor: "f2",
            fromRoom: "r1",
            toRoom: "r2",
            fromHint: null,
            toHint: null,
            fromPointMetres: [1, 1],
            toPointMetres: [1, 1],
            offsetMetres: 0,
            evidence: "label",
            status: "needs-landing-review",
            routingEligible: false,
          },
        ],
      },
    ],
    campusReference: {
      source: campusSource,
      registration: {
        method: "configured controls",
        surveyed: false,
        controlCount: 3,
        rmsMetres: 11,
        status: "approximate",
      },
      routingEligible: false,
      graphEdges: [],
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [-122.8, 53.8],
                [-122.81, 53.81],
              ],
            },
            properties: {
              sourceHandle: "CC",
              kind: "sidewalk",
              layer: "sidewalk",
              routingEligible: false,
              evidence: "edge",
            },
          },
        ],
      },
    },
  };
}
test("unplaced CAD floor stack retains holes and remains separate from native geometry", () => {
  const data = validateCadIntake(fixture());
  assert.equal(data.buildings[0].placement, null);
  assert.equal(data.buildings[0].floors[0].rooms[0].ringsMetres.length, 2);
  assert.equal(data.buildings[0].floors[0].nativeLevelId, null);
  assert.equal(data.campusReference.graphEdges.length, 0);
});
test("reject native level assignment, accidental route admission and unbound connectors", () => {
  let d = fixture();
  (
    d.buildings[0].floors[0] as unknown as { nativeLevelId: number }
  ).nativeLevelId = 311;
  assert.throws(() => validateCadIntake(d), /schematic floor/);
  d = fixture();
  d.campusReference.routingEligible = true;
  assert.throws(() => validateCadIntake(d), /admit routes/);
  d = fixture();
  d.buildings[0].connectors[0].toRoom = "r1";
  assert.throws(() => validateCadIntake(d), /unbound/);
});
test("reject invalid local/geographic coordinates, duplicate identities and missing source binding", () => {
  let d = fixture();
  d.buildings[0].floors[0].rooms[0].ringsMetres[1][0][1] = NaN;
  assert.throws(() => validateCadIntake(d), /coordinates/);
  d = fixture();
  d.campusReference.geojson.features[0].geometry.coordinates[0][0] = 181;
  assert.throws(() => validateCadIntake(d), /coordinates/);
  d = fixture();
  d.buildings[0].floors[1].rooms[0].key = "r1";
  assert.throws(() => validateCadIntake(d), /identity/);
  d = fixture();
  d.sourceFiles.pop();
  assert.throws(() => validateCadIntake(d), /absent from sources/);
});
