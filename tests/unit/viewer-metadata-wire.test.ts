import test from "node:test";
import assert from "node:assert/strict";
import {
  packViewerMetadata,
  hydrateViewerMetadata,
} from "../../app/indoor-project/viewer-metadata-wire";

test("multiple individually small physical bindings fit the viewer limit without rounding", async () => {
  const metadata = {
    format: "openindoormaps-viewer-metadata",
    version: 1,
    nativeMaterialSections: {
      coordinate: 0.123456789012345,
      physical: "m".repeat(9 * 1024 * 1024),
    },
    nativeProvisionalCornerSeals: {
      sourceVerified: false,
      revisitRequired: true,
      physical: "c".repeat(9 * 1024 * 1024),
    },
  };
  const before = JSON.stringify(metadata),
    wire = await packViewerMetadata(metadata);
  assert(Buffer.byteLength(JSON.stringify(wire)) < 16 * 1024 * 1024);
  assert.equal(JSON.stringify(await hydrateViewerMetadata(wire)), before);
  assert.equal(JSON.stringify(metadata), before);
  const packed = wire as {
    bytes: number;
    sha256: string;
    [key: string]: unknown;
  };
  await assert.rejects(
    hydrateViewerMetadata({ ...packed, bytes: 64 * 1024 * 1024 + 1 }),
    /packed viewer/,
  );
  await assert.rejects(
    hydrateViewerMetadata({ ...packed, sha256: "f".repeat(64) }),
    /packed viewer/,
  );
  await assert.rejects(
    hydrateViewerMetadata({ ...packed, bytes: packed.bytes - 1 }),
    /packed review/,
  );
  await assert.rejects(
    hydrateViewerMetadata({ ...packed, unboundGeometry: [] }),
    /packed viewer/,
  );
});

test("legacy small viewer metadata remains unchanged", async () => {
  const metadata = {
    format: "openindoormaps-viewer-metadata",
    version: 1,
    annotations: [],
  };
  assert.equal(await packViewerMetadata(metadata), metadata);
  assert.equal(await hydrateViewerMetadata(metadata), metadata);
});
