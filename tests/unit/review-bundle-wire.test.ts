import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync, zipSync, strToU8 } from "fflate";
import {
  packReviewBundle,
  unpackReviewBundle,
  serializeRoomsWithReviewBundle,
  serializeRoomsForArchive,
  REVIEW_BUNDLE_ARCHIVE_PATH,
  type PackedReviewBundle,
} from "../../app/indoor-project/review-bundle-wire";
import {
  reviewFileBytes,
  type ReviewBundle,
} from "../../app/indoor-project/review-bundle";
import { project as fixtureProject } from "../fixtures/native-area-project";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
function bundle(): ReviewBundle {
  const text = new TextEncoder().encode(
    '{"evidence":"' +
      "native source wall and doorway evidence; ".repeat(8000) +
      '"}',
  );
  const binary = Uint8Array.from({ length: 4096 }, (_, i) => (i * 71) % 256);
  return {
    version: 1,
    masterSha256: "a".repeat(64),
    files: [
      {
        path: "review/evidence.json",
        bytes: text.length,
        sha256: sha(text),
        compressedBase64: b64(deflateSync(text)),
      },
      {
        path: "review/source.png",
        bytes: binary.length,
        sha256: sha(binary),
        compressedBase64: b64(deflateSync(binary, { level: 0 })),
      },
      {
        path: "review/reply.txt",
        bytes: 0,
        sha256: sha(new Uint8Array()),
        compressedBase64: b64(deflateSync(new Uint8Array())),
      },
    ],
  };
}
function changed(
  wire: PackedReviewBundle,
  edit: (
    header: any,
    payload: Uint8Array,
  ) => { header: any; payload?: Uint8Array },
) {
  const raw = inflateSync(Buffer.from(wire.compressedBase64, "base64"));
  const n = new DataView(raw.buffer, raw.byteOffset).getUint32(0, true);
  const result = edit(
    JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + n))),
    raw.subarray(4 + n),
  );
  const header = new TextEncoder().encode(JSON.stringify(result.header)),
    payload = result.payload ?? raw.subarray(4 + n);
  const bytes = new Uint8Array(4 + header.length + payload.length);
  new DataView(bytes.buffer).setUint32(0, header.length, true);
  bytes.set(header, 4);
  bytes.set(payload, 4 + header.length);
  return {
    ...wire,
    bytes: bytes.length,
    sha256: sha(bytes),
    compressedBase64: b64(deflateSync(bytes, { level: 9 })),
  };
}
test("packed authoring evidence preserves default streams, nondefault streams, binary files and ordering exactly", async () => {
  const original = bundle(),
    wire = await packReviewBundle(original),
    restored = await unpackReviewBundle(wire);
  assert.deepEqual(restored, original);
  for (let i = 0; i < original.files.length; i++)
    assert.deepEqual(
      reviewFileBytes(restored!.files[i]),
      reviewFileBytes(original.files[i]),
    );
  assert.equal(wire.encoding, "deflate-binary-v1");
  const raw = inflateSync(Buffer.from(wire.compressedBase64, "base64"));
  const n = new DataView(raw.buffer, raw.byteOffset).getUint32(0, true);
  const h = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + n)));
  assert.equal(h.files[0].mode, "raw");
  assert.equal(h.files[1].mode, "compressed");
});
test("legacy wire is unchanged; only exceeding rooms JSON packs review companions", async () => {
  const original = bundle(),
    rooms = { annotations: [], reviewBundle: original };
  assert.equal(await unpackReviewBundle(original), original);
  assert.equal(await unpackReviewBundle(undefined), undefined);
  assert.deepEqual(
    await serializeRoomsWithReviewBundle(rooms),
    new TextEncoder().encode(JSON.stringify(rooms)),
  );
  // Incompressible inner stream at level zero makes legacy base64 larger than
  // the complete outer packed binary while retaining that exact stream.
  const binary = Uint8Array.from({ length: 120000 }, (_, i) => (i * 71) % 256);
  rooms.reviewBundle.files = [
    {
      path: "review/source.png",
      bytes: binary.length,
      sha256: sha(binary),
      compressedBase64: b64(deflateSync(binary, { level: 0 })),
    },
  ];
  const bytes = await serializeRoomsWithReviewBundle(rooms, 12000);
  assert(bytes.length < 12000);
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  assert.deepEqual(
    await unpackReviewBundle(parsed.reviewBundle),
    rooms.reviewBundle,
  );
  await assert.rejects(
    serializeRoomsWithReviewBundle(
      { reviewBundle: undefined, tooBig: "x".repeat(20) },
      10,
    ),
    /size limit/,
  );
  await assert.rejects(serializeRoomsWithReviewBundle(rooms, 10), /size limit/);
});
test("packed wire refuses damaged payload, truncated stream, trailing bytes and wrong declared lengths", async () => {
  const wire = await packReviewBundle(bundle());
  await assert.rejects(unpackReviewBundle({ ...wire, sha256: "b".repeat(64) }));
  await assert.rejects(unpackReviewBundle({ ...wire, bytes: wire.bytes - 1 }));
  const compressed = Buffer.from(wire.compressedBase64, "base64");
  await assert.rejects(
    unpackReviewBundle({
      ...wire,
      compressedBase64: b64(compressed.subarray(0, compressed.length - 3)),
    }),
  );
  await assert.rejects(
    unpackReviewBundle({
      ...wire,
      compressedBase64: b64(
        Buffer.concat([compressed, Buffer.from([1, 2, 3])]),
      ),
    }),
  );
  await assert.rejects(
    unpackReviewBundle(
      changed(wire, (header, payload) => {
        const p = payload.slice();
        p[0] ^= 1;
        return { header, payload: p };
      }),
    ),
  );
  await assert.rejects(
    unpackReviewBundle(
      changed(wire, (header) => {
        header.files[0].storedBytes++;
        return { header };
      }),
    ),
  );
  await assert.rejects(
    unpackReviewBundle(
      changed(wire, (header) => {
        header.files[1].bytes--;
        return { header };
      }),
    ),
  );
});
test("metadata and expansion bounds reject unsafe paths, file/count/total/header excess and raw bombs", async () => {
  const wire = await packReviewBundle(bundle());
  await assert.rejects(
    unpackReviewBundle({ ...wire, bytes: 257 * 1024 * 1024 + 1 }),
  );
  await assert.rejects(
    unpackReviewBundle(
      changed(wire, (header) => {
        header.files[0].path = "../reply.txt";
        return { header };
      }),
    ),
  );
  await assert.rejects(
    unpackReviewBundle(
      changed(wire, (header) => {
        header.files[0].bytes = 33 * 1024 * 1024;
        return { header };
      }),
    ),
  );
  await assert.rejects(
    unpackReviewBundle(
      changed(wire, (header) => {
        header.files = Array.from({ length: 1001 }, (_, i) => ({ ...header.files[0], path: `review/over-count-${i}.json` }));
        return { header };
      }),
    ),
  );
  await assert.rejects(
    unpackReviewBundle(
      changed(wire, (header) => {
        header.files = Array.from({ length: 5 }, (_, i) => ({
          ...header.files[0],
          path: `review/${i}.json`,
          mode: "compressed",
          storedBytes: 0,
          bytes: 32 * 1024 * 1024,
        }));
        return { header };
      }),
    ),
  );
  await assert.rejects(
    unpackReviewBundle(
      changed(wire, (header) => {
        header.padding = "x".repeat(1024 * 1024);
        return { header };
      }),
    ),
  );
  const bomb = deflateSync(new Uint8Array(2 * 1024 * 1024), { level: 9 });
  await assert.rejects(
    unpackReviewBundle({ ...wire, bytes: 10, compressedBase64: b64(bomb) }),
  );
});
test("legacy noncanonical base64 spelling is retained rather than silently normalized", async () => {
  const original = bundle();
  original.files[1].compressedBase64 =
    original.files[1].compressedBase64.replace(/=+$/, "");
  assert.deepEqual(
    await unpackReviewBundle(await packReviewBundle(original)),
    original,
  );
});

