import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createOriginalSteppedStairV2SourceProof,
  createOriginalSteppedStairV2SourceProofFromSources,
  readOriginalSteppedStairV2SourceProof,
  type OriginalSteppedStairV2SourceInputs,
  type OriginalSteppedStairV2SourceProof,
} from "../../scripts/indoor/source-stepped-stair-v2-producer.ts";
import { captureOriginalSteppedStairGraphDemand } from "../../scripts/indoor/proposals/original-stepped-stair-graph-demand.ts";
const fixtureBytes = readFileSync(
    new URL(
      "../fixtures/unbc-1696006-original-held-graph-demand.json",
      import.meta.url,
    ),
  ),
  fixture = JSON.parse(fixtureBytes.toString("utf8")),
  sourceRoomsBytes = new TextEncoder().encode(
    JSON.stringify({
      model: { fileName: "unbc.rvt" },
      indoorReviews: { version: 1, records: {}, edges: {} },
    }),
  ),
  roomSha = createHash("sha256").update(sourceRoomsBytes).digest("hex"),
  bytes = new TextEncoder().encode(
    JSON.stringify({
      ...fixture,
      source: { ...fixture.source, roomsSha256: roomSha },
    }),
  ),
  checksum = createHash("sha256").update(bytes).digest("hex"),
  model = fixture.source.modelSha256,
  edgeId = fixture.edges[0].id;
const proposal: OriginalSteppedStairV2SourceInputs["proposal"] = {
  nativeRunId: 1696012,
  terminals: [
    {
      nativeFloorElementId: 402395,
      originalCapFaceToken: 249,
      lateralAxis: "y",
      approachXYFeet: [
        [2.327728994970098, -320.89781591346036],
        [0.5148043399884723, -323.3025630530456],
      ],
    },
    {
      nativeFloorElementId: 405772,
      originalCapFaceToken: 5,
      lateralAxis: "y",
      approachXYFeet: [
        [1.578773765958708, -320.9697773842104],
        [-0.9831061180773955, -318.12343176841307],
      ],
    },
  ],
  stations: [],
};
function raw(): OriginalSteppedStairV2SourceInputs {
  return {
    originalRVTBytes: new Uint8Array([1, 2, 3]),
    expectedSourceModelSha256: model,
    originalDatasetBytes: bytes,
    originalSourceRoomsBytes: sourceRoomsBytes,
    expectedOriginalDatasetSha256: checksum,
    originalEdgeId: edgeId,
    foreignScopeBoundsFeet: {
      min: { x: -15, y: -328, z: 23 },
      max: { x: 6, y: -300, z: 42 },
    },
    sourceRequest: {
      nativeStairId: 1696006,
      nativeRunId: 1696012,
      nativeDefinitionId: 1696013,
    },
    terminalMaterials: [
      { kind: "floor-domains", nativeFloorElementId: 402395 },
      { kind: "planar-slab", nativeFloorElementId: 405772 },
    ],
    proposal,
  };
}
test("raw source producer refuses changed full graph bytes or original RVT bytes before issuing any capability", () => {
  const input = raw();
  assert.throws(
    () => createOriginalSteppedStairV2SourceProof(input),
    /RVT source checksum/,
  );
  input.expectedOriginalDatasetSha256 = "0".repeat(64);
  assert.throws(
    () => createOriginalSteppedStairV2SourceProof(input),
    /graph byte checksum/,
  );
});
test("a full checked graph and self-hashed plain source snapshots cannot mint source authority", () => {
  const originalDemand = captureOriginalSteppedStairGraphDemand(
      bytes,
      checksum,
      model,
      edgeId,
    ),
    sources = {
      stair: { sourceModelSha256: model },
      foreign: { sourceModelSha256: model },
      own: { sourceModelSha256: model },
      terminalMaterials: [],
    } as unknown as Parameters<
      typeof createOriginalSteppedStairV2SourceProofFromSources
    >[0]["sources"];
  assert.throws(
    () =>
      createOriginalSteppedStairV2SourceProofFromSources({
        sources,
        originalDemand,
        originalDatasetBytes: bytes,
        originalSourceRoomsBytes: sourceRoomsBytes,
        expectedOriginalDatasetSha256: checksum,
        expectedSourceModelSha256: model,
        proposal,
      }),
    /actual|original|context|source|handle/i,
  );
});
test("copying the original-demand symbol or serializing a source-proof shape grants no private capability", () => {
  const original = captureOriginalSteppedStairGraphDemand(
    bytes,
    checksum,
    model,
    edgeId,
  );
  for (const f of [
    { ...original },
    JSON.parse(JSON.stringify(original)),
    {
      sourceIndex: { id: "forged", physical: {} },
      receipt: {},
      originalGraphBinding: {},
      bindings: {
        sourceModelSha256: model,
        bothOriginalSourceDirectionsPassed: true,
      },
    },
  ])
    assert.throws(
      () =>
        readOriginalSteppedStairV2SourceProof(
          f as unknown as OriginalSteppedStairV2SourceProof,
        ),
      /genuine same-process/,
    );
  assert.throws(
    () =>
      createOriginalSteppedStairV2SourceProofFromSources({
        sources: {} as never,
        originalDemand: { ...original },
        originalDatasetBytes: bytes,
        originalSourceRoomsBytes: sourceRoomsBytes,
        expectedOriginalDatasetSha256: checksum,
        expectedSourceModelSha256: model,
        proposal,
      }),
    /checked-byte handle/,
  );
});

