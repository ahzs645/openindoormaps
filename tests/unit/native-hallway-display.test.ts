import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import pc from "polygon-clipping";
import { fixture } from "../fixtures/native-area-project";
import {
  nativeHallwayContainedDisplay,
  nativeExactHallwayDisplayParts,
} from "../../app/indoor-project/native-hallway-display";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import {
  createNativeExactTopologyIndex,
  encodeNativeExactTopology,
  nativeRationalPointInParts,
  type NativeExactPlanarTopology,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  type NativeRationalOverlayInput,
} from "../../app/indoor-project/native-rational-overlay";
type Point = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const contains = (parts: Point[][][], p: Point) =>
  nativeRationalPointInParts(p, nativeRationalOverlay("union", parts));

test("original Floor 2 floating hallway failure clips its retained exact face without rounding source operands", async () => {
  const witness = JSON.parse(
    await readFile(
      new URL(
        "../fixtures/native-hallway-floating-failure.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    exactTopology: NativeExactPlanarTopology;
    exactFaceId: string;
    ringsFeet: Point[][];
    exclusions: Point[][][];
    message: string;
  };
  const before = JSON.stringify(witness);
  const legacy = witness.exclusions.map((part) =>
    part.map((r) =>
      r
        .map(
          (p) =>
            [
              Math.round(p[0] * 1e4) / 1e4,
              Math.round(p[1] * 1e4) / 1e4,
            ] as Point,
        )
        .filter(
          (p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1],
        ),
    ),
  );
  assert.throws(
    () => pc.difference(witness.ringsFeet, ...legacy),
    /Unable to complete output ring/,
  );
  const face = createNativeExactTopologyIndex(
    witness.exactTopology,
    witness.exactTopology,
  ).parts(witness.exactFaceId)!;
  const display = nativeHallwayContainedDisplay(face, witness.exclusions);
  assert(display.partsFeet.length > 0);
  assert.equal(display.certificate.numericOutsideSourceEmpty, true);
  assert.equal(display.certificate.exactDecompositionEqualsSource, true);
  assert.equal(display.certificate.completeExactAuthorityRetained, true);
  assert.deepEqual(
    nativeRationalOverlay("difference", display.exactParts, face),
    [],
  );
  assert.deepEqual(
    nativeRationalOverlay(
      "intersection",
      display.exactParts,
      witness.exclusions,
    ),
    [],
  );
  assert.equal(
    JSON.stringify(witness),
    before,
    "original face, numeric proposal and exclusion bytes retained",
  );
});

test("native floor holes and complete exclusion polygons with holes survive contained hallway drawing", () => {
  const source = nativeRationalOverlay("union", [
    [rect(0, 0, 10, 10), rect(1, 1, 2, 2)],
  ]);
  const excluded: NativeRationalOverlayInput = [
    [rect(4, 0, 8, 10), rect(5, 2, 7, 8)],
  ];
  const before = source.map((part) =>
    part.map((ring) =>
      ring.map((p) => p.map((q) => [String(q.n), String(q.d)])),
    ),
  );
  const display = nativeHallwayContainedDisplay(source, excluded);
  assert.equal(
    contains(display.partsFeet, [1.5, 1.5]),
    false,
    "physical slab hole",
  );
  assert.equal(
    contains(display.partsFeet, [4.5, 5]),
    false,
    "excluded exterior",
  );
  assert.equal(
    contains(display.partsFeet, [6, 5]),
    true,
    "hole within exclusion remains available",
  );
  assert.equal(contains(display.partsFeet, [3, 5]), true);
  assert.deepEqual(
    source.map((part) =>
      part.map((ring) =>
        ring.map((p) => p.map((q) => [String(q.n), String(q.d)])),
      ),
    ),
    before,
  );
});

async function nativeFixture() {
  const data = fixture();
  data.records = [];
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 10, 10), rect(1, 1, 2, 2)],
      },
    ],
  };
  const envelope = {
    version: 1 as const,
    sourceModelSha256: data.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[rect(0, 0, 10, 10)]],
        sourceElementIds: [100],
        cutElevationsFeet: [4],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  data.nativeIndoorEnvelopes = {
    ...envelope,
    geometrySha256: await nativeIndoorEnvelopeHash(envelope),
  };
  const key = nativeCirculationGeometryKey(data),
    face = nativeRationalOverlay("union", [
      [rect(0, 0, 10, 10), rect(1, 1, 2, 2)],
    ]);
  data.circulationGeometry = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: key,
    cells: [
      {
        id: "literal-hall",
        levelIds: [1],
        elevationFeet: 0,
        roomKeys: [],
        nativeFloorIds: [100],
        ringsFeet: [rect(0, 0, 20, 20)],
        sourceCoverage: 1,
        exactFaceId: "source-face",
      },
    ],
    exactTopology: encodeNativeExactTopology(
      {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: key,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      },
      [{ id: "source-face", parts: face }],
    ),
  };
  return data;
}
test("strict hallway drawing follows current exact source face, not its larger rounded outline; source bytes unchanged", async () => {
  const data = await nativeFixture(),
    before = JSON.stringify(data),
    parts = nativeExactHallwayDisplayParts(data, 1, []);
  assert(parts.length > 0);
  assert.equal(contains(parts, [15, 15]), false);
  assert.equal(contains(parts, [1.5, 1.5]), false);
  assert.equal(contains(parts, [5, 5]), true);
  assert.deepEqual(nativeExactHallwayDisplayParts(data, 2, []), []);
  assert.equal(JSON.stringify(data), before);
});
test("stale or absent circulation/exact source faces fail closed without using numeric cell outlines", async () => {
  const stale = await nativeFixture();
  stale.circulationGeometry!.sourceGeometryKey = "stale";
  assert.deepEqual(nativeExactHallwayDisplayParts(stale, 1, []), []);
  const missing = await nativeFixture();
  delete missing.circulationGeometry!.exactTopology;
  assert.deepEqual(nativeExactHallwayDisplayParts(missing, 1, []), []);
  const missingFace = await nativeFixture();
  missingFace.circulationGeometry!.cells[0].exactFaceId = "absent";
  assert.deepEqual(nativeExactHallwayDisplayParts(missingFace, 1, []), []);
});