test("binary archive fallback binds the exact container, hydrates evidence and excludes it from visitors", async () => {
  const p = await fixtureProject();
  p.rooms.reviewBundle = bundle();
  // A fixed small test budget forces the same fallback used for opaque large
  // masters without allocating a synthetic 64 MiB source just to trigger it.
  const encoded = await serializeRoomsForArchive(
    p.rooms,
    Buffer.byteLength(JSON.stringify({ ...p.rooms, reviewBundle: undefined })) +
      800,
  );
  assert(encoded.reviewEntry);
  assert.equal(encoded.reviewEntry.path, REVIEW_BUNDLE_ARCHIVE_PATH);
  const ref = JSON.parse(new TextDecoder().decode(encoded.rooms)).reviewBundle;
  assert.equal(ref.storage, "archive-entry");
  await assert.rejects(unpackReviewBundle(ref));
  await assert.rejects(
    unpackReviewBundle(
      { ...ref, path: "../companions.bin" },
      { [REVIEW_BUNDLE_ARCHIVE_PATH]: encoded.reviewEntry.bytes },
    ),
  );
  const damaged = encoded.reviewEntry.bytes.slice();
  damaged[0] ^= 1;
  await assert.rejects(
    unpackReviewBundle(ref, { [REVIEW_BUNDLE_ARCHIVE_PATH]: damaged }),
  );
  const d = structuredClone(p.dataset);
  d.source.roomsSha256 = sha(encoded.rooms);
  const indoor = strToU8(JSON.stringify(d)),
    m = structuredClone(p.manifest) as any;
  m.floors = {
    path: "floors/rooms.json",
    bytes: encoded.rooms.length,
    sha256: sha(encoded.rooms),
  };
  m.indoor = {
    path: "viewer/indoor.json",
    bytes: indoor.length,
    sha256: sha(indoor),
  };
  m.reviewBundle = {
    path: REVIEW_BUNDLE_ARCHIVE_PATH,
    bytes: encoded.reviewEntry.bytes.length,
    sha256: encoded.reviewEntry.sha256,
  };
  const files = {
    ...p.files,
    "floors/rooms.json": encoded.rooms,
    "viewer/indoor.json": indoor,
    [REVIEW_BUNDLE_ARCHIVE_PATH]: encoded.reviewEntry.bytes,
    "manifest.json": strToU8(JSON.stringify(m)),
  };
  const restored = await readIndoorProject(zipSync(files));
  assert.deepEqual(restored.rooms.reviewBundle, p.rooms.reviewBundle);
  assert.deepEqual(restored.files[m.model.path], p.files[m.model.path]);
  assert.deepEqual(restored.dataset.records, p.dataset.records);
  assert.deepEqual(restored.dataset.edges, p.dataset.edges);
  const refreshed = await readIndoorProject(
    await exportIndoorProject(restored),
  );
  assert.deepEqual(refreshed.rooms.reviewBundle, p.rooms.reviewBundle);
  assert.equal(refreshed.files[REVIEW_BUNDLE_ARCHIVE_PATH], undefined);
  const visitor = await readIndoorProject(await exportCampusViewer(restored));
  assert.equal(visitor.rooms.reviewBundle, undefined);
  assert.equal(visitor.files[REVIEW_BUNDLE_ARCHIVE_PATH], undefined);
  await assert.rejects(
    readIndoorProject(
      zipSync({ ...files, [REVIEW_BUNDLE_ARCHIVE_PATH]: damaged }),
    ),
    /Damaged project entry/,
  );
  delete m.reviewBundle;
  await assert.rejects(
    readIndoorProject(
      zipSync({ ...files, "manifest.json": strToU8(JSON.stringify(m)) }),
    ),
    /Unlisted project entry/,
  );
});
