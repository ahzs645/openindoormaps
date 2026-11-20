import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import {
  corridorCandidateDatasetSha256,
  readCorridorCandidateInput,
} from "../../scripts/indoor/lib/corridor-candidate-input";

const sha = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function fixture() {
  const model = strToU8("original model bytes");
  const floors = strToU8('{"originalRooms":["A","B"],"review":"retained"}');
  const reference = strToU8('{"origin":[1.25,-2.5]}');
  const data = {
    source: { modelSha256: sha(model), roomsSha256: sha(floors) },
    records: [{ key: "A", access: "unknown", walkable: true }],
    nodes: [{ id: "door:A", pointFeet: [0.000_000_000_001, -3.5, 24.278_215] }],
    edges: [{ id: "original-edge", enabled: false, accessible: "unknown" }],
    circulationGeometry: {
      cells: [
        {
          id: "original-cell",
          holes: [
            [
              [1, 1],
              [2, 1],
              [1, 2],
            ],
          ],
        },
      ],
    },
    nativePhysicalLevels: { levels: [{ nativeLevelId: 400_176 }] },
    nativeExploreMapping: { deliberatelyRetainedDisplayData: [1, 2, 3] },
    unrelatedSourceField: {
      text: "保留 · café · 😀",
      values: [null, true, 1e-25],
    },
  };
  // Whitespace makes the original byte identity differ from its semantic snapshot.
  const indoor = strToU8(JSON.stringify(data, null, 2) + "\n");
  const descriptor = (name: string, bytes: Uint8Array) => ({
    path: name,
    bytes: bytes.length,
    sha256: sha(bytes),
  });
  const manifest = {
    format: "reviter-project",
    version: 2,
    model: descriptor("model/original.rvt", model),
    indoor: descriptor("viewer/indoor.json", indoor),
    floors: descriptor("floors/rooms.json", floors),
    georeference: descriptor("gis/reference-points.json", reference),
  };
  const files: Record<string, Uint8Array> = {
    [manifest.model.path]: model,
    [manifest.floors.path]: floors,
    [manifest.georeference.path]: reference,
    [manifest.indoor.path]: indoor,
  };
  return { data, manifest, files };
}

async function withArchive(
  value: ReturnType<typeof fixture>,
  run: (file: string, bytes: Uint8Array) => Promise<void>,
  includeManifest = true,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "corridor-input-"));
  try {
    const bytes = zipSync({
      ...value.files,
      ...(includeManifest
        ? { "manifest.json": strToU8(JSON.stringify(value.manifest)) }
        : {}),
    });
    const file = path.join(directory, "source.zip");
    await writeFile(file, bytes);
    await run(file, bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("complete candidate input matches the previous JSON decoder and byte identities", async () => {
  const value = fixture();
  await withArchive(value, async (file, bytes) => {
    const before = JSON.parse(
      strFromU8(unzipSync(bytes)[value.manifest.indoor.path]),
    );
    const result = await readCorridorCandidateInput(file);
    assert.deepEqual(result.data, before);
    assert.deepEqual(result.data, value.data);
    assert.equal(result.inputZipSha256, sha(bytes));
    assert.equal(result.inputJsonSha256, value.manifest.indoor.sha256);
    assert.equal(result.sourceSnapshot, sha(JSON.stringify(before)));
    assert.notEqual(result.sourceSnapshot, result.inputJsonSha256);
  });
});

test("candidate input rejects a missing original package manifest", async () => {
  await withArchive(
    fixture(),
    async (file) => {
      await assert.rejects(
        readCorridorCandidateInput(file),
        /Missing package manifest/,
      );
    },
    false,
  );
});

test("candidate input rejects an absent required source member", async () => {
  const value = fixture();
  delete value.files[value.manifest.floors.path];
  await withArchive(value, async (file) => {
    await assert.rejects(
      readCorridorCandidateInput(file),
      /does not match its manifest/,
    );
  });
});

test("candidate input rejects changed room bytes with an unchanged descriptor", async () => {
  const value = fixture();
  value.files[value.manifest.floors.path][5] ^= 1;
  await withArchive(value, async (file) => {
    await assert.rejects(
      readCorridorCandidateInput(file),
      /does not match its manifest/,
    );
  });
});

test("candidate input rejects a declared length mismatch even with the right digest", async () => {
  const value = fixture();
  value.manifest.georeference.bytes++;
  await withArchive(value, async (file) => {
    await assert.rejects(
      readCorridorCandidateInput(file),
      /does not match its manifest/,
    );
  });
});

test("candidate input rejects a source model identity mismatch", async () => {
  const value = fixture();
  value.data.source.modelSha256 = "b".repeat(64);
  const indoor = strToU8(JSON.stringify(value.data));
  value.files[value.manifest.indoor.path] = indoor;
  value.manifest.indoor.bytes = indoor.length;
  value.manifest.indoor.sha256 = sha(indoor);
  await withArchive(value, async (file) => {
    await assert.rejects(
      readCorridorCandidateInput(file),
      /Model identities disagree/,
    );
  });
});

test("bounded UTF-8 hashing preserves native JSON semantics and surrogate boundaries", () => {
  const values = [
    "a".repeat(65_534) + "😀" + "b".repeat(65_536),
    {
      z: [undefined, Number.NaN, Infinity, -0],
      a: undefined,
      unicode: "\uD800 / \uDC00 / 中文",
    },
    { "20": 1, "2": 2, z: 3, a: [1e-25, 1e25, Number.MIN_VALUE] },
    { nested: { value: false, absent: null }, array: [1, 2, 3] },
  ];
  for (const value of values)
    assert.equal(
      corridorCandidateDatasetSha256(value),
      sha(JSON.stringify(value)),
    );
  const source = { coordinates: [1, 2, 3], access: "unknown" };
  const before = corridorCandidateDatasetSha256(source);
  source.coordinates[1] += 0.000_000_000_001;
  assert.notEqual(corridorCandidateDatasetSha256(source), before);
});
