import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  bridgeFloorDisplayWorker,
  preparedFloorNativeDisplay,
} from "../../app/indoor-project/floor-display-worker-bridge";
import {
  FloorWorkerClient,
  floorClientKey,
  floorWorkerKey,
  type FloorWorker,
  type FloorWorkerRequest,
} from "../../app/indoor-project/floor-worker-client";
import type { NativeExploreResult } from "../../app/indoor-project/native-explore";
import type {
  FloorPreparationOptions,
  FloorPreparationResponse,
  PreparedFloor,
} from "../../app/indoor-project/prepared-floor";

const options: FloorPreparationOptions = {
  showPillars: false,
  showPassThroughPlaces: false,
  showVestibuleDoors: false,
  showStructures: false,
  review: false,
  simplifyGeometry: false,
};
const project = {} as IndoorDataset;
const floor = (id: string) => ({ id }) as unknown as PreparedFloor;
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 5));
class ControlledWorker implements FloorWorker {
  onmessage: FloorWorker["onmessage"] = null;
  onerror: FloorWorker["onerror"] = null;
  onmessageerror: FloorWorker["onmessageerror"] = null;
  messages: FloorWorkerRequest[] = [];
  terminated = false;
  postMessage(message: FloorWorkerRequest) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(
    value: PreparedFloor,
    memoryCostBytes = 100,
    extra: Record<string, unknown> = {},
  ) {
    this.onmessage?.({
      data: {
        requestId: this.messages.at(-1)!.requestId,
        value,
        memoryCostBytes,
        ...extra,
      },
    } as MessageEvent<FloorPreparationResponse>);
  }
}
function setup(maximumBytes = 1000) {
  const workers: ControlledWorker[] = [];
  const client = new FloorWorkerClient(
    () => {
      const w = new ControlledWorker();
      workers.push(w);
      return bridgeFloorDisplayWorker(w);
    },
    12,
    maximumBytes,
  );
  return { client, workers };
}

test("an oversized 2D result does not evict the resident dataset: the 3D scope reuses the same worker without re-cloning", async () => {
  const { client, workers } = setup(1000);
  const twoD = client.request(project, [1, 2, 3], "all", options);
  assert.equal(workers[0].messages[0].data, project, "first upload");
  workers[0].reply(floor("2d"), 5000); // larger than the client budget
  await twoD.promise;
  assert.equal(
    client.peek(project, floorWorkerKey([1, 2, 3], "all", options)),
    undefined,
    "an oversized result is not retained",
  );
  assert(client.hasResidentWorker());
  assert.equal(workers[0].terminated, false);
  const threeD = client.request(project, [1, 2, 3, 4], "all", options, {
    nativeDisplay: false,
  });
  assert.equal(workers.length, 1, "no new worker");
  assert.equal(
    workers[0].messages[1].data,
    undefined,
    "the dataset is not structured-cloned again",
  );
  assert.equal(workers[0].messages[1].omitNativeDisplay, true);
  workers[0].reply(floor("3d"), 5000);
  await threeD.promise;
  // A different dataset (import/edit) is still uploaded.
  const edited = {} as IndoorDataset;
  const next = client.request(edited, [1], "all", options);
  assert.equal(workers[0].messages[2].data, edited);
  workers[0].reply(floor("edited"));
  await next.promise;
  client.dispose();
  assert(workers[0].terminated);
});

test("StrictMode-style cancel, release and identical re-request adopts the in-flight floor", async () => {
  const { client, workers } = setup();
  const first = client.request(project, [7], "all", options);
  const aborted = assert.rejects(first.promise, { name: "AbortError" });
  // Effect cleanup + unmount cleanup, then the replayed effect, in one task.
  const cancelFirst = first.cancel;
  cancelFirst();
  client.release();
  const second = client.request(project, [7], "all", options);
  await aborted;
  await nextTask();
  assert.equal(workers.length, 1, "no replacement worker");
  assert.equal(workers[0].terminated, false, "in-flight work kept");
  assert.equal(workers[0].messages.length, 1, "dataset posted once");
  const value = floor("seven");
  workers[0].reply(value);
  assert.equal(await second.promise, value);
  client.dispose();
});

