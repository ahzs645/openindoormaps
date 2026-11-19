import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  sharedDoorChord,
  centeredDoorThreshold,
  prepareSharedDoorCrossings,
  chordFitsFiniteDoor,
} from "../../app/indoor-project/shared-door-crossing";
import { straightenSharedDoorGuideBends } from "../../app/indoor-project/shared-door-guide-bend";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
type P = [number, number, number];
test("split a common cross-hall chord at the two original longitudinal portal stations", () => {
  const a: P = [0, 0, 0],
    b: P = [10, 1, 0],
    portals: P[] = [
      [4, 5, 0],
      [6, 4, 0],
    ];
  assert.deepEqual(sharedDoorChord(a, b, [1, 0], portals), [
    [4, 0.4, 0],
    [6, 0.6, 0],
  ]);
  assert.ok(!sharedDoorChord(a, b, [1, 0], portals.toReversed()));
  assert.ok(!sharedDoorChord(a, [10, 1, 2], [1, 0], portals));
  assert.ok(
    !sharedDoorChord(
      a,
      b,
      [1, 0],
      [
        [0, 1, 0],
        [7, 1, 0],
      ],
    ),
  );
});
test("the entire finite width fits between both jambs even when adjacent floor is open", () => {
  const gate: [number, number][] = [
    [4, -1.5],
    [6, -1.5],
    [6, 1.5],
    [4, 1.5],
  ];
  assert.ok(chordFitsFiniteDoor([0, 0, 0], [10, 0, 0], gate, [1, 0]));
  assert.ok(chordFitsFiniteDoor([10, 0, 0], [0, 0, 0], gate, [1, 0]));
  assert.ok(!chordFitsFiniteDoor([0, -0.6, 0], [10, -0.6, 0], gate, [1, 0]));
  assert.ok(!chordFitsFiniteDoor([5, -5, 0], [5, 5, 0], gate, [1, 0]));
});
test("an offset raw door keeps both longitudinal stations on its center normal in either direction", () => {
  const opening: [number, number][] = [
    [0, -1.75],
    [0.5, -1.75],
    [0.5, 1.75],
    [0, 1.75],
  ];
  const raw: P[] = [
    [-0.6, 1.5, 7],
    [1.2, 0.5, 7],
  ];
  const center = centeredDoorThreshold(raw, opening, [2, 0])!;
  assert.deepEqual(center, [
    [-0.6, 0, 7],
    [1.2, 0, 7],
  ]);
  assert.deepEqual(
    centeredDoorThreshold(raw.toReversed(), opening, [-1, 0]),
    center.toReversed(),
  );
  assert.equal(chordFitsFiniteDoor(raw[0], raw[1], opening, [1, 0]), false);
  assert.equal(
    chordFitsFiniteDoor(center[0], center[1], opening, [1, 0]),
    true,
  );
});

test("a corridor door with an invalid finite raw strip stays held when its approach is missing", () => {
  const data: IndoorDataset = JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  );
  const door = data.doors![0];
  const edge = data.edges.find((e) => e.id === door.id)!;
  door.hostWallNativeElementId = 101;
  edge.nativeElementId = door.nativeElementId;
  door.normalFeet = [0, 1];
  const held = () =>
    prepareSharedDoorCrossings(
      data,
      new Map(),
      new Map(),
      new Map(),
      new Set(),
      0.3048,
    ).held(edge);
  assert.equal(held(), false);
  edge.pointsFeet = [
    [6.5, 7.5, 0],
    [6.5, 8.5, 0],
  ];
  assert.equal(held(), true);
});

