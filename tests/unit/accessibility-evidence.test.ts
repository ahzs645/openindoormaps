import test from "node:test";
import assert from "node:assert/strict";
import { accessibilityEvidenceInventory } from "../../scripts/indoor/audit-accessibility-evidence";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";

function data() {
  const edge = {
    id: "ramp",
    kind: "ramp",
    from: "lower",
    to: "upper",
    roomKeys: ["lower-area", "upper-area"],
    accessible: "unknown",
    enabled: true,
    pointsFeet: [
      [0, 0, 0],
      [10, 0, 1],
    ],
    nativeRampSurface: {
      widthCertificate: {
        halfWidthFeet: 0.5,
        maximumCrossfallRatio: 0.01,
        maximumContinuousHeightJointFeet: 0.001,
        maximumNativeJointFeet: 0.01,
      },
    },
  } as unknown as IndoorEdge;
  const dataset = {
    source: { modelSha256: "a".repeat(64) },
    nodes: [
      { id: "lower", pointFeet: [0, 0, 0] },
      { id: "upper", pointFeet: [10, 0, 1] },
    ],
    edges: [edge],
    issues: [],
  } as unknown as IndoorDataset;
  return { dataset, edge };
}

test("measured ramp geometry remains distinct from accessibility approval", () => {
  const { dataset, edge } = data(),
    before = JSON.stringify(dataset);
  const result = accessibilityEvidenceInventory(dataset, {});
  assert.deepEqual(result.byAccessible, { unknown: 1 });
  assert.equal(result.ramps[0]!.maximumSavedPathGradient, 0.1);
  assert.equal(result.ramps[0]!.checkedProfileWidthFeet, 1);
  assert.equal(result.ramps[0]!.maximumSourceCrossfallRatio, 0.01);
  assert.equal(edge.accessible, "unknown");
  assert.equal(result.confirmedEdges.length, 0);
  assert.equal(JSON.stringify(dataset), before);
});

test("lost endpoint identity and changed exact path are reported without repairing reviews", () => {
  const { dataset, edge } = data();
  const oldKey = JSON.stringify([
    dataset.source.modelSha256,
    edge.from,
    "old-upper",
    edge.roomKeys,
    edge.pointsFeet,
  ]);
  const result = accessibilityEvidenceInventory(dataset, {
    indoorReviews: {
      edges: { ramp: { accessible: "yes", geometryKey: oldKey } },
    },
  });
  assert.equal(result.savedReviews[0]!.exactGeometryKeyMatches, false);
  assert.deepEqual(result.savedReviews[0]!.savedEndpointIdsPresent, [
    true,
    false,
  ]);
  assert.equal(result.savedReviews[0]!.savedModelMatches, true);
  assert.equal(edge.accessible, "unknown");
});

test("source connector approvals are inventoried without approving served lift approaches", () => {
  const { dataset } = data();
  const result = accessibilityEvidenceInventory(dataset, {
    indoorConnectors: {
      modelSha256: dataset.source.modelSha256,
      connectors: [
        {
          id: "lift",
          accessible: "unknown",
          evidence: "Source shaft and served stops; clearance not reviewed.",
          entrances: [{}, {}],
        },
      ],
    },
  });
  assert.equal(result.connectorReviewModelMatches, true);
  assert.equal(result.originalLiftReviews[0]!.accessible, "unknown");
  assert.equal(result.originalLiftReviews[0]!.servedEntranceCount, 2);
  assert.equal(result.confirmedEdges.length, 0);
});
