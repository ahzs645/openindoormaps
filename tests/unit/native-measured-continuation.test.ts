import test from "node:test";
import assert from "node:assert/strict";
import {
  validateNativeBoundaryPatches,
  reviewedBoundaryWalls,
  type NativeBoundaryPatch,
} from "../../app/indoor-project/native-boundary-patches";
import { validateNativeBoundaryPatches as compilerValidate } from "../../../reviter/lib/reviter/native-boundary-patches";
import { gapProject } from "../fixtures/native-area-project";
import { deriveExactBoundaryPatchGroupPreview } from "../../app/indoor-project/enclosure-proposals";
import {
  nativeBoundaryPatchFile,
  importNativeBoundaryPatchFile,
} from "../../app/indoor-project/native-boundary-patch-file";

const model = "a".repeat(64);
function patch(column = false): NativeBoundaryPatch {
  return {
    id: "measured-reconstruction",
    levelId: 1,
    sourceModelSha256: model,
    status: "proposed",
    widthFeet: 12,
    ringsFeet: [
      [
        [0, -0.0002],
        [0.4, -0.0002],
        [0.4, 12.0002],
        [0, 12.0002],
      ],
    ],
    wallEvidence: [
      {
        nativeElementId: 1,
        ringsFeet: [
          [
            [0, -5],
            [0.4, -5],
            [0.4, 0],
            [0, 0],
          ],
        ],
      },
      {
        nativeElementId: 2,
        kind: column ? "column" : "wall",
        ringsFeet: [
          [
            [-1, 12],
            [2, 12],
            [2, 13],
            [-1, 13],
          ],
        ],
      },
    ],
    nativeDoorIds: [],
    notes: "Reviewed missing run; exact source cap and supporting face.",
    continuationProof: {
      sourceWallId: 1,
      sourceCapFeet: [
        [0, 0],
        [0.4, 0],
      ],
      targetContactFeet: [
        [0, 12],
        [0.4, 12],
      ],
      evidenceSha256: "b".repeat(64),
    },
  };
}
for (const [name, validate] of [
  ["runtime", validateNativeBoundaryPatches],
  ["compiler", compilerValidate],
] as const) {
  test(
    name +
      " follows a slightly oblique original column face without shifting the source axis or overpenetrating either cap corner",
    () => {
      const p = patch(true);
      p.wallEvidence[1].ringsFeet = [
        [
          [-1, 11.986],
          [2, 12.016],
          [2, 13],
          [-1, 13],
        ],
      ];
      p.continuationProof!.targetContactFeet = [
        [0, 11.996],
        [0.4, 12],
      ];
      validate({ version: 1, patches: [p] }, model);
      const over = structuredClone(p);
      over.ringsFeet[0][2][1] = 12.019;
      over.ringsFeet[0][3][1] = 12.019;
      assert.throws(() => validate({ version: 1, patches: [over] }, model));
      const skew = structuredClone(p);
      skew.continuationProof!.targetContactFeet[1][0] += 0.01;
      assert.throws(() => validate({ version: 1, patches: [skew] }, model));
      const broad = structuredClone(p);
      broad.wallEvidence[1].ringsFeet = [
        [
          [-1, 11.9],
          [2, 12.2],
          [2, 13],
          [-1, 13],
        ],
      ];
      broad.continuationProof!.targetContactFeet = [
        [0, 12],
        [0.4, 12.04],
      ];
      broad.widthFeet = 12.04;
      broad.ringsFeet[0][2][1] = 12.0402;
      broad.ringsFeet[0][3][1] = 12.0402;
      assert.throws(() => validate({ version: 1, patches: [broad] }, model));
      const wedge = structuredClone(broad);
      wedge.ringsFeet[0][3][1] = 12.0002;
      validate({ version: 1, patches: [wedge] }, model);
      const rotated = patch();
      rotated.continuationProof!.sourceCapFeet = [
        [0.4, -5],
        [0.4, 0],
      ];
      assert.throws(() => validate({ version: 1, patches: [rotated] }, model));
    },
  );
}

