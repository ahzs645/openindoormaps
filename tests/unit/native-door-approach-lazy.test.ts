import assert from "node:assert/strict";
import test from "node:test";
import { createNativeDoorApproachQuery } from "../../app/indoor-project/native-door-approach";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";

export async function sharedPortalFixture(
  strict: boolean,
): Promise<IndoorDataset> {
  const rect = (a: number, b: number, c: number, d: number) => [
    [a, b],
    [c, b],
    [c, d],
    [a, d],
  ];
  const nodes = [
    { id: "shared", roomKey: "B", pointFeet: [1.1, 0, 0] },
    { id: "first-other", roomKey: "C", pointFeet: [0.9, 0, 0] },
    { id: "last-other", roomKey: "A", pointFeet: [1.1, 0.2, 0] },
    { id: "arrival", roomKey: "B", pointFeet: [4, 4, 0] },
  ].map((n) => ({ ...n, levelId: 1 }));
  const doorSpecs = [
    {
      id: "first",
      nativeElementId: 10,
      pair: ["shared", "first-other"],
      roomKeys: ["B", "C"],
      normalFeet: [1, 0],
      footprintFeet: rect(0.8, -0.3, 1.2, 0.3),
    },
    {
      id: "last",
      nativeElementId: 11,
      pair: ["shared", "last-other"],
      roomKeys: ["B", "A"],
      normalFeet: [0, 1],
      footprintFeet: rect(0.8, -0.1, 1.4, 0.3),
    },
  ];
  const edges = doorSpecs.map((d) => ({
    id: d.id,
    nativeElementId: d.nativeElementId,
    from: d.pair[0],
    to: d.pair[1],
    roomKeys: d.roomKeys,
    kind: "door",
    enabled: true,
    pointsFeet: d.pair.map((id) => nodes.find((n) => n.id === id)!.pointFeet),
  }));
  for (const node of nodes.slice(0, 3))
    edges.push({
      id: node.id + "-walk",
      nativeElementId: 0,
      from: node.id,
      to: "arrival",
      roomKeys: [node.roomKey],
      kind: "walk",
      enabled: true,
      pointsFeet: [node.pointFeet, [4, 4, 0]],
    });
  edges.push({ ...edges[1], id: "same-door-walk", kind: "walk" });
  const floor = [rect(-5, -5, 5, 5)];
  const data = {
    source: { modelSha256: "a".repeat(64) },
    walkingSupport: {
      version: 1,
      sourceModelSha256: "a".repeat(64),
      floors: [
        {
          nativeElementId: 1,
          elevationFeet: 0,
          ringsFeet: floor,
          partsFeet: [floor],
        },
      ],
    },
    ...(strict
      ? {
          nativeIndoorEnvelopes: {
            version: 1,
            sourceModelSha256: "a".repeat(64),
            geometrySha256: "",
            levels: [
              {
                levelId: 1,
                elevationFeet: 0,
                partsFeet: [floor],
                sourceElementIds: [1],
                cutElevationsFeet: [0.1, 4],
                evidenceSha256: "b".repeat(64),
              },
            ],
          },
        }
      : {}),
    nodes,
    edges,
    walls: [],
    records: ["A", "B", "C"].map((key) => ({
      key,
      levelId: 1,
      elevationFeet: 0,
      circulation: true,
      walkable: true,
      access: "unknown",
      properties: {},
      ringsFeet: floor,
    })),
    doors: doorSpecs.map((d) => ({
      ...d,
      levelId: 1,
      state: "connected",
      hostWallNativeElementId: 100,
    })),
  } as unknown as IndoorDataset;
  if (data.nativeIndoorEnvelopes)
    data.nativeIndoorEnvelopes.geometrySha256 = await nativeIndoorEnvelopeHash(
      data.nativeIndoorEnvelopes,
    );
  return data;
}
function reverse(edge: IndoorEdge): IndoorEdge {
  return {
    ...edge,
    from: edge.to,
    to: edge.from,
    pointsFeet: [...edge.pointsFeet].reverse(),
  };
}
test("constructor and unrelated walks defer half geometry, incident results compute once", async () => {
  const data = await sharedPortalFixture(true);
  let reads = 0;
  for (const door of data.doors!) {
    const normal = door.normalFeet;
    Object.defineProperty(door, "normalFeet", {
      enumerable: true,
      get: () => {
        reads++;
        return normal;
      },
    });
  }
  const query = createNativeDoorApproachQuery(data);
  assert.equal(reads, 0);
  const arrival = data.nodes.find((n) => n.id === "arrival")!;
  assert.deepEqual(
    query({
      id: "unrelated",
      kind: "walk",
      from: arrival.id,
      to: arrival.id,
      pointsFeet: [arrival.pointFeet, arrival.pointFeet],
      roomKeys: [],
      lengthMetres: 0,
      evidence:
        "Coincident unrelated arrival used to verify lazy query isolation",
      accessible: "unknown",
      enabled: true,
    }),
    [],
  );
  assert.equal(reads, 0);
  const shared = data.edges.find((e) => e.id === "shared-walk")!;
  assert.ok(query(shared).length);
  assert.equal(reads, 2);
  query(reverse(shared));
  query(data.edges.find((e) => e.id === "first-other-walk")!);
  assert.equal(reads, 2);
});
test("lazy incident doors preserve source-order winner regardless of query/reverse order", async () => {
  for (const strict of [false, true]) {
    const data = await sharedPortalFixture(strict),
      before = JSON.stringify(data);
    const walks = data.edges.filter((e) => e.kind === "walk");
    const expected = createNativeDoorApproachQuery(data);
    const baseline = walks.map((e) => expected(e));
    assert.ok(baseline[0].length);
    assert.deepEqual(
      baseline.at(-1),
      [],
      "last physical door owns both incident ends",
    );
    for (const order of [
      walks,
      [...walks].reverse(),
      [walks[2], walks[0], walks[1], walks[3]],
    ]) {
      const query = createNativeDoorApproachQuery(data);
      for (const edge of order) {
        assert.deepEqual(query(edge), baseline[walks.indexOf(edge)]);
        assert.deepEqual(query(reverse(edge)), baseline[walks.indexOf(edge)]);
      }
    }
    assert.deepEqual(createNativeDoorApproachQuery(data)(data.edges[0]), []);
    assert.equal(JSON.stringify(data), before);
  }
});
test("changing source door order changes the shared-node winner, disabled doors stay excluded", async () => {
  for (const strict of [false, true]) {
    const data = await sharedPortalFixture(strict),
      walk = data.edges.find((e) => e.id === "shared-walk")!;
    const last = createNativeDoorApproachQuery(data)(walk);
    data.doors!.reverse();
    const first = createNativeDoorApproachQuery(data)(walk);
    assert.notDeepEqual(first, last);
    data.edges.find((e) => e.id === "first")!.enabled = false;
    assert.deepEqual(createNativeDoorApproachQuery(data)(walk), last);
  }
});
