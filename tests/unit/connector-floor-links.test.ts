import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture } from "../fixtures/native-area-project";
import {
  ConnectorFloorLinks,
  connectorFloorSelectionId,
  connectorFloorTargets,
} from "../../app/indoor-project/connector-floor-links";
import {
  sourceStairAnchor,
  type SourceStair,
} from "../../app/indoor-project/source-stairs";
import { roomDisplayColor } from "../../app/indoor-project/display-geometry";
import { projectConnectorMarkers } from "../../app/indoor-project/connector-markers";
import { geographicPoint } from "../../app/indoor-project/routing";
import {
  HALLWAY_COLOR,
  isOverviewWalkway,
} from "../../app/indoor-project/display-passages";

test("ordinary stair areas use green circulation without changing type or access", () => {
  const data = fixture();
  const room = data.records.find((r) => r.stair)!;
  const before = JSON.stringify(data);
  assert.equal(roomDisplayColor(room, false), HALLWAY_COLOR);
  assert.equal(isOverviewWalkway(room), true);
  assert.equal(JSON.stringify(data), before);
  assert.equal(isOverviewWalkway({ ...room, access: "staff" }), false);
  assert.notEqual(
    roomDisplayColor({ ...room, access: "staff" }, false),
    HALLWAY_COLOR,
  );
  assert.equal(
    isOverviewWalkway({ ...room, name: "Lecture theatre seating" }),
    false,
  );
});

test("a selected lift segment exposes every enabled served floor of its compiled connector", () => {
  const data = fixture();
  const room = data.records.find((r) => r.stair)!;
  data.floors = [1, 2, 3, 4, 5, 6].map((levelId) => ({
    id: `floor${levelId}`,
    name: `Floor ${levelId}`,
    levelIds: [levelId],
    elevationFeet: (levelId - 1) * 10,
  }));
  data.nodes = [1, 2, 3, 4, 5, 6].map((levelId) => ({
    id: `n${levelId}`,
    roomKey: room.key,
    levelId,
    building: "08",
    surfaceId: room.surfaceId,
    pointFeet: [0, 0, (levelId - 1) * 10],
    geographic: [0, 0],
    kind: "connector",
  }));
  const edge = {
    id: "lift12",
    kind: "elevator" as const,
    from: "n1",
    to: "n2",
    roomKeys: [],
    connectorId: "lift",
    nativeElementId: 123,
    enabled: true,
    accessible: "unknown" as const,
    lengthMetres: 3,
    pointsFeet: [data.nodes[0].pointFeet, data.nodes[1].pointFeet],
    evidence: "Existing reviewed lift",
  };
  data.edges = [
    edge,
    { ...edge, id: "lift23", from: "n2", to: "n3" },
    { ...edge, id: "lift34", from: "n3", to: "n4" },
    { ...edge, id: "disabled", enabled: false, from: "n4", to: "n5" },
    { ...edge, id: "foreign", connectorId: "other", from: "n4", to: "n5" },
    { ...edge, id: "disconnected", from: "n5", to: "n6" },
  ];
  const before = JSON.stringify(data);
  assert.deepEqual(
    connectorFloorTargets(data, { edge }).map((t) => t.floorId),
    ["floor1", "floor2", "floor3", "floor4"],
  );
  assert.equal(
    connectorFloorTargets(data, { edge: { ...edge, id: "stale" } }).length,
    0,
  );
  assert.equal(JSON.stringify(data), before);
});