test("remove a common bend once from every contributing guide, retaining stops, forks and failed witnesses", () => {
  const points: P[] = [
    [-1, 0, 0],
    [0, 0, 0],
    [1, 3, 0],
    [3, 0, 0],
    [4, 0, 0],
  ];
  const draft = (
    id: string,
    p: P[] = points,
  ): PreparedRouting["guides"][number] => ({
    edgeId: id,
    kind: "shared-corridor",
    pointsFeet: p,
    hallwayJoins: [1, 3],
  });
  const edges = ["a", "b"].map(
    (id) => ({ id, from: "gate", to: id }) as IndoorEdge,
  );
  const first = draft("a"),
    second = draft("b");
  const run = (gs: (typeof first)[], allowed = (_edge: IndoorEdge) => true) =>
    straightenSharedDoorGuideBends(edges, gs, (k) => k === "gate", allowed);
  const changed = run([first, second]);
  assert.deepEqual(changed[0].pointsFeet, [
    points[0],
    points[1],
    points[3],
    points[4],
  ]);
  assert.deepEqual(changed[0].hallwayJoins, [1, 2]);
  assert.deepEqual(changed[0].pointsFeet, changed[1].pointsFeet);
  assert.deepEqual(
    run([first, second], (e) => e.id === "a"),
    [first, second],
  );
  const fork = draft("b", [...points.slice(0, 3), [4, 2, 0], points[4]]);
  assert.deepEqual(run([first, fork]), [first, fork]);
  const stop = { ...second, hallwayJoins: [2, 3] as [number, number] };
  assert.deepEqual(run([first, stop]), [first, stop]);
});

const source = process.env.UNBC_PATHWAY_MASTER,
  prepared = process.env.UNBC_PATHWAY_GUIDES;
test(
  "09-374 and 09-373 use the same finite, straight native door crossing in either direction",
  { skip: !source || !prepared },
  async () => {
    const { readFileSync } = await import("node:fs");
    const { initializeNativeExactGeosOverlay } = await import(
      "../../app/indoor-project/native-exact-geos-overlay"
    );
    const { createImmutableRoutingSession } = await import(
      "../../app/indoor-project/routing-cache"
    );
    const { withPreparedRouting } = await import(
      "../../app/indoor-project/prepared-routing"
    );
    const { routeWorkerDataset } = await import(
      "../../app/indoor-project/route-worker-dataset"
    );
    const { createSharedPathwayNetwork } = await import(
      "../../app/indoor-project/shared-pathway-routing"
    );
    await initializeNativeExactGeosOverlay();
    const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
    const d = routeWorkerDataset(
      withPreparedRouting(read(source!), read(prepared!)),
    );
    createImmutableRoutingSession(d)(() => {
      const network = createSharedPathwayNetwork(d);
      const key = (n: string) => d.records.find((r) => r.number === n)!.key;
      const run = (a: string, b: string) =>
        network.journey(key(a), key(b), {
          endpointMode: "pathway",
          allowOtherRoomTransit: false,
        })!;
      const forward = run("09-374", "09-373"),
        reverse = run("09-373", "09-374");
      const at = (r: typeof forward) => {
        assert.ok(r.doorEdgeIds?.includes("door:694:1522476"));
        const i = r.paths.findIndex((p) =>
          p.edgeIds.includes("door:694:1522476"),
        );
        return [
          r.paths[i - 1].pointsFeet.at(-2)!,
          ...r.paths[i].pointsFeet,
          r.paths[i + 1].pointsFeet[1],
        ];
      };
      const lane = at(forward);
      assert.deepEqual(lane, at(reverse).reverse());
      const dx = lane.at(-1)![0] - lane[0][0],
        dy = lane.at(-1)![1] - lane[0][1];
      for (const p of lane.slice(1, -1))
        assert.ok(
          Math.abs(dx * (p[1] - lane[0][1]) - dy * (p[0] - lane[0][0])) < 1e-10,
        );
      assert.deepEqual(
        forward.departure?.pointFeet,
        reverse.arrival?.pointFeet,
      );
      assert.deepEqual(
        forward.arrival?.pointFeet,
        reverse.departure?.pointFeet,
      );
      assert.ok(
        Math.abs(forward.distanceMetres - reverse.distanceMetres) < 1e-9,
      );
    });
  },
);
