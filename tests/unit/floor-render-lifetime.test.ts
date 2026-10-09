import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
import {
  configureFloorDiagnostics,
  floorDiagnostic,
  timeFloorStage,
  type FloorDiagnosticEntry,
} from "../../app/indoor-project/floor-diagnostics";
import { bridgeFloorDisplayWorker } from "../../app/indoor-project/floor-display-worker-bridge";
import type { FloorWorker } from "../../app/indoor-project/floor-worker-client";
import type {
  FloorPreparationRequest,
  FloorPreparationResponse,
  PreparedFloor,
} from "../../app/indoor-project/prepared-floor";
import {
  emptyPreparedFloorSources,
  PREPARED_CUSTOM_LAYER_IDS,
  PREPARED_FLOOR_SOURCE_IDS,
  removePreparedCustomLayers,
} from "../../app/indoor-project/prepared-layer-lifetime";
import {
  precisionWallLayer,
  precisionWallMesh,
} from "../../app/indoor-project/precision-wall-layer";
import { EXPOSED_WALL_HEIGHT_METRES } from "../../app/indoor-project/display-geometry";

const { MercatorCoordinate } = maplibregl;

class FakeMap {
  layers = new Set<string>();
  sources = new Map<string, unknown[]>();
  styled = true;
  getStyle() {
    return this.styled ? {} : undefined;
  }
  getLayer(id: string) {
    return this.layers.has(id) ? { id } : undefined;
  }
  removeLayer(id: string) {
    if (!this.layers.delete(id)) throw new Error(`missing layer ${id}`);
  }
  getSource(id: string) {
    const writes = this.sources.get(id);
    return writes
      ? { setData: (value: unknown) => void writes.push(value) }
      : undefined;
  }
}

test("prepared-floor teardown removes every custom 3D layer, including window glass and frames", () => {
  const map = new FakeMap();
  for (const id of PREPARED_CUSTOM_LAYER_IDS) map.layers.add(id);
  map.layers.add("project-room-fill"); // ordinary style layer, not owned here
  const removed = removePreparedCustomLayers(map);
  assert(removed.includes("project-native-window-glass"));
  assert(removed.includes("project-native-window-frames"));
  assert(removed.includes("project-precision-walls"));
  assert.deepEqual([...map.layers], ["project-room-fill"]);
  // Idempotent, and a disposed map (no style) is never touched.
  assert.deepEqual(removePreparedCustomLayers(map), []);
  map.styled = false;
  map.layers.add("project-native-window-glass");
  assert.deepEqual(removePreparedCustomLayers(map), []);
  assert(map.layers.has("project-native-window-glass"));
});

test("a loading floor scope empties every prepared drawing source, including perimeters and windows", () => {
  const map = new FakeMap();
  for (const id of PREPARED_FLOOR_SOURCE_IDS) map.sources.set(id, []);
  map.sources.set("basemap", []);
  const empty = { type: "FeatureCollection", features: [] };
  const emptied = emptyPreparedFloorSources(map, empty);
  for (const id of [
    "project-area-perimeters",
    "project-block-perimeters",
    "project-native-windows",
    "project-exposed-walls",
    "project-selection-areas",
  ])
    assert(emptied.includes(id), id);
  for (const id of PREPARED_FLOOR_SOURCE_IDS)
    assert.deepEqual(map.sources.get(id), [empty]);
  assert.deepEqual(map.sources.get("basemap"), []);
});