test("connected stair markers use the original native landing and distinguish same-floor buildings", () => {
  const data = fixture();
  const room = data.records.find((r) => r.stair)!;
  data.floors[0].levelIds = [1, 2];
  data.nativeLevels = [
    { id: 1, name: "Lower", elevationFeet: 0 },
    { id: 2, name: "Upper", elevationFeet: 3 },
  ];
  data.nodes = [1, 2].map((levelId, i) => ({
    id: `landing${levelId}`,
    roomKey: room.key,
    levelId,
    building: i ? "08" : "07",
    surfaceId: room.surfaceId,
    pointFeet: [i * 5, 0, i * 3],
    geographic: [0, 0],
    kind: "stair",
  }));
  data.edges = [
    {
      id: "local",
      kind: "local-steps",
      from: "landing1",
      to: "landing2",
      roomKeys: [],
      nativeElementId: 123,
      enabled: true,
      accessible: "no",
      lengthMetres: 3,
      pointsFeet: data.nodes.map((n) => n.pointFeet),
      evidence: "Saved native steps",
    },
  ];
  const stair: SourceStair = {
    stairElementId: 123,
    levelIds: [1, 2],
    buildings: ["07", "08"],
    floorElevationFeet: 0,
    sourceGeometry: "native-cache",
    treads: [
      {
        runElementId: 124,
        elevationFeet: 0.5,
        ringFeet: [
          [1, 0],
          [2, 0],
          [2, 1],
          [1, 1],
        ],
      },
    ],
  };
  data.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: data.source.modelSha256,
    flights: [],
    sourceFlights: [stair],
  };
  const before = JSON.stringify(data);
  assert.deepEqual(sourceStairAnchor(data, stair, [1, 2]), [0, 0, 0]);
  assert.deepEqual(sourceStairAnchor(data, stair, [1, 2], "07"), [0, 0, 0]);
  assert.deepEqual(sourceStairAnchor(data, stair, [1, 2], "08"), [5, 0, 3]);
  const marker = projectConnectorMarkers(data, [1, 2], "08").features.find(
    (feature) => feature.properties?.id === "source-stair:123",
  );
  assert.deepEqual(marker?.geometry.coordinates, geographicPoint(data, [5, 0]));
  assert.deepEqual(sourceStairAnchor(data, stair, [2]), [5, 0, 3]);
  const html = renderToStaticMarkup(
    React.createElement(ConnectorFloorLinks, {
      data,
      nativeElementId: 123,
      onNavigate: () => {},
    }),
  );
  assert.match(html, /Building 07/);
  assert.match(html, /Building 08/);
  assert.equal(JSON.stringify(data), before);
  data.edges[0].enabled = false;
  assert.deepEqual(sourceStairAnchor(data, stair, [1]), [1.5, 0.5, 0.5]);
  data.edges[0].enabled = true;
  data.stairDisplay.sourceModelSha256 = "stale";
  assert.deepEqual(sourceStairAnchor(data, stair, [1]), [1.5, 0.5, 0.5]);
});