test("independent drawing reconstruction can join real native supports through a complete linked set, while a floating or widened body fails", async () => {
  const project = await gapProject();
  const evidence: NativeBoundaryPatch["wallEvidence"] = [
    {
      nativeElementId: 1,
      ringsFeet: [
        [
          [14.8, 0],
          [15.2, 0],
          [15.2, 4],
          [14.8, 4],
        ],
      ],
    },
    {
      nativeElementId: 2,
      ringsFeet: [
        [
          [14.8, 16],
          [15.2, 16],
          [15.2, 20],
          [14.8, 20],
        ],
      ],
    },
  ];
  project.dataset.walls = evidence.map((e) => ({
    ...e,
    levelId: 1,
    kind: "wall",
  })) as typeof project.dataset.walls;
  const pieces = [4, 8, 12].map<NativeBoundaryPatch>((y, i) => ({
    id: "drawing-piece-" + i,
    levelId: 1,
    sourceModelSha256: model,
    status: "proposed" as const,
    widthFeet: 4,
    ringsFeet: [
      [
        [14.8, y - 0.0002],
        [15.2, y - 0.0002],
        [15.2, y + 4.0002],
        [14.8, y + 4.0002],
      ],
    ],
    wallEvidence: evidence,
    nativeDoorIds: [],
    notes:
      "Independent registered wall faces; source layout and native contacts retained.",
    drawingReconstructionProof: {
      sourceDrawingSha256: "c".repeat(64),
      sectionId: "registered-wall-section",
      evidenceSha256: "d".repeat(64),
      registeredRingsFeet: [
        [
          [14.8, y],
          [15.2, y],
          [15.2, y + 4],
          [14.8, y + 4],
        ],
      ],
      contactAdaptationFeet: 0.0002,
    },
  }));
  for (const piece of pieces)
    piece.sourceModelSha256 = project.dataset.source.modelSha256;
  validateNativeBoundaryPatches(
    { version: 1, patches: pieces },
    project.dataset.source.modelSha256,
  );
  compilerValidate(
    { version: 1, patches: pieces },
    project.dataset.source.modelSha256,
  );
  assert.equal(
    (
      await deriveExactBoundaryPatchGroupPreview(project.dataset, 1, pieces, {
        mode: "connected",
        previewGapIds: pieces.map((p) => p.id),
      })
    ).regions.length,
    2,
  );
  await assert.rejects(
    () =>
      deriveExactBoundaryPatchGroupPreview(project.dataset, 1, [pieces[1]], {
        mode: "connected",
        previewGapIds: [pieces[1].id],
      }),
    /contact both/,
  );
  const bad = structuredClone(pieces[1]);
  bad.ringsFeet[0][1][0] += 0.05;
  bad.ringsFeet[0][2][0] += 0.05;
  assert.throws(() =>
    validateNativeBoundaryPatches({ version: 1, patches: [bad] }, model),
  );
  const door = structuredClone(project.dataset);
  door.doors = [
    {
      levelId: 1,
      footprintFeet: [
        [14.8, 9],
        [15.2, 9],
        [15.2, 10],
        [14.8, 10],
      ],
    },
  ] as typeof door.doors;
  await assert.rejects(
    () =>
      deriveExactBoundaryPatchGroupPreview(door, 1, pieces, {
        mode: "connected",
        previewGapIds: pieces.map((p) => p.id),
      }),
    /protected/,
  );
});
for (const [name, validate] of [
  ["runtime", validateNativeBoundaryPatches],
  ["compiler", compilerValidate],
] as const) {
  test(
    name +
      " requires an exact source cap, axis, full thickness and bounded face contact for a long reconstruction",
    () => {
      const value = { version: 1, patches: [patch()] };
      validate(value, model);
      for (const mutate of [
        (p: NativeBoundaryPatch) => {
          delete p.continuationProof;
        },
        (p: NativeBoundaryPatch) => {
          p.continuationProof!.sourceCapFeet[0][0] = 0.05;
        },
        (p: NativeBoundaryPatch) => {
          p.continuationProof!.targetContactFeet[0][0] = 0.1;
        },
        (p: NativeBoundaryPatch) => {
          p.ringsFeet[0][0][0] = -0.05;
        },
        (p: NativeBoundaryPatch) => {
          p.ringsFeet[0][0][1] = -0.03;
        },
        (p: NativeBoundaryPatch) => {
          p.widthFeet = 11;
        },
        (p: NativeBoundaryPatch) => {
          p.nativeDoorIds = [9];
        },
        (p: NativeBoundaryPatch) => {
          p.manualPointsFeet = [
            [0, 0],
            [0, 12],
          ];
        },
        (p: NativeBoundaryPatch) => {
          p.wallEvidence[0].ringsFeet[0][0][1] = 1;
        },
        (p: NativeBoundaryPatch) => {
          p.ringsFeet[0].reverse();
          [p.ringsFeet[0][0], p.ringsFeet[0][1]] = [
            p.ringsFeet[0][1],
            p.ringsFeet[0][0],
          ];
        },
        (p: NativeBoundaryPatch) => {
          p.continuationProof!.evidenceSha256 = "missing";
        },
      ]) {
        const changed = structuredClone(value);
        mutate(changed.patches[0]);
        assert.throws(
          () => validate(changed, model),
          /Invalid native boundary/,
        );
      }
    },
  );
}
test("measured column contact binds its exact native footprint, retains wall identity and rejects legacy column patches", () => {
  const p = patch(true),
    walls = p.wallEvidence.map((e) => ({
      ...e,
      levelId: 1,
      kind: e.kind ?? "wall",
    }));
  const applied = {
    version: 1 as const,
    patches: [{ ...p, status: "applied" as const }],
  };
  assert.equal(
    reviewedBoundaryWalls(walls, applied, model)[0].nativeElementId,
    1,
  );
  walls[1].ringsFeet = structuredClone(walls[1].ringsFeet);
  walls[1].ringsFeet[0][0][0] -= 0.1;
  assert.throws(
    () => reviewedBoundaryWalls(walls, applied, model),
    /stale native wall evidence/,
  );
  delete applied.patches[0].continuationProof;
  assert.throws(
    () => validateNativeBoundaryPatches(applied, model),
    /Invalid native boundary/,
  );
});

