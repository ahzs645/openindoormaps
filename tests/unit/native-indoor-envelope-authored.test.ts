import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeIndoorEnvelopeAuthored,
  nativeIndoorEnvelopeHash,
  verifyNativeIndoorEnvelopes,
  type NativeIndoorEnvelopes,
} from "../../app/indoor-project/native-indoor-envelopes";

type P = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const MODEL = "a".repeat(64);

test("prepared envelopes with a compiler-derived supplement still match their authored source exactly", async () => {
  const level = {
    levelId: 7,
    elevationFeet: 3,
    partsFeet: [[rect(30, 0, 40, 10)]],
    sourceElementIds: [77],
    cutElevationsFeet: [3.1, 7],
    evidenceSha256: "b".repeat(64),
  };
  const base = {
    version: 1 as const,
    sourceModelSha256: MODEL,
    levels: [level],
  };
  const authored = {
    ...base,
    geometrySha256: await nativeIndoorEnvelopeHash(base),
  } as NativeIndoorEnvelopes;
  assert.equal(
    nativeIndoorEnvelopeAuthored(authored),
    authored,
    "an unsupplemented envelope is its own authored form",
  );
  // Shape written by reviter mergeNativeIndoorEnvelopeSupplements.
  const levels = [
    {
      ...level,
      partsFeet: [...level.partsFeet, [rect(0, 0, 10, 10)]],
      supplements: [
        {
          version: 1,
          method: "bounded-faces-intersection-over-cuts-v1",
          levelId: 7,
          elevationFeet: 3,
          cutElevationsFeet: [3.1, 7],
          areaSqFt: 100,
          sourceElementIds: [1],
          correctionIds: ["db:7:x"],
          assumptionIds: ["db:7:x"],
          evidenceSha256: "c".repeat(64),
          partStartIndex: 1,
          partCount: 1,
        },
      ],
    },
  ];
  const prepared = {
    ...authored,
    levels,
    geometrySha256: await nativeIndoorEnvelopeHash({
      ...base,
      levels,
    } as never),
    authoredGeometrySha256: authored.geometrySha256,
  } as unknown as NativeIndoorEnvelopes;
  await verifyNativeIndoorEnvelopes(prepared, MODEL);
  assert.equal(
    JSON.stringify(nativeIndoorEnvelopeAuthored(prepared)),
    JSON.stringify(authored),
  );
  const misplaced = structuredClone(prepared) as unknown as {
    levels: { supplements: { partStartIndex: number }[] }[];
  };
  misplaced.levels[0]!.supplements[0]!.partStartIndex = 0;
  assert.throws(
    () =>
      nativeIndoorEnvelopeAuthored(
        misplaced as unknown as NativeIndoorEnvelopes,
      ),
    /follow every authored part|Invalid/,
  );
});

test("floor-edge rule rows in a prepared supplement must carry their provenance (reviter mirror)", async () => {
  const level = {
    levelId: 7,
    elevationFeet: 3,
    partsFeet: [[rect(30, 0, 40, 10)]],
    sourceElementIds: [77],
    cutElevationsFeet: [3.1, 7],
    evidenceSha256: "b".repeat(64),
  };
  const base = {
    version: 1 as const,
    sourceModelSha256: MODEL,
    levels: [level],
  };
  const authored = {
    ...base,
    geometrySha256: await nativeIndoorEnvelopeHash(base),
  } as NativeIndoorEnvelopes;
  const row = "native-floor-edge-drop-v1:7:300";
  const supplement = {
    version: 1,
    method: "bounded-faces-intersection-over-cuts-v1",
    levelId: 7,
    elevationFeet: 3,
    cutElevationsFeet: [3.1, 7],
    areaSqFt: 100,
    sourceElementIds: [1],
    correctionIds: [row],
    assumptionIds: [] as string[],
    floorEdge: {
      decisionId: "owner-decision#floor-edge",
      rules: ["native-floor-edge-drop-v1"],
      rowIds: [row],
      rowsSha256: "d".repeat(64),
      yieldedConnectorIds: ["ramp:9"],
    },
    evidenceSha256: "c".repeat(64),
    partStartIndex: 1,
    partCount: 1,
  };
  const prepared = (s: Record<string, unknown>) =>
    ({
      ...authored,
      levels: [
        {
          ...level,
          partsFeet: [...level.partsFeet, [rect(0, 0, 10, 10)]],
          supplements: [s],
        },
      ],
      authoredGeometrySha256: authored.geometrySha256,
    }) as unknown as NativeIndoorEnvelopes;
  assert.equal(
    JSON.stringify(nativeIndoorEnvelopeAuthored(prepared(supplement))),
    JSON.stringify(authored),
  );
  const { floorEdge: _, ...untagged } = supplement;
  assert.throws(
    () => nativeIndoorEnvelopeAuthored(prepared(untagged)),
    /without their provenance/,
  );
  assert.throws(
    () =>
      nativeIndoorEnvelopeAuthored(
        prepared({ ...supplement, assumptionIds: [row] }),
      ),
    /floor-edge provenance/,
  );
  assert.throws(
    () =>
      nativeIndoorEnvelopeAuthored(
        prepared({
          ...supplement,
          floorEdge: {
            ...supplement.floorEdge,
            rules: ["native-floor-edge-step-v1"],
          },
        }),
      ),
    /floor-edge provenance/,
  );
});
