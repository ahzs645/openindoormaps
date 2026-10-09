import test from "node:test";
import assert from "node:assert/strict";
import { beginNativeImportValidation } from "../../app/indoor-project/native-import-validation";

test("concurrent import proof waits for a checked result, keeps all native source fields and omits unused volume meshes", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let posted: unknown,
    terminations = 0,
    instance: FakeWorker;
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void;
    constructor() {
      instance = this;
    }
    postMessage(value: unknown) {
      posted = value;
    }
    terminate() {
      terminations++;
    }
  }
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: FakeWorker,
  });
  try {
    const data = {
      nativeExploreMapping: { version: 3 },
      presentation: { mesh: [1] },
      source: { modelSha256: "a" },
      walls: [{ source: "exact" }],
      extra: undefined,
    };
    const job = beginNativeImportValidation(data)!;
    assert.deepEqual(posted, {
      data: {
        nativeExploreMapping: data.nativeExploreMapping,
        source: data.source,
        walls: data.walls,
        extra: undefined,
      },
      validation: true,
    });
    assert.equal(terminations, 0);
    instance!.onmessage?.({ data: { error: "Stale exact native topology." } });
    assert.deepEqual(await job.result, {
      error: "Stale exact native topology.",
    });
    assert.equal(terminations, 1);
    job.cancel();
    assert.equal(terminations, 1);
    assert.deepEqual(data.presentation, { mesh: [1] });
  } finally {
    if (original) Object.defineProperty(globalThis, "Worker", original);
    else Reflect.deleteProperty(globalThis, "Worker");
  }
});
test("malformed responses, cancellation and clone failures cannot accept a native import", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let instance: FakeWorker,
    throwClone = false,
    terminated = 0;
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void;
    constructor() {
      instance = this;
    }
    postMessage() {
      if (throwClone) throw Error("clone failed");
    }
    terminate() {
      terminated++;
    }
  }
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: FakeWorker,
  });
  try {
    const data = { nativeExploreMapping: { version: 3 } };
    for (const response of [
      null,
      { result: {} },
      { error: "" },
      { error: 42 },
    ]) {
      const job = beginNativeImportValidation(data)!;
      instance!.onmessage?.({ data: response });
      assert.match((await job.result).error!, /Invalid native/);
    }
    const cancelled = beginNativeImportValidation(data)!;
    cancelled.cancel();
    assert.match((await cancelled.result).error!, /cancelled/);
    throwClone = true;
    assert.match(
      (await beginNativeImportValidation(data)!.result).error!,
      /clone failed/,
    );
    assert.equal(terminated, 6);
  } finally {
    if (original) Object.defineProperty(globalThis, "Worker", original);
    else Reflect.deleteProperty(globalThis, "Worker");
  }
});
