import assert from "node:assert/strict";
import test from "node:test";
import { prepareCirculationLabelPassages } from "../../app/indoor-project/circulation-label-passage";
import { isHorizontalCirculationAnnotation } from "../../app/indoor-project/horizontal-circulation-annotations";
import { circulationDoorGuideJoins } from "../../app/indoor-project/circulation-door-guide-joins";
import {
  sharedDoorChord,
  chordFitsFiniteDoor,
} from "../../app/indoor-project/shared-door-crossing";
import type {
  IndoorDataset,
  IndoorRecord,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import type { PathwayArc } from "../../app/indoor-project/shared-pathway-routing";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
type Point = [number, number, number];
type Guide = PreparedRouting["guides"][number];

const source = {
  modelSha256:
    "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
  roomsSha256:
    "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9",
} as IndoorDataset["source"];
test("circulation labels preserve actual service and office destinations and bind manual classifications", () => {
  const room = {
    key: "k",
    number: "09-318",
    name: "Corridor",
    building: "09",
    levelId: 694,
    circulation: true,
    stair: false,
  } as IndoorRecord;
  assert.ok(isHorizontalCirculationAnnotation({ source }, room));
  for (const name of ["Reception", "Office", "Elevator Lobby", "Ramps"])
    assert.ok(
      !isHorizontalCirculationAnnotation({ source }, { ...room, name }),
    );
  for (const [key, number, name] of [
    ["rm-694-3b62e4fee0f2", "08-245", "Storage"],
    ["rm-694-44498dfee60e", "08-249", "Office"],
  ]) {
    const area = {
      ...room,
      key,
      number,
      name,
      building: "08",
      circulation: false,
    };
    assert.ok(isHorizontalCirculationAnnotation({ source }, area));
    assert.ok(
      !isHorizontalCirculationAnnotation(
        { source: { ...source, roomsSha256: "new source" } },
        area,
      ),
    );
  }
});

function hallway(labelPoint: Point, widthFits: boolean, count = 2) {
  const room = {
    key: "room",
    name: "Corridor",
    number: "09-318",
    building: "09",
    walkable: true,
    access: "public",
    circulation: true,
    arrivalNodeId: "label",
  } as IndoorRecord;
  const sourceVertex = JSON.stringify(["label"]);
  const edges = Array.from(
    { length: count },
    (_, i) =>
      ({
        id: String(i),
        kind: "walk",
        enabled: true,
        nativeCellId: "cell",
        from: "label",
        to: String(i),
      }) as IndoorEdge,
  );
  const data = { source, records: [room], edges } as IndoorDataset;
  const incoming = new Map<string, PathwayArc[]>(),
    outgoing = new Map<string, PathwayArc[]>();
  const arcs: PathwayArc[] = [];
  for (const [i, edge] of edges.entries())
    for (const forward of [true, false]) {
      const stop: Point = [i * 8, 0, 0];
      const arc: PathwayArc = {
        from: forward ? String(i) : sourceVertex,
        to: forward ? sourceVertex : String(i),
        sourceFrom: "label",
        sourceTo: "label",
        link: {
          edge,
          to: forward ? edge.to : edge.from,
          requiredRooms: [],
          passages: [],
          blockers: [],
        },
        points: forward ? [stop, labelPoint] : [labelPoint, stop],
        metres: Math.hypot(stop[0] - labelPoint[0], labelPoint[1]),
      };
      outgoing.set(arc.from, [...(outgoing.get(arc.from) ?? []), arc]);
      incoming.set(arc.to, [...(incoming.get(arc.to) ?? []), arc]);
      arcs.push(arc);
    }
  const check = prepareCirculationLabelPassages(
    data,
    outgoing,
    incoming,
    new Set(edges.map((e) => e.id)),
    () => widthFits,
    1,
  );
  return { arcs, outgoing, incoming, check };
}

test("the through line ignores the location of its incidental hallway label in either direction", () => {
  const lines = (
    [
      [1, 3, 0],
      [4, -9, 0],
    ] as Point[]
  ).map((p) => {
    const { arcs, check } = hallway(p, true);
    assert.ok(arcs.every(check));
    return arcs.map((a) => a.points);
  });
  assert.deepEqual(lines[0], lines[1]);
  assert.deepEqual(lines[0][0], [
    [0, 0, 0],
    [4, 0, 0],
  ]);
  assert.deepEqual(lines[0][3], [
    [4, 0, 0],
    [8, 0, 0],
  ]);
});
test("failed body replay restores every original arc; a junction with a third branch retains the original geometry", () => {
  const p: Point = [2, 3, 0],
    proposed = hallway(p, false);
  assert.ok(!proposed.check(proposed.arcs[0]));
  assert.ok(proposed.arcs.every((a) => a.points.includes(p)));
  assert.ok(hallway(p, true, 3).arcs.every((a) => a.points.includes(p)));
});
test("a leaf whose sole purpose is reaching the circulation annotation is omitted", () => {
  const graph = hallway([1, 2, 0], true, 1);
  assert.ok(
    [...graph.incoming.values(), ...graph.outgoing.values()].every(
      (ls) => !ls.length,
    ),
  );
});
test("the 1513778 split on the vestibule guide can release while the office-side junction stays", () => {
  const far: Point = [46.218612121881165, 525.551551891907, 0];
  const old: Point = [47.710401954725306, 520.649978593422, 0];
  const south: Point = [45.71586944744339, 515.6983605305419, 0];
  const portals: Point[] = [
    [46.654053789444035, 519.0678924587272, 0],
    [45.45277547092939, 517.2687453270375, 0],
  ];
  const opening: [number, number][] = [
    [43.43792050436429, 517.9324078430277],
    [46.938576672343295, 517.9324078430277],
    [46.938576672343295, 518.4901506251799],
    [43.43792050436429, 518.4901506251799],
  ];
  const label = {
    key: "vest",
    name: "Vestibule",
    circulation: true,
    walkable: true,
    access: "public",
    arrivalNodeId: "arrival:vest",
  } as IndoorRecord;
  const door = {
    id: "door:694:1513778",
    from: "north",
    to: "south",
    kind: "door",
    enabled: true,
  } as IndoorEdge;
  const data = {
    source,
    records: [
      label,
      {
        ...label,
        key: "corr",
        name: "Corridor",
        arrivalNodeId: "arrival:corr",
      },
    ],
    doors: [
      {
        id: door.id,
        roomKeys: ["vest", "corr"],
        state: "connected",
        hostWallNativeElementId: 1513630,
      },
    ],
  } as IndoorDataset;
  const edges = new Map([[door.id, door]]),
    guides = new Map<string, Guide>();
  const add = (
    id: string,
    from: string,
    to: string,
    pointsFeet: Point[],
    hallwayJoins: [number, number],
  ) => {
    edges.set(id, { id, from, to, nativeCellId: "cell" } as IndoorEdge);
    guides.set(id, {
      edgeId: id,
      pointsFeet,
      hallwayJoins,
      kind: "shared-corridor",
    } as Guide);
  };
  add(
    "vest",
    "north",
    "arrival:vest",
    [portals[0], old, far, [47, 530, 0]],
    [1, 2],
  );
  add("next", "interior", "arrival:vest", [[48, 533, 0], far], [0, 1]);
  add(
    "office",
    "south",
    "office-door",
    [portals[1], south, [46, 510, 0]],
    [1, 2],
  );
  add("side", "side-door", "arrival:corr", [[40, 513, 0], south], [0, 1]);
  const changes = circulationDoorGuideJoins(data, guides, edges);
  assert.deepEqual([...changes.keys()], ["vest"]);
  assert.deepEqual(changes.get("vest")?.guide.hallwayJoins, [2, 2]);
  assert.ok(!chordFitsFiniteDoor(old, south, opening, [0, 1]));
  assert.ok(sharedDoorChord(far, south, [0, 1], portals));
  assert.ok(chordFitsFiniteDoor(far, south, opening, [0, 1]));
});
