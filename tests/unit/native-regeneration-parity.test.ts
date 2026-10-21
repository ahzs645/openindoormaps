import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ReviewedPlaceLabels } from "../../app/indoor-project/reviewed-place-labels";
import { floorDisplayName } from "../../app/indoor-project/floor-display-name";
import { nativeSourceStairPhysicalEvidence } from "../../app/indoor-project/native-source-stair-material";
import {
  nativeRegenerationDatasetSha256,
  nativeRegenerationVisitorExpectedSha256,
} from "../../scripts/indoor/native-regeneration-parity";

// Shape-only synthetic serializer fixture, not geometry or routing approval.
// No model files, package readers, native compilation or private receipts.
function fixture(envelopes = true, authored = true) {
  return {
    format: "reviter-indoor",
    version: 1,
    source: {
      modelSha256: "a".repeat(64),
      roomsSha256: "b".repeat(64),
      modelFileName: "synthetic.rvt",
    },
    floors: [
      { id: "main", name: "Floor 1", levelIds: [1], elevationFeet: 0 },
      { id: "other", name: "Floor 2", levelIds: [2], elevationFeet: 10 },
    ],
    records: [{ key: "original-owner", access: "unknown", walkable: true }],
    nodes: [{ id: "source-node", pointFeet: [1, 2, 3] }],
    edges: [{ id: "source-edge", enabled: true, accessible: "unknown" }],
    nativeExploreMapping: { mappingSha256: "c".repeat(64), levels: [1, 2] },
    nativeIndoorEnvelopes: envelopes
      ? {
          partsFeet: [
            [
              [0, 0],
              [2, 0],
            ],
          ],
        }
      : undefined,
    nativeSourceStairMaterials: {
      version: 1,
      sourceModelSha256: "a".repeat(64),
      flights: [{ id: "authoring-inventory", foreignIds: [19, 20] }],
      ...(authored
        ? {
            authoredTreadRoles: {
              members: [{ nativeElementId: 4, role: "tread" }],
            },
          }
        : {}),
    },
    stairDisplay: {
      sourceFlights: [
        { points: [1, 2], historicalPreparedTreads: ["old-source"] },
      ],
      flights: [{ points: [3, 4], historicalPreparedTreads: ["old-flight"] }],
    },
    selectionDoorThresholds: { authoring: "threshold history" },
    doorAperturePatchState: { regenerated: true, binding: "physical-opening" },
    nativeDoorBoundaryClosures: { authoring: "source closure history" },
    nativeWallPositionRepairs: {
      walls: [
        {
          nativeElementId: 8,
          pointsFeet: [
            [1, 2],
            [3, 4],
          ],
          notes: "authoring",
        },
      ],
    },
    reviewedAreaPartitions: { authoring: "partition history" },
    indoorExclusions: {
      areas: [
        {
          reason: "off-limits",
          partsFeet: [
            [
              [5, 6],
              [7, 8],
            ],
          ],
          notes: "review",
        },
      ],
    },
    nativeSelectionContactRepairs: {
      repairs: [
        {
          id: "kept",
          status: "applied",
          partsFeet: [[[9, 10]]],
          notes: "reviewed",
        },
        {
          id: "pending",
          status: "proposed",
          partsFeet: [[[11, 12]]],
          notes: "proposal",
        },
      ],
    },
    futurePhysicalOperand: {
      originalOwner: "foreign-source-owner",
      exact: { $rational: ["9007199254740993", "9007199254740992"] },
      holes: [
        [
          [1, 1],
          [2, 1],
          [2, 2],
        ],
      ],
      optional: undefined,
      negativeZero: -0,
    },
  };
}
const asDataset = (data: ReturnType<typeof fixture>) =>
  data as unknown as IndoorDataset;
const sha = (data: IndoorDataset) =>
  createHash("sha256")
    .update(new TextEncoder().encode(JSON.stringify(data)))
    .digest("hex");
function legacyDatasetSha256(data: IndoorDataset) {
  const comparable = structuredClone(data);
  delete comparable.nativeExploreMapping;
  return sha(comparable);
}

