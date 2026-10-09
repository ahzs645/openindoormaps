import assert from "node:assert/strict";
import test from "node:test";
import {
  validDrawingReconstruction as visitor,
  type NativeBoundaryPatch,
} from "../../app/indoor-project/native-boundary-patches";
import { validDrawingReconstruction as compiler } from "../../../reviter/lib/reviter/native-boundary-patches.ts";
const ring: [number, number][] = [
  [183.8968407282817, 486.6781534613432],
  [182.58450743379336, 486.67847280764744],
  [182.5848267800976, 487.9908061021348],
  [183.8971600745859, 487.99048675583055],
];
function fixture(): NativeBoundaryPatch {
  const q = structuredClone(ring);
  for (const p of q) p[0] -= 0.0484;
  const v = [ring[0][0] - ring[3][0], ring[0][1] - ring[3][1]],
    len = Math.hypot(...v);
  for (const p of q.slice(0, 2)) {
    p[0] += (0.076 * v[0]) / len;
    p[1] += (0.076 * v[1]) / len;
  }
  return {
    id: "independent-closed-square",
    levelId: 1,
    sourceModelSha256: "a".repeat(64),
    status: "proposed",
    widthFeet: Math.max(
      ...ring.map((p, i) =>
        Math.hypot(p[0] - ring[(i + 1) % 4][0], p[1] - ring[(i + 1) % 4][1]),
      ),
    ),
    ringsFeet: [q],
    wallEvidence: [],
    nativeDoorIds: [],
    notes: "Independent drawing body",
    drawingReconstructionProof: {
      sourceDrawingSha256: "b".repeat(64),
      sectionId: "independent reference",
      evidenceSha256: "c".repeat(64),
      registeredRingsFeet: [structuredClone(ring)],
      contactAdaptationFeet: 0.095,
    },
  };
}
for (const [name, validate] of [
  ["visitor", visitor],
  ["compiler", compiler],
] as const) {
  test(
    name +
      " retains an unchanged tied square width when adapting the perpendicular contact ends",
    () => {
      const p = fixture(),
        bytes = JSON.stringify(p);
      assert.equal(validate(p), true);
      assert.equal(JSON.stringify(p), bytes);
      assert.equal(
        validate({
          ...p,
          ringsFeet: structuredClone(
            p.drawingReconstructionProof!.registeredRingsFeet,
          ),
        }),
        true,
      );
    },
  );
  test(
    name +
      " rejects expansion of both axes, excessive contact movement and a different untied thickness",
    () => {
      const p = fixture();
      const wide = structuredClone(p);
      wide.ringsFeet[0][0][0] += 0.03;
      wide.ringsFeet[0][3][0] += 0.03;
      assert.equal(validate(wide), false);
      const far = structuredClone(p);
      far.ringsFeet[0][0][1] -= 0.1;
      assert.equal(validate(far), false);
      const unequal = fixture();
      unequal.drawingReconstructionProof!.registeredRingsFeet[0][0][1] += 0.01;
      unequal.drawingReconstructionProof!.registeredRingsFeet[0][1][1] += 0.01;
      unequal.widthFeet = Math.max(
        ...unequal.drawingReconstructionProof!.registeredRingsFeet[0].map(
          (q, i, r) =>
            Math.hypot(q[0] - r[(i + 1) % 4][0], q[1] - r[(i + 1) % 4][1]),
        ),
      );
      assert.equal(validate(unequal), false);
    },
  );
}
