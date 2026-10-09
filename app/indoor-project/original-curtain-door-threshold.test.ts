import assert from "node:assert/strict";
import test from "node:test";
import { rational, type NativeRationalParts } from "./native-rational-overlay";
import { nativeRationalArea } from "./native-exact-planar-topology";
import {
  recoverOriginalCurtainDoorSelectionThreshold,
  type OriginalCurtainThresholdInput,
} from "./original-curtain-door-threshold";
import {
  Rational as SourceRational,
  type NativeRationalParts as SourceParts,
} from "../../../reviter/lib/reviter/native-rational-overlay";
import {
  recoverOriginalCurtainDoorSelectionThreshold as sourceRecover,
  type OriginalCurtainThresholdInput as SourceThresholdInput,
} from "../../../reviter/lib/reviter/original-curtain-door-threshold";

const rectangle = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): NativeRationalParts => [
  [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map(
      (p) =>
        p.map(rational) as [
          ReturnType<typeof rational>,
          ReturnType<typeof rational>,
        ],
    ),
  ],
];
const sha = "1".repeat(64);
const input = (): OriginalCurtainThresholdInput => ({
  sourceModelSha256: sha,
  expectedSourceModelSha256: sha,
  nativeDoorElementId: 1,
  originalDoorPlacement: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  originalGlassLocalNormalPlanes: [-0.03125, 0.03125],
  cutElevationFeet: 4,
  originalDoorwayHeightFeet: [0, 7],
  originalSingleDoorAssembly: true,
  originalJambs: [
    { nativeElementId: 2, parts: rectangle(-2, -0.25, -1.5, 0.25) },
    { nativeElementId: 3, parts: rectangle(1.5, -0.25, 2, 0.25) },
  ],
  originalHeaderSection: rectangle(-2, -0.25, 2, 0.25),
  originalFloor: rectangle(-4, -4, 4, 4),
  foreignPhysicalMaterial: [],
});

test("native glass depth closes only selection between the first finite source jambs", () => {
  const v = input(),
    result = recoverOriginalCurtainDoorSelectionThreshold(v);
  assert.equal(result.state, "qualified");
  assert.deepEqual(result.originalJambNativeElementIds, [2, 3]);
  assert.equal(nativeRationalArea(result.threshold).n, 3n);
  assert.equal(nativeRationalArea(result.threshold).d, 16n);
  assert.equal(result.grantsWalkingOrPortal, false);
  const convert = (parts: NativeRationalParts): SourceParts =>
    parts.map((p) =>
      p.map((r) =>
        r.map((q) => [
          new SourceRational(q[0].n, q[0].d),
          new SourceRational(q[1].n, q[1].d),
        ]),
      ),
    );
  const sourceInput: SourceThresholdInput = {
    ...v,
    originalJambs: v.originalJambs.map((j) => ({
      ...j,
      parts: convert(j.parts),
    })),
    originalHeaderSection: convert(v.originalHeaderSection),
    originalFloor: convert(v.originalFloor),
    foreignPhysicalMaterial: convert(v.foreignPhysicalMaterial),
  };
  const encode = (x: ReturnType<typeof sourceRecover>) => ({
    ...x,
    threshold: x.threshold.map((p) =>
      p.map((r) => r.map((q) => q.map((t) => [String(t.n), String(t.d)]))),
    ),
  });
  assert.deepEqual(encode(sourceRecover(sourceInput)), encode(result));
});

test("the whole source glass depth requires finite contacts, including an interior jamb notch", () => {
  const v = input();
  v.originalJambs = [
    v.originalJambs[0],
    {
      nativeElementId: 3,
      parts: [
        rectangle(1.5, -0.25, 2, -0.01)[0],
        rectangle(1.5, 0.01, 2, 0.25)[0],
      ],
    },
  ];
  assert.equal(
    recoverOriginalCurtainDoorSelectionThreshold(v).reason,
    "missing-both-first-finite-jamb-contacts",
  );
});

test("every positive floor, header or foreign residual survives, including one IEEE step", () => {
  const floor = input();
  floor.originalFloor = rectangle(-4, -4, 1.5 - Number.EPSILON, 4);
  const f = recoverOriginalCurtainDoorSelectionThreshold(floor);
  assert.equal(f.reason, "positive-original-floor-or-hole-residual");
  assert(nativeRationalArea(f.exactResidual!).n > 0n);
  const header = input();
  header.originalHeaderSection = rectangle(-4, -4, 1.5 - Number.EPSILON, 4);
  assert.equal(
    recoverOriginalCurtainDoorSelectionThreshold(header).reason,
    "positive-original-finite-header-residual",
  );
  const foreign = input();
  foreign.foreignPhysicalMaterial = rectangle(0, -0.01, 0.01, 0.01);
  assert.equal(
    recoverOriginalCurtainDoorSelectionThreshold(foreign).reason,
    "foreign-physical-material-intersection",
  );
});

test("ambiguous multi-leaf assemblies, stale models and unsupported source heights remain rejected", () => {
  const multi = input();
  multi.originalSingleDoorAssembly = false;
  assert.equal(
    recoverOriginalCurtainDoorSelectionThreshold(multi).reason,
    "unqualified-single-door-source-role",
  );
  const stale = input();
  stale.expectedSourceModelSha256 = "2".repeat(64);
  assert.equal(
    recoverOriginalCurtainDoorSelectionThreshold(stale).reason,
    "source-model-mismatch",
  );
  const low = input();
  low.cutElevationFeet = -0.1;
  assert.equal(
    recoverOriginalCurtainDoorSelectionThreshold(low).reason,
    "outside-original-doorway-height",
  );
});
