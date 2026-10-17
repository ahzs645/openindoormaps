import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { precisionWallMesh } from "../../app/indoor-project/precision-wall-layer";

test("room-colour preview changes paint without moving vertices or filling the source hole", () => {
  const origin: [number, number] = [-122, 53];
  const anchor = maplibregl.MercatorCoordinate.fromLngLat(origin);
  const unit = anchor.meterInMercatorCoordinateUnits();
  const ring = (x: number, y: number, width: number, height: number) =>
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
      [x, y],
    ].map(([a, b]) => {
      const p = new maplibregl.MercatorCoordinate(
        anchor.x + a * unit,
        anchor.y - b * unit,
      ).toLngLat();
      return [p.lng, p.lat];
    });
  const input: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { color: "#aaccee" },
        geometry: {
          type: "MultiPolygon",
          coordinates: [[ring(0, 0, 10, 10), ring(2, 2, 4, 4).reverse()]],
        },
      },
    ],
  };
  const before = JSON.stringify(input);
  const grey = precisionWallMesh(input, origin, false, true, true);
  const rooms = precisionWallMesh(input, origin, false, true, true, true);
  assert.deepEqual(rooms.positions, grey.positions);
  assert.notDeepEqual(rooms.colors, grey.colors);
  assert.deepEqual(rooms.overviewColors, grey.colors);
  const expected = new THREE.Color("#aaccee");
  assert(Math.abs(rooms.colors[0] - expected.r) < 1e-6);
  let area = 0;
  for (let i = 0; i < rooms.positions.length; i += 9) {
    const p = rooms.positions;
    area +=
      Math.abs(
        (p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) -
          (p[i + 6] - p[i]) * (p[i + 4] - p[i + 1]),
      ) / 2;
    const x = (p[i] + p[i + 3] + p[i + 6]) / 3,
      y = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
    assert(!(x > 2 && x < 6 && y > 2 && y < 6));
    assert.equal(p[i + 2], 0);
  }
  assert(Math.abs(area - 84) < 1e-4);
  assert.equal(JSON.stringify(input), before);
  assert.equal(precisionWallMesh(input, origin, false, true, true), grey);
});
