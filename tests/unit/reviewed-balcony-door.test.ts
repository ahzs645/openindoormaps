import assert from "node:assert/strict";
import test from "node:test";
import type {
  IndoorDataset,
  IndoorEdge,
  IndoorNode,
} from "../../app/indoor-project/contract";
import {
  balconyLevel,
  balconyFloor,
} from "../../app/indoor-project/reviewed-balcony-support";
import { balconyDoorSpec } from "../../app/indoor-project/reviewed-balcony-door";
import { buildReviewedStationDoor } from "../../app/indoor-project/reviewed-station-door";
import type { PathwayArc } from "../../app/indoor-project/shared-pathway-routing";
const north = "rm-402367-133b24ba6565",
  south = "rm-402367-039546889998";
function fixture() {
  return {
    source: {
      modelSha256:
        "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
      roomsSha256:
        "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9",
    },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [0, 0],
      rotationRadians: 0,
      projectionLatitude: 0,
      horizontalMetresPerFoot: 0.3048,
    },
    edges: [],
    nodes: [north, south].map((roomKey) => ({
      roomKey,
      id: "arrival:" + roomKey,
      levelId: balconyLevel,
      pointFeet: [0, 0, balconyFloor],
    })),
    records: [
      [north, "04-423"],
      [south, "04-430"],
    ].map(([key, number]) => ({
      key,
      number,
      name: "Corridor",
      building: "04",
      levelId: balconyLevel,
      walkable: true,
      circulation: true,
      access: "unknown",
      properties: {},
    })),
    doors: [
      {
        id: "door:402367:2131263",
        nativeElementId: 2131263,
        hostWallNativeElementId: 2131262,
        levelId: balconyLevel,
        state: "unmatched",
        pointFeet: [-68.4508160142962, 305.72628644297896],
        normalFeet: [0, 1],
        roomKeys: [south],
        footprintFeet: [
          [-70.50462178857441, 305.49662765032804],
          [-66.39701024001798, 305.49662765032804],
          [-66.39701024001798, 305.9559452356299],
          [-70.50462178857441, 305.9559452356299],
        ],
      },
    ],
  } as unknown as IndoorDataset;
}
test("reviewed balcony binds the original physical portal and both public corridors", () => {
  const data = fixture(),
    door = data.doors![0];
  assert.ok(balconyDoorSpec(data));
  door.pointFeet[0] += 0.01;
  assert.equal(balconyDoorSpec(data), undefined);
  door.pointFeet[0] = -68.4508160142962;
  data.records[0].access = "staff";
  assert.equal(balconyDoorSpec(data), undefined);
});
test("the balcony joins two bidirectional core stations and keeps its door in the route both ways", () => {
  const data = fixture(),
    spec = balconyDoorSpec(data)!;
  const nodes = new Map<string, IndoorNode>(data.nodes.map((n) => [n.id, n]));
  const cores = new Map<string, PathwayArc[]>();
  let supported = true;
  spec.supported = () => supported;
  for (const [i, id] of spec.guideEdgeIds.entries()) {
    const source = spec.terminalIds[i],
      vertex = "station" + i,
      point = i === 0 ? spec.paths[0][0] : spec.paths[2].at(-1)!;
    const link = {
      edge: { id, enabled: true } as IndoorEdge,
      passages: [],
      requiredRooms: [],
      blockers: [],
    };
    cores.set(id, [
      {
        from: "other" + i,
        to: vertex,
        sourceFrom: "other" + i,
        sourceTo: source,
        metres: 0,
        points: [point],
        link: { ...link, to: source },
      },
      {
        from: vertex,
        to: "other" + i,
        sourceFrom: source,
        sourceTo: "other" + i,
        metres: 0,
        points: [point],
        link: { ...link, to: "other" + i },
      },
    ]);
  }
  const build = () =>
    buildReviewedStationDoor(data, new Map(nodes), cores, () => true, spec);
  const arcs = build();
  assert.equal(arcs.length, 6);
  assert.equal(arcs[0].from, "station0");
  assert.equal(arcs[4].to, "station1");
  const doors = arcs.filter((a) => a.link.edge.kind === "door");
  assert.equal(doors.length, 2);
  assert.equal(doors[0].link.edge.nativeElementId, 2131263);
  assert.equal(doors[0].link.edge.accessible, "unknown");
  assert.deepEqual(doors[1].points, doors[0].points.toReversed());
  assert.equal(arcs[0].validateReviewedDoor?.(), true);
  supported = false;
  assert.equal(build()[0].validateReviewedDoor?.(), false);
  cores.get(spec.guideEdgeIds[0])!.pop();
  assert.equal(build().length, 0);
});
