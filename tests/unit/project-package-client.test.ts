import test from "node:test";
import assert from "node:assert/strict";
import {
  runProjectPackageJob,
  type ProjectPackageWorker,
} from "../../app/indoor-project/project-package-client";

function mock(post: (request: unknown, transfers?: Transferable[]) => void) {
  let terminations = 0;
  const worker = {
    postMessage: post,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    terminate: () => {
      terminations++;
    },
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  } as unknown as ProjectPackageWorker & EventTarget;
  return { worker, terminations: () => terminations };
}
test("package worker transfers an independent ZIP copy and retains original bytes for persistence", async () => {
  const original = new Uint8Array([1, 2, 3]);
  const m = mock((value, transfers) => {
    const request = value as { kind: string; bytes: Uint8Array };
    assert.notEqual(request.bytes.buffer, original.buffer);
    assert.deepEqual(transfers, [request.bytes.buffer]);
    request.bytes[0] = 9;
    queueMicrotask(() =>
      m.worker.onmessage?.({
        data: { kind: request.kind, result: { verified: true } },
      } as MessageEvent),
    );
  });
  assert.deepEqual(
    await runProjectPackageJob(
      { kind: "import", bytes: original },
      () => m.worker,
    ),
    { verified: true },
  );
  assert.deepEqual([...original], [1, 2, 3]);
  assert.equal(m.terminations(), 1);
});
test("package validation failure never accepts a result and releases its worker", async () => {
  const m = mock(() =>
    queueMicrotask(() =>
      m.worker.onmessage?.({
        data: { kind: "import", error: "Stale exact native topology." },
      } as MessageEvent),
    ),
  );
  await assert.rejects(
    runProjectPackageJob(
      { kind: "import", bytes: new Uint8Array([1]) },
      () => m.worker,
    ),
    /Stale exact/,
  );
  assert.equal(m.terminations(), 1);
});
test("wrong-operation and clone failures reject instead of falling back to UI-thread validation", async () => {
  const wrong = mock(() =>
    queueMicrotask(() =>
      wrong.worker.onmessage?.({
        data: { kind: "viewer", result: {} },
      } as MessageEvent),
    ),
  );
  await assert.rejects(
    runProjectPackageJob(
      { kind: "import", bytes: new Uint8Array([1]) },
      () => wrong.worker,
    ),
    /Unexpected/,
  );
  assert.equal(wrong.terminations(), 1);
  const clone = mock(() => {
    throw new Error("clone failed");
  });
  await assert.rejects(
    runProjectPackageJob(
      { kind: "import", bytes: new Uint8Array([1]) },
      () => clone.worker,
    ),
    /clone failed/,
  );
  assert.equal(clone.terminations(), 1);
});

test("import progress does not accept or terminate the package before its final checked result", async () => {
  const events: unknown[] = [];
  const m = mock(() =>
    queueMicrotask(() => {
      m.worker.onmessage?.({
        data: {
          kind: "import",
          progress: { stage: "mapping", elapsedMs: 123 },
        },
      } as MessageEvent);
      assert.equal(m.terminations(), 0);
      m.worker.onmessage?.({
        data: { kind: "import", result: { checked: true } },
      } as MessageEvent);
      m.worker.onmessage?.({
        data: {
          kind: "import",
          progress: { stage: "transfer", elapsedMs: 124 },
        },
      } as MessageEvent);
    }),
  );
  const result = await runProjectPackageJob(
    { kind: "import", bytes: new Uint8Array([1]) },
    () => m.worker,
    (p) => events.push(p),
  );
  assert.deepEqual(result, { checked: true });
  assert.deepEqual(events, [{ stage: "mapping", elapsedMs: 123 }]);
  assert.equal(m.terminations(), 1);
});

test("malformed or mixed progress cannot suppress import failures or become a package result", async () => {
  for (const payload of [
    { progress: { stage: "unknown", elapsedMs: 1 } },
    { progress: { stage: "mapping", elapsedMs: -1 } },
    { progress: { stage: "mapping", elapsedMs: NaN } },
    { progress: { stage: "mapping", elapsedMs: 1 }, error: "bad geometry" },
    { progress: { stage: "mapping", elapsedMs: 1 }, result: {} },
  ]) {
    const m = mock(() =>
      queueMicrotask(() =>
        m.worker.onmessage?.({
          data: { kind: "import", ...payload },
        } as MessageEvent),
      ),
    );
    await assert.rejects(
      runProjectPackageJob(
        { kind: "import", bytes: new Uint8Array([1]) },
        () => m.worker,
      ),
      /Invalid indoor import progress/,
    );
    assert.equal(m.terminations(), 1);
  }
});

test("a failed progress observer releases its worker and rejects the import", async () => {
  const m = mock(() =>
    queueMicrotask(() =>
      m.worker.onmessage?.({
        data: { kind: "import", progress: { stage: "mapping", elapsedMs: 1 } },
      } as MessageEvent),
    ),
  );
  await assert.rejects(
    runProjectPackageJob(
      { kind: "import", bytes: new Uint8Array([1]) },
      () => m.worker,
      () => {
        throw new Error("observer failed");
      },
    ),
    /observer failed/,
  );
  assert.equal(m.terminations(), 1);
});

test("a replaced import releases its worker and ignores late results", async () => {
  const controller = new AbortController();
  const m = mock(() => {});
  const job = runProjectPackageJob(
    { kind: "import", bytes: new Uint8Array([1]) },
    () => m.worker,
    undefined,
    controller.signal,
  );
  controller.abort();
  await assert.rejects(job, /cancelled/);
  assert.equal(m.terminations(), 1);
  m.worker.onmessage?.({
    data: { kind: "import", result: { stale: true } },
  } as MessageEvent);
  assert.equal(m.terminations(), 1);
  let started = false;
  await assert.rejects(
    runProjectPackageJob(
      { kind: "import", bytes: new Uint8Array([1]) },
      () => {
        started = true;
        return m.worker;
      },
      undefined,
      controller.signal,
    ),
    /cancelled/,
  );
  assert.equal(started, false);
});
