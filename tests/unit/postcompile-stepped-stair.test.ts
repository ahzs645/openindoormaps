/** Integrity/math fixtures only. No original-RVT capability or route admission. */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { SteppedStairSavedReplay } from "../../scripts/indoor/stepped-stair-v2-candidate-scope";
import {
  prepareHeldPostcompileArchive,
  checkedPostcompileArchive,
  restoredHeldDataset,
  reconstructPostcompileFinalizerInput,
  postcompileHash,
  postcompileJsonHash,
  assertExactSteppedOutcomeInventory,
} from "../../scripts/indoor/postcompile-stepped-stair-artifacts";
import {
  assertHistoricalPostcompileInputChain,
  checkedCurrentPolicyDecline,
  type CurrentFlatPolicyInspection,
} from "../../scripts/indoor/postcompile-stepped-stair-replay";
import {
  assertPostcompileCandidateOutcomes,
  postcompileDeclinedRouteCases,
} from "../../scripts/indoor/postcompile-stepped-stair-candidate-scope";
import {
  assertHistoricalSteppedAlgorithmBindings,
  exactPostcompileQualifierStrengthening,
  exactPostcompileCellAccessExport,
} from "../../scripts/indoor/postcompile-stepped-stair-source-review";

const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
function fixture() {
  const data = progressiveRoutingFixture(),
    held = {
      ...data.edges[0]!,
      id: "synthetic-held",
      kind: "stairs" as const,
      enabled: false,
      accessible: "no" as const,
      roomKeys: data.records.map((r) => r.key),
    };
  data.edges = [held, { ...data.edges[0]!, id: "unrelated", enabled: false }];
  const currentRooms = {
      format: "reviter-room-annotations",
      version: 1,
      synthetic: true,
    },
    originalRooms = encode(currentRooms),
    model = encode("SYNTHETIC NOT RVT"),
    gis = encode({ points: [] });
  data.source = {
    modelFileName: "synthetic.rvt",
    modelSha256: postcompileHash(model),
    roomsSha256: postcompileHash(originalRooms),
  };
  const inputFieldSha256 = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, postcompileJsonHash(v)]),
    ),
    physical = { syntheticOnly: true },
    receipt = { syntheticOnly: true },
    finalized = {
      ...held,
      enabled: true,
      nativeSteppedStairV2: {
        version: 2,
        sourceIndexId: "synthetic-index",
        receipt,
        originalGraphBinding: {},
        anchorPolicy: "existing-claimed-cell-only",
        circulationGeometryKey: "synthetic",
        terminalApproaches: [],
      },
    } as unknown as IndoorDataset["edges"][number];
  const saved = {
    initialization: {},
    applications: [
      {
        edgeId: held.id,
        previousHeldEdge: held,
        finalizedEdge: finalized,
        inputFieldSha256,
        source: {
          physicalWireSha256: postcompileJsonHash(physical),
          receiptWireSha256: postcompileJsonHash(receipt),
        },
      },
    ],
  } as unknown as SteppedStairSavedReplay;
  const historical: IndoorDataset = {
    ...data,
    edges: [finalized, data.edges[1]!],
    nativeSteppedStairV2SourceIndices: [{ id: "synthetic-index", physical }],
    nativeExploreMapping: { synthetic: true } as never,
  };
  const indoor = encode(historical),
    manifest = {
      format: "reviter-project",
      version: 2,
      model: {
        path: "model/synthetic.rvt",
        fileName: "synthetic.rvt",
        bytes: model.length,
        sha256: postcompileHash(model),
      },
      floors: {
        path: "floors/rooms.json",
        bytes: originalRooms.length,
        sha256: postcompileHash(originalRooms),
      },
      georeference: {
        path: "gis/reference-points.json",
        bytes: gis.length,
        sha256: postcompileHash(gis),
      },
      indoor: {
        path: "viewer/indoor.json",
        bytes: indoor.length,
        sha256: postcompileHash(indoor),
      },
    },
    files = {
      "manifest.json": encode(manifest),
      "model/synthetic.rvt": model,
      "floors/rooms.json": originalRooms,
      "gis/reference-points.json": gis,
      "viewer/indoor.json": indoor,
    },
    bytes = zipSync(files, { level: 6 });
  return {
    data,
    historical,
    held,
    finalized,
    saved,
    currentRooms,
    bytes,
    files,
    manifest,
  };
}
test("exact held/no-index archive transform is deterministic and preserves every source entry and other raw operand", () => {
  const f = fixture(),
    hash = postcompileHash(f.bytes),
    transformed = prepareHeldPostcompileArchive(f.bytes, hash, f.saved),
    repeated = prepareHeldPostcompileArchive(f.bytes, hash, f.saved),
    parsed = checkedPostcompileArchive(
      transformed.bytes,
      transformed.receipt.outputSha256,
    );
  assert.deepEqual(transformed.bytes, repeated.bytes);
  const data = JSON.parse(
    new TextDecoder().decode(parsed.files["viewer/indoor.json"]),
  );
  assert.deepEqual(data.edges[0], f.held);
  assert.deepEqual(data.edges[1], f.historical.edges[1]);
  assert.equal(data.nativeSteppedStairV2SourceIndices, undefined);
  assert.equal(data.nativeExploreMapping, undefined);
  for (const name of [
    "model/synthetic.rvt",
    "floors/rooms.json",
    "gis/reference-points.json",
  ] as const)
    assert.deepEqual(parsed.files[name], f.files[name]);
  assert.equal(transformed.receipt.importAuthorityGranted, false);
  assert.equal(transformed.receipt.strictCurrentImportRequired, true);
});
test("wrong archive/source entry, changed finalized edge/wire, unreviewed variant and unsafe path refuse before strict import", () => {
  const f = fixture();
  assert.throws(() =>
    prepareHeldPostcompileArchive(f.bytes, "0".repeat(64), f.saved),
  );
  const changedSource = zipSync({
    ...f.files,
    "model/synthetic.rvt": encode("changed"),
  });
  assert.throws(() =>
    checkedPostcompileArchive(changedSource, postcompileHash(changedSource)),
  );
  for (const mutate of [
    (d: IndoorDataset) => {
      d.edges[0]!.accessible = "yes";
    },
    (d: IndoorDataset) => {
      d.nativeSteppedStairV2SourceIndices![0]!.physical = { changed: true };
    },
    (d: IndoorDataset) => {
      d.nativeSteppedStairV2SourceIndices!.push({ id: "orphan", physical: {} });
    },
  ]) {
    const d = structuredClone(f.historical);
    mutate(d);
    assert.throws(() => restoredHeldDataset(d, f.saved));
  }
  const unsafe = zipSync({ ...f.files, "../unsafe": encode("x") });
  assert.throws(
    () => checkedPostcompileArchive(unsafe, postcompileHash(unsafe)),
    /Unsafe/,
  );
});
test("pre-finalizer reconstruction requires exact geometry, source, room dependencies and every saved field hash", () => {
  const f = fixture(),
    reconstructed = reconstructPostcompileFinalizerInput(
      f.historical,
      f.saved,
      f.currentRooms,
    );
  assert.deepEqual(reconstructed, f.data);
  for (const mutate of [
    (d: IndoorDataset) => {
      d.nodes[0]!.pointFeet[0] += 1;
    },
    (d: IndoorDataset) => {
      d.records[0]!.access = "staff";
    },
    (d: IndoorDataset) => {
      d.edges[1]!.enabled = true;
    },
    (d: IndoorDataset) => {
      d.source.modelSha256 = "f".repeat(64);
    },
  ]) {
    const d = structuredClone(f.historical);
    mutate(d);
    assert.throws(
      () => reconstructPostcompileFinalizerInput(d, f.saved, f.currentRooms),
      /Compiled input operand changed|Historical appended edge differs/,
    );
  }
  assert.throws(() =>
    reconstructPostcompileFinalizerInput(f.historical, f.saved, {
      changedRooms: true,
    }),
  );
});
test("absent, empty and own-undefined initial source inventories reconstruct distinctly", () => {
  for (const kind of ["absent", "empty", "undefined"] as const) {
    const f = fixture();
    if (kind !== "absent")
      f.data.nativeSteppedStairV2SourceIndices =
        kind === "empty" ? [] : undefined;
    f.saved.applications[0]!.inputFieldSha256 = Object.fromEntries(
      Object.entries(f.data).map(([key, value]) => [
        key,
        postcompileJsonHash(value),
      ]),
    );
    const result = reconstructPostcompileFinalizerInput(
      f.historical,
      f.saved,
      f.currentRooms,
    );
    assert.deepEqual(result, f.data);
    assert.equal(
      Object.hasOwn(result, "nativeSteppedStairV2SourceIndices"),
      kind !== "absent",
    );
    const transformed = prepareHeldPostcompileArchive(
        f.bytes,
        postcompileHash(f.bytes),
        f.saved,
      ),
      archive = checkedPostcompileArchive(
        transformed.bytes,
        transformed.receipt.outputSha256,
      ),
      parsed = JSON.parse(
        new TextDecoder().decode(archive.files["viewer/indoor.json"]),
      );
    assert.equal(
      Object.hasOwn(parsed, "nativeSteppedStairV2SourceIndices"),
      kind === "empty",
    );
  }
});
test("each ordered historical append must reproduce the next exact input hash inventory", () => {
  const f = fixture(),
    secondHeld = { ...f.held, id: "synthetic-held-2" },
    base = { ...f.data, edges: [f.held, secondHeld, f.data.edges[1]!] },
    first = {
      ...base,
      edges: [f.finalized, secondHeld, f.data.edges[1]!],
      nativeSteppedStairV2SourceIndices:
        f.historical.nativeSteppedStairV2SourceIndices,
    },
    secondPhysical = { syntheticSecond: true },
    secondReceipt = { syntheticSecond: true },
    secondFinalized = {
      ...f.finalized,
      id: secondHeld.id,
      nativeSteppedStairV2: {
        ...f.finalized.nativeSteppedStairV2!,
        sourceIndexId: "synthetic-index-2",
        receipt: secondReceipt,
      },
    } as unknown as IndoorDataset["edges"][number],
    saved = {
      initialization: f.saved.initialization,
      applications: [
        {
          ...f.saved.applications[0]!,
          inputFieldSha256: Object.fromEntries(
            Object.entries(base).map(([key, value]) => [
              key,
              postcompileJsonHash(value),
            ]),
          ),
        },
        {
          ...f.saved.applications[0]!,
          edgeId: secondHeld.id,
          previousHeldEdge: secondHeld,
          finalizedEdge: secondFinalized,
          inputFieldSha256: Object.fromEntries(
            Object.entries(first).map(([key, value]) => [
              key,
              postcompileJsonHash(value),
            ]),
          ),
          source: {
            physicalWireSha256: postcompileJsonHash(secondPhysical),
            receiptWireSha256: postcompileJsonHash(secondReceipt),
          },
        },
      ],
    } as unknown as SteppedStairSavedReplay,
    historical = {
      ...first,
      edges: [f.finalized, secondFinalized, f.data.edges[1]!],
      nativeSteppedStairV2SourceIndices: [
        ...first.nativeSteppedStairV2SourceIndices!,
        { id: "synthetic-index-2", physical: secondPhysical },
      ],
    };
  const reconstructed = reconstructPostcompileFinalizerInput(
    historical,
    saved,
    f.currentRooms,
  );
  assert.deepEqual(reconstructed, base);
  assertHistoricalPostcompileInputChain(reconstructed, historical, saved);
  const changed = structuredClone(saved);
  changed.applications[1]!.inputFieldSha256.nodes = "0".repeat(64);
  assert.throws(
    () =>
      assertHistoricalPostcompileInputChain(reconstructed, historical, changed),
    /Compiled input operand changed/,
  );
  assert.throws(() =>
    assertHistoricalPostcompileInputChain(reconstructed, historical, {
      ...saved,
      applications: [...saved.applications].reverse(),
    }),
  );
});
function veto(): CurrentFlatPolicyInspection {
  const row = {
    nodeId: "original",
    cellId: "cell",
    accessSupported: true,
    centerlineSupported: true,
    fullProfileSupported: true,
    exclusionContact: false,
    staffContact: false,
    policies: [
      { blockers: [], requiredRooms: ["ordinary"] },
      { blockers: [], requiredRooms: ["ordinary"] },
    ],
    untrackedRoomKeys: ["ordinary"],
    passed: false,
  };
  return {
    passed: false,
    rows: [
      { ...row, side: 0 },
      { ...row, side: 1 },
    ],
  };
}
test("only concrete complete current-policy vetoes classify expected alias-selection refusal", () => {
  const message =
    "Original stair lacks both current physically valid claimed lateral approaches";
  assert.equal(
    checkedCurrentPolicyDecline(message, [veto()])
      .allCurrentAliasCombinationsRefused,
    true,
  );
  assert.throws(() => checkedCurrentPolicyDecline("out of memory", [veto()]));
  assert.throws(() => checkedCurrentPolicyDecline(message, []));
  assert.throws(() =>
    checkedCurrentPolicyDecline(message, [{ ...veto(), passed: true }]),
  );
  const invented = veto();
  invented.rows.forEach((row) => {
    row.untrackedRoomKeys = [];
    row.policies = [
      { blockers: [], requiredRooms: [] },
      { blockers: [], requiredRooms: [] },
    ];
  });
  assert.throws(
    () => checkedCurrentPolicyDecline(message, [invented]),
    /passed bit differs/,
  );
  const missing = veto();
  delete (missing.rows[0] as unknown as Record<string, unknown>)
    .fullProfileSupported;
  assert.throws(
    () => checkedCurrentPolicyDecline(message, [missing]),
    /Malformed/,
  );
});
test("qualified and declined inventories are complete/disjoint; declined edge/index and unrelated edge changes refuse", () => {
  assertExactSteppedOutcomeInventory(["a", "b"], ["a"], ["b"]);
  for (const args of [
    [["a"], [], []],
    [["a"], ["a"], ["a"]],
    [["a"], ["b"], []],
  ] as [string[], string[], string[]][])
    assert.throws(() => assertExactSteppedOutcomeInventory(...args));
  assert.throws(
    () => assertExactSteppedOutcomeInventory(["a", "b"], ["b", "a"], []),
    /ordered subsequence/,
  );
  assert.throws(
    () => assertExactSteppedOutcomeInventory(["a", "b"], [], ["b", "a"]),
    /ordered subsequence/,
  );
  assert.throws(
    () =>
      assertExactSteppedOutcomeInventory(["a", "b"], ["a"], ["b"], ["b", "a"]),
    /request order/,
  );
  const f = fixture(),
    declined = restoredHeldDataset(f.historical, f.saved);
  assertPostcompileCandidateOutcomes(
    declined,
    f.historical,
    f.saved,
    [f.held.id],
    [],
    [f.held.id],
  );
  const changed = structuredClone(declined);
  changed.edges[0]!.enabled = true;
  assert.throws(() =>
    assertPostcompileCandidateOutcomes(
      changed,
      f.historical,
      f.saved,
      [f.held.id],
      [],
      [f.held.id],
    ),
  );
  const copied = structuredClone(declined);
  copied.edges[1]!.enabled = true;
  assert.throws(() =>
    assertPostcompileCandidateOutcomes(
      copied,
      f.historical,
      f.saved,
      [f.held.id],
      [],
      [f.held.id],
    ),
  );
});
test("declined actual cases forbid that edge in both profiles and directions while allowing independently valid alternatives", () => {
  const f = fixture(),
    held = restoredHeldDataset(f.historical, f.saved),
    cases = postcompileDeclinedRouteCases(held, [f.held.id]);
  assert.equal(cases.length, 4);
  assert(
    cases.every(
      (c) =>
        c.forbiddenEdgeIds?.includes(f.held.id) &&
        !c.intendedEdgeId &&
        !c.expect,
    ),
  );
});
test("each qualified stair must own exactly one distinct source index with no orphan rows", () => {
  const f = fixture(),
    second = {
      ...f.finalized,
      id: "second-qualified",
      nativeSteppedStairV2: {
        ...f.finalized.nativeSteppedStairV2!,
        sourceIndexId: "second-index",
      },
    },
    candidate = {
      ...f.historical,
      edges: [...f.historical.edges, second],
      nativeSteppedStairV2SourceIndices: [
        ...f.historical.nativeSteppedStairV2SourceIndices!,
        { id: "second-index", physical: { synthetic: true } },
      ],
    };
  const ids = [f.held.id, second.id];
  assertPostcompileCandidateOutcomes(
    candidate,
    candidate,
    f.saved,
    ids,
    ids,
    [],
  );
  const changed = structuredClone(candidate);
  changed.edges.at(-1)!.nativeSteppedStairV2!.sourceIndexId = "synthetic-index";
  assert.throws(
    () =>
      assertPostcompileCandidateOutcomes(
        changed,
        candidate,
        f.saved,
        ids,
        ids,
        [],
      ),
    /cannot share/,
  );
});
test("exact proposed caller/export transforms preserve every existing predicate and reject already amended inputs", () => {
  const source = new TextEncoder().encode(
      'function assertExistingClaimedSteppedApproaches(data, edge, proof) {\n  for (const original of data.edges) {\n    if (!original) throw Error("existing guard");\n  }\n}\n\nexport function inspectNativeSteppedStairV2Binding(data, edge, proof) {\n  assertExistingClaimedSteppedApproaches(data, edge, proof);\n}\n',
    ),
    circulation = new TextEncoder().encode(
      "function nativeCellAccessIsSupported(data, cell, index) {\n  return existingPhysicalAccessPredicate(data, cell, index);\n}\n",
    );
  const amended = exactPostcompileQualifierStrengthening(source),
    exported = exactPostcompileCellAccessExport(circulation);
  assert.throws(() => exactPostcompileQualifierStrengthening(amended));
  assert.throws(() => exactPostcompileCellAccessExport(exported));
  assert(
    new TextDecoder()
      .decode(amended)
      .includes("assertExistingClaimedSteppedApproaches(data, edge, proof);"),
  );
});
test("historical source metadata binds the exact three original algorithms, never a matching subset", () => {
  const algorithms = [
      "source-stepped-stair-v2-review.ts",
      "source-stepped-stair-v2-producer.ts",
      "finalize-source-stepped-stair-v2.ts",
    ].map((name, i) => ({
      path: fileURLToPath(
        new URL(`../../scripts/indoor/${name}`, import.meta.url),
      ),
      sha256: String(i).repeat(64),
    })),
    files = Object.fromEntries(algorithms.map((row) => [row.path, row.sha256]));
  assertHistoricalSteppedAlgorithmBindings(algorithms, files);
  assert.throws(() =>
    assertHistoricalSteppedAlgorithmBindings(algorithms.slice(0, 2), files),
  );
  assert.throws(() =>
    assertHistoricalSteppedAlgorithmBindings(
      [...algorithms, algorithms[0]!],
      files,
    ),
  );
  assert.throws(() =>
    assertHistoricalSteppedAlgorithmBindings(
      algorithms.map((row, i) =>
        i ? row : { ...row, sha256: "f".repeat(64) },
      ),
      files,
    ),
  );
});