test("original source rooms are mandatory, exact-hash-bound and cannot omit a disabled edge decision", () => {
  const trySource = (rooms: unknown) => {
    const originalSourceRoomsBytes = new TextEncoder().encode(
      JSON.stringify(rooms),
    );
    const data = {
      ...fixture,
      source: {
        ...fixture.source,
        roomsSha256: createHash("sha256")
          .update(originalSourceRoomsBytes)
          .digest("hex"),
      },
    };
    const originalDatasetBytes = new TextEncoder().encode(JSON.stringify(data));
    const expectedOriginalDatasetSha256 = createHash("sha256")
      .update(originalDatasetBytes)
      .digest("hex");
    const originalDemand = captureOriginalSteppedStairGraphDemand(
      originalDatasetBytes,
      expectedOriginalDatasetSha256,
      model,
      edgeId,
    );
    return () =>
      createOriginalSteppedStairV2SourceProofFromSources({
        sources: {} as never,
        originalDemand,
        originalDatasetBytes,
        originalSourceRoomsBytes,
        expectedOriginalDatasetSha256,
        expectedSourceModelSha256: model,
        proposal,
      });
  };
  assert.throws(
    trySource({
      indoorReviews: {
        version: 1,
        records: {},
        edges: { [edgeId]: { enabled: false, notes: "Source hold" } },
      },
    }),
    /explicit original source review disables/,
  );
  assert.throws(
    trySource({
      indoorReviews: {
        format: "openindoormaps-review-bundle-wire",
        version: 1,
      },
    }),
    /direct version1/,
  );
  assert.throws(
    trySource({
      indoorReviews: {
        version: 1,
        records: {},
        edges: { $ref: { path: "review.bin" } },
      },
    }),
    /packed or unsupported/,
  );
  const originalDemand = captureOriginalSteppedStairGraphDemand(
    bytes,
    checksum,
    model,
    edgeId,
  );
  const input = {
    sources: {} as never,
    originalDemand,
    originalDatasetBytes: bytes,
    originalSourceRoomsBytes: sourceRoomsBytes,
    expectedOriginalDatasetSha256: checksum,
    expectedSourceModelSha256: model,
    proposal,
  };
  assert.throws(
    () =>
      createOriginalSteppedStairV2SourceProofFromSources({
        ...input,
        originalSourceRoomsBytes: new Uint8Array([123, 125]),
      }),
    /source room bytes/,
  );
  assert.throws(
    () =>
      createOriginalSteppedStairV2SourceProofFromSources({
        ...input,
        originalSourceRoomsBytes: undefined as never,
      }),
    /source room bytes/,
  );
});

test("a loaded producer refuses later source edits instead of relabelling cached mathematics with new file hashes", async () => {
  const {
    mkdtempSync,
    mkdirSync,
    copyFileSync,
    symlinkSync,
    appendFileSync,
    rmSync,
  } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const root = mkdtempSync(join(tmpdir(), "stepped-v2-loaded-policy-"));
  try {
    const dir = join(root, "openindoormaps", "scripts", "indoor");
    mkdirSync(dir, { recursive: true });
    symlinkSync(
      fileURLToPath(new URL("../../../reviter", import.meta.url)),
      join(root, "reviter"),
      "dir",
    );
    symlinkSync(
      fileURLToPath(new URL("../../scripts/indoor/proposals", import.meta.url)),
      join(dir, "proposals"),
      "dir",
    );
    const copy = join(dir, "source-stepped-stair-v2-producer.ts");
    copyFileSync(
      fileURLToPath(
        new URL(
          "../../scripts/indoor/source-stepped-stair-v2-producer.ts",
          import.meta.url,
        ),
      ),
      copy,
    );
    const module = await import(pathToFileURL(copy).href);
    appendFileSync(copy, "\n// Isolated test-only policy edit.\n");
    assert.throws(
      () => module.readOriginalSteppedStairV2SourceProof({}),
      /implementation changed after module load/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
