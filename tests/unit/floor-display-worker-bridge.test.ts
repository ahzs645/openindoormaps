import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  bridgeFloorDisplayWorker,
  preparedFloorNativeDisplay,
} from "../../app/indoor-project/floor-display-worker-bridge";
import {
  FloorWorkerClient,
  floorWorkerKey,
  type FloorWorker,
} from "../../app/indoor-project/floor-worker-client";
import { floorMemoryCostBytes } from "../../app/indoor-project/floor-memory-cost";
import type { NativeExploreResult } from "../../app/indoor-project/native-explore";
import type {
  FloorPreparationOptions,
  FloorPreparationRequest,
  FloorPreparationResponse,
  PreparedFloor,
} from "../../app/indoor-project/prepared-floor";

type Envelope = FloorPreparationResponse & {
  nativeFaces?: NativeExploreResult;
};
class ControlledWorker implements FloorWorker {
  onmessage: FloorWorker["onmessage"] = null;
  onerror: FloorWorker["onerror"] = null;
  onmessageerror: FloorWorker["onmessageerror"] = null;
  messages: FloorPreparationRequest[] = [];
  terminated = false;
  postMessage(message: FloorPreparationRequest) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(response: Envelope) {
    this.onmessage?.({
      data: response,
    } as MessageEvent<FloorPreparationResponse>);
  }
}
const options: FloorPreparationOptions = {
  showPillars: false,
  showPassThroughPlaces: false,
  showVestibuleDoors: false,
  showStructures: false,
  review: false,
  simplifyGeometry: true,
};
const project = {} as IndoorDataset;
const floor = () => ({}) as PreparedFloor;
const faces = () => ({}) as NativeExploreResult;
const request = (requestId: number): FloorPreparationRequest => ({
  requestId,
  data: project,
  levelIds: [311],
  building: "all",
  options,
});

test("one matching worker envelope shares the original native graph before delivering the floor", () => {
  const raw = new ControlledWorker(),
    bridge = bridgeFloorDisplayWorker(raw);
  const value = Object.defineProperty(floor(), "geometry", {
    get() {
      throw Error("The UI must not walk native geometry");
    },
  });
  const nativeFaces = faces();
  let seen: PreparedFloor | undefined;
  bridge.onmessage = ({ data }) => {
    assert(!("error" in data));
    seen = data.value;
    assert.equal(preparedFloorNativeDisplay(data.value), nativeFaces);
  };
  bridge.postMessage(request(1));
  raw.reply({ requestId: 1, value, nativeFaces, memoryCostBytes: 100 });
  assert.equal(seen, value);
  assert.equal(preparedFloorNativeDisplay(undefined), undefined);
  bridge.terminate();
});

test("stale generation, reported failures and ordinary legacy floors cannot publish native geometry", () => {
  const raw = new ControlledWorker(),
    bridge = bridgeFloorDisplayWorker(raw);
  const stale = floor(),
    failed = floor(),
    legacy = floor();
  bridge.postMessage(request(2));
  raw.reply({ requestId: 1, value: stale, nativeFaces: faces() });
  assert.equal(preparedFloorNativeDisplay(stale), undefined);
  raw.reply({
    requestId: 2,
    error: "Invalid native data",
    nativeFaces: faces(),
    value: failed,
  } as Envelope);
  assert.equal(preparedFloorNativeDisplay(failed), undefined);
  bridge.postMessage(request(3));
  raw.reply({ requestId: 3, value: legacy });
  assert.equal(preparedFloorNativeDisplay(legacy), undefined);
  bridge.terminate();
});

test("termination prevents late native graphs and callbacks while preserving a completed graph still displayed", () => {
  const raw = new ControlledWorker(),
    bridge = bridgeFloorDisplayWorker(raw);
  const value = floor(),
    nativeFaces = faces();
  let deliveries = 0;
  bridge.onmessage = () => deliveries++;
  bridge.postMessage(request(1));
  raw.reply({ requestId: 1, value, nativeFaces });
  bridge.postMessage(request(2));
  bridge.terminate();
  const stale = floor();
  raw.reply({ requestId: 2, value: stale, nativeFaces: faces() });
  assert.equal(deliveries, 1);
  assert(raw.terminated);
  assert.equal(preparedFloorNativeDisplay(stale), undefined);
  assert.equal(preparedFloorNativeDisplay(value), nativeFaces);
});

