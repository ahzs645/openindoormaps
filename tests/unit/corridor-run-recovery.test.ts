import test from "node:test";
import assert from "node:assert/strict";
import {
  recoverCorridorRuns,
  reconcileCorridorDoorwayStations,
} from "../../app/indoor-project/corridor-run-recovery";
import {
  compareCombinedCorridorGuides,
  type CorridorGuideTopologyInput,
} from "../../app/indoor-project/corridor-guide-contacts";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import { clearance, rect } from "./corridor-run-fixture";
import type { IndoorEdge } from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
type P = [number, number, number];
const a: P = [0, 2, 0],
  b: P = [10, 2, 0],
  m: P = [4, -2, 0],
  left: P = [-4, 0, 0],
  right: P = [14, 0, 0];
const edge = (from: string, to: string, pointsFeet: P[]): IndoorEdge => ({
  id: from + "-" + to,
  from,
  to,
  pointsFeet,
  kind: "walk",
  enabled: true,
  accessible: "unknown",
  roomKeys: [],
  evidence: "fixture",
  lengthMetres: 10,
  nativeCellId: "cell",
});
const edges = [
  edge("L", "A", [left, a]),
  edge("B", "R", [b, right]),
  edge("A", "M", [a, m]),
  edge("M", "B", [m, b]),
];
const guides: PreparedRouting["guides"] = [
  {
    edgeId: "L-A",
    kind: "shared-corridor",
    pointsFeet: [left, [0, 0, 0], a],
    hallwayJoins: [0, 1],
  },
  {
    edgeId: "B-R",
    kind: "shared-corridor",
    pointsFeet: [b, [10, 0, 0], right],
    hallwayJoins: [1, 2],
  },
];
const missing = new Set(["A-M", "M-B"]);
test("a pair of existing walks continues two corridor ends and meets at one normal doorway station", () => {
  const r = recoverCorridorRuns(
    edges,
    guides,
    missing,
    () => [0, 1],
    () => true,
  );
  assert.deepEqual(
    r.map((g) => g.edgeId),
    ["A-M", "M-B"],
  );
  assert.deepEqual(
    r.map((g) => g.pointsFeet),
    [
      [a, [0, 0, 0], [4, 0, 0], m],
      [m, [4, 0, 0], [10, 0, 0], b],
    ],
  );
  assert.deepEqual(
    r.map((g) => g.hallwayJoins),
    [
      [1, 2],
      [1, 2],
    ],
  );
});
test("a failed strip, incomplete source link or missing doorway normal leaves the pair held", () => {
  for (const r of [
    recoverCorridorRuns(
      edges,
      guides,
      missing,
      () => [0, 1],
      (e) => e.id !== "M-B",
    ),
    recoverCorridorRuns(
      edges,
      guides,
      new Set(["A-M"]),
      () => [0, 1],
      () => true,
    ),
    recoverCorridorRuns(
      edges,
      guides,
      missing,
      (): undefined => {},
      () => true,
    ),
  ])
    assert.deepEqual(r, []);
});
test("nearby dead ends pointing across a corner do not imply a straight continuation", () => {
  const rotated: PreparedRouting["guides"] = [
    { ...guides[0], pointsFeet: [[0, -4, 0], [0, 0, 0], a] },
    guides[1],
  ];
  assert.deepEqual(
    recoverCorridorRuns(
      edges,
      rotated,
      missing,
      () => [0, 1],
      () => true,
    ),
    [],
  );
});

test("two guides at one doorway use a single verified hallway junction for through walks", () => {
  const terminal: P = [4, -2, 0];
  const source = [
    edge("L", "M", [left, terminal]),
    edge("M", "R", [terminal, right]),
  ];
  const saved: PreparedRouting["guides"] = [
    {
      edgeId: "L-M",
      kind: "shared-corridor",
      pointsFeet: [left, [0, 0, 0], terminal],
      hallwayJoins: [0, 1],
    },
    {
      edgeId: "M-R",
      kind: "shared-corridor",
      pointsFeet: [terminal, [10, 0, 0], right],
      hallwayJoins: [1, 2],
    },
  ];
  const repair = (deny: string) =>
    recoverCorridorRuns(
      source,
      saved,
      new Set(),
      () => [0, 1],
      (e) => e.id !== deny,
    );
  const corrected = repair("");
  assert.deepEqual(
    corrected.map((g) => g.pointsFeet),
    [
      [left, [0, 0, 0], [4, 0, 0], terminal],
      [terminal, [4, 0, 0], [10, 0, 0], right],
    ],
  );
  assert.deepEqual(
    corrected.map((g) => g.hallwayJoins),
    [
      [0, 2],
      [1, 3],
    ],
  );
  assert.deepEqual(repair("M-R"), []);
});

