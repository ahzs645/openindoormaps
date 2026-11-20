import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compareCombinedCorridorGuides,
  retainedCorridorGuidePaths,
  type CorridorGuideTopologyInput,
} from "../../app/indoor-project/corridor-guide-contacts";

type XY = [number, number];
function input(
  rows: {
    id: string;
    path: XY[];
    origin?: string;
    from?: string;
    to?: string;
  }[],
): CorridorGuideTopologyInput {
  return {
    guides: rows.map(({ id, path }) => ({
      edgeId: id,
      kind: "shared-corridor",
      pointsFeet: path.map(([x, y]) => [x, y, 20]),
      hallwayJoins: [0, path.length - 1],
    })),
    edges: new Map(
      rows.map(({ id, from, to }) => [
        id,
        { from: from ?? `${id}:a`, to: to ?? `${id}:b` },
      ]),
    ),
    origins: new Map(
      rows.flatMap(({ id, origin }) =>
        origin === undefined ? [] : [[id, origin] as const],
      ),
    ),
  };
}

test("retained paths include full legacy/refined/other-part guides with original terminal identities", () => {
  const control = input([
    {
      id: "own",
      path: [
        [0, 0],
        [5, 0],
      ],
      origin: "primary:0",
    },
    {
      id: "legacy",
      path: [
        [-1, 1],
        [0, 1],
        [5, 1],
        [6, 1],
      ],
      origin: "legacy:0",
      from: "original-door:a",
      to: "original-door:b",
    },
    {
      id: "refined",
      path: [
        [0, 2],
        [5, 2],
      ],
      origin: "refined:refined",
    },
    {
      id: "other-part",
      path: [
        [0, 3],
        [5, 3],
      ],
      origin: "primary:1",
    },
    {
      id: "unknown",
      path: [
        [0, 4],
        [5, 4],
      ],
    },
  ]);
  control.guides.find((guide) => guide.edgeId === "legacy")!.hallwayJoins = [
    1, 2,
  ];
  const before = structuredClone(control);
  const retained = retainedCorridorGuidePaths(control, "primary:0");
  assert.deepEqual(
    retained.map((path) => path.id),
    ["legacy", "other-part", "refined", "unknown"],
  );
  assert.deepEqual(retained[0], {
    id: "legacy",
    from: "original-door:a",
    to: "original-door:b",
    points: [
      [-1, 1],
      [0, 1],
      [5, 1],
      [6, 1],
    ],
  });
  assert.deepEqual(control, before);
});

test("a new mixed-network crossing is refused even when another crossing disappears", () => {
  const primary = {
    id: "hall",
    path: [
      [0, 0],
      [10, 0],
    ] as XY[],
    origin: "primary:0",
  };
  const before = input([
    primary,
    {
      id: "fallback",
      path: [
        [2, -2],
        [2, 2],
      ],
      origin: "legacy:0",
    },
  ]);
  const after = input([
    primary,
    {
      id: "fallback",
      path: [
        [8, -2],
        [8, 2],
      ],
      origin: "legacy:0",
    },
  ]);
  const result = compareCombinedCorridorGuides(before, after);
  assert.equal(result.newContacts.length, 1);
  assert.deepEqual(result.newContacts[0].edgeIds, ["fallback", "hall"]);
  assert.equal(result.newContacts[0].at, "8/1,0/1:8/1,0/1");
});

test("existing mixed-network contacts retain their exact location independently of guide order", () => {
  const rows = [
    {
      id: "hall",
      path: [
        [0, 0],
        [10, 0],
      ] as XY[],
      origin: "primary:0",
    },
    {
      id: "fallback",
      path: [
        [2, -2],
        [2, 2],
      ] as XY[],
      origin: "legacy:0",
    },
  ];
  assert.deepEqual(
    compareCombinedCorridorGuides(input(rows), input(rows.toReversed())),
    {
      missingGuideIds: [],
      newContacts: [],
    },
  );
});

test("a touch or overlap between different networks is also a topology contact", () => {
  const hall = {
    id: "hall",
    path: [
      [0, 0],
      [10, 0],
    ] as XY[],
    origin: "primary:0",
  };
  const before = input([hall]);
  for (const path of [
    [
      [5, 0],
      [5, 2],
    ],
    [
      [3, 0],
      [7, 0],
    ],
  ] as XY[][]) {
    const after = input([hall, { id: "fallback", path, origin: "legacy:0" }]);
    assert.equal(
      compareCombinedCorridorGuides(before, after).newContacts.length,
      1,
    );
  }
});

