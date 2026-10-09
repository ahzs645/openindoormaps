import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import pc from "polygon-clipping";
import {
  validateCurrentBoundaryContacts as runtimeContacts,
  type NativeBoundaryPatch,
  type BoundaryWall,
} from "../../app/indoor-project/native-boundary-patches";

import { validateCurrentBoundaryContacts as sourceContacts } from "../../../reviter/lib/reviter/native-boundary-patches.ts";
import { boundaryPatchMaterialParts as runtimeParts } from "../../app/indoor-project/native-boundary-patches";
import { boundaryPatchMaterialParts as sourceParts } from "../../../reviter/lib/reviter/native-boundary-patches.ts";

const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][][] => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
];
const wall = (id: number, x: number): BoundaryWall => ({
  levelId: 1,
  nativeElementId: id,
  kind: "wall",
  ringsFeet: rect(x, 0, 1, 1),
});
const patch = (id: string, x = 0.9, w = 1.2): NativeBoundaryPatch => ({
  id,
  levelId: 1,
  status: "applied",
  sourceModelSha256: "a".repeat(64),
  widthFeet: 1,
  ringsFeet: rect(x, 0, w, 1),
  nativeDoorIds: [],
  notes: "Checked original continuation",
  wallEvidence: [wall(1, 0), wall(2, 2)].map(
    ({ nativeElementId, ringsFeet }) => ({ nativeElementId, ringsFeet }),
  ),
});
const sourceContact: { patch: NativeBoundaryPatch; walls: BoundaryWall[] } =
  JSON.parse(
    await fs.readFile(
      new URL(
        "../fixtures/native-current-contact/source-cap-1107919.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

for (const [implementation, validateCurrentBoundaryContacts] of [
  ["visitor", runtimeContacts],
  ["source", sourceContacts],
] as const) {
  test(
    implementation +
      " actual original cap contact survives a failed global-coordinate sweep without changing its source",
    () => {
      const original = JSON.stringify(sourceContact);
      assert.throws(
        () =>
          pc.intersection(
            sourceContact.patch.ringsFeet,
            sourceContact.walls.find((w) => w.nativeElementId === 1107919)!
              .ringsFeet,
          ),
        /Unable to complete output ring/,
      );
      assert.doesNotThrow(() =>
        validateCurrentBoundaryContacts(
          [sourceContact.patch],
          () => sourceContact.walls,
        ),
      );
      assert.equal(JSON.stringify(sourceContact), original);
      const moved = structuredClone(sourceContact.walls);
      const target = moved.find((w) => w.nativeElementId === 1008886)!;
      target.ringsFeet = target.ringsFeet.map((r) =>
        r.map(([x, y]) => [x, y + 0.1]),
      );
      assert.throws(
        () =>
          validateCurrentBoundaryContacts([sourceContact.patch], () => moved),
        /actual current native material #1008886/,
      );
    },
  );
  test(
    implementation +
      " historical gross evidence cannot authorize a cap missing actual material",
    () => {
      assert.throws(
        () =>
          validateCurrentBoundaryContacts([patch("stale")], () => [
            wall(1, 0),
            wall(2, 3),
          ]),
        /actual current native material #2/,
      );
    },
  );
  test(
    implementation +
      " actual rigid placement and aperture absence are checked independently",
    () => {
      assert.doesNotThrow(() =>
        validateCurrentBoundaryContacts([patch("valid")], () => [
          wall(1, 0),
          wall(2, 2),
        ]),
      );
      assert.throws(
        () =>
          validateCurrentBoundaryContacts([patch("door-cut")], () => [
            wall(1, 0),
          ]),
        /#2/,
      );
      assert.throws(
        () =>
          validateCurrentBoundaryContacts(
            [patch("lost-effective-contact")],
            () => [wall(1, 0), wall(2, 2)],
            () => [rect(0.9, 0, 1.05, 1)],
          ),
        /#2/,
      );
    },
  );
  test(
    implementation +
      " linked corner caps need positive overlap on their own level",
    () => {
      const a = patch("a", 0.9, 0.7),
        b = patch("b", 1.5, 0.6);
      assert.doesNotThrow(() =>
        validateCurrentBoundaryContacts([a, b], () => [wall(1, 0), wall(2, 2)]),
      );
      assert.throws(
        () =>
          validateCurrentBoundaryContacts([a, { ...b, levelId: 2 }], () => [
            wall(1, 0),
            wall(2, 2),
          ]),
        /actual current/,
      );
      assert.throws(
        () =>
          validateCurrentBoundaryContacts(
            [a, patch("edge-only", 1.6, 0.5)],
            () => [wall(1, 0), wall(2, 2)],
          ),
        /actual current/,
      );
    },
  );
  test(
    implementation +
      " tagged derived patches and approximate owner boxes cannot certify original contact",
    () => {
      assert.throws(
        () =>
          validateCurrentBoundaryContacts([patch("derived")], () => [
            wall(1, 0),
            { ...wall(2, 2), reviewPatchId: "unrelated" },
          ]),
        /#2/,
      );
      assert.throws(
        () =>
          validateCurrentBoundaryContacts([patch("approx")], () => [
            wall(1, 0),
            { ...wall(2, 2), approximate: true },
          ]),
        /#2/,
      );
    },
  );
}

for (const [implementation, materialParts] of [
  ["visitor", runtimeParts],
  ["source", sourceParts],
] as const) {
  test(
    implementation +
      " continuation inherits only its original host's checked doorway",
    () => {
      const p = patch("return");
      const cuts = {
        version: 1,
        sourceModelSha256: p.sourceModelSha256,
        patches: [
          {
            kind: "basic-wall-overlap",
            id: "original-host-opening",
            levelId: 1,
            nativeDoorId: 12,
            apertureFeet: rect(1.2, -0.1, 0.6, 1.2)[0],
            normalFeet: [1, 0],
            wallEvidence: [
              { nativeElementId: 1, partsFeet: wall(1, 0).ringsFeet },
            ],
            frameEvidence: [],
            doorEvidence: {
              hostId: 1,
              orientedBox: Array.from({ length: 8 }, (_, i) => [
                i & 1,
                (i >> 1) & 1,
                (i >> 2) & 1,
              ]),
            },
            notes: "Independently checked original host aperture",
          },
        ],
      };
      const original = JSON.stringify([p, cuts]);
      const parts = materialParts(p, cuts, p.sourceModelSha256);
      assert.equal(
        parts.length,
        2,
        "exact original aperture keeps both wall returns",
      );
      assert.ok(
        parts.every((rings) =>
          rings[0].every((q) => q[0] <= 1.2 + 1e-12 || q[0] >= 1.8 - 1e-12),
        ),
      );
      assert.equal(
        JSON.stringify([p, cuts]),
        original,
        "full source recipe and doorway remain unchanged",
      );
      const foreign = structuredClone(cuts);
      foreign.patches[0].wallEvidence[0].nativeElementId = 2;
      foreign.patches[0].doorEvidence.hostId = 2;
      assert.deepEqual(materialParts(p, foreign, p.sourceModelSha256), [
        p.ringsFeet,
      ]);
      assert.deepEqual(materialParts(p, undefined, p.sourceModelSha256), [
        p.ringsFeet,
      ]);
      assert.throws(
        () => materialParts(p, cuts, "b".repeat(64)),
        /Invalid reviewed native door aperture/,
      );
    },
  );
}
