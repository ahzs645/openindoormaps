import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  validatedSourceDoorProof,
  routingDoorApertures,
} from "../../app/indoor-project/routing-apertures";
import { validatedSourceDoorProof as compilerProof } from "../../../reviter/lib/reviter/routing-apertures";
import { nativeDoorFloorBlockers } from "../../app/indoor-project/native-door-floor-support";
import { nativeDoorFloorBlockers as compilerFloorBlockers } from "../../../reviter/lib/reviter/native-door-floor-support";
import {
  recoverRegisteredSourceDoors,
  type SourceDoorFloorSupport,
} from "../../../reviter/lib/reviter/registered-source-doors";

const rect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [[number,number],[number,number],[number,number],[number,number]] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
function fixture() {
  const source = "b".repeat(64),
    model = "a".repeat(64);
  return {
    source: { modelSha256: model },
    nativeIndoorEnvelopes: {},
    records: ["a", "b"].map((key) => ({
      key,
      levelId: 1,
      properties: { dwg: { sha256: source, sectionId: "Drawing" } },
    })),
    nodes: [
      { id: "from", roomKey: "a", levelId: 1, pointFeet: [4, 5, 0] },
      { id: "to", roomKey: "b", levelId: 1, pointFeet: [6, 5, 0] },
    ],
    doors: [],
    edges: [
      {
        id: "source-door",
        kind: "door",
        from: "from",
        to: "to",
        enabled: true,
        accessible: "unknown",
        roomKeys: ["a", "b"],
        pointsFeet: [
          [4, 5, 0],
          [6, 5, 0],
        ],
        sourceDoorProof: {
          version: 1,
          sourceModelSha256: model,
          sourceSha256: source,
          sectionId: "Drawing",
          levelId: 1,
          elevationFeet: 0,
          registrationErrorFeet: 0,
          nativeFloorElementIds: [10],
          wallSegmentIndices: [1, 2],
          doorSymbolCollection: "wallSegments",
          doorSymbolSegmentIndices: [3, 4],
          apertureFeet: rect(4.5, 3.5, 5.5, 6.5),
          walkingStripWidthFeet: 2,
        },
      },
    ],
    walkingSupport: {
      version: 1,
      sourceModelSha256: model,
      floors: [
        {
          nativeElementId: 10,
          elevationFeet: 0,
          ringsFeet: [rect(0, 0, 10, 10)],
        },
      ],
    },
  } as unknown as IndoorDataset;
}

test("original two-owner aperture accepts either ring winding and either original travel orientation without mutating the proof", () => {
  for (const reverse of [false, true])
    for (const reverseRing of [false, true]) {
      const data = fixture(),
        edge = data.edges[0]!;
      if (reverse) {
        [edge.from, edge.to] = [edge.to, edge.from];
        edge.pointsFeet.reverse();
        edge.roomKeys.reverse();
      }
      if (reverseRing) edge.sourceDoorProof!.apertureFeet.reverse();
      const original = JSON.stringify(data);
      assert(validatedSourceDoorProof(data, edge));
      assert(compilerProof(data, edge));
      assert.equal(routingDoorApertures(data).length, 1);
      assert.equal(JSON.stringify(data), original);
    }
});

