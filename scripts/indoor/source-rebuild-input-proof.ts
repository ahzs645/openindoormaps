/** A derived display mapping may be discarded only in an isolated compiler
 * input. This proves exact retained JSON operands and every other archive entry;
 * it confers no visitor, geometry, route or cache-validation authority. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

/** Scan top-level JSON operands without materializing hundreds of MB of native
 * geometry. The trusted original is valid JSON; identical retained raw operands
 * are stronger evidence than a rounded or normalized geometric comparison. */
export function topLevelJsonOperands(bytes: Uint8Array) {
  const text = new TextDecoder(),
    fields = new Map<string, { bytes: Uint8Array; sha256: string }>();
  let i = 0;
  const ws = () => {
    while ([9, 10, 13, 32].includes(bytes[i])) i++;
  };
  const stringEnd = () => {
    assert.equal(bytes[i++], 34);
    while (i < bytes.length) {
      const c = bytes[i++];
      if (c === 92) {
        assert(i < bytes.length);
        i++;
      } else if (c === 34) return;
    }
    throw Error("Unterminated JSON string");
  };
  ws();
  assert.equal(bytes[i++], 123);
  ws();
  while (bytes[i] !== 125) {
    const keyStart = i;
    stringEnd();
    const key = JSON.parse(text.decode(bytes.subarray(keyStart, i))) as string;
    assert(!fields.has(key), "Duplicate top-level JSON key");
    ws();
    assert.equal(bytes[i++], 58);
    ws();
    const start = i;
    if (bytes[i] === 34) stringEnd();
    else if (bytes[i] === 123 || bytes[i] === 91) {
      const stack = [bytes[i++] === 123 ? 125 : 93];
      while (stack.length) {
        assert(i < bytes.length, "Unterminated JSON operand");
        const c = bytes[i];
        if (c === 34) stringEnd();
        else {
          i++;
          if (c === 123) stack.push(125);
          else if (c === 91) stack.push(93);
          else if (c === 125 || c === 93)
            assert.equal(c, stack.pop(), "Mismatched JSON container");
        }
      }
    } else {
      while (
        i < bytes.length &&
        bytes[i] !== 44 &&
        bytes[i] !== 125 &&
        ![9, 10, 13, 32].includes(bytes[i])
      )
        i++;
      assert(i > start, "Missing JSON operand");
    }
    const value = bytes.subarray(start, i);
    fields.set(key, { bytes: value, sha256: hash(value) });
    ws();
    if (bytes[i] === 44) {
      i++;
      ws();
      assert.notEqual(bytes[i], 125, "Trailing JSON comma");
    } else {
      assert.equal(bytes[i], 125);
      break;
    }
  }
  assert.equal(bytes[i++], 125);
  ws();
  assert.equal(i, bytes.length, "Trailing JSON content");
  return fields;
}