// Independent copy of the former inline projection, including its ordering.
function legacyVisitorExpected(
  data: IndoorDataset,
  floorNames?: Readonly<Record<string, string>>,
) {
  const expected: IndoorDataset = structuredClone(data);
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
  if (expected.nativeSelectionContactRepairs)
    expected.nativeSelectionContactRepairs.repairs =
      expected.nativeSelectionContactRepairs.repairs
        .filter((repair) => repair.status === "applied")
        .map((repair) => ({
          ...repair,
          notes:
            "Provisional source-bound native selection contact; physical geometry and access unchanged. Revisit required.",
        }));
  delete expected.nativeExploreMapping;
  return expected;
}

test("master digest matches legacy bytes, excludes only mapping and preserves its input", () => {
  const data = fixture(),
    before = structuredClone(data),
    original = asDataset(data);
  const digest = nativeRegenerationDatasetSha256(original);
  assert.equal(digest, legacyDatasetSha256(original));
  assert.match(digest, /^[a-f0-9]{64}$/);
  data.nativeExploreMapping.mappingSha256 = "d".repeat(64);
  assert.equal(nativeRegenerationDatasetSha256(original), digest);
  data.nativeExploreMapping = before.nativeExploreMapping;
  assert.deepEqual(data, before);
  data.futurePhysicalOperand.exact.$rational[0] = "9007199254740994";
  assert.notEqual(nativeRegenerationDatasetSha256(original), digest);
  data.futurePhysicalOperand = before.futurePhysicalOperand;
  data.records[0].access = "staff";
  assert.notEqual(nativeRegenerationDatasetSha256(original), digest);
});

test("visitor digest matches every legacy projection branch without changing originals", () => {
  for (const envelopes of [false, true])
    for (const authored of [false, true]) {
      const data = fixture(envelopes, authored),
        before = structuredClone(data),
        names = { main: "Reviewed Main", other: "" },
        original = asDataset(data),
        expected = legacyVisitorExpected(original, names);
      assert.equal(
        nativeRegenerationVisitorExpectedSha256(original, names),
        sha(expected),
      );
      assert.deepEqual(data, before);
      assert.equal(expected.floors[0].name, "Reviewed Main");
      assert.equal(expected.floors[1].name, "");
      assert.deepEqual(expected.records, original.records);
      assert.deepEqual(expected.nodes, original.nodes);
      assert.deepEqual(expected.edges, original.edges);
      assert.deepEqual(
        expected.indoorExclusions?.areas[0].partsFeet,
        original.indoorExclusions?.areas[0].partsFeet,
      );
      assert.deepEqual(
        expected.nativeSourceStairMaterials?.authoredTreadRoles,
        original.nativeSourceStairMaterials?.authoredTreadRoles,
      );
      assert.equal(
        expected.nativeSourceStairMaterials === undefined,
        !authored,
      );
      assert.equal(expected.doorAperturePatchState === undefined, !envelopes);
      assert.equal(
        expected.nativeWallPositionRepairs === undefined,
        !envelopes,
      );
      assert.equal(expected.nativeSelectionContactRepairs?.repairs.length, 1);
    }
});

test("retained visitor physical geometry, ownership and policy mutations all change its digest", () => {
  const original = fixture(),
    digest = nativeRegenerationVisitorExpectedSha256(asDataset(original));
  const changes: ((data: ReturnType<typeof fixture>) => void)[] = [
    (data) => {
      data.nodes[0].pointFeet[0] += 0.001;
    },
    (data) => {
      data.edges[0].enabled = false;
    },
    (data) => {
      data.records[0].access = "staff";
    },
    (data) => {
      data.nativeWallPositionRepairs.walls[0].pointsFeet[0][0] += 0.001;
    },
    (data) => {
      data.indoorExclusions.areas[0].partsFeet[0][0][0] += 0.001;
    },
    (data) => {
      data.nativeSelectionContactRepairs.repairs[0].partsFeet[0][0][0] += 0.001;
    },
    (data) => {
      data.futurePhysicalOperand.originalOwner = "another-owner";
    },
    (data) => {
      data.nativeSourceStairMaterials.authoredTreadRoles!.members[0]
        .nativeElementId++;
    },
  ];
  for (const change of changes) {
    const changed = structuredClone(original);
    change(changed);
    assert.notEqual(
      nativeRegenerationVisitorExpectedSha256(asDataset(changed)),
      digest,
    );
    assert.deepEqual(original, fixture());
  }
});