test("plausible same-source doorway proofs reject relocated apertures, edge-node substitution, unrelated owners and degenerate crossing", () => {
  const changes: [string, (data: IndoorDataset) => void][] = [
    [
      "remote aperture",
      (data) => {
        data.edges[0]!.sourceDoorProof!.apertureFeet = rect(1, 1, 2, 3);
      },
    ],
    [
      "moved original edge endpoint",
      (data) => {
        data.edges[0]!.pointsFeet[0]![0] = 3.9;
      },
    ],
    [
      "moved original node",
      (data) => {
        data.nodes[0]!.pointFeet = [3.9, 5, 0];
      },
    ],
    [
      "foreign node owner",
      (data) => {
        data.nodes[0]!.roomKey = "unrelated-original-room";
      },
    ],
    [
      "same owner on both nodes",
      (data) => {
        data.nodes[1]!.roomKey = "a";
      },
    ],
    [
      "duplicated room ownership",
      (data) => {
        data.edges[0]!.roomKeys = ["a", "a"];
      },
    ],
    [
      "positive tiny endpoint displacement",
      (data) => {
        data.edges[0]!.pointsFeet[0]![0] += 2 ** -40;
      },
    ],
    [
      "nonconvex aperture",
      (data) => {
        data.edges[0]!.sourceDoorProof!.apertureFeet = [
          [4.5, 3.5],
          [5.5, 6.5],
          [5.5, 3.5],
          [4.5, 6.5],
        ];
      },
    ],
    [
      "only corner contact",
      (data) => {
        data.nodes[0]!.pointFeet = [4, 3, 0];
        data.nodes[1]!.pointFeet = [6, 5, 0];
        data.edges[0]!.pointsFeet = [
          data.nodes[0]!.pointFeet,
          data.nodes[1]!.pointFeet,
        ];
      },
    ],
    [
      "path terminates inside aperture",
      (data) => {
        data.nodes[0]!.pointFeet = [5, 5, 0];
        data.edges[0]!.pointsFeet[0] = data.nodes[0]!.pointFeet;
      },
    ],
  ];
  for (const [name, change] of changes) {
    const data = fixture();
    change(data);
    assert.equal(
      validatedSourceDoorProof(data, data.edges[0]!),
      undefined,
      name,
    );
    assert.equal(compilerProof(data, data.edges[0]!), undefined, name);
    assert.equal(routingDoorApertures(data).length, 0, name);
    assert.deepEqual([...nativeDoorFloorBlockers(data)], ["source-door"], name);
  }
});

test("complete original source-door approach keeps positive off-center floor holes outside the aperture and cannot borrow an unrelated proof floor", () => {
  for (const kind of [
    "off-aperture tiny hole",
    "unrelated real proof floor",
  ] as const) {
    const data = fixture();
    if (kind === "off-aperture tiny hole")
      data.walkingSupport!.floors[0]!.ringsFeet.push(
        rect(4.1, 4.2, 4.100000001, 4.3),
      );
    else {
      data.walkingSupport!.floors.push({
        nativeElementId: 11,
        elevationFeet: 0,
        ringsFeet: [rect(20, 20, 30, 30)],
      });
      data.edges[0]!.sourceDoorProof!.nativeFloorElementIds = [11];
    }
    assert.deepEqual([...nativeDoorFloorBlockers(data)], ["source-door"], kind);
    assert.deepEqual(
      nativeDoorFloorBlockers(data),
      compilerFloorBlockers(data),
      kind,
    );
  }
});

test("the independently recovered original Tea Lab drawing doorway still binds its real placed aperture and original opposite-side terminals", () => {
  const source = JSON.parse(
    readFileSync(
      new URL(
        "../../../reviter/tests/fixtures/unbc-source-corridor-door.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const openings = recoverRegisteredSourceDoors(
    source.rooms,
    source.reference,
    source.geometry,
    new Map<string, SourceDoorFloorSupport>(
      source.support.map((s: SourceDoorFloorSupport & { key: string }) => [
        s.key,
        s,
      ]),
    ),
    source.sourceModelSha256,
  );
  assert.equal(openings.length, 1);
  const opening = openings[0]!,
    proof = opening.proof,
    z = proof.elevationFeet,
    from = [...opening.from!, z],
    to = [...opening.to!, z],
    edge = {
      id: opening.sourceDoorId,
      kind: "door",
      from: "original-from",
      to: "original-to",
      roomKeys: opening.rooms,
      enabled: true,
      accessible: "unknown",
      pointsFeet: [from, to],
      sourceDoorProof: proof,
    },
    data = {
      source: { modelSha256: source.sourceModelSha256 },
      records: source.rooms.map(
        (r: { key: string; levelId: number; dwg: unknown }) => ({
          key: r.key,
          levelId: r.levelId,
          properties: { dwg: r.dwg },
        }),
      ),
      nodes: [
        {
          id: edge.from,
          roomKey: opening.rooms[0],
          levelId: proof.levelId,
          pointFeet: from,
        },
        {
          id: edge.to,
          roomKey: opening.rooms[1],
          levelId: proof.levelId,
          pointFeet: to,
        },
      ],
      edges: [edge],
      walkingSupport: {
        version: 1,
        sourceModelSha256: source.sourceModelSha256,
        floors: proof.nativeFloorElementIds.map((nativeElementId) => ({
          nativeElementId,
          elevationFeet: z,
        })),
      },
    } as unknown as IndoorDataset;
  const original = JSON.stringify(data);
  assert(validatedSourceDoorProof(data, data.edges[0]!));
  assert(compilerProof(data, data.edges[0]!));
  assert.equal(JSON.stringify(data), original);
});