test("long continuation previews a split at its declared column face, but vetoes another column, doorway and floor hole", async () => {
  const project = await gapProject();
  const p = patch(true);
  p.sourceModelSha256 = project.dataset.source.modelSha256;
  const move = (rings: [number, number][][]) =>
    rings.map((r) => r.map(([x, y]) => [x + 14.8, y + 4] as [number, number]));
  p.ringsFeet = move(p.ringsFeet);
  p.wallEvidence[0].ringsFeet = [
    [
      [14.8, 0],
      [15.2, 0],
      [15.2, 4],
      [14.8, 4],
    ],
  ];
  p.wallEvidence[1].ringsFeet = [
    [
      [14.8, 16],
      [15.2, 16],
      [15.2, 20],
      [14.8, 20],
    ],
  ];
  p.continuationProof!.sourceCapFeet = [
    [14.8, 4],
    [15.2, 4],
  ];
  p.continuationProof!.targetContactFeet = [
    [14.8, 16],
    [15.2, 16],
  ];
  project.dataset.walls = p.wallEvidence.map((e) => ({
    ...e,
    levelId: 1,
    kind: e.kind ?? "wall",
  }));
  const preview = () =>
    deriveExactBoundaryPatchGroupPreview(project.dataset, 1, [p], {
      mode: "connected",
      previewGapIds: [p.id],
    });
  assert.equal((await preview()).regions.length, 2);
  const intrusion: [number, number][] = [
    [14.9, 8],
    [15.1, 8],
    [15.1, 9],
    [14.9, 9],
  ];
  project.dataset.walls.push({
    kind: "column",
    levelId: 1,
    nativeElementId: 3,
    ringsFeet: [intrusion],
  });
  await assert.rejects(preview(), /fixture/);
  project.dataset.walls.pop();
  project.dataset.doors = [
    {
      id: "physical-door",
      nativeElementId: 4,
      levelId: 1,
      pointFeet: [15, 8.5],
      footprintFeet: intrusion,
      normalFeet: [1, 0],
      roomKeys: ["0", "1"],
      state: "connected",
    },
  ];
  await assert.rejects(preview(), /measured door/);
  project.dataset.doors = [];
  project.dataset.walkingSupport!.floors[0].ringsFeet.push(intrusion);
  await assert.rejects(preview(), /unsupported floor/);
});

