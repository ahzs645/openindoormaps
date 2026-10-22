import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { routingSnapshot } from "../../app/indoor-project/routing-cache";
import { preparedDisplayDatasetSha256 } from "../../app/indoor-project/prepared-display-assets";

// Deliberately incomplete evidence exercises transport and invalidation only.
// It is not a qualifying stair proof and is never passed to route admission.
function transportFixture() {
  const data = progressiveRoutingFixture();
  const wire = [
    {
      id: "transport-only-index",
      physical: {
        exact: { $rational: ["9007199254740993", "9007199254740997"] },
      },
    },
  ];
  data.nativeSteppedStairV2SourceIndices = wire as unknown as NonNullable<
    IndoorDataset["nativeSteppedStairV2SourceIndices"]
  >;
  return { data, wire };
}

test("shared stair wire values survive worker projection and structured clone without rounding", () => {
  const { data, wire } = transportFixture();
  const projected = routeWorkerDataset(data);
  assert.equal(projected.nativeSteppedStairV2SourceIndices, wire);
  const transferred = structuredClone(projected);
  assert.deepEqual(transferred.nativeSteppedStairV2SourceIndices, wire);
  assert.equal(
    JSON.stringify(transferred.nativeSteppedStairV2SourceIndices),
    JSON.stringify(wire),
  );
  wire[0].physical.exact.$rational[0] = "9007199254740995";
  assert.notDeepEqual(transferred.nativeSteppedStairV2SourceIndices, wire);
});

test("a shared stair source mutation invalidates route and publisher bindings with unchanged edges", () => {
  const { data, wire } = transportFixture();
  const edges = JSON.stringify(data.edges);
  const before = routingSnapshot(data);
  const publisherBefore = preparedDisplayDatasetSha256(
    routeWorkerDataset(data),
  );
  wire[0].physical.exact.$rational[1] = "9007199254740999";
  assert.equal(JSON.stringify(data.edges), edges);
  assert.notEqual(routingSnapshot(data), before);
  assert.notEqual(
    preparedDisplayDatasetSha256(routeWorkerDataset(data)),
    publisherBefore,
  );
  delete data.nativeSteppedStairV2SourceIndices;
  assert.notEqual(routingSnapshot(data), before);
});

test("an absent optional stair index preserves the existing route snapshot", () => {
  const data = progressiveRoutingFixture();
  const before = routingSnapshot(data);
  data.nativeSteppedStairV2SourceIndices = undefined;
  assert.equal(routingSnapshot(data), before);
  assert.equal(
    routeWorkerDataset(data).nativeSteppedStairV2SourceIndices,
    undefined,
  );
});

test("worker projection retains source flights for the v2 connector without copying display meshes", () => {
  const { data } = transportFixture();
  const physical = {
    stairElementId: 77,
    treads: [{ exactSource: "retained" }],
  };
  data.stairDisplay = {
    flights: [{ displayMesh: "omit" }],
    sourceFlights: [physical, { stairElementId: 78, treads: [] }],
  } as unknown as NonNullable<IndoorDataset["stairDisplay"]>;
  data.edges[0].nativeElementId = 77;
  data.edges[0].nativeSteppedStairV2 = {
    sourceIndexId: "transport-only-index",
  } as NonNullable<IndoorDataset["edges"][number]["nativeSteppedStairV2"]>;
  delete data.nativeIndoorEnvelopes;
  delete data.nativePhysicalLevels;
  const projected = routeWorkerDataset(data);
  assert.deepEqual(projected.stairDisplay?.flights, []);
  assert.deepEqual(projected.stairDisplay?.sourceFlights, [physical]);
  assert.equal(data.stairDisplay.sourceFlights?.length, 2);
  assert.equal(data.stairDisplay.flights.length, 1);
});

test("worker projection keeps display containment only on cells a stepped stair claims", async () => {
  const { nativeSteppedStairV2Digest } = await import(
    "../../app/indoor-project/native-stepped-stair-v2"
  );
  const { data } = transportFixture();
  const claimed = { id: "cell-claimed", containedDisplay: { faces: [1] } };
  const other = { id: "cell-other", containedDisplay: { faces: [2] } };
  const residual = { faces: ["cell-claimed:render-residual"] };
  data.circulationGeometry = {
    cells: [claimed, other],
    displayResidualTopology: residual,
  } as unknown as NonNullable<IndoorDataset["circulationGeometry"]>;
  const cellSha256 = nativeSteppedStairV2Digest(claimed);
  data.edges[0].nativeSteppedStairV2 = {
    terminalApproaches: [{ nativeCellId: "cell-claimed", cellSha256 }],
  } as unknown as NonNullable<
    IndoorDataset["edges"][number]["nativeSteppedStairV2"]
  >;
  const geometry = routeWorkerDataset(data).circulationGeometry!;
  assert.equal(geometry.displayResidualTopology, residual);
  const [kept, stripped] = geometry.cells as unknown as Record<
    string,
    unknown
  >[];
  assert.equal(nativeSteppedStairV2Digest(kept), cellSha256);
  assert.equal(stripped.containedDisplay, undefined);
  assert.deepEqual(other.containedDisplay, { faces: [2] });
  delete data.edges[0].nativeSteppedStairV2;
  assert.equal(
    routeWorkerDataset(data).circulationGeometry!.displayResidualTopology,
    undefined,
  );
});
