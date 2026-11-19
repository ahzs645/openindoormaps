import { matchedRoomDoorCaps } from "../../app/indoor-project/native-room-door-junction";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { wallNormalJoin } from "../../app/indoor-project/room-pathway-branch";
import {
  splitPathwayCore,
  type PathwayCut,
} from "../../app/indoor-project/pathway-station";
import { createSharedPathwayNetwork } from "../../app/indoor-project/shared-pathway-routing";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { withPreparedRouting } from "../../app/indoor-project/prepared-routing";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
type XYZ = [number, number, number];
test("a fixed native wall normal must meet the saved finite segment in front of the room", () => {
  const p: XYZ = [2, -1, 0],
    a: XYZ = [0, 2, 0],
    b: XYZ = [4, 2, 0];
  assert.deepEqual(wallNormalJoin(p, [0, 1], a, b), {
    point: [2, 2, 0],
    fraction: 0.5,
    distance: 3,
  });
  assert.equal(wallNormalJoin([5, -1, 0], [0, 1], a, b), null);
  assert.equal(wallNormalJoin(p, [0, -1], a, b), null);
  assert.equal(wallNormalJoin(p, [0, 1], [0, 2, 1], [4, 2, 1]), null);
});
test("two stations on one original segment keep their shared subsegment and all physical corners", () => {
  const pts: XYZ[] = [
    [0, 0, 0],
    [4, 0, 0],
    [4, 6, 0],
    [9, 6, 0],
  ];
  const c = (
    id: string,
    segment: number,
    fraction: number,
    point: XYZ,
  ): PathwayCut => ({ id, node: id, segment, fraction, point });
  const a = c("start", 0, 0, pts[0]),
    b = c("end", 2, 1, pts[3]),
    m = c("first", 1, 0.25, [4, 1.5, 0]),
    n = c("second", 1, 0.75, [4, 4.5, 0]);
  assert.deepEqual(
    splitPathwayCore(pts, a, b, [n, m]).map((p) => p.points),
    [
      [pts[0], pts[1], m.point],
      [m.point, n.point],
      [n.point, pts[2], pts[3]],
    ],
  );
});
// The native campus master is deliberately external to the source repository.
test("finite door caps need both matching source endpoints and transverse width", () => {
  const cap: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 1],
    [0, 1],
  ];
  const face = (x: number, y: number) =>
    nativeRationalOverlay("union", [
      [
        [
          [0, y],
          [x, y],
          [x, -1],
          [0, -1],
        ],
      ],
    ]);
  const one = matchedRoomDoorCaps(cap, [0, 1], face(4, -1e-9));
  assert.ok(one.length);
  assert.equal(matchedRoomDoorCaps(cap, [0, 1], face(3.99, -1e-9)).length, 0);
  assert.equal(matchedRoomDoorCaps(cap, [0, 1], face(4, -1e-4)).length, 0);
  assert.equal(matchedRoomDoorCaps(cap, [1, 0], face(4, -1e-9)).length, 0);
  assert.equal(matchedRoomDoorCaps(cap, [0, 1], face(4, 0)).length, 0);
  assert.equal(
    nativeRationalOverlay("difference", one, [
      [
        [
          [0, 0],
          [4, 0],
          [4, -1e-9],
          [0, -1e-9],
        ],
      ],
    ]).length,
    0,
  );
});

const source = process.env.UNBC_PATHWAY_MASTER,
  guides = process.env.UNBC_PATHWAY_GUIDES;
test(
  "09-382 uses its wall-normal T as the actual first step on two jobs and both return journeys",
  { skip: !source || !guides },
  async () => {
    await initializeNativeExactGeosOverlay();
    const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
    const data = routeWorkerDataset(
      withPreparedRouting(read(source!), read(guides!)),
    );
    createImmutableRoutingSession(data)(() => {
      const network = createSharedPathwayNetwork(data);
      const key = (n: string) => data.records.find((r) => r.number === n)!.key;
      for (const [name, doorId] of [
        ["09-387", 1_522_421],
        ["09-379", 1_522_425],
      ] as const) {
        const id = key(name);
        const b = network.branchForRoom(id);
        assert.equal(b?.shape, "wall-normal", JSON.stringify(b));
        assert.equal(b.normalProof!.nativeCapJunction, true);
        assert.equal(b.normalProof!.nativeDoorElementId, doorId);
        const t = b.normalProof!.hallwayJoinFeet;
        assert.deepEqual(network.stopForRoom(id, true)?.pointFeet, t);
        assert.deepEqual(network.stopForRoom(id, false)?.pointFeet, t);
        const opt = {
          endpointMode: "pathway",
          allowOtherRoomTransit: false,
        } as const;
        const forward = network.journey(id, key("09-382"), opt)!;
        const reverse = network.journey(key("09-382"), id, opt)!;
        assert.deepEqual(forward.departure?.pointFeet, t);
        assert.deepEqual(reverse.arrival?.pointFeet, t);
        assert.ok(
          Math.abs(forward.distanceMetres - reverse.distanceMetres) < 1e-9,
        );
      }
      const room = key("09-382");
      const branch = network.branchForRoom(room)!;
      assert.equal(branch.shape, "wall-normal");
      assert.equal(branch.normalProof?.nativeDoorElementId, 1_970_499);
      assert.deepEqual(branch.pathToHallway, [
        branch.roomSidePoint,
        branch.normalProof!.hallwayJoinFeet,
      ]);
      const stop = network.stopForRoom(room, true)!;
      assert.ok(stop.station);
      assert.notEqual(stop.stopId, stop.station.previousStopId);
      for (const name of ["09-389", "09-386"]) {
        const target = key(name);
        const opts = {
          endpointMode: "pathway",
          allowOtherRoomTransit: false,
        } as const;
        const outward = network.journey(room, target, opts)!,
          back = network.journey(target, room, opts)!;
        assert.ok(outward && back);
        assert.deepEqual(outward.departure?.pathwayStop, stop);
        assert.deepEqual(back.arrival?.pathwayStop, stop);
        const p = (r: typeof outward) =>
          r.paths
            .flatMap((s) => s.pointsFeet)
            .filter(
              (point, i, all) =>
                !i || point.some((v, j) => v !== all[i - 1][j]),
            );
        assert.deepEqual(p(outward), p(back).reverse());
        assert.ok(
          Math.abs(outward.distanceMetres - back.distanceMetres) < 1e-9,
        );
        assert.deepEqual(p(outward)[0], stop.pointFeet);
        assert.deepEqual(
          projectNavigationSteps(data, outward, "09-382", name)[0]
            .pointsFeet[0],
          stop.pointFeet,
        );
        assert.deepEqual(
          projectNavigationSteps(data, back, name, "09-382")
            .at(-1)!
            .pointsFeet.at(-1),
          stop.pointFeet,
        );
      }
    });
  },
);
