import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  nativeWalkTouchesTransitRoom,
  createNativeTransitRefinementPolicy,
} from "../../app/indoor-project/native-walk-transit-owners";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
const rect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
async function fixture() {
  await initializeNativeExactGeosOverlay();
  const d = JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  ) as IndoorDataset;
  const room = d.records[0];
  d.records = [
    {
      ...room,
      key: "hall",
      circulation: true,
      ringsFeet: [rect(0, 0, 20, 10)],
    },
    {
      ...room,
      key: "office",
      circulation: false,
      ringsFeet: [rect(0, 10, 20, 20)],
    },
  ];
  d.nodes = d.nodes.slice(0, 2).map((n, i) => ({
    ...n,
    id: `n${i}`,
    roomKey: "hall",
    pointFeet: [i * 20, 5, 0],
  }));
  d.edges = [
    {
      ...d.edges[0],
      id: "walk",
      from: "n0",
      to: "n1",
      kind: "walk",
      nativeCellId: "cell",
      pointsFeet: [
        [0, 5, 0],
        [20, 5, 0],
      ],
      roomKeys: ["hall", "office"],
    },
  ];
  d.nativeIndoorEnvelopes = {} as IndoorDataset["nativeIndoorEnvelopes"];
  d.circulationGeometry = {
    exactTopology: {},
  } as IndoorDataset["circulationGeometry"];
  return d;
}
test("a whole-cell office association does not mean a hallway path transits the office; source owners remain intact", async () => {
  const d = await fixture(),
    before = JSON.stringify(d);
  assert.equal(
    nativeWalkTouchesTransitRoom(d, d.edges[0], d.records[1]),
    false,
  );
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(d.edges[0].roomKeys, ["hall", "office"]);
});
test("positive strip overlap below raster resolution is retained, including the full body width", async () => {
  const d = await fixture();
  d.records[1].ringsFeet = [rect(8, 6 - 2 ** -40, 12, 9)];
  assert.equal(nativeWalkTouchesTransitRoom(d, d.edges[0], d.records[1]), true);
});
test("a real inner hole stays excluded; original endpoint owners and explicit door dependencies remain required", async () => {
  const d = await fixture();
  d.records[1].ringsFeet = [rect(-2, -2, 22, 22), rect(-1, 3, 21, 7)];
  assert.equal(
    nativeWalkTouchesTransitRoom(d, d.edges[0], d.records[1]),
    false,
  );
  const own = { ...d.edges[0], from: "office-entry" };
  d.nodes.push({ ...d.nodes[0], id: "office-entry", roomKey: "office" });
  assert.equal(nativeWalkTouchesTransitRoom(d, own, d.records[1]), true);
  assert.equal(
    nativeWalkTouchesTransitRoom(
      d,
      { ...d.edges[0], kind: "door" },
      d.records[1],
    ),
    true,
  );
});
test("legacy paths without strict source identity retain the original conservative requirements", async () => {
  const d = await fixture();
  delete d.nativeIndoorEnvelopes;
  assert.equal(nativeWalkTouchesTransitRoom(d, d.edges[0], d.records[1]), true);
});

test("a prepared guide or straightening trial cannot introduce transit through an ordinary room", async () => {
  const d = await fixture();
  d.records[1].ringsFeet = [rect(8, 8, 18, 12)];
  const allowed = createNativeTransitRefinementPolicy(
    d,
    d.edges,
    d.edges[0].pointsFeet,
  );
  assert.equal(
    allowed([
      [0, 5, 0],
      [20, 5, 0],
    ]),
    true,
  );
  assert.equal(
    allowed([
      [0, 5, 0],
      [12, 9, 0],
      [20, 5, 0],
    ]),
    false,
  );
});
