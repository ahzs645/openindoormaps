import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { fixture } from "../fixtures/native-area-project";
import {
  compileNativeExploreMapping,
  nativeExploreDatasetGeometrySha256,
  validatePublishedNativeExploreMapping,
  validatePublishedNativeExploreMappingInProcess,
} from "../../app/indoor-project/native-explore-mapping";

test("real published validator still rejects new undefined mapping keys and forged source", async () => {
  const data = fixture();
  data.nativeExploreMapping = await compileNativeExploreMapping(
    data,
    await nativeExploreDatasetGeometrySha256(data),
  );
  const before = JSON.stringify(data);
  await validatePublishedNativeExploreMappingInProcess(data);
  await validatePublishedNativeExploreMapping(data);
  assert.equal(JSON.stringify(data), before);
  const mapping = data.nativeExploreMapping as unknown as Record<
    string,
    unknown
  >;
  mapping.extra = undefined;
  await assert.rejects(validatePublishedNativeExploreMappingInProcess(data));
  delete mapping.extra;
  await validatePublishedNativeExploreMappingInProcess(data);
  data.source.modelSha256 = "f".repeat(64);
  await assert.rejects(validatePublishedNativeExploreMappingInProcess(data));
});

test("public browser path delegates validation before reading or hashing the carrier", async () => {
  const originals = ["window", "Worker"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  let posted: unknown,
    terminated = false;
  class FakeWorker {
    onmessage?: (event: { data: object }) => void;
    postMessage(value: unknown) {
      posted = value;
      queueMicrotask(() => this.onmessage?.({ data: {} }));
    }
    terminate() {
      terminated = true;
    }
  }
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: FakeWorker,
    });
    const data = fixture();
    data.nativeExploreMapping = {
      version: 3,
    } as typeof data.nativeExploreMapping;
    Object.defineProperty(data, "source", {
      enumerable: true,
      get: () => {
        throw Error("main-thread carrier read");
      },
    });
    await validatePublishedNativeExploreMapping(data);
    assert.deepEqual(posted, { data, validation: true });
    assert.equal(terminated, true);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("mapping proof is independent of historical room volume meshes but rechecks every source replacement", async () => {
  const data = fixture();
  data.nativeExploreMapping = await compileNativeExploreMapping(
    data,
    await nativeExploreDatasetGeometrySha256(data),
  );
  data.presentation = {
    historical: { mesh: [1, 2, 3] },
  } as unknown as IndoorDataset["presentation"];
  const before = JSON.stringify(data);
  await validatePublishedNativeExploreMappingInProcess(data);
  assert.equal(JSON.stringify(data), before);
  data.presentation = {
    historical: { mesh: [9] },
  } as unknown as IndoorDataset["presentation"];
  await validatePublishedNativeExploreMappingInProcess(data);
  const source = data.source;
  data.source = { ...source, modelSha256: "f".repeat(64) };
  await assert.rejects(validatePublishedNativeExploreMappingInProcess(data));
  data.source = source;
  await validatePublishedNativeExploreMappingInProcess(data);
  data.records[0].ringsFeet[0][0][0] += 1;
  await assert.rejects(validatePublishedNativeExploreMappingInProcess(data));
});