test("duplicate completed replies cannot replace the current floor's bound native graph", () => {
  const raw = new ControlledWorker(),
    bridge = bridgeFloorDisplayWorker(raw);
  const value = floor(),
    nativeFaces = faces();
  bridge.postMessage(request(1));
  raw.reply({ requestId: 1, value, nativeFaces });
  raw.reply({ requestId: 1, value, nativeFaces: faces() });
  assert.equal(preparedFloorNativeDisplay(value), nativeFaces);
  bridge.postMessage(request(2));
  raw.reply({ requestId: 2, error: "Failed" });
  const failed = floor();
  raw.reply({ requestId: 2, value: failed, nativeFaces: faces() });
  assert.equal(preparedFloorNativeDisplay(failed), undefined);
  bridge.terminate();
});

test("combined retention costs include native-only branches and charge shared geometry once", () => {
  const shared = {
    coordinates: [
      [1, 2],
      [3, 4],
    ],
    metadata: "original",
  };
  const value = { geometry: shared } as unknown as PreparedFloor;
  const nativeFaces = {
    geometry: shared,
    exactTopology: new ArrayBuffer(2048),
  } as unknown as NativeExploreResult;
  const combined = floorMemoryCostBytes({ value, nativeFaces });
  assert(
    combined > floorMemoryCostBytes(value),
    "the floor budget includes its attached native graph",
  );
  assert(
    combined <
      floorMemoryCostBytes({
        value,
        nativeFaces: structuredClone(nativeFaces),
      }),
    "a shared native subtree is not charged twice",
  );
});

test("an oversized combined floor remains displayable after disposal, and the next floor receives a fresh source upload", async () => {
  const workers: ControlledWorker[] = [];
  const client = new FloorWorkerClient(
    () => {
      const raw = new ControlledWorker();
      workers.push(raw);
      return bridgeFloorDisplayWorker(raw);
    },
    12,
    1024,
  );
  const value = floor(),
    nativeFaces = {
      exactTopology: new ArrayBuffer(2048),
    } as unknown as NativeExploreResult;
  const pending = client.request(project, [311], "all", options);
  workers[0].reply({
    requestId: 1,
    value,
    nativeFaces,
    memoryCostBytes: floorMemoryCostBytes({ value, nativeFaces }),
  });
  assert.equal(await pending.promise, value);
  assert.equal(
    client.peek(project, floorWorkerKey([311], "all", options)),
    undefined,
  );
  assert.equal(client.cacheStatistics().entries, 0);
  client.dispose();
  assert(workers[0].terminated);
  assert.equal(
    preparedFloorNativeDisplay(value),
    nativeFaces,
    "the current rendered floor survives worker release",
  );
  const next = client.request(project, [694], "all", options);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].messages[0].data, project);
  const cancelled = assert.rejects(next.promise, { name: "AbortError" });
  client.dispose();
  await cancelled;
});

test("an explicit retry releases a cached shared display and cannot reuse its old worker generation", async () => {
  const workers: ControlledWorker[] = [];
  const client = new FloorWorkerClient(() => {
    const raw = new ControlledWorker();
    workers.push(raw);
    return bridgeFloorDisplayWorker(raw);
  });
  const value = floor(),
    nativeFaces = faces();
  const first = client.request(project, [311], "all", options);
  workers[0].reply({ requestId: 1, value, nativeFaces, memoryCostBytes: 100 });
  await first.promise;
  const key = floorWorkerKey([311], "all", options);
  assert.equal(client.peek(project, key), value);
  client.dispose();
  const retry = client.request(project, [311], "all", options);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].messages[0].data, project);
  assert.equal(client.peek(project, key), undefined);
  const stale = floor();
  workers[0].reply({
    requestId: 1,
    value: stale,
    nativeFaces: faces(),
    memoryCostBytes: 100,
  });
  assert.equal(preparedFloorNativeDisplay(stale), undefined);
  const recovered = floor(),
    recoveredFaces = faces();
  workers[1].reply({
    requestId: 2,
    value: recovered,
    nativeFaces: recoveredFaces,
    memoryCostBytes: 100,
  });
  assert.equal(await retry.promise, recovered);
  assert.equal(client.peek(project, key), recovered);
  assert.equal(preparedFloorNativeDisplay(recovered), recoveredFaces);
  client.dispose();
});
