import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { steppedRuntimeFixture } from "../fixtures/stepped-stair-v2-runtime";
import {
  validNativeSteppedStairV2Binding,
  inspectNativeSteppedStairV2Binding,
  nativeSteppedStairV2Digest,
  validateNativeSteppedStairV2Proofs,
} from "../../app/indoor-project/native-stepped-stair-v2";
import { validNativeSteppedStairV2Binding as sourceBinding } from "../../../reviter/lib/reviter/native-stepped-stair-v2.ts";
import { nativeStairRouteQualified } from "../../app/indoor-project/native-source-stair";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import {
  finalizeSourceSteppedStairV2Dataset,
  existingClaimedSteppedApproachCandidates,
  checkedCurrentSteppedStairSourceReview,
} from "../../scripts/indoor/finalize-source-stepped-stair-v2";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { OriginalSteppedStairV2SourceProof } from "../../scripts/indoor/source-stepped-stair-v2-producer";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import {
  createNativeExactTopologyIndex,
  encodeNativeExactTopology,
} from "../../app/indoor-project/native-exact-planar-topology";
import { NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION } from "../../app/indoor-project/native-rational-overlay";

test("separate portable stepped variant requires complete physical replay and both current claimed lateral approaches", async () => {
  const { data, edge, sourceAuthority } = await steppedRuntimeFixture();
  assert.equal(sourceAuthority, false);
  assert.equal(validNativeSteppedStairV2Binding(data, edge), true);
  assert.equal(sourceBinding(data, edge), true);
  assert.equal(nativeStairRouteQualified(data, edge), true);
  validateNativeSteppedStairV2Proofs(data);
  const result = inspectNativeSteppedStairV2Binding(data, edge);
  assert.equal(result.replay.mathematicalReplayPassed, true);
  const projected = routeWorkerDataset(data);
  assert.equal(
    validNativeSteppedStairV2Binding(projected, projected.edges[0]!),
    true,
  );
});

