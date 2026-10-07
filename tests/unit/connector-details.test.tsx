import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture } from "../fixtures/native-area-project";
import { ConnectorDetails } from "../../app/indoor-project/connector-details";

test("stair marker details disclose original identity and missing route evidence without changing the dataset", () => {
  const data = fixture(),
    room = data.records.find((r) => r.stair)!;
  const before = JSON.stringify(data);
  const html = renderToStaticMarkup(
    <ConnectorDetails data={data} room={room} />,
  );
  assert.ok(html.includes(room.number));
  assert.ok(html.includes(room.key));
  assert.match(html, /No confirmed route connection/);
  assert.match(html, /excluded from wheelchair paths/);
  assert.equal(JSON.stringify(data), before);
});

test("stair details expose an existing prepared connection without promoting it to a destination", () => {
  const data = fixture(),
    room = data.records.find((r) => r.stair)!;
  data.nodes = [0, 1].map((i) => ({
    id: `stair-end-${i}`, roomKey: room.key, levelId: room.levelId,
    building: room.building, surfaceId: room.surfaceId,
    pointFeet: [i, 0, i * 10], geographic: [0, 0], kind: "stair",
  }));
  const edge = {
    id: "native-stair-599",
    from: data.nodes[0].id, to: data.nodes[1].id,
    lengthMetres: 3.2, pointsFeet: data.nodes.map((n) => n.pointFeet),
    accessible: "no" as const,
    kind: "stairs" as const,
    nativeElementId: 599,
    roomKeys: [room.key],
    enabled: true,
    evidence: "Measured native flight",
  };
  data.edges = [edge];
  const html = renderToStaticMarkup(
    <ConnectorDetails data={data} room={room} />,
  );
  assert.match(html, /native-stair-599/);
  assert.match(html, /Measured native flight/);
  assert.match(html, /Enabled connection/);
  assert.match(html, /#599/);
});