test("a cancelled floor that is not requested again is terminated on the next task", async () => {
  const { client, workers } = setup();
  const job = client.request(project, [8], "all", options);
  const aborted = assert.rejects(job.promise, { name: "AbortError" });
  job.cancel();
  await aborted;
  assert.equal(workers[0].terminated, false, "not yet: same task");
  await nextTask();
  assert.equal(workers[0].terminated, true, "obsolete CPU work stopped");
  // A late reply from the terminated worker cannot publish anything.
  workers[0].reply(floor("late"));
  assert.equal(
    client.peek(project, floorWorkerKey([8], "all", options)),
    undefined,
  );
  // A different floor immediately after a cancel also stops the old work.
  const a = client.request(project, [9], "all", options);
  const aAborted = assert.rejects(a.promise, { name: "AbortError" });
  a.cancel();
  const b = client.request(project, [10], "all", options);
  await aAborted;
  assert.equal(workers[1].terminated, true);
  workers[2].reply(floor("ten"));
  await b.promise;
  client.dispose();
});

test("an unmounted map releases its worker on the next task", async () => {
  const { client, workers } = setup();
  const job = client.request(project, [1], "all", options);
  workers[0].reply(floor("one"));
  await job.promise;
  client.release();
  assert.equal(workers[0].terminated, false);
  await nextTask();
  assert.equal(workers[0].terminated, true);
  assert.equal(client.hasResidentWorker(), false);
  assert.equal(client.cacheStatistics().entries, 0);
});

test("a display-only reply never satisfies a native floor-map request for the same scope", async () => {
  const { client, workers } = setup();
  assert.notEqual(
    floorClientKey([1], "all", options, { nativeDisplay: false }),
    floorClientKey([1], "all", options),
  );
  assert.equal(
    floorClientKey([1], "all", options, { nativeDisplay: true }),
    floorWorkerKey([1], "all", options),
  );
  const threeD = client.request(project, [1], "all", options, {
    nativeDisplay: false,
  });
  const displayOnly = floor("display only");
  workers[0].reply(displayOnly);
  assert.equal(await threeD.promise, displayOnly);
  assert.equal(preparedFloorNativeDisplay(displayOnly), undefined);
  const twoD = client.request(project, [1], "all", options);
  assert.equal(workers[0].messages.length, 2, "native view asks the worker");
  assert.equal(workers[0].messages[1].omitNativeDisplay, undefined);
  const full = floor("with native display"),
    nativeFaces = {} as NativeExploreResult;
  workers[0].reply(full, 100, { nativeFaces });
  assert.equal(await twoD.promise, full);
  assert.equal(preparedFloorNativeDisplay(full), nativeFaces);
  // Both variants are cached under their own identities.
  assert.equal(
    client.peek(
      project,
      floorClientKey([1], "all", options, { nativeDisplay: false }),
    ),
    displayOnly,
  );
  assert.equal(client.peek(project, floorClientKey([1], "all", options)), full);
  client.dispose();
});

test("stale prepared displays are reported with both engine hashes, never treated as usable", async () => {
  const { registerPreparedDisplayArchive } = await import(
    "../../app/indoor-project/prepared-display-registry"
  );
  const { preparedDisplayStatus } = await import(
    "../../app/indoor-project/prepared-display-status"
  );
  const { PREPARED_DISPLAY_ENGINE_SHA256 } = await import(
    "../../app/indoor-project/prepared-display-engine-binding"
  );
  const { preparedDisplayOptions } = await import(
    "../../app/indoor-project/prepared-display-registry"
  );
  const data = { windowDisplay: { mode: "simplified" } } as IndoorDataset;
  assert.deepEqual(preparedDisplayStatus(data, [1], "all", options), {
    state: "none",
  });
  const descriptor = (engine: string, levelIds: number[]) =>
    ({
      binding: {
        version: 1,
        datasetSha256: "a".repeat(64),
        enginePreparationSha256: engine,
        levelIds,
        building: "all",
        windowMode: "simplified",
        options: preparedDisplayOptions(data, options),
      },
      chunks: [{ sha256: "c".repeat(64) }],
    }) as never;
  const stale = "1".repeat(64);
  registerPreparedDisplayArchive(data, {
    version: 1,
    descriptors: [
      descriptor(stale, [1]),
      descriptor(PREPARED_DISPLAY_ENGINE_SHA256, [2]),
    ],
    blobs: { ["c".repeat(64)]: new Uint8Array(1) },
  });
  assert.deepEqual(preparedDisplayStatus(data, [1], "all", options), {
    state: "stale-engine",
    assetEngine: stale,
    runtimeEngine: PREPARED_DISPLAY_ENGINE_SHA256,
  });
  assert.deepEqual(preparedDisplayStatus(data, [2], "all", options), {
    state: "usable",
  });
  assert.deepEqual(preparedDisplayStatus(data, [3], "all", options), {
    state: "missing-scope",
  });
});