function throughStationFixture() {
  const terminal: P = [0, -2, 0],
    west: P = [-6, 0, 0],
    east: P = [6, 0, 0];
  const source = [
    edge("east", "door", [east, terminal]),
    edge("door", "west", [terminal, west]),
    edge("east", "west", [east, west]),
  ];
  const saved: PreparedRouting["guides"] = [
    {
      edgeId: source[0].id,
      kind: "shared-corridor",
      pointsFeet: [east, [5, 0, 0], [0.4, 0, 0], terminal],
      hallwayJoins: [1, 2],
    },
    {
      edgeId: source[1].id,
      kind: "shared-corridor",
      pointsFeet: [terminal, [0, 0, 0], [-5, 0, 0], west],
      hallwayJoins: [1, 2],
    },
    {
      edgeId: source[2].id,
      kind: "shared-corridor",
      pointsFeet: [east, [5, 0.2, 0], [0, 0, 0], [-5, 0, 0], west],
      hallwayJoins: [1, 3],
    },
  ];
  const origins = new Map([
    [source[0].id, "primary:0"],
    [source[1].id, "legacy:0"],
    [source[2].id, "legacy:0"],
  ]);
  const physical = clearance(
    nativeRationalOverlay("union", [[rect(-8, -3, 16, 6)]]),
  );
  const replayed: string[] = [];
  const qualifies = (
    e: IndoorEdge,
    guide: PreparedRouting["guides"][number],
  ) => {
    replayed.push(e.id);
    return physical(guide.pointsFeet.map(([x, y]) => [x, y]));
  };
  const options = { origins, maxStationShiftFeet: 0.75 };
  const normal = (id: string) => (id === "door" ? [0, 1] : undefined);
  const topology = (
    changes: PreparedRouting["guides"] = [],
  ): CorridorGuideTopologyInput => {
    const changed = new Map(changes.map((guide) => [guide.edgeId, guide]));
    return {
      guides: saved.map((guide) => changed.get(guide.edgeId) ?? guide),
      edges: new Map(source.map((e) => [e.id, e])),
      origins: new Map(
        [...origins].map(([id, origin]) => [
          id,
          changed.has(id) ? `refined:${id}` : origin,
        ]),
      ),
    };
  };
  return { source, saved, options, normal, qualifies, replayed, topology };
}

test("one original doorway reuses a checked through-station after atomic whole-guide replay", () => {
  const f = throughStationFixture();
  const before = structuredClone({ source: f.source, saved: f.saved });
  const result = reconcileCorridorDoorwayStations(
    f.source,
    f.saved,
    f.normal,
    f.qualifies,
    f.options,
  );
  assert.deepEqual(
    result.guides.map((guide) => guide.edgeId),
    ["east-door"],
  );
  assert.deepEqual(f.replayed.sort(), ["door-west", "east-door", "east-west"]);
  assert.equal(result.junctions.length, 1);
  assert.equal(result.junctions[0].terminalId, "door");
  assert.deepEqual(result.junctions[0].pointFeet, [0, 0, 0]);
  const changed = result.guides.find((guide) => guide.edgeId === "east-door")!;
  assert.deepEqual(changed.pointsFeet, [
    [6, 0, 0],
    [5, 0, 0],
    [0, 0, 0],
    [0, -2, 0],
  ]);
  assert.deepEqual(changed.hallwayJoins, [1, 2]);
  for (const guide of result.guides) {
    const original = f.source.find((e) => e.id === guide.edgeId)!;
    assert.deepEqual(guide.pointsFeet[0], original.pointsFeet[0]);
    assert.deepEqual(guide.pointsFeet.at(-1), original.pointsFeet.at(-1));
  }
  const control = f.topology();
  const candidate = {
    ...f.topology(result.guides),
    junctions: result.junctions,
  };
  assert.deepEqual(compareCombinedCorridorGuides(control, candidate), {
    missingGuideIds: [],
    newContacts: [],
  });
  assert.ok(
    compareCombinedCorridorGuides(control, { ...candidate, junctions: [] })
      .newContacts.length > 0,
    "The same geometry needs actual junction provenance to pass the final guard",
  );
  assert.deepEqual({ source: f.source, saved: f.saved }, before);
});

test("reconciliation preserves reverse direction and exact original source endpoints", () => {
  const f = throughStationFixture();
  const forward = reconcileCorridorDoorwayStations(
    f.source,
    f.saved,
    f.normal,
    f.qualifies,
    f.options,
  );
  const source = f.source.map((e) => ({
    ...e,
    from: e.to,
    to: e.from,
    pointsFeet: e.pointsFeet.toReversed(),
  }));
  const saved = f.saved.map((guide) => {
    const [a, b] = guide.hallwayJoins!;
    const last = guide.pointsFeet.length - 1;
    return {
      ...guide,
      pointsFeet: guide.pointsFeet.toReversed(),
      hallwayJoins: [last - b, last - a] as [number, number],
    };
  });
  const reverse = reconcileCorridorDoorwayStations(
    source,
    saved,
    f.normal,
    f.qualifies,
    f.options,
  );
  assert.equal(reverse.guides.length, forward.guides.length);
  for (const guide of forward.guides) {
    const other = reverse.guides.find((g) => g.edgeId === guide.edgeId)!;
    const [a, b] = guide.hallwayJoins!;
    const last = guide.pointsFeet.length - 1;
    assert.deepEqual(other.pointsFeet, guide.pointsFeet.toReversed());
    assert.deepEqual(other.hallwayJoins, [last - b, last - a]);
  }
});

