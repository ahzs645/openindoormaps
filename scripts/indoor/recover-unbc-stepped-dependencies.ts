/** Source-owned capture locators only. These IDs grant no material authority. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createOriginalNativeForeignEnvelopeCensus,
  originalNativeForeignEnvelopeFacts,
  readOriginalForeignEnvelopeScopedSemantic,
} from "../../../reviter/lib/reviter/native-source-foreign-envelope-census.ts";
import { originalRectangularMullionEnvelopeDependencies } from "../../../reviter/lib/reviter/native-source-rectangular-mullion-envelope.ts";
import { readOriginalCurtainInstanceTypedFifo } from "../../../reviter/lib/reviter/native-source-curtain-instance.ts";
import { readSchema } from "../../../reviter/lib/reviter/schema-reader.ts";
const root = path.resolve(process.argv[2]!),
  out = path.join(root, "reviews"),
  hash = (b: Uint8Array | string) =>
    createHash("sha256").update(b).digest("hex");
const bytes = await readFile(
    path.resolve(root, "../unbc-recovery-20261017/UNBC.original.rvt"),
  ),
  review = JSON.parse(
    await readFile(path.join(out, "reviewed-drawing-references.json"), "utf8"),
  );
const scope = {
  min: { x: -15, y: -328, z: 23 },
  max: { x: 6, y: -300, z: 42 },
};
const certificate = createOriginalNativeForeignEnvelopeCensus(
  bytes,
  hash(bytes),
  scope,
  review,
).certificate;
const facts = originalNativeForeignEnvelopeFacts(certificate),
  unknown = facts.rows.filter((r) => !r.boundsFeet || r.blocker),
  dependencies = [];
const id = (v: unknown) => {
  const n = (v as { m_id: { m_id64: number } }).m_id.m_id64;
  assert(Number.isSafeInteger(n) && n > 0);
  return n;
};
for (const row of unknown) {
  if (row.categoryId === -2_000_171) {
    const d = originalRectangularMullionEnvelopeDependencies(
      certificate,
      row.nativeElementId,
    );
    assert(d.ok, d.ok ? "" : d.blockers.join(";"));
    dependencies.push(d);
  }
  if (row.categoryId === -2_000_170) {
    const original = readOriginalForeignEnvelopeScopedSemantic(
        certificate,
        row.nativeElementId,
        2031,
      ),
      schema = readSchema(original.originalSourceSchemaBytes);
    assert(schema.ok);
    const decoded = readOriginalCurtainInstanceTypedFifo(
      original.originalFrameBytes,
      schema.schema,
    );
    assert(decoded.ok);
    const info = decoded.value.entries.filter(
      (e) => e.sourceClassName === "InstanceInfo",
    );
    assert.equal(info.length, 1);
    const nativeHostId = id(decoded.value.root.m_hostId),
      nativeSymbolId = id(info[0]!.value.m_symbolId);
    dependencies.push({
      nativeElementId: row.nativeElementId,
      nativeHostId,
      nativeSymbolId,
      originalInstanceFrameSha256: original.originalFrameSha256,
      requestedOriginalFrameIds: [
        row.nativeElementId,
        nativeHostId,
        nativeSymbolId,
      ],
    });
  }
}
const ids = [
  ...new Set(dependencies.flatMap((d) => d.requestedOriginalFrameIds)),
].sort((a, b) => a - b);
const result = {
  format: "original-stepped-stair-capture-locators-v1",
  sourceModelSha256: hash(bytes),
  reviewedDrawingReferencesSha256: hash(JSON.stringify(review)),
  sourceCensusSha256: facts.sourceCensusSha256,
  physicalRows: facts.rows.length,
  physicalRowsSha256: hash(JSON.stringify(facts.rows)),
  unknownRows: unknown.length,
  dependencies,
  requestedOriginalFrameIds: ids,
  locatorsOnly: true,
  materialOrRouteAuthorityGranted: false,
};
await writeFile(
  path.join(out, "stepped-source-dependencies.json"),
  JSON.stringify(result, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    unknownRows: unknown.length,
    dependencies: dependencies.length,
    retainedLocators: ids.length,
  }),
);
