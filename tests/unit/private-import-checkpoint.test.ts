import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  bindPrivateImportCheckpoint,
  readPrivateImportCheckpoint,
  writePrivateImportCheckpoint,
  type PrivateImportedData,
} from "../../scripts/indoor/private-import-checkpoint";

test("private import data preserves bytes and refuses source, receipt and payload changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oim-import-data-"));
  try {
    const input = path.join(root, "source.zip"), directory = path.join(root, "private");
    await writeFile(input, "source fixture bytes");
    const binding = await bindPrivateImportCheckpoint(directory, input);
    assert.equal(await readPrivateImportCheckpoint(binding), undefined);
    const manifest = { model: { sha256: "fixture" } },
      rooms = { annotations: [], evidence: new Uint8Array([0, 255, 1]) },
      dataset = { value: -0, exact: 12345678901234567890n };
    const data = {
      original: { manifest, rooms, indoor: dataset },
      before: { manifest, rooms, dataset, files: { "model/original.rvt": new Uint8Array([3, 4, 5]) } },
    } as unknown as PrivateImportedData;
    await writePrivateImportCheckpoint(binding, data);
    assert.deepEqual(await readPrivateImportCheckpoint(binding), data);
    await writeFile(input, "changed source fixture");
    await assert.rejects(readPrivateImportCheckpoint(binding), /changed during import/);
    const differentBinding = await bindPrivateImportCheckpoint(directory, input);
    assert.notEqual(differentBinding.bindingSha256, binding.bindingSha256);
    assert.equal(await readPrivateImportCheckpoint(differentBinding), undefined);
    await writeFile(input, "source fixture bytes");
    const receiptPath = path.join(directory, binding.bindingSha256 + ".json"),
      receiptBytes = await readFile(receiptPath), receipt = JSON.parse(receiptBytes.toString());
    receipt.binding.input.sha256 = "0".repeat(64);
    await writeFile(receiptPath, JSON.stringify(receipt));
    await assert.rejects(readPrivateImportCheckpoint(binding));
    await writeFile(receiptPath, receiptBytes);
    const payloadPath = path.join(directory, receipt.payload.name), payload = await readFile(payloadPath);
    payload[payload.length - 1] ^= 1;
    await writeFile(payloadPath, payload);
    await assert.rejects(readPrivateImportCheckpoint(binding), /Private import data changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