test("separate correction log retains proof and rejects changed continuation evidence", async () => {
  const project = await gapProject(),
    p = patch(true);
  p.sourceModelSha256 = project.dataset.source.modelSha256;
  project.dataset.walls = p.wallEvidence.map((e) => ({
    ...e,
    levelId: 1,
    kind: e.kind ?? "wall",
  }));
  project.rooms.nativeBoundaryPatches = { version: 1, patches: [p] };
  const log = nativeBoundaryPatchFile(project);
  assert.deepEqual(
    log.nativeBoundaryPatches.patches[0].continuationProof,
    p.continuationProof,
  );
  assert.deepEqual(
    importNativeBoundaryPatchFile(project, log).rooms.nativeBoundaryPatches,
    project.rooms.nativeBoundaryPatches,
  );
  log.nativeBoundaryPatches.patches[0].continuationProof!.evidenceSha256 =
    "c".repeat(64);
  assert.throws(() => importNativeBoundaryPatchFile(project, log), /conflict/i);
});

for (const [name, validate] of [
  ["runtime", validateNativeBoundaryPatches],
  ["compiler", compilerValidate],
] as const)
  test(`${name} accepts only the first two native column faces for a full-cap corner continuation`, () => {
    const p: NativeBoundaryPatch = {
      id: "column-corner",
      levelId: 1,
      sourceModelSha256: model,
      status: "proposed",
      widthFeet: 2.2,
      ringsFeet: [
        [
          [1.9998, -0.2],
          [1.9998, 0.2],
          [4.2002, 0.2],
          [4.0002, 0],
          [4.2002, -0.2],
        ],
      ],
      wallEvidence: [
        {
          nativeElementId: 1,
          ringsFeet: [
            [
              [0, -0.2],
              [0, 0.2],
              [2, 0.2],
              [2, -0.2],
            ],
          ],
        },
        {
          nativeElementId: 2,
          kind: "column",
          ringsFeet: [
            [
              [4, 0],
              [5, -1],
              [6, 0],
              [5, 1],
            ],
          ],
        },
      ],
      nativeDoorIds: [],
      notes:
        "Original full cap terminates at the two measured near faces of a rotated column.",
      continuationProof: {
        sourceWallId: 1,
        sourceCapFeet: [
          [2, -0.2],
          [2, 0.2],
        ],
        targetContactFeet: [
          [4.2, -0.2],
          [4.2, 0.2],
        ],
        targetContactPathFeet: [
          [4.2, -0.2],
          [4, 0],
          [4.2, 0.2],
        ],
        evidenceSha256: "b".repeat(64),
      },
    };
    validate({ version: 1, patches: [p] }, model);
    const invalid = structuredClone(p);
    invalid.ringsFeet[0][3] = [4.1, 0];
    assert.throws(() => validate({ version: 1, patches: [invalid] }, model));
    const far = structuredClone(p);
    far.continuationProof!.targetContactPathFeet = [
      [5.8, -0.2],
      [6, 0],
      [5.8, 0.2],
    ];
    far.continuationProof!.targetContactFeet = [
      [5.8, -0.2],
      [5.8, 0.2],
    ];
    far.widthFeet = 3.8;
    far.ringsFeet = [
      [
        [1.9998, -0.2],
        [1.9998, 0.2],
        [5.8002, 0.2],
        [6.0002, 0],
        [5.8002, -0.2],
      ],
    ];
    assert.throws(() => validate({ version: 1, patches: [far] }, model));
    const crossing = structuredClone(p);
    [crossing.ringsFeet[0][2], crossing.ringsFeet[0][3]] = [
      crossing.ringsFeet[0][3],
      crossing.ringsFeet[0][2],
    ];
    assert.throws(() => validate({ version: 1, patches: [crossing] }, model));
  });

