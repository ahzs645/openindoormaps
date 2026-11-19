/** Verify compiler diagnostic exports before using them for review images.
 * This checks identity and byte integrity, not new route or source admission. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [directory] = process.argv.slice(2);
if (!directory)
  throw new Error("Usage: verify-corridor-run-diagnostic.mjs directory");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receiptBytes = readFileSync(
  path.join(directory, "diagnostic-receipt.json"),
);
const receipt = JSON.parse(receiptBytes);
assert.equal(receipt.status, "scoped-compiler-diagnostic-only");
assert.equal(receipt.navigationAuthority, false);
const fields = [
  "sourceSha256",
  "contextSha256",
  "compilerBinding",
  "cacheCompressedSha256",
  "cacheLogicalSha256",
];
for (const field of fields)
  assert.match(receipt[field], /^[a-f0-9]{64}$/, `Invalid ${field}`);
assert.ok(Array.isArray(receipt.cells) && receipt.cells.length > 0);
const cellIds = new Set();
const manifest = {
  format: "unbc-corridor-diagnostic-export-manifest-v1",
  status: "diagnostic-identity-and-integrity-checked",
  navigationAuthority: false,
  diagnosticReceiptSha256: sha(receiptBytes),
  ...Object.fromEntries(fields.map((field) => [field, receipt[field]])),
  files: [],
};
for (const cell of receipt.cells) {
  assert.equal(typeof cell.cellId, "string");
  assert.ok(cell.cellId.length > 0 && !cellIds.has(cell.cellId));
  cellIds.add(cell.cellId);
  assert.equal(typeof cell.withdrawn, "boolean");
  assert.ok(Number.isSafeInteger(cell.originalEdges) && cell.originalEdges > 0);
  assert.ok(Number.isSafeInteger(cell.terminals) && cell.terminals > 0);
  const exports = new Map();
  for (const role of ["control", "proposed", "guarded"]) {
    const file = `${cell.cellId.replaceAll(":", "_")}-${role}.json`;
    const bytes = readFileSync(path.join(directory, file));
    const value = JSON.parse(bytes);
    assert.equal(value.cell.id, cell.cellId);
    assert.equal(value.navigationAuthority, false);
    assert.equal(value.status, receipt.status);
    assert.equal(value.withdrawn, cell.withdrawn);
    for (const field of fields)
      assert.equal(value[field], receipt[field], field);
    assert.equal(value.edges.length, cell.originalEdges, "Incomplete original edges");
    assert.equal(value.terminalCount, cell.terminals, "Changed terminal count");
    const edges = new Map(value.edges.map((edge) => [edge.id, edge]));
    assert.equal(edges.size, value.edges.length, "Duplicate source edge");
    const ids = new Set();
    for (const guide of value.guides) {
      assert.ok(!ids.has(guide.edgeId), "Duplicate guide identity");
      ids.add(guide.edgeId);
      const edge = edges.get(guide.edgeId);
      assert.ok(edge, "Unknown original guide edge");
      assert.ok(guide.pointsFeet.length >= 2);
      assert.ok(
        guide.pointsFeet.every(
          (p) => p.length === 3 && p.every(Number.isFinite),
        ),
      );
      assert.deepEqual(
        guide.pointsFeet[0],
        edge.pointsFeet[0],
        "Changed departure",
      );
      assert.deepEqual(
        guide.pointsFeet.at(-1),
        edge.pointsFeet.at(-1),
        "Changed arrival",
      );
    }
    const expected =
      role === "control"
        ? cell.controlGuides
        : role === "proposed"
          ? cell.proposedGuides
          : cell.guardedGuides;
    assert.equal(
      value.guides.length,
      expected,
      "Mismatched complete export count",
    );
    assert.ok(value.guides.length > 0, "Empty guide export");
    exports.set(role, value.guides);
    manifest.files.push({
      file,
      sha256: sha(bytes),
      cellId: cell.cellId,
      role,
    });
  }
  assert.deepEqual(
    exports.get("guarded"),
    exports.get(cell.withdrawn ? "control" : "proposed"),
    "Guarded output does not match the reported decision",
  );
}
writeFileSync(
  path.join(directory, "diagnostic-export-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    verifiedFiles: manifest.files.length,
    sourceSha256: receipt.sourceSha256,
  }),
);
