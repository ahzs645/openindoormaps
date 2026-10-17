/** Exact removal of a historically finalized v2 append before NEW strict
 * import. This is a bounded source transformation, never import authority. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync, zipSync } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { topLevelJsonOperands } from "./source-rebuild-input-proof";
import type { SteppedStairSavedReplay } from "./stepped-stair-v2-candidate-scope";

export const postcompileHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const postcompileJsonHash = (value?: unknown) =>
  postcompileHash(new TextEncoder().encode(JSON.stringify(value)));
const decode = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
type Entry = { path: string; bytes: number; sha256: string };
export type PostcompileArchiveManifest = {
  format: "reviter-project" | "openindoormaps-viewer";
  version: number;
  indoor: Entry;
  floors: Entry;
  model: Entry & { fileName: string };
  georeference: Entry;
  scene?: Entry;
  reviewBundle?: Entry;
  [key: string]: unknown;
};

/** Raw checks precede parsing any routing data. Full ordinary import must still
 * validate grammar, source companions, geometry, ownership and current policy. */
export function checkedPostcompileArchive(
  bytes: Uint8Array,
  expectedSha256: string,
) {
  assert.match(expectedSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    postcompileHash(bytes),
    expectedSha256,
    "Historical archive checksum changed",
  );
  let expanded = 0;
  const seen = new Set<string>(),
    files = unzipSync(bytes, {
      filter: (entry) => {
        assert(
          entry.name &&
            !entry.name.startsWith("/") &&
            !entry.name.includes("\\") &&
            !entry.name.split("/").includes("..") &&
            ![...entry.name].some(
              (character) => character.codePointAt(0)! < 32,
            ),
          "Unsafe archive path",
        );
        assert(!seen.has(entry.name), "Duplicate archive entry");
        seen.add(entry.name);
        assert(
          Number.isSafeInteger(entry.originalSize) && entry.originalSize >= 0,
        );
        expanded += entry.originalSize;
        assert(
          expanded <= 900 * 1024 * 1024,
          "Expanded archive limit exceeded",
        );
        return true;
      },
    });
  assert(files["manifest.json"], "Missing historical manifest");
  const manifest = decode(files["manifest.json"]) as PostcompileArchiveManifest;
  assert(
    ["reviter-project", "openindoormaps-viewer"].includes(manifest.format),
  );
  assert.equal(manifest.version, manifest.format === "reviter-project" ? 2 : 1);
  assert.equal(manifest.indoor?.path, "viewer/indoor.json");
  const entries = [
    manifest.indoor,
    manifest.floors,
    manifest.georeference,
    ...(manifest.model?.path ? [manifest.model] : []),
    ...(manifest.scene ? [manifest.scene] : []),
    ...(manifest.reviewBundle ? [manifest.reviewBundle] : []),
  ];
  for (const entry of entries) {
    assert(
      entry &&
        typeof entry.path === "string" &&
        Number.isSafeInteger(entry.bytes) &&
        entry.bytes >= 0,
    );
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    const body = files[entry.path];
    assert(body, `Missing historical entry ${entry.path}`);
    assert.equal(body.length, entry.bytes);
    assert.equal(
      postcompileHash(body),
      entry.sha256,
      `Historical entry changed: ${entry.path}`,
    );
  }
  return { files, manifest };
}

export function assertExactSteppedOutcomeInventory(
  requested: string[],
  qualified: string[],
  declined: string[],
  applicationIds?: string[],
) {
  for (const rows of [requested, qualified, declined]) {
    assert(rows.every((id) => typeof id === "string" && id.length > 0));
    assert.equal(
      new Set(rows).size,
      rows.length,
      "Duplicate stepped outcome identity",
    );
  }
  assert(requested.length > 0 && requested.length <= 28);
  assert.equal(
    new Set([...qualified, ...declined]).size,
    qualified.length + declined.length,
    "Qualified and declined overlap",
  );
  assert.deepEqual(
    [...qualified, ...declined].sort(),
    [...requested].sort(),
    "Missing or extra reviewed outcome",
  );
  for (const list of [qualified, declined])
    assert.deepEqual(
      requested.filter((id) => list.includes(id)),
      list,
      "Qualified/declined inventory is not an ordered subsequence of the original requests",
    );
  if (applicationIds)
    assert.deepEqual(
      applicationIds,
      requested,
      "Outcome applications changed original request order",
    );
}

