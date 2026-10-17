import { fixture } from "./native-area-project";
import { geographicPoint } from "../../app/indoor-project/routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
/** Small complete legacy source fixture. It certifies no UNBC geometry. */
export function progressiveRoutingFixture(): IndoorDataset {
  const data = fixture();
  delete data.presentation;
  data.records = data.records.slice(0, 2).map((record) => ({
    ...record,
    access: "public",
    arrivalNodeId: `arrival-${record.key}`,
  }));
  data.records[1].ringsFeet = [
    [
      [10, 0],
      [30, 0],
      [30, 10],
      [10, 10],
    ],
  ];
  data.nodes = data.records.map((record, index) => {
    const pointFeet: [number, number, number] = [index ? 20 : 5, 5, 0];
    return {
      id: record.arrivalNodeId!,
      roomKey: record.key,
      kind: "arrival",
      levelId: record.levelId,
      building: record.building,
      surfaceId: record.surfaceId,
      pointFeet,
      geographic: geographicPoint(data, pointFeet),
    };
  });
  data.edges = [
    {
      id: "synthetic-walk",
      from: data.nodes[0].id,
      to: data.nodes[1].id,
      roomKeys: data.records.map((record) => record.key),
      kind: "walk",
      enabled: true,
      accessible: "yes",
      pointsFeet: data.nodes.map((node) => node.pointFeet),
      lengthMetres: 15 * 0.3048,
      evidence: "complete synthetic validation fixture",
    },
  ];
  data.report = {
    ...data.report,
    recordCount: 2,
    routableArrivals: 2,
    components: 1,
    largestComponentArrivals: 2,
  };
  return data;
}

export function progressiveRoutingDisclosureFixture(): IndoorDataset {
  const data = progressiveRoutingFixture();
  const middle = {
    ...data.records[0],
    key: "middle",
    number: "01-2",
    name: "Unconfirmed transit room",
    arrivalNodeId: "arrival-middle",
    access: "unknown" as const,
    properties: {},
    ringsFeet: [
      [
        [10, 0],
        [20, 0],
        [20, 10],
        [10, 10],
      ],
    ] as [number, number][][],
  };
  data.records[1].ringsFeet = [
    [
      [20, 0],
      [30, 0],
      [30, 10],
      [20, 10],
    ],
  ];
  data.nodes[1].pointFeet = [25, 5, 0];
  data.nodes[1].geographic = geographicPoint(data, data.nodes[1].pointFeet);
  data.records.push(middle);
  data.nodes.push({
    ...data.nodes[0],
    id: middle.arrivalNodeId,
    roomKey: middle.key,
    pointFeet: [15, 5, 0],
    geographic: geographicPoint(data, [15, 5, 0]),
  });
  const original = data.edges[0];
  data.edges = [
    [data.nodes[0], data.nodes[2]],
    [data.nodes[2], data.nodes[1]],
  ].map(([from, to], index) => ({
    ...original,
    id: `walk-${index}`,
    from: from.id,
    to: to.id,
    roomKeys: [from.roomKey, to.roomKey],
    accessible: "unknown",
    pointsFeet: [from.pointFeet, to.pointFeet],
    lengthMetres: 10 * 0.3048,
  }));
  data.report = {
    ...data.report,
    recordCount: 3,
    routableArrivals: 3,
    largestComponentArrivals: 3,
  };
  return data;
}
