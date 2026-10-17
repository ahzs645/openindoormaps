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
      coordinate: 0.123_456_789_012_345,
      physical: "m".repeat(17 * 1024 * 1024),
    },
    nativeProvisionalCornerSeals: {
      sourceVerified: false,
      revisitRequired: true,
      physical: "c".repeat(17 * 1024 * 1024),
    },
  };
  const before = JSON.stringify(metadata),
    wire = await packViewerMetadata(metadata);
  assert(Buffer.byteLength(JSON.stringify(wire)) < 32 * 1024 * 1024);
  assert.equal(JSON.stringify(await hydrateViewerMetadata(wire)), before);
  assert.equal(JSON.stringify(metadata), before);
  const packed = wire as {
    bytes: number;
    sha256: string;
    [key: string]: unknown;
  };
  await assert.rejects(
    hydrateViewerMetadata({ ...packed, bytes: 128 * 1024 * 1024 + 1 }),
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

function referenceFixture() {
  const physical = {
    originalCoordinates: [
      0.123_456_789_012_345,
      1 + Number.EPSILON,
      -0.000_001,
    ],
    holes: [
      [
        [1, 2],
        [3, 4],
        [1, 2],
      ],
    ],
    evidence: "original source-bound material; ".repeat(100),
  };
  const dataset = {
    source: { modelSha256: "a".repeat(64), roomsSha256: "b".repeat(64) },
    nativeMaterialSections: structuredClone(physical),
    nativeProvisionalCornerSeals: {
      sourceVerified: false,
      revisitRequired: true,
      evidence: "provisional; not a route approval; ".repeat(100),
    },
    nativeIndoorEnvelopes: { authored: true, compilerSupplement: [1, 2] },
  };
  const metadata = {
    format: "openindoormaps-viewer-metadata",
    version: 1,
    annotations: [{ key: "original-room", access: "staff", walkability: "no" }],
    nativeMaterialSections: physical,
    nativeIndoorEnvelopes: { authored: true },
    nativeProvisionalCornerSeals: structuredClone(
      dataset.nativeProvisionalCornerSeals,
    ),
  };
  return { dataset, metadata };
}

// Exercise the representation that the package loader actually receives.
function jsonWire(value: object) {
  const text = JSON.stringify(value);
  return JSON.parse(text);
}

test("dataset references preserve exact logical metadata, original field order and source evidence", async () => {
  const { dataset, metadata } = referenceFixture();
  const sourceBefore = JSON.stringify(dataset);
  const before = JSON.stringify(metadata);
  const packed = await packViewerMetadata(metadata, dataset);
  const wire = jsonWire(packed);
  assert.equal(wire.version, 2);
  assert.deepEqual(
    wire.references.map((r: { field: string }) => r.field),
    ["nativeMaterialSections", "nativeProvisionalCornerSeals"],
  );
  assert.deepEqual(wire.inline.nativeIndoorEnvelopes, { authored: true });
  assert.equal(
    JSON.stringify(await hydrateViewerMetadata(wire, dataset)),
    before,
  );
  assert.equal(JSON.stringify(metadata), before);
  assert.equal(JSON.stringify(dataset), sourceBefore);
  assert(
    Buffer.byteLength(JSON.stringify(wire)) < Buffer.byteLength(before) / 2,
  );
});

test("hydrated references and inline values never alias the mutable dataset, wire or input metadata", async () => {
  const { dataset, metadata } = referenceFixture();
  const before = JSON.stringify(metadata);
  const packed = await packViewerMetadata(metadata, dataset);
  const wire = jsonWire(packed);
  metadata.annotations[0].access = "public";
  metadata.nativeMaterialSections.originalCoordinates[0] = 999;
  const hydrated = (await hydrateViewerMetadata(
    wire,
    dataset,
  )) as typeof metadata;
  assert.equal(JSON.stringify(hydrated), before);
  hydrated.nativeMaterialSections.originalCoordinates[0] = 888;
  hydrated.annotations[0].access = "public";
  assert.equal(
    dataset.nativeMaterialSections.originalCoordinates[0],
    0.123_456_789_012_345,
  );
  assert.equal(wire.inline.annotations[0].access, "staff");
  const again = await hydrateViewerMetadata(wire, dataset);
  assert.equal(JSON.stringify(again), before);
});

test("references require the original source and exact current physical values", async () => {
  const { dataset, metadata } = referenceFixture();
  const wire = jsonWire(await packViewerMetadata(metadata, dataset));
  await assert.rejects(hydrateViewerMetadata(wire), /packed viewer/);
  for (const change of [
    (d: typeof dataset) => {
      d.source.modelSha256 = "c".repeat(64);
    },
    (d: typeof dataset) => {
      d.source.roomsSha256 = "c".repeat(64);
    },
    (d: typeof dataset) => {
      d.nativeMaterialSections.originalCoordinates[1] = 1;
    },
    (d: typeof dataset) => {
      d.nativeProvisionalCornerSeals.sourceVerified = true;
    },
  ]) {
    const edited = structuredClone(dataset);
    change(edited);
    await assert.rejects(hydrateViewerMetadata(wire, edited), /packed viewer/);
  }
});

test("reference corruption, substitutions, extra keys and changed logical metadata fail before acceptance", async () => {
  const { dataset, metadata } = referenceFixture();
  const wire = jsonWire(await packViewerMetadata(metadata, dataset));
  const corruptions = [
    (w: typeof wire) => {
      w.references[0].sha256 = "f".repeat(64);
    },
    (w: typeof wire) => {
      w.references[0].bytes--;
    },
    (w: typeof wire) => {
      w.references[0].field = "source";
    },
    (w: typeof wire) => {
      w.references.push(w.references[0]);
    },
    (w: typeof wire) => {
      w.references[0].unbound = true;
    },
    (w: typeof wire) => {
      w.inline.nativeMaterialSections = dataset.nativeMaterialSections;
    },
    (w: typeof wire) => {
      w.inline.annotations[0].access = "public";
    },
    (w: typeof wire) => {
      w.keys.reverse();
    },
    (w: typeof wire) => {
      w.keys.push(w.keys[0]);
    },
    (w: typeof wire) => {
      w.keys.pop();
    },
    (w: typeof wire) => {
      w.source.unbound = true;
    },
    (w: typeof wire) => {
      w.sha256 = "f".repeat(64);
    },
    (w: typeof wire) => {
      w.bytes++;
    },
    (w: typeof wire) => {
      w.bytes = 128 * 1024 * 1024 + 1;
    },
    (w: typeof wire) => {
      w.inline = { ...wire };
    },
    (w: typeof wire) => {
      w.unbound = true;
    },
  ];
  for (const change of corruptions) {
    const edited = structuredClone(wire);
    change(edited);
    await assert.rejects(
      hydrateViewerMetadata(edited, dataset),
      /packed viewer/,
    );
  }
});

test("large unmatched inline metadata retains bounded legacy packing inside reference wire", async () => {
  const { dataset, metadata } = referenceFixture();
  const large = {
    ...metadata,
    retained: "original unshared metadata ".repeat(1_400_000),
  };
  const before = JSON.stringify(large);
  const wire = jsonWire(await packViewerMetadata(large, dataset));
  assert.equal(wire.version, 2);
  assert.equal(wire.inline.version, 1);
  assert(Buffer.byteLength(JSON.stringify(wire)) < 32 * 1024 * 1024);
  assert.equal(
    JSON.stringify(await hydrateViewerMetadata(wire, dataset)),
    before,
  );
});