type Application = SteppedStairSavedReplay["applications"][number];
export function assertHistoricalSteppedAppend(
  data: IndoorDataset,
  saved: SteppedStairSavedReplay,
) {
  const ids = saved.applications.map((a) => a.edgeId);
  assert.equal(new Set(ids).size, ids.length);
  assert(ids.length > 0 && ids.length <= 28);
  assert.deepEqual(
    data.edges
      .filter((e) => e.nativeSteppedStairV2)
      .map((e) => e.id)
      .sort(),
    [...ids].sort(),
    "Unreviewed historical stepped edge",
  );
  const indices = data.nativeSteppedStairV2SourceIndices ?? [];
  assert.equal(
    indices.length,
    ids.length,
    "Unreviewed historical source index",
  );
  const used = new Set<string>();
  for (const application of saved.applications) {
    const matches = data.edges.filter((e) => e.id === application.edgeId),
      edge = matches[0];
    assert.equal(matches.length, 1);
    assert(edge);
    assert.deepEqual(
      edge,
      application.finalizedEdge,
      "Historical appended edge differs from saved complete finalizer receipt",
    );
    assert.equal(application.previousHeldEdge.id, edge.id);
    assert.equal(application.previousHeldEdge.enabled, false);
    assert.equal(application.previousHeldEdge.nativeSteppedStairV2, undefined);
    assert.equal(application.previousHeldEdge.nativeSourceStair, undefined);
    assert.equal(application.previousHeldEdge.accessible, "no");
    const proof = edge.nativeSteppedStairV2!;
    assert(!used.has(proof.sourceIndexId));
    used.add(proof.sourceIndexId);
    const rows = indices.filter((row) => row.id === proof.sourceIndexId);
    assert.equal(rows.length, 1);
    assert.equal(
      postcompileJsonHash(rows[0]!.physical),
      application.source.physicalWireSha256,
    );
    assert.equal(
      postcompileJsonHash(proof.receipt),
      application.source.receiptWireSha256,
    );
  }
  assert.deepEqual([...used].sort(), indices.map((row) => row.id).sort());
}

export function restoredHeldDataset(
  data: IndoorDataset,
  saved: SteppedStairSavedReplay,
  discardMapping = false,
) {
  assertHistoricalSteppedAppend(data, saved);
  const beforeHashes = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      postcompileJsonHash(value),
    ]),
  );
  const dataset = {
    ...data,
    edges: data.edges.map(
      (edge) =>
        saved.applications.find((a) => a.edgeId === edge.id)
          ?.previousHeldEdge ?? edge,
    ),
  };
  delete dataset.nativeSteppedStairV2SourceIndices;
  const initialIndexDigest =
    saved.applications[0]!.inputFieldSha256.nativeSteppedStairV2SourceIndices;
  if (initialIndexDigest !== undefined) {
    assert(
      [postcompileJsonHash([]), postcompileJsonHash()].includes(
        initialIndexDigest,
      ),
      "Unexpected pre-existing concrete source index inventory",
    );
    dataset.nativeSteppedStairV2SourceIndices =
      initialIndexDigest === postcompileJsonHash([]) ? [] : undefined;
  }
  if (discardMapping) delete dataset.nativeExploreMapping;
  for (const [key, digest] of Object.entries(beforeHashes))
    if (
      key !== "edges" &&
      key !== "nativeSteppedStairV2SourceIndices" &&
      !(discardMapping && key === "nativeExploreMapping")
    ) {
      assert.equal(
        (dataset as unknown as Record<string, unknown>)[key],
        (data as unknown as Record<string, unknown>)[key],
      );
      assert.equal(
        postcompileJsonHash((data as unknown as Record<string, unknown>)[key]),
        digest,
        `Mutated historical field ${key}`,
      );
    }
  data.edges.forEach((edge, i) => {
    if (!saved.applications.some((a) => a.edgeId === edge.id))
      assert.equal(dataset.edges[i], edge);
  });
  return dataset;
}

/** Reverses only the two checked packaging operations and historical finalized
 * appends. Every concrete compiler operand must equal its saved exact digest. */
export function reconstructPostcompileFinalizerInput(
  data: IndoorDataset,
  saved: SteppedStairSavedReplay,
  currentSourceRooms: unknown,
) {
  const input = restoredHeldDataset(data, saved, true);
  input.source = {
    ...input.source,
    roomsSha256: postcompileJsonHash(currentSourceRooms),
  };
  const first = saved.applications[0]!;
  for (const [key, digest] of Object.entries(first.inputFieldSha256))
    if (!Object.hasOwn(input, key)) {
      assert.equal(
        digest,
        postcompileJsonHash(),
        `Missing concrete compiled operand ${key}`,
      );
      (input as unknown as Record<string, unknown>)[key] = undefined;
    }
  assertExactPostcompileInputFields(input, first);
  assert(!input.edges.some((edge) => edge.nativeSteppedStairV2));
  assert.equal(input.nativeSteppedStairV2SourceIndices?.length ?? 0, 0);
  return input;
}
export function assertExactPostcompileInputFields(
  data: IndoorDataset,
  application: Application,
) {
  assert.deepEqual(
    Object.keys(data).sort(),
    Object.keys(application.inputFieldSha256).sort(),
    "Compiled input field inventory changed",
  );
  for (const [key, digest] of Object.entries(application.inputFieldSha256))
    assert.equal(
      postcompileJsonHash((data as unknown as Record<string, unknown>)[key]),
      digest,
      `Compiled input operand changed: ${key}`,
    );
}

