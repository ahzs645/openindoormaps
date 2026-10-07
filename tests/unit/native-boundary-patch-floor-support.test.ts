import assert from "node:assert/strict";
import test from "node:test";
import { nativeBoundaryPatchFloorSupport } from "../../app/indoor-project/native-boundary-patch-floor-support";
import {
  validNativeContinuation,
  type NativeBoundaryPatch,
} from "../../app/indoor-project/native-boundary-patches";
import { deriveExactBoundaryPatchPreview } from "../../app/indoor-project/enclosure-proposals";
import { gapProject } from "../fixtures/native-area-project";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const patch = (): NativeBoundaryPatch => ({
  id: "contact",
  levelId: 1,
  sourceModelSha256: "a".repeat(64),
  status: "proposed",
  widthFeet: 2,
  ringsFeet: [rect(2, 7.9998, 1, 2.0004)],
  wallEvidence: [
    { nativeElementId: 101, ringsFeet: [rect(2, 0, 1, 8)] },
    { nativeElementId: 102, ringsFeet: [rect(1, 10, 3, 2)] },
  ],
  nativeDoorIds: [],
  notes: "Measured original cap to original wall face",
  continuationProof: {
    sourceWallId: 101,
    sourceCapFeet: [
      [2, 8],
      [3, 8],
    ],
    targetContactFeet: [
      [2, 10],
      [3, 10],
    ],
    evidenceSha256: "b".repeat(64),
  },
});

test("supported gap can penetrate at most 0.0002ft into named original contact at slab perimeter", () => {
  const p = patch(),
    floors = [[rect(0, 0, 5, 10)]];
  assert(validNativeContinuation(p));
  const before = JSON.stringify([p, floors]);
  assert.deepEqual(nativeBoundaryPatchFloorSupport(p, floors), {
    supported: true,
    originalContactAllowance: true,
  });
  assert.equal(JSON.stringify([p, floors]), before);
  assert.deepEqual(nativeBoundaryPatchFloorSupport(p, [[rect(0, 0, 5, 13)]]), {
    supported: true,
    originalContactAllowance: false,
  });
});

test("allowance never admits unsupported gap, unproved patch, wider contact, detached contact or native floor hole", () => {
  const p = patch(),
    floors = [[rect(0, 0, 5, 10)]];
  assert.equal(
    nativeBoundaryPatchFloorSupport(p, [[rect(0, 0, 5, 9.9999)]]).supported,
    false,
  );
  assert.equal(
    nativeBoundaryPatchFloorSupport(p, [[rect(0, 0, 5, 9.99999995)]]).supported,
    false,
  );
  const unproved = structuredClone(p);
  delete unproved.continuationProof;
  assert.equal(
    nativeBoundaryPatchFloorSupport(unproved, floors).supported,
    false,
  );
  const wider = structuredClone(p);
  wider.ringsFeet = [rect(2, 7.9997, 1, 2.0006)];
  assert.equal(nativeBoundaryPatchFloorSupport(wider, floors).supported, false);
  const forged = structuredClone(p);
  forged.continuationProof!.targetContactFeet = [
    [2, 9.9],
    [3, 9.9],
  ];
  assert.equal(
    nativeBoundaryPatchFloorSupport(forged, floors).supported,
    false,
  );
  const hole = rect(2.2, 10.00005, 0.4, 0.0001);
  assert.equal(
    nativeBoundaryPatchFloorSupport(p, [[rect(0, 0, 5, 13), hole]]).supported,
    false,
  );
  assert.equal(nativeBoundaryPatchFloorSupport(p, []).supported, false);
});

test("rotated native contacts use one topology grid without weakening a real unsupported gap", () => {
  const transform = ([x, y]: [number, number]): [number, number] => [
    157.016927343 + Math.cos(0.28325) * x - Math.sin(0.28325) * y,
    172.49524973 + Math.sin(0.28325) * x + Math.cos(0.28325) * y,
  ];
  const p = patch();
  p.ringsFeet = p.ringsFeet.map((ring) => ring.map(transform));
  p.wallEvidence = p.wallEvidence.map((w) => ({
    ...w,
    ringsFeet: w.ringsFeet.map((ring) => ring.map(transform)),
  }));
  p.continuationProof!.sourceCapFeet = p.continuationProof!.sourceCapFeet.map(
    transform,
  ) as [[number, number], [number, number]];
  p.continuationProof!.targetContactFeet =
    p.continuationProof!.targetContactFeet.map(transform) as [
      [number, number],
      [number, number],
    ];
  assert.deepEqual(
    nativeBoundaryPatchFloorSupport(p, [[rect(0, 0, 5, 10).map(transform)]]),
    { supported: true, originalContactAllowance: true },
  );
  assert.equal(
    nativeBoundaryPatchFloorSupport(p, [[rect(0, 0, 5, 9.9999).map(transform)]])
      .supported,
    false,
  );
});

async function candidate() {
  const project = await gapProject(),
    p = patch(),
    d = project.dataset;
  p.sourceModelSha256 = d.source.modelSha256;
  d.walls = p.wallEvidence.map((w) => ({
    ...w,
    levelId: 1,
    kind: "wall" as const,
    approximate: false,
  }));
  d.doors = [];
  d.walkingSupport!.floors = [
    {
      ...d.walkingSupport!.floors[0],
      ringsFeet: [rect(0, 0, 5, 10)],
      partsFeet: [[rect(0, 0, 5, 10)]],
    },
  ];
  delete d.indoorExclusions;
  delete d.nativeDoorBoundaryClosures;
  delete d.selectionDoorThresholds;
  delete d.reviewedAreaPartitions;
  return { p, d };
}

test("exact preview retains full patch obstacle/opening guards when contact allowance is needed", async () => {
  const { p, d } = await candidate(),
    options = { mode: "connected" as const, previewGapIds: [p.id] },
    before = JSON.stringify(d);
  await deriveExactBoundaryPatchPreview(d, 1, p, options);
  assert.equal(JSON.stringify(d), before);
  const foreign = {
    levelId: 1,
    nativeElementId: 103,
    kind: "wall" as const,
    approximate: false,
    ringsFeet: [rect(2.2, 10, 0.4, 0.0002)],
  };
  d.walls.push(foreign);
  await assert.rejects(
    () => deriveExactBoundaryPatchPreview(d, 1, p, options),
    /unsupported floor|fixture/,
  );
  d.walls.pop();
  d.records[0].properties.floorOpeningsFeet = [rect(2.2, 10, 0.4, 0.0002)];
  await assert.rejects(
    () => deriveExactBoundaryPatchPreview(d, 1, p, options),
    /protected opening/,
  );
  delete d.records[0].properties.floorOpeningsFeet;
  d.doors = [
    {
      id: "door:1:500",
      levelId: 1,
      nativeElementId: 500,
      pointFeet: [2.5, 10],
      normalFeet: [0, 1],
      footprintFeet: rect(2.2, 10, 0.4, 0.0002),
      roomKeys: [],
      state: "unmatched",
    },
  ];
  await assert.rejects(
    () => deriveExactBoundaryPatchPreview(d, 1, p, options),
    /measured door/,
  );
});
