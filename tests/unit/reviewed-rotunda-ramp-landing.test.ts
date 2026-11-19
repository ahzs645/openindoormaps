import test from "node:test";
import assert from "node:assert/strict";
import {
  reviewedRampLandingGuide,
  isRotundaRampApproach,
  reviewedRampLanding,
} from "../../app/indoor-project/raised-rotunda-plane";
import type {
  IndoorDataset,
  IndoorEdge,
  IndoorNode,
} from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
const cell = "native-cell:3.280840:383",
  connector = "connector:unbc-04-lift:0",
  tipId = "ramp:1587605:upper";
const z = 3.2808398950131235;
const tip = {
  pointFeet: [-83.0215102319552, 358.59684096007834, z],
  id: tipId,
} as IndoorNode;
const peer = { pointFeet: [-73.35, 369.7, z], id: connector } as IndoorNode;
const guideId = cell + ":walk:" + connector + "|door:1487816:1026477:0";
const station: [number, number, number] = [
  -73.35582348526155,
  369.6903881479552,
  z,
];
const reference = {
  edgeId: guideId,
  kind: "shared-corridor",
  pointsFeet: [peer.pointFeet, station, [-66, 365, z]],
  hallwayJoins: [1, 2],
} as PreparedRouting["guides"][number];
const normal: [number, number] = [0.8259411349711215, 0.5637563672036138];
const landing = {
  tip,
  peer,
  normal,
  review: {
    side: "upper",
    id: 1587605,
    cell,
    peer: connector,
    peerGuide: guideId,
  },
} as NonNullable<ReturnType<typeof reviewedRampLanding>>;
const edge = {
  id: cell + ":walk:" + connector + "|" + tipId,
  to: tipId,
  from: connector,
} as IndoorEdge;
test("checked landing preserves both native endpoints, finite ramp exit and the exact existing lift station in source orientation", () => {
  const g = reviewedRampLandingGuide(edge, landing, [reference], () => true);
  assert.ok(g);
  assert.deepEqual(g.pointsFeet[0], peer.pointFeet);
  assert.deepEqual(g.pointsFeet.at(-1), tip.pointFeet);
  assert.deepEqual(g.pointsFeet[g.hallwayJoins![0]], station);
  const p = g.pointsFeet[g.hallwayJoins![1]];
  assert.deepEqual(p, [
    tip.pointFeet[0] + normal[0],
    tip.pointFeet[1] + normal[1],
    z,
  ]);
  assert.equal(
    reviewedRampLandingGuide(edge, landing, [reference], () => false),
    undefined,
  );
  assert.equal(
    reviewedRampLandingGuide(edge, landing, [], () => true),
    undefined,
  );
});
test("mixed nominal levels alone cannot grant a hallway link", () => {
  assert.equal(isRotundaRampApproach(edge), true);
  assert.equal(
    isRotundaRampApproach({ ...edge, id: edge.id + "-other" }),
    false,
  );
  assert.equal(
    reviewedRampLanding(
      {} as IndoorDataset,
      { ...edge, kind: "walk", enabled: false },
      tip,
      peer,
      new Map(),
    ),
    undefined,
  );
});