/** Retained raw JSON operands are copied verbatim. Edges are the only rewritten
 * geometry/graph operand, and only exact reviewed appended variants are undone. */
export function prepareHeldPostcompileArchive(
  original: Uint8Array,
  expectedOriginalSha256: string,
  saved: SteppedStairSavedReplay,
) {
  const { files, manifest } = checkedPostcompileArchive(
    original,
    expectedOriginalSha256,
  );
  assert.equal(
    manifest.format,
    "reviter-project",
    "Post-cell replay needs the original source master",
  );
  const raw = files[manifest.indoor.path]!,
    fields = topLevelJsonOperands(raw),
    data = decode(raw) as IndoorDataset,
    held = restoredHeldDataset(data, saved, true),
    rewrittenEdges = encode(held.edges),
    pieces: Uint8Array[] = [new Uint8Array([123])];
  let count = 0;
  for (const [key, field] of fields) {
    if (
      key === "nativeExploreMapping" ||
      key === "nativeSteppedStairV2SourceIndices"
    )
      continue;
    if (count++) pieces.push(new Uint8Array([44]));
    pieces.push(
      encode(key),
      new Uint8Array([58]),
      key === "edges" ? rewrittenEdges : field.bytes,
    );
  }
  if (held.nativeSteppedStairV2SourceIndices !== undefined) {
    if (count++) pieces.push(new Uint8Array([44]));
    pieces.push(
      encode("nativeSteppedStairV2SourceIndices"),
      new Uint8Array([58]),
      encode([]),
    );
  }
  pieces.push(new Uint8Array([125]));
  const indoor = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    indoor.set(piece, offset);
    offset += piece.length;
  }
  const afterFields = topLevelJsonOperands(indoor);
  for (const [key, value] of afterFields)
    if (key !== "edges" && key !== "nativeSteppedStairV2SourceIndices")
      assert.equal(
        value.sha256,
        fields.get(key)?.sha256,
        `Unrelated raw operand changed: ${key}`,
      );
  const updatedManifest = {
      ...manifest,
      indoor: {
        ...manifest.indoor,
        bytes: indoor.length,
        sha256: postcompileHash(indoor),
      },
    },
    outputFiles = {
      ...files,
      [manifest.indoor.path]: indoor,
      "manifest.json": encode(updatedManifest),
    },
    output = zipSync(outputFiles, {
      level: 6,
      mtime: new Date("1980-01-01T00:00:00Z"),
    }),
    reread = checkedPostcompileArchive(output, postcompileHash(output));
  assert.deepEqual(Object.keys(reread.files).sort(), Object.keys(files).sort());
  const retainedEntries = Object.keys(files)
    .filter((p) => p !== "manifest.json" && p !== manifest.indoor.path)
    .map((p) => {
      assert.equal(
        postcompileHash(reread.files[p]!),
        postcompileHash(files[p]!),
      );
      return {
        path: p,
        bytes: files[p]!.length,
        sha256: postcompileHash(files[p]!),
      };
    });
  // JSON cannot persist the one explicitly restored own-undefined inventory.
  // Do not stringify all other fields here: their verbatim operands may contain
  // signed zero or other lexical forms that this transform deliberately keeps.
  const expectedHeld = { ...held };
  if (expectedHeld.nativeSteppedStairV2SourceIndices === undefined)
    delete expectedHeld.nativeSteppedStairV2SourceIndices;
  assert.deepEqual(decode(reread.files[manifest.indoor.path]!), expectedHeld);
  return {
    bytes: output,
    receipt: {
      format: "openindoormaps-postcompile-held-import-transform-v1",
      originalSha256: expectedOriginalSha256,
      outputSha256: postcompileHash(output),
      originalIndoorSha256: postcompileHash(raw),
      heldIndoorSha256: postcompileHash(indoor),
      historicalFinalizerSha256: postcompileJsonHash(saved),
      restoredEdgeIds: saved.applications.map((a) => a.edgeId),
      allOtherRawDatasetOperandsUnchanged: true,
      allOtherArchiveEntriesByteIdentical: true,
      discardedDerivedMappingSha256:
        fields.get("nativeExploreMapping")?.sha256 ?? null,
      retainedEntries,
      strictCurrentImportRequired: true,
      importAuthorityGranted: false,
    } as const,
  };
}