test("only existing visitor authoring/history projections disappear from parity", () => {
  const data = fixture(),
    digest = nativeRegenerationVisitorExpectedSha256(asDataset(data));
  data.nativeExploreMapping.mappingSha256 = "e".repeat(64);
  data.stairDisplay.sourceFlights[0].historicalPreparedTreads.push("changed");
  data.stairDisplay.flights[0].historicalPreparedTreads.push("changed");
  data.selectionDoorThresholds.authoring = "changed";
  data.nativeDoorBoundaryClosures.authoring = "changed";
  data.reviewedAreaPartitions.authoring = "changed";
  data.nativeWallPositionRepairs.walls[0].notes = "changed";
  data.indoorExclusions.areas[0].notes = "changed";
  data.nativeSelectionContactRepairs.repairs[0].notes = "changed";
  data.nativeSelectionContactRepairs.repairs[1].partsFeet[0][0][0]++;
  data.nativeSourceStairMaterials.flights[0].foreignIds.push(999);
  assert.equal(
    nativeRegenerationVisitorExpectedSha256(asDataset(data)),
    digest,
  );
  assert.equal(
    legacyDatasetSha256(legacyVisitorExpected(asDataset(data))),
    digest,
  );
});

test("visitor parity excludes label review notes while retaining label decisions and master notes", () => {
  const labels: ReviewedPlaceLabels = {
    version: 1,
    sourceModelSha256: "a".repeat(64),
    labels: [
      {
        id: "reviewed-label",
        roomKey: "original-label-owner",
        number: "05-101",
        action: "alias",
        placeRoomKey: "original-place-owner",
        decisionId: "original-decision",
        evidence: "user-reported",
        reason: "Two labels name the same place.",
        notes: "Private authoring review notes.",
      },
    ],
  };
  const data = { ...fixture(), reviewedPlaceLabels: labels },
    before = structuredClone(data),
    expected = legacyVisitorExpected(asDataset(data));
  // The current visitor exporter explicitly removes these authoring notes.
  // Keep every label decision and all other expected dataset fields intact.
  delete expected.reviewedPlaceLabels!.labels[0].notes;
  const digest = nativeRegenerationVisitorExpectedSha256(asDataset(data));
  assert.equal(digest, sha(expected));
  assert.deepEqual(data, before);

  const masterDigest = nativeRegenerationDatasetSha256(asDataset(data));
  data.reviewedPlaceLabels.labels[0].notes = "Changed authoring notes.";
  assert.equal(
    nativeRegenerationVisitorExpectedSha256(asDataset(data)),
    digest,
  );
  assert.notEqual(
    nativeRegenerationDatasetSha256(asDataset(data)),
    masterDigest,
  );
  data.reviewedPlaceLabels = structuredClone(before.reviewedPlaceLabels);

  const changes: ((value: typeof data) => void)[] = [
    (value) => {
      value.reviewedPlaceLabels.labels[0].id += "-changed";
    },
    (value) => {
      value.reviewedPlaceLabels.labels[0].roomKey += "-changed";
    },
    (value) => {
      value.reviewedPlaceLabels.labels[0].number = "05-102";
    },
    (value) => {
      value.reviewedPlaceLabels.labels[0].action = "retire";
    },
    (value) => {
      value.reviewedPlaceLabels.labels[0].placeRoomKey += "-changed";
    },
    (value) => {
      value.reviewedPlaceLabels.labels[0].decisionId += "-changed";
    },
    (value) => {
      value.reviewedPlaceLabels.labels[0].reason += " Changed.";
    },
    (value) => {
      value.reviewedPlaceLabels.sourceModelSha256 = "f".repeat(64);
    },
  ];
  for (const change of changes) {
    const changed = structuredClone(data);
    change(changed);
    assert.notEqual(
      nativeRegenerationVisitorExpectedSha256(asDataset(changed)),
      digest,
    );
  }
  assert.deepEqual(data, before);
});