test("strict native-area review consumes the contained exact hallway and preserves full source input", async () => {
  const data = await nativeFixture();
  const { nativeMaterialSectionsHash } = await import(
    "../../app/indoor-project/native-material-sections"
  );
  const { deriveNativeAreas } = await import(
    "../../app/indoor-project/native-area-review"
  );
  const source = {
    version: 1 as const,
    sourceModelSha256: data.source.modelSha256,
    levels: [0.1, 4].map((cut) => ({
      levelId: 1,
      elevationFeet: 0,
      cutElevationFeet: cut,
      sourceElementIds: [200],
      evidenceSha256: "b".repeat(64),
      sections: [
        {
          nativeElementId: 200,
          categoryId: -2000011,
          kind: "wall" as const,
          baseElevationFeet: 0,
          topElevationFeet: 10,
          partsFeet: [[rect(11, 0, 12, 10)]],
        },
      ],
    })),
  };
  data.nativeMaterialSections = {
    ...source,
    geometrySha256: await nativeMaterialSectionsHash(source),
  };
  const geometry = data.circulationGeometry!,
    face = createNativeExactTopologyIndex(
      geometry.exactTopology!,
      geometry.exactTopology!,
    ).parts("source-face")!;
  geometry.sourceGeometryKey = nativeCirculationGeometryKey(data);
  geometry.exactTopology = encodeNativeExactTopology(
    {
      sourceModelSha256: data.source.modelSha256,
      sourceGeometryKey: geometry.sourceGeometryKey,
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    [{ id: "source-face", parts: face }],
  );
  const before = JSON.stringify(data),
    result = await deriveNativeAreas(data, 1, {
      mode: "connected",
      maxGapFeet: 0,
    });
  assert(result.exactTopology);
  assert(result.hallwayPartsFeet?.length);
  assert.equal(contains(result.hallwayPartsFeet!, [15, 15]), false);
  assert.equal(contains(result.hallwayPartsFeet!, [1.5, 1.5]), false);
  assert.equal(contains(result.hallwayPartsFeet!, [5, 5]), true);
  assert.equal(JSON.stringify(data), before);
});

test("legacy area review keeps the existing numeric circulation triangulation branch", async () => {
  const data = await nativeFixture();
  delete data.nativeIndoorEnvelopes;
  data.circulationGeometry!.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  delete data.circulationGeometry!.exactTopology;
  delete data.circulationGeometry!.cells[0].exactFaceId;
  const { deriveNativeAreas } = await import(
    "../../app/indoor-project/native-area-review"
  );
  const { nativeAreaDisplayParts } = await import(
    "../../app/indoor-project/native-area-display"
  );
  const before = JSON.stringify(data),
    expected = nativeAreaDisplayParts(
      data.circulationGeometry!.cells[0].ringsFeet,
    );
  const result = await deriveNativeAreas(data, 1, {
    mode: "connected",
    maxGapFeet: 0,
  });
  assert.deepEqual(result.hallwayPartsFeet, expected);
  assert.equal(result.exactTopology, undefined);
  assert.equal(JSON.stringify(data), before);
});
