import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReviewedVestibuleDoor,
  reviewedVestibuleThreshold,
  vestibuleDoorSegments,
} from "../../app/indoor-project/reviewed-lower-vestibule";
import type { NativeCirculationCell } from "../../app/indoor-project/native-circulation";
import type { SharedPathwayStop } from "../../app/indoor-project/shared-pathway-routing";
import type {
  IndoorDataset,
  IndoorNode,
} from "../../app/indoor-project/contract";

const west = "rm-694-3eff6106de76",
  east = "rm-694-43c823fdc35c";
function fixture() {
  return {
    source: {
      modelSha256:
        "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
      roomsSha256:
        "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9",
    },
    edges: [],
    records: [
      [west, "08-216"],
      [east, "08-202"],
    ].map(([key, number]) => ({
      key,
      number,
      levelId: 694,
      building: "08",
      walkable: true,
      circulation: true,
      access: "public",
      properties: {},
    })),
    doors: [
      {
        id: "door:694:2463762",
        nativeElementId: 2463762,
        levelId: 694,
        hostWallNativeElementId: 2463683,
        state: "unmatched",
        roomKeys: [west],
        pointFeet: [54.64395724977068, 529.643530373783],
        normalFeet: [-1, 1.90645670820616e-15],
        footprintFeet: [
          [56.28437719727725, 527.780013796927],
          [56.28437719727726, 531.507046950639],
          [53.003537302264114, 531.507046950639],
          [53.00353730226411, 527.780013796927],
        ],
      },
    ],
  } as unknown as IndoorDataset;
}
test("the owner's two-way permission binds one native opening and both public spaces", () => {
  for (const change of [
    (d: IndoorDataset) => {
      d.source.roomsSha256 = "0".repeat(64);
    },
    (d: IndoorDataset) => {
      d.doors![0].hostWallNativeElementId = 2463684;
    },
    (d: IndoorDataset) => {
      d.doors![0].state = "connected";
    },
    (d: IndoorDataset) => {
      d.doors![0].footprintFeet![0][0] += 0.01;
    },
    (d: IndoorDataset) => {
      d.records[1].access = "staff";
    },
    (d: IndoorDataset) => {
      d.records[0].circulation = false;
    },
    (d: IndoorDataset) => {
      d.doors![0].roomKeys = [east];
    },
    (d: IndoorDataset) => {
      d.edges.push({
        id: "door:694:2463762",
        enabled: false,
      } as IndoorDataset["edges"][number]);
    },
  ]) {
    const d = fixture();
    assert.ok(reviewedVestibuleThreshold(d));
    change(d);
    assert.equal(reviewedVestibuleThreshold(d), undefined);
  }
});
test("the canonical footprint runs from the west station to the east station and the whole body must fit both jambs", () => {
  const door = reviewedVestibuleThreshold(fixture())!;
  const a: [number, number, number] = [
      45.33505552992976, 527.3033713078413, 14.435695538057743,
    ],
    b: [number, number, number] = [
      66.2254660478713, 531.808491930014, 14.435695538057743,
    ];
  const p = vestibuleDoorSegments(door, a, b)!;
  assert.deepEqual([p[0], p[3]], [a, b]);
  assert.ok(p[1][0] > a[0] && p[2][0] > p[1][0] && b[0] > p[2][0]);
  assert.equal(vestibuleDoorSegments(door, b, a), undefined);
  assert.equal(
    vestibuleDoorSegments(door, a, [b[0], b[1], b[2] + 1]),
    undefined,
  );
  assert.equal(
    vestibuleDoorSegments(door, [a[0], a[1] + 2, a[2]], [b[0], b[1] + 2, b[2]]),
    undefined,
  );
});

test("each confirmed direction uses the same portal and requires both of its directional station guides", () => {
  const d = fixture(),
    cellId = "native-cell:14.435696:637";
  const ends = [
    {
      id: "door:694:1513787:0",
      roomKey: west,
      pointFeet: [45.33505552992976, 527.3033713078413, 14.435695538057743],
    },
    {
      id: "door:694:1998054:1",
      roomKey: east,
      pointFeet: [66.2254660478713, 531.808491930014, 14.435695538057743],
    },
  ] as IndoorNode[];
  d.nodes = ends;
  d.alignment = {
    originFeet: [0, 0, 0],
    originGeographic: [0, 0],
    projectionLatitude: 0,
    rotationRadians: 0,
    horizontalMetresPerFoot: 0.3048,
  } as IndoorDataset["alignment"];
  const build = (disable?: (side: number, enter: boolean) => boolean) =>
    buildReviewedVestibuleDoor(
      d,
      new Map(ends.map((n) => [n.id, n])),
      { id: cellId } as NativeCirculationCell,
      (id, enter) => {
        const side = ends.findIndex((n) => n.id === id),
          n = ends[side];
        return disable?.(side, enter)
          ? undefined
          : ({
              cellId,
              terminalNodeId: id,
              stopId: id + "-station",
              pointFeet: n.pointFeet,
            } as SharedPathwayStop);
      },
      (s) => s.stopId,
    );
  const arcs = build(),
    doors = arcs.filter((a) => a.link.edge.kind === "door");
  assert.equal(arcs.length, 6);
  assert.equal(doors.length, 2);
  assert.equal(doors[0].link.edge.direction, "both");
  assert.deepEqual(doors[0].points, doors[1].points.toReversed());
  assert.equal(doors[0].sourceFrom, doors[1].sourceTo);
  assert.equal(doors[0].link.edge.accessible, "unknown");
  assert.equal(doors[0].validateReviewedDoor?.(), false);
  for (const side of [0, 1])
    for (const enter of [true, false]) {
      const remaining = build((s, e) => s === side && e === enter);
      assert.equal(remaining.length, 3);
      const gate = remaining.find((a) => a.link.edge.kind === "door")!;
      assert.equal(
        gate.points[1][0] > gate.points[0][0],
        (side === 0) !== enter,
      );
    }
  assert.equal(build(() => true).length, 0);
});
