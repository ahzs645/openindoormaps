import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { NativeExploreResult } from "../../app/indoor-project/native-explore";
import {
  startNativeExploreTrace,
  type NativeExploreWorker,
  type NativeExploreRequest,
  type NativeExploreResponse,
} from "../../app/indoor-project/native-explore-client";
class ControlledWorker implements NativeExploreWorker {
  onmessage: NativeExploreWorker["onmessage"] = null;
  onerror: NativeExploreWorker["onerror"] = null;
  onmessageerror: NativeExploreWorker["onmessageerror"] = null;
  terminated = false;
  postFailure = false;
  messages: NativeExploreRequest[] = [];
  postMessage(request: NativeExploreRequest) {
    if (this.postFailure)
      throw new DOMException("Unable to clone floor data", "DataCloneError");
    this.messages.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: NativeExploreResponse) {
    this.onmessage?.({ data } as MessageEvent<NativeExploreResponse>);
  }
}
const request = { data: {} as IndoorDataset, levelIds: [1], building: "all" };
test("one-shot trace releases its cloned dataset on success and ignores later events", () => {
  const worker = new ControlledWorker(),
    responses: NativeExploreResponse[] = [];
  startNativeExploreTrace(
    request,
    () => worker,
    (value) => responses.push(value),
  );
  const result = {} as NativeExploreResult;
  worker.reply({ result });
  assert.equal(worker.terminated, true);
  worker.reply({ error: "late failure" });
  assert.deepEqual(responses, [{ result }]);
  assert.equal(worker.messages[0], request);
});
test("cancelled scope cannot publish its obsolete result", () => {
  const worker = new ControlledWorker(),
    responses: NativeExploreResponse[] = [];
  const cancel = startNativeExploreTrace(
    request,
    () => worker,
    (value) => responses.push(value),
  );
  cancel();
  worker.reply({ result: {} as NativeExploreResult });
  assert.equal(worker.terminated, true);
  assert.deepEqual(responses, []);
});
test("startup, cloning, unreadable replies and worker errors produce a retryable result and release memory", () => {
  const startup: NativeExploreResponse[] = [];
  startNativeExploreTrace(
    request,
    () => {
      throw new Error("Worker unavailable");
    },
    (v) => startup.push(v),
  );
  assert.match(startup[0].error!, /Worker unavailable/);
  for (const failure of ["clone", "unreadable", "error", "empty", "reported"]) {
    const worker = new ControlledWorker(),
      responses: NativeExploreResponse[] = [];
    worker.postFailure = failure === "clone";
    startNativeExploreTrace(
      request,
      () => worker,
      (v) => responses.push(v),
    );
    if (failure === "unreadable") worker.onmessageerror?.({} as MessageEvent);
    if (failure === "error")
      worker.onerror?.({
        message: "Out of memory",
        preventDefault() {},
      } as ErrorEvent);
    if (failure === "empty") worker.reply({});
    if (failure === "reported")
      worker.reply({ error: "Stale source geometry" });
    assert.equal(worker.terminated, true, failure);
    assert.equal(responses.length, 1, failure);
    assert.ok(responses[0].error, failure);
  }
});