test("one failed incident or receiving guide leaves the whole doorway reconciliation held", () => {
  for (const refused of ["east-door", "door-west", "east-west"]) {
    const f = throughStationFixture();
    const before = structuredClone(f.saved);
    const result = reconcileCorridorDoorwayStations(
      f.source,
      f.saved,
      f.normal,
      (e, guide) => e.id !== refused && f.qualifies(e, guide),
      f.options,
    );
    assert.deepEqual(result, { guides: [], junctions: [] });
    assert.deepEqual(f.saved, before);
  }
});

test("nearby or differently owned stations and missing source evidence cannot create a junction", () => {
  const cases: ((f: ReturnType<typeof throughStationFixture>) => void)[] = [
    (f) => {
      f.source[1].from = "another-door";
    },
    (f) => {
      f.source[2].to = "coincident-other-west";
    },
    (f) => {
      f.options.origins.set("east-west", "primary:9");
    },
    (f) => {
      f.options.origins.set("door-west", "refined:door-west");
    },
    (f) => {
      f.options.maxStationShiftFeet = 0.1;
    },
    (f) => {
      f.source[2].enabled = false;
    },
    (f) => {
      f.source[2].nativeCellId = "other-cell";
    },
  ];
  for (const change of cases) {
    const f = throughStationFixture();
    change(f);
    assert.deepEqual(
      reconcileCorridorDoorwayStations(
        f.source,
        f.saved,
        f.normal,
        f.qualifies,
        f.options,
      ),
      { guides: [], junctions: [] },
    );
  }
  const f = throughStationFixture();
  assert.deepEqual(
    reconcileCorridorDoorwayStations(
      f.source,
      f.saved,
      (): undefined => {},
      f.qualifies,
      f.options,
    ),
    { guides: [], junctions: [] },
  );
});

test("forged, changed, or stale junction receipts do not waive mixed-network contacts", () => {
  const f = throughStationFixture();
  const result = reconcileCorridorDoorwayStations(
    f.source,
    f.saved,
    f.normal,
    f.qualifies,
    f.options,
  );
  const control = f.topology();
  const candidate = {
    ...f.topology(result.guides),
    junctions: result.junctions,
  };
  assert.ok(
    compareCombinedCorridorGuides(control, {
      ...candidate,
      junctions: structuredClone(result.junctions),
    }).newContacts.length > 0,
  );
  const stale = {
    ...candidate,
    guides: structuredClone(candidate.guides),
  };
  stale.guides.find(
    (guide) => guide.edgeId === "east-door",
  )!.pointsFeet[1][0] += 0.1;
  assert.ok(
    compareCombinedCorridorGuides(control, stale).newContacts.length > 0,
  );
  const changedSource = {
    ...candidate,
    edges: new Map(candidate.edges),
  };
  changedSource.edges.set("east-door", { from: "east", to: "other-door" });
  assert.ok(
    compareCombinedCorridorGuides(control, changedSource).newContacts.length >
      0,
  );
  result.junctions[0].terminalId = "forged-door";
  assert.ok(
    compareCombinedCorridorGuides(control, candidate).newContacts.length > 0,
  );
});

test("a verified station does not authorize another guide merely crossing its coordinate", () => {
  const f = throughStationFixture();
  const result = reconcileCorridorDoorwayStations(
    f.source,
    f.saved,
    f.normal,
    f.qualifies,
    f.options,
  );
  const control = f.topology();
  const candidate = {
    ...f.topology(result.guides),
    junctions: result.junctions,
  };
  const outsider = edge("outsider-a", "outsider-b", [
    [0, -1, 0],
    [0, 1, 0],
  ]);
  candidate.edges = new Map([...candidate.edges, [outsider.id, outsider]]);
  candidate.guides.push({
    edgeId: outsider.id,
    pointsFeet: outsider.pointsFeet,
    kind: "shared-corridor",
    hallwayJoins: [0, 1],
  });
  candidate.origins = new Map([
    ...candidate.origins,
    [outsider.id, "primary:10"],
  ]);
  assert.ok(
    compareCombinedCorridorGuides(control, candidate).newContacts.some(
      (contact) => contact.edgeIds.includes(outsider.id),
    ),
  );
});