for (const [name, validate] of [
  ["runtime", validateNativeBoundaryPatches],
  ["compiler", compilerValidate],
] as const) {
  test(
    name +
      " follows only the first certified convex curved-column face chain at full wall thickness",
    async () => {
      const { readFile } = await import("node:fs/promises");
      const [p] = JSON.parse(
        await readFile(
          new URL("../fixtures/native-curved-column-cap.json", import.meta.url),
          "utf8",
        ),
      ) as NativeBoundaryPatch[];
      validate({ version: 1, patches: [p] }, p.sourceModelSha256);
      const missingCorner = structuredClone(p);
      missingCorner.continuationProof!.targetContactPathFeet!.splice(1, 1);
      assert.throws(() =>
        validate({ version: 1, patches: [missingCorner] }, p.sourceModelSha256),
      );
      const fakeCorner = structuredClone(p);
      fakeCorner.continuationProof!.targetContactPathFeet![1][0] += 0.01;
      assert.throws(() =>
        validate({ version: 1, patches: [fakeCorner] }, p.sourceModelSha256),
      );
      const backwards = structuredClone(p);
      const chain = backwards.continuationProof!.targetContactPathFeet!;
      [chain[1], chain[2]] = [chain[2], chain[1]];
      assert.throws(() =>
        validate({ version: 1, patches: [backwards] }, p.sourceModelSha256),
      );
      const broad = structuredClone(p);
      broad.ringsFeet[0][2][0] += 0.1;
      assert.throws(() =>
        validate({ version: 1, patches: [broad] }, p.sourceModelSha256),
      );
      const concave = structuredClone(p);
      concave.wallEvidence[1].ringsFeet[0][5] =
        concave.wallEvidence[1].ringsFeet[0][0];
      assert.throws(() =>
        validate({ version: 1, patches: [concave] }, p.sourceModelSha256),
      );
    },
  );
}

for (const [name, validate] of [
  ["runtime", validateNativeBoundaryPatches],
  ["compiler", compilerValidate],
] as const) {
  test(
    name +
      " preserves genuine off-cap column notches and certifies only the full first contacted native face chain",
    async () => {
      const { readFile } = await import("node:fs/promises");
      const p = JSON.parse(
        await readFile(
          new URL(
            "../fixtures/native-notched-column-cap.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ) as NativeBoundaryPatch;
      const original = structuredClone(p);
      validate({ version: 1, patches: [p] }, p.sourceModelSha256);
      assert.deepEqual(p, original);
      const missing = structuredClone(p);
      missing.continuationProof!.targetContactPathFeet!.splice(1, 1);
      assert.throws(() =>
        validate({ version: 1, patches: [missing] }, p.sourceModelSha256),
      );
      const selfTouch = structuredClone(p);
      selfTouch.wallEvidence[1].ringsFeet[0][5] = [
        ...selfTouch.wallEvidence[1].ringsFeet[0][0],
      ];
      assert.throws(() =>
        validate({ version: 1, patches: [selfTouch] }, p.sourceModelSha256),
      );
      const unsupported = structuredClone(p);
      unsupported.continuationProof!.targetContactPathFeet![1][0] += 0.01;
      assert.throws(() =>
        validate({ version: 1, patches: [unsupported] }, p.sourceModelSha256),
      );
      const penetration = structuredClone(p);
      penetration.ringsFeet[0][3][0] += 0.1;
      assert.throws(() =>
        validate({ version: 1, patches: [penetration] }, p.sourceModelSha256),
      );
    },
  );
}