// Reference: the previous whole-floor JS number accumulation.
function referenceMesh(
  walls: FeatureCollection<MultiPolygon>,
  originGeographic: [number, number],
  windowOpacity: boolean,
) {
  const origin = MercatorCoordinate.fromLngLat(originGeographic),
    metre = origin.meterInMercatorCoordinateUnits();
  const positions: number[] = [],
    colors: number[] = [];
  const xy = (p: number[]) => {
    const m = MercatorCoordinate.fromLngLat([p[0], p[1]]);
    return new THREE.Vector2(
      (m.x - origin.x) / metre,
      -(m.y - origin.y) / metre,
    );
  };
  const sideColor = new THREE.Color("#a3a3a0"),
    topColor = new THREE.Color("#deded9");
  for (const f of walls.features) {
    const base = Number(f.properties?.base ?? 0),
      top = Number(f.properties?.height ?? EXPOSED_WALL_HEIGHT_METRES);
    if (!Number.isFinite(base) || !Number.isFinite(top) || top <= base)
      continue;
    const nativeColor = f.properties?.nativeWindowColor
      ? new THREE.Color(String(f.properties.nativeWindowColor))
      : undefined;
    for (const polygon of f.geometry.coordinates) {
      const shape = new THREE.Shape(polygon[0].map(xy));
      for (const hole of polygon.slice(1))
        shape.holes.push(new THREE.Path(hole.map(xy)));
      const part = new THREE.ExtrudeGeometry(shape, {
        depth: top - base,
        bevelEnabled: false,
      });
      const p = part.getAttribute("position"),
        n = part.getAttribute("normal");
      for (let i = 0; i < p.count; i++) {
        positions.push(p.getX(i), p.getY(i), p.getZ(i) + base);
        const color = nativeColor
          ? nativeColor
          : Math.abs(n.getZ(i)) > 0.5
            ? topColor
            : sideColor;
        colors.push(color.r, color.g, color.b);
        if (windowOpacity) colors.push(Number(f.properties?.opacity ?? 1));
      }
      part.dispose();
    }
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}
const origin: [number, number] = [-122.8140180885126, 53.892922780400426];
const d = 0.00001;
const square = (x: number, y: number, s: number) => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
];
const walls = (): FeatureCollection<MultiPolygon> => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { base: 0.25, height: 3.1 },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          // A wall body with a door-sized hole: holes must survive.
          [
            square(origin[0], origin[1], 8 * d),
            square(origin[0] + 2 * d, origin[1] + 2 * d, 3 * d).reverse(),
          ],
          [square(origin[0] + 20 * d, origin[1], d / 3)],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        base: 1,
        height: 2.2,
        nativeWindowColor: "#88aacc",
        opacity: 0.35,
        role: "glazing",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[square(origin[0] - 5 * d, origin[1] - 5 * d, 2 * d)]],
      },
    },
    {
      type: "Feature",
      properties: { base: 2, height: 2 }, // zero height: skipped as before
      geometry: {
        type: "MultiPolygon",
        coordinates: [[square(origin[0], origin[1] + 9 * d, d)]],
      },
    },
  ],
});

test("typed precision wall buffers are bit-identical to the previous number-array mesh", () => {
  for (const windowOpacity of [false, true]) {
    const input = walls();
    const mesh = precisionWallMesh(input, origin, windowOpacity),
      reference = referenceMesh(input, origin, windowOpacity);
    assert.equal(mesh.colorSize, windowOpacity ? 4 : 3);
    assert.equal(mesh.vertices * 3, reference.positions.length);
    assert.deepEqual(
      new Uint32Array(mesh.positions.buffer),
      new Uint32Array(reference.positions.buffer),
    );
    assert.deepEqual(
      new Uint32Array(mesh.colors.buffer),
      new Uint32Array(reference.colors.buffer),
    );
    assert(mesh.vertices > 0);
  }
});

test("precision meshes are reused only for the identical immutable collection and options", () => {
  const input = walls();
  const first = precisionWallMesh(input, origin);
  assert.equal(precisionWallMesh(input, origin), first, "same floor reuses");
  assert.notEqual(precisionWallMesh(input, origin, true), first);
  assert.notEqual(
    precisionWallMesh(input, [origin[0] + 0.001, origin[1]]),
    first,
  );
  const copy = walls();
  const rebuilt = precisionWallMesh(copy, origin);
  assert.notEqual(rebuilt, first, "another floor scope never shares a mesh");
  assert.deepEqual(rebuilt.positions, first.positions);
});