test("mutable current nodes/access/cells/walks and shared source facts are rechecked on later calls", async () => {
  const { data } = await steppedRuntimeFixture();
  const mutations: ((d: IndoorDataset) => void)[] = [
    (d) => {
      d.nodes[0]!.pointFeet[0] += 0.01;
    },
    (d) => {
      d.records[0]!.access = "staff";
    },
    (d) => {
      d.edges[0]!.accessible = "yes";
    },
    (d) => {
      d.edges[0]!.direction = "from-to";
    },
    (d) => {
      d.edges[1]!.enabled = false;
    },
    (d) => {
      d.edges[1]!.pointsFeet[0]![0] += 0.01;
    },
    (d) => {
      d.circulationGeometry!.cells[0]!.roomKeys = ["borrowed"];
    },
    (d) => {
      d.edges[0]!.nativeSteppedStairV2!.anchorPolicy = "new-unclaimed" as never;
    },
    (d) => {
      d.nativeSteppedStairV2SourceIndices!.push(
        d.nativeSteppedStairV2SourceIndices![0]!,
      );
    },
    (d) => {
      (
        d.nativeSteppedStairV2SourceIndices![0]!.physical as {
          sourceModelSha256: string;
        }
      ).sourceModelSha256 = "f".repeat(64);
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(data);
    assert.equal(
      validNativeSteppedStairV2Binding(changed, changed.edges[0]!),
      true,
    );
    mutate(changed);
    assert.equal(
      validNativeSteppedStairV2Binding(changed, changed.edges[0]!),
      false,
    );
    assert.equal(sourceBinding(changed, changed.edges[0]!), false);
  }
});

test("re-signing an unsupported walk or borrowing a foreign cell never substitutes for current original floor coverage", async () => {
  const { data } = await steppedRuntimeFixture();
  const changed = structuredClone(data),
    walk = changed.edges[1]!;
  walk.pointsFeet.splice(1, 0, [100, 100, 0]);
  changed.edges[0]!.nativeSteppedStairV2!.terminalApproaches[0].walkEdgeSha256 =
    nativeSteppedStairV2Digest(walk);
  assert.equal(
    validNativeSteppedStairV2Binding(changed, changed.edges[0]!),
    false,
  );
  assert.equal(sourceBinding(changed, changed.edges[0]!), false);
  const candidates = existingClaimedSteppedApproachCandidates(
    data,
    data.edges[0]!,
    0,
  );
  assert.equal(candidates.length, 1);
  data.circulationGeometry!.cells[0]!.roomKeys = ["upper"];
  assert.equal(
    existingClaimedSteppedApproachCandidates(data, data.edges[0]!, 0).length,
    0,
  );
});

test("source finalizer refuses copied, serialized or declared capabilities before examining a dataset", async () => {
  for (const proof of [
    {},
    {
      sourceModelSha256: "a".repeat(64),
      scope: "original-source-physical-profile-only",
    },
  ]) {
    await assert.rejects(
      finalizeSourceSteppedStairV2Dataset(
        {} as IndoorDataset,
        proof as OriginalSteppedStairV2SourceProof,
        { sourceRooms: {} },
      ),
      /genuine same-process original/,
    );
  }
});

test("finalization requires the checksum-bound CURRENT source decision as well as its private original review", () => {
  const hash = (value: unknown) =>
      createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    source = {
      format: "reviter-room-annotations",
      version: 1,
      indoorReviews: { version: 1, edges: {} },
    },
    bound = hash(source),
    edgeId = "held:10";
  assert.equal(
    checkedCurrentSteppedStairSourceReview(bound, source, edgeId)
      .explicitSourceReview,
    null,
  );
  for (const missing of [undefined, {}, null])
    assert.throws(
      () => checkedCurrentSteppedStairSourceReview(bound, missing, edgeId),
      /snapshot differs/,
    );
  const disabled = {
    ...source,
    indoorReviews: { version: 1, edges: { [edgeId]: { enabled: false } } },
  };
  assert.throws(
    () => checkedCurrentSteppedStairSourceReview(bound, disabled, edgeId),
    /snapshot differs/,
  );
  assert.throws(
    () =>
      checkedCurrentSteppedStairSourceReview(hash(disabled), disabled, edgeId),
    /current source review disables/,
  );
  const packed = {
    ...source,
    indoorReviews: { format: "packed-review", sha256: "a".repeat(64) },
  };
  assert.throws(
    () => checkedCurrentSteppedStairSourceReview(hash(packed), packed, edgeId),
    /packed placeholders refuse/,
  );
  let reads = 0;
  const getter = {
    ...source,
    get indoorReviews() {
      reads++;
      return reads === 1 ? disabled.indoorReviews : source.indoorReviews;
    },
  };
  assert.throws(
    () =>
      checkedCurrentSteppedStairSourceReview(hash(disabled), getter, edgeId),
    /current source review disables/,
  );
  assert.equal(reads, 1);
  const custom = {
    ...source,
    toJSON() {
      return disabled;
    },
  };
  assert.throws(
    () =>
      checkedCurrentSteppedStairSourceReview(hash(disabled), custom, edgeId),
    /current source review disables/,
  );
});

test("a newly rebound exact floor hole still vetoes an unchanged claimed walk independently of descriptor hashes", async () => {
  const { data } = await steppedRuntimeFixture(),
    geometry = data.circulationGeometry!,
    original = createNativeExactTopologyIndex(
      geometry.exactTopology!,
      geometry.exactTopology!,
    );
  // The render/cell face and its checksum intentionally remain the old whole
  // region. Every source descriptor is refreshed to the new actual floor.
  data.walkingSupport!.floors[0]!.ringsFeet.push([
    [-2.1, -1e-12],
    [-2.1 + 1e-12, -1e-12],
    [-2.1 + 1e-12, 1e-12],
    [-2.1, 1e-12],
  ]);
  const key = nativeCirculationGeometryKey(data);
  geometry.sourceGeometryKey = key;
  geometry.exactTopology = encodeNativeExactTopology(
    {
      sourceModelSha256: data.source.modelSha256,
      sourceGeometryKey: key,
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    original.ids().map((id) => ({ id, parts: original.parts(id)! })),
  );
  data.edges[0]!.nativeSteppedStairV2!.circulationGeometryKey = key;
  assert.equal(validNativeSteppedStairV2Binding(data, data.edges[0]!), false);
  assert.equal(sourceBinding(data, data.edges[0]!), false);
});
