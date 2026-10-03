import test from "node:test";
import assert from "node:assert/strict";
import desk from "../fixtures/unbc-library-services-desk-display.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectRoute } from "../../app/indoor-project/routing";
import { isConnectorLobbyDestination } from "../../app/indoor-project/connector-arrival";
import { resolveRouteArrival } from "../../app/indoor-project/route-arrival";
test("all destination stop modes retain the verified elevator lobby instead of the shaft outline", () => {
  const d = structuredClone(desk) as unknown as IndoorDataset,
    r = d.records[0];
  r.key = "shaft";
  r.arrivalNodeId = "stop";
  r.walkable = true;
  r.access = "unknown";
  r.elevationFeet = 0;
  d.records.push({ ...r, key: "lobby" });
  d.nodes = [
    { id: "stop", roomKey: "lobby", levelId: r.levelId, pointFeet: [5, 14, 0] },
  ] as IndoorDataset["nodes"];
  d.connectors = [
    {
      id: "lift",
      sourceModelSha256: d.source.modelSha256,
      reviewedShaft: { pointFeet: [4, 6] },
      entrances: [
        {
          areaKey: "shaft",
          roomKey: "lobby",
          levelId: r.levelId,
          nodeId: "stop",
        },
      ],
    },
  ] as IndoorDataset["connectors"];
  const route = {
    edges: [],
    nodeIds: ["stop"],
    paths: [],
  } as unknown as ProjectRoute;
  assert.equal(isConnectorLobbyDestination(d, r), true);
  for (const mode of ["inside", "doorway", "hallway"] as const)
    assert.equal(resolveRouteArrival(d, route, r.key, mode).route, route);
  d.connectors![0].sourceModelSha256 = "foreign";
  assert.equal(isConnectorLobbyDestination(d, r), false);
  assert.equal(resolveRouteArrival(d, route, r.key, "doorway").route, null);
  d.connectors![0].sourceModelSha256 = d.source.modelSha256;
  d.records.find((r) => r.key === "lobby")!.access = "staff";
  assert.equal(isConnectorLobbyDestination(d, r), false);
});