test("removing a precision wall layer releases its GPU geometry and material", () => {
  const input = walls();
  const layer = precisionWallLayer(input, origin, {
    id: "project-native-window-glass",
    windowOpacity: true,
  });
  assert.equal(layer.id, "project-native-window-glass");
  const disposed: string[] = [];
  const original = {
    geometry: THREE.BufferGeometry.prototype.dispose,
    material: THREE.Material.prototype.dispose,
  };
  THREE.BufferGeometry.prototype.dispose = function () {
    disposed.push("geometry");
    return original.geometry.call(this);
  };
  THREE.Material.prototype.dispose = function () {
    disposed.push("material");
    return original.material.call(this);
  };
  try {
    layer.onRemove?.(
      {} as Parameters<NonNullable<typeof layer.onRemove>>[0],
      {} as WebGL2RenderingContext,
    );
  } finally {
    THREE.BufferGeometry.prototype.dispose = original.geometry;
    THREE.Material.prototype.dispose = original.material;
  }
  assert.deepEqual(disposed.sort(), ["geometry", "material"]);
  // The cached vertex buffers remain valid for the next layer on this floor.
  const again = precisionWallLayer(input, origin, { windowOpacity: true });
  assert.equal(again.id, "project-precision-walls");
});

class ControlledWorker implements FloorWorker {
  onmessage: FloorWorker["onmessage"] = null;
  onerror: FloorWorker["onerror"] = null;
  onmessageerror: FloorWorker["onmessageerror"] = null;
  messages: FloorPreparationRequest[] = [];
  postMessage(message: FloorPreparationRequest) {
    this.messages.push(message);
  }
  terminate() {}
  reply(response: unknown) {
    this.onmessage?.({
      data: response,
    } as MessageEvent<FloorPreparationResponse>);
  }
}
const request = (requestId: number): FloorPreparationRequest => ({
  requestId,
  levelIds: [311],
  building: "all",
  options: {
    showPillars: false,
    showPassThroughPlaces: false,
    showVestibuleDoors: false,
    showStructures: false,
    review: false,
    simplifyGeometry: false,
  },
});

test("diagnostics are opt-in, scalar-only and never reach the floor client", () => {
  const recorded: FloorDiagnosticEntry[] = [];
  configureFloorDiagnostics(false);
  assert.equal(floorDiagnostic("disabled", { n: 1 }), undefined);
  const raw = new ControlledWorker(),
    bridge = bridgeFloorDisplayWorker(raw);
  const delivered: unknown[] = [];
  bridge.onmessage = ({ data }) => delivered.push(data);
  const plain = request(1);
  bridge.postMessage(plain);
  assert.equal(raw.messages[0], plain, "disabled: request is posted as-is");

  configureFloorDiagnostics(true, (entry) => recorded.push(entry));
  try {
    bridge.postMessage(request(2));
    assert.equal(
      (raw.messages[1] as { diagnostics?: boolean }).diagnostics,
      true,
    );
    raw.reply({
      requestId: 2,
      diagnostic: {
        stage: "floor-worker:prepare-floor",
        realm: "worker",
        at: 1,
        ms: 5,
        geometry: [[1, 2]],
        name: "x".repeat(500),
      },
    });
    assert.deepEqual(delivered, [], "diagnostics are consumed by the bridge");
    const value = {} as PreparedFloor;
    raw.reply({ requestId: 2, value, memoryCostBytes: 1 });
    assert.equal(delivered.length, 1);
    const worker = recorded.find((e) => e.stage === "floor-worker:prepare-floor");
    assert(worker);
    assert.equal(worker.ms, 5);
    assert.equal("geometry" in worker, false, "non-scalars are dropped");
    assert.equal("name" in worker, false, "long text is dropped");
    assert(recorded.some((e) => e.stage === "floor-main:receive"));
    assert(recorded.some((e) => e.stage === "floor-main:postMessage"));
    const entry = floorDiagnostic("custom", {
      count: 3,
      object: { a: 1 },
      bad: Number.NaN,
    });
    assert.equal(entry?.count, 3);
    assert.equal("object" in entry!, false);
    assert.equal("bad" in entry!, false);
    assert.throws(() =>
      timeFloorStage("throws", () => {
        throw new Error("propagated");
      }),
    );
  } finally {
    configureFloorDiagnostics(false);
    bridge.terminate();
  }
});