function archive(bytes: Uint8Array) {
  let expanded = 0;
  const seen = new Set<string>();
  return unzipSync(bytes, {
    filter: (entry) => {
      assert(!seen.has(entry.name), "Duplicate archive entry");
      seen.add(entry.name);
      expanded += entry.originalSize;
      assert(
        expanded <= 900 * 1024 * 1024,
        "Source rebuild archive exceeds original package aggregate limit",
      );
      return true;
    },
  });
}
export function proveDerivedMappingDiscard(
  originalBytes: Uint8Array,
  rebuildBytes: Uint8Array,
) {
  const original = archive(originalBytes),
    rebuilt = archive(rebuildBytes),
    decode = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b)),
    before = decode(original["manifest.json"]),
    after = decode(rebuilt["manifest.json"]);
  assert.equal(before.format, "reviter-project");
  assert.equal(before.version, 2);
  assert.equal(before.indoor.path, "viewer/indoor.json");
  assert.deepEqual(
    Object.keys(original).sort(),
    Object.keys(rebuilt).sort(),
    "Source rebuild added/removed an archive entry",
  );
  const oldIndoor = original[before.indoor.path],
    newIndoor = rebuilt[before.indoor.path];
  assert.equal(oldIndoor.length, before.indoor.bytes);
  assert.equal(hash(oldIndoor), before.indoor.sha256);
  assert.deepEqual(
    after,
    {
      ...before,
      indoor: {
        ...before.indoor,
        bytes: newIndoor.length,
        sha256: hash(newIndoor),
      },
    },
    "Only manifest indoor size/checksum may change",
  );
  const oldFields = topLevelJsonOperands(oldIndoor),
    newFields = topLevelJsonOperands(newIndoor),
    mapping = oldFields.get("nativeExploreMapping");
  assert(mapping, "Original derived mapping is absent");
  assert(
    !newFields.has("nativeExploreMapping"),
    "Derived mapping was not removed",
  );
  assert.deepEqual(
    [...oldFields.keys()].filter((key) => key !== "nativeExploreMapping"),
    [...newFields.keys()],
    "Only the derived mapping property may be removed",
  );
  for (const [key, value] of newFields)
    assert.equal(
      value.sha256,
      oldFields.get(key)?.sha256,
      `Original dataset operand changed: ${key}`,
    );
  const retainedAssets = Object.entries(original)
    .filter(([key]) => key !== "manifest.json" && key !== before.indoor.path)
    .map(([name, value]) => {
      assert.equal(
        hash(rebuilt[name]),
        hash(value),
        `Original source/archive asset changed: ${name}`,
      );
      return { path: name, bytes: value.length, sha256: hash(value) };
    });
  const source = decode(oldFields.get("source")!.bytes);
  assert.equal(source.modelSha256, before.model.sha256);
  assert.equal(source.roomsSha256, before.floors.sha256);
  assert.equal(hash(original[before.model.path]), before.model.sha256);
  assert.equal(hash(original[before.floors.path]), before.floors.sha256);
  return {
    inputSha256: hash(originalBytes),
    outputSha256: hash(rebuildBytes),
    originalIndoorSha256: hash(oldIndoor),
    rebuiltIndoorSha256: hash(newIndoor),
    removedDerivedField: "viewer/indoor.json:nativeExploreMapping",
    removedMappingSha256: mapping.sha256,
    unchangedRetainedDatasetFields: [...newFields.keys()],
    allOtherParsedDatasetFieldsUnchanged: true,
    allSourceAssetsByteIdentical: true,
    retainedAssets,
    sourceModelSha256: source.modelSha256,
    sourceRoomsSha256: source.roomsSha256,
    authority:
      "Isolated source-rebuild input only; full original import, physical guards and fresh output mapping validation remain mandatory",
  };
}
export async function verifyDerivedMappingRebuild(
  originalPath: string,
  rebuildPath: string,
  receiptPath: string,
) {
  const [original, rebuild, receiptBytes] = await Promise.all([
      fs.readFile(originalPath),
      fs.readFile(rebuildPath),
      fs.readFile(receiptPath),
    ]),
    receipt = JSON.parse(new TextDecoder().decode(receiptBytes)),
    proof = proveDerivedMappingDiscard(original, rebuild);
  assert.equal(path.resolve(receipt.input.path), path.resolve(originalPath));
  assert.equal(path.resolve(receipt.output.path), path.resolve(rebuildPath));
  assert.equal(receipt.input.sha256, proof.inputSha256);
  assert.equal(receipt.output.sha256, proof.outputSha256);
  assert.equal(receipt.input.bytes, original.length);
  assert.equal(receipt.output.bytes, rebuild.length);
  for (const key of [
    "originalIndoorSha256",
    "rebuiltIndoorSha256",
    "removedDerivedField",
    "removedMappingSha256",
    "allOtherParsedDatasetFieldsUnchanged",
    "allSourceAssetsByteIdentical",
  ] as const)
    assert.equal(receipt[key], proof[key]);
  assert.deepEqual(
    [...receipt.retainedAssets].sort((a, b) => a.path.localeCompare(b.path)),
    [...proof.retainedAssets].sort((a, b) => a.path.localeCompare(b.path)),
  );
  assert.equal(receipt.canonicalReplaced, false);
  assert.equal(receipt.freshOutputMappingValidationRequired, true);
  assert.match(receipt.routingProjectionBefore, /^[a-f0-9]{64}$/);
  assert.equal(receipt.routingProjectionBefore, receipt.routingProjectionAfter);
  return {
    ...proof,
    receiptPath: path.resolve(receiptPath),
    receiptSha256: hash(receiptBytes),
    originalPath: path.resolve(originalPath),
    rebuildPath: path.resolve(rebuildPath),
    routingProjectionInvariance:
      "Every retained raw dataset operand is byte-identical; production routeWorkerDataset omits the sole changed nativeExploreMapping field",
    reportedCanonicalRoutingProjectionSha256: receipt.routingProjectionBefore,
    independentProjectionHashRecalculated: false,
  };
}