test("true original terminal identity permits contact; coincident coordinates alone do not", () => {
  const hall = {
    id: "hall",
    path: [
      [0, 0],
      [10, 0],
    ] as XY[],
    origin: "primary:0",
    to: "door:1",
  };
  const branch = {
    id: "branch",
    path: [
      [10, 0],
      [10, 5],
    ] as XY[],
    origin: "legacy:0",
  };
  const before = input([hall]);
  assert.equal(
    compareCombinedCorridorGuides(before, input([hall, branch])).newContacts
      .length,
    1,
  );
  assert.equal(
    compareCombinedCorridorGuides(
      before,
      input([hall, { ...branch, from: "door:1" }]),
    ).newContacts.length,
    0,
  );
});

test("shared routes within one checked network keep that network's own topology acceptance", () => {
  const before = input([
    {
      id: "a",
      path: [
        [0, 0],
        [10, 0],
      ],
      origin: "primary:0",
    },
    {
      id: "b",
      path: [
        [2, 0],
        [8, 0],
      ],
      origin: "primary:0",
    },
  ]);
  const after = input([
    {
      id: "a",
      path: [
        [0, 1],
        [10, 1],
      ],
      origin: "primary:0",
    },
    {
      id: "b",
      path: [
        [2, 1],
        [8, 1],
      ],
      origin: "primary:0",
    },
  ]);
  assert.equal(
    compareCombinedCorridorGuides(before, after).newContacts.length,
    0,
  );
});

test("post-compile recovered geometry cannot borrow its former network's acceptance", () => {
  const hall = {
    id: "hall",
    path: [
      [0, 0],
      [10, 0],
    ] as XY[],
    origin: "primary:0",
  };
  const before = input([
    hall,
    {
      id: "recovered",
      path: [
        [5, 1],
        [5, 2],
      ],
      origin: "primary:0",
    },
  ]);
  const after = input([
    hall,
    {
      id: "recovered",
      path: [
        [5, -1],
        [5, 2],
      ],
      origin: "refined:recovered",
    },
  ]);
  assert.equal(
    compareCombinedCorridorGuides(before, after).newContacts.length,
    1,
  );
});

test("lost guides and self contacts cannot be hidden by origin grouping", () => {
  const before = input([
    {
      id: "a",
      path: [
        [0, 0],
        [1, 1],
      ],
      origin: "primary:0",
    },
  ]);
  assert.deepEqual(
    compareCombinedCorridorGuides(before, input([])).missingGuideIds,
    ["a"],
  );
  const loop = input([
    {
      id: "a",
      path: [
        [0, 0],
        [2, 2],
        [0, 2],
        [2, 0],
      ],
      origin: "primary:0",
    },
  ]);
  assert.equal(
    compareCombinedCorridorGuides(before, loop).newContacts.length,
    1,
  );
});

test("current UNBC cell 918 rejects its three new contacts with the unchanged legacy guide", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/corridor-mixed-network-unbc-918.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const edges = new Map<string, { from: string; to: string }>(
    fixture.edges.map((edge: { id: string; from: string; to: string }) => [
      edge.id,
      edge,
    ]),
  );
  const side = (name: "control" | "candidate"): CorridorGuideTopologyInput => ({
    guides: fixture[name].guides,
    origins: new Map(fixture[name].origins),
    edges,
  });
  const control = side("control"),
    candidate = side("candidate");
  const legacy = [...control.origins].find(
    ([, origin]) => origin === "legacy:0",
  )![0];
  assert.deepEqual(
    candidate.guides.find((guide) => guide.edgeId === legacy),
    control.guides.find((guide) => guide.edgeId === legacy),
    "The fallback is unchanged; fitting the other guides introduces the contacts",
  );
  const comparison = compareCombinedCorridorGuides(control, candidate);
  assert.deepEqual(comparison.missingGuideIds, []);
  assert.equal(comparison.newContacts.length, 3);
  assert.ok(
    comparison.newContacts.every((contact) => contact.edgeIds.includes(legacy)),
  );
});