test("shared original stair landings connect separate flights and switch to the target assembly", () => {
  const data = fixture();
  const room = data.records.find((r) => r.stair)!;
  data.floors = [1, 2, 3, 4].map((levelId) => ({
    id: `f${levelId}`,
    name: `Floor ${levelId}`,
    levelIds: [levelId],
    elevationFeet: (levelId - 1) * 10,
  }));
  data.nodes = [1, 2, 3, 4].map((levelId) => ({
    id: `n${levelId}`,
    roomKey: room.key,
    levelId,
    building: "08",
    surfaceId: room.surfaceId,
    pointFeet: [0, 0, (levelId - 1) * 10],
    geographic: [0, 0],
    kind: "stair",
  }));
  const edge = {
    id: "flight12",
    kind: "stairs" as const,
    from: "n1",
    to: "n2",
    roomKeys: [],
    nativeElementId: 123,
    enabled: true,
    accessible: "no" as const,
    lengthMetres: 3,
    pointsFeet: [data.nodes[0].pointFeet, data.nodes[1].pointFeet],
    evidence: "Compiled flight",
  };
  data.edges = [
    edge,
    { ...edge, id: "flight23", nativeElementId: 456, from: "n2", to: "n3" },
    {
      ...edge,
      id: "disabled34",
      nativeElementId: 789,
      enabled: false,
      from: "n3",
      to: "n4",
    },
  ];
  // This staircase overlaps the same drawn point but uses a different saved
  // landing; it must not create a connection to the fourth floor.
  data.nodes.push({ ...data.nodes[1], id: "separate" });
  data.edges.push({
    ...edge,
    id: "nearby24",
    nativeElementId: 999,
    from: "separate",
    to: "n4",
  });
  const source: SourceStair = {
    stairElementId: 123,
    levelIds: [1, 2],
    buildings: ["08"],
    floorElevationFeet: 0,
    sourceGeometry: "native-cache",
    treads: [
      {
        runElementId: 124,
        elevationFeet: 0.5,
        ringFeet: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      },
    ],
  };
  data.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: data.source.modelSha256,
    flights: [],
    sourceFlights: [
      source,
      { ...source, stairElementId: 456, levelIds: [2, 3] },
    ],
  };
  const before = JSON.stringify(data);
  const targets = connectorFloorTargets(data, { nativeElementId: 123 });
  assert.deepEqual(
    targets.map((t) => t.label),
    ["Floor 1", "Floor 2", "Floor 3"],
  );
  assert.equal(connectorFloorSelectionId(data, targets[2]), "source-stair:456");
  assert.equal(JSON.stringify(data), before);
  // Compilers may retain distinct endpoint IDs at one landing and connect
  // them through explicit stationary graph transfers.
  data.nodes.push({ ...data.nodes[1], id: "continued" });
  data.edges[1].from = "continued";
  assert.equal(connectorFloorTargets(data, { nativeElementId: 123 }).length, 2);
  const transfer = {
    ...edge,
    id: "transfer",
    kind: "walk" as const,
    lengthMetres: 0,
    from: "n2",
    to: "continued",
    pointsFeet: [data.nodes[1].pointFeet, data.nodes[1].pointFeet],
  };
  data.edges.push(transfer);
  assert.equal(connectorFloorTargets(data, { nativeElementId: 123 }).length, 3);
  transfer.enabled = false;
  assert.equal(connectorFloorTargets(data, { nativeElementId: 123 }).length, 2);
  transfer.enabled = true;
  transfer.pointsFeet = [data.nodes[1].pointFeet, [0.01, 0, 10]];
  assert.equal(connectorFloorTargets(data, { nativeElementId: 123 }).length, 2);
  data.stairDisplay.sourceModelSha256 = "stale";
  assert.equal(connectorFloorSelectionId(data, targets[2]), "flight23");
});

test("floor actions follow saved connector endpoints, deduplicate and omit disabled/unmapped edges", () => {
  const data = fixture();
  const room = data.records.find((r) => r.stair)!;
  data.floors.push({
    id: "second",
    name: "Campus Floor 2",
    levelIds: [2],
    elevationFeet: 10,
  });
  data.nodes = [1, 2, 3].map((levelId, i) => ({
    id: `node${i}`,
    roomKey: room.key,
    levelId,
    building: room.building,
    surfaceId: "first",
    pointFeet: [0, 0, i * 10],
    geographic: [0, 0],
    kind: "stair",
  }));
  data.edges = [
    {
      id: "linked",
      kind: "stairs",
      from: "node0",
      to: "node1",
      roomKeys: [room.key],
      nativeElementId: 123,
      enabled: true,
      accessible: "no",
      lengthMetres: 3,
      pointsFeet: [
        [0, 0, 0],
        [0, 0, 10],
      ],
      evidence: "Native flight",
    },
  ];
  const before = JSON.stringify(data);
  assert.deepEqual(
    connectorFloorTargets(data, { nativeElementId: 123 }).map((t) => t.label),
    ["Floor 1", "Floor 2"],
  );
  assert.deepEqual(
    connectorFloorTargets(data, { room }).map((t) => t.floorId),
    ["first", "second"],
  );
  assert.equal(connectorFloorTargets(data, { nativeElementId: 999 }).length, 0);
  assert.equal(JSON.stringify(data), before);
  data.edges = [
    ...data.edges,
    { ...data.edges[0], id: "duplicate" },
    { ...data.edges[0], id: "disabled", enabled: false, to: "node2" },
  ];
  assert.equal(connectorFloorTargets(data, { room }).length, 2);
  data.edges[0].enabled = false;
  data.edges[1].enabled = false;
  assert.equal(connectorFloorTargets(data, { room }).length, 0);
});
