/** Inventory every physical native ramp, without turning helper records or
 * unreviewed entrances into navigation edges. Originals remain read-only.
 * node --import tsx scripts/indoor/prepare-unbc-all-ramps.ts input.zip cache.json output.zip */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { validateIndoorDataset } from "../../app/indoor-project/routing";

type Point = [number, number, number];
type Triangle = Point[];
type Bounds = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};
type Native = {
  elementId: number;
  categoryName: string;
  renderGeometryProvenance?: string;
  boundsFeet: Bounds;
};
const [input, cache, output] = process.argv.slice(2);
assert(input && cache && output && input !== output);
const project = await readIndoorProject(new Uint8Array(await readFile(input)));
const data = project.dataset;
assert.equal(
  data.source.modelSha256,
  "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
);
assert(project.scene);
const before = structuredClone({
  records: data.records,
  nodes: data.nodes,
  edges: data.edges,
  walls: data.walls,
  doors: data.doors,
  floors: data.floors,
  connectors: data.connectors,
  rooms: project.rooms,
});
const model: {
  elementBounds: Native[];
  nativeAssociatedLevelRelations: { elementId: number; levelId: number }[];
} = JSON.parse(await readFile(cache, "utf8"));
const physical = model.elementBounds.filter(
  (r) => r.categoryName === "Ramps" && r.renderGeometryProvenance === "native",
);
const helpers = model.elementBounds.filter(
  (r) =>
    r.categoryName === "Ramps" &&
    r.renderGeometryProvenance === "not-rendered-helper",
);
const scene = project.scene;
const view = new DataView(scene.buffer, scene.byteOffset, scene.byteLength);
const jsonLength = view.getUint32(12, true);
const gltf = JSON.parse(
  new TextDecoder().decode(scene.subarray(20, 20 + jsonLength)),
);
assert.equal(gltf.extras.sourceFile, data.source.modelFileName);
const origin = gltf.extras.originFeet,
  binary = 28 + jsonLength;
function accessor(index: number): number[][] {
  const a = gltf.accessors[index],
    v = gltf.bufferViews[a.bufferView];
  const size = a.componentType === 5123 ? 2 : 4,
    count = a.type === "VEC3" ? 3 : 1;
  assert([5123, 5125, 5126].includes(a.componentType));
  return Array.from({ length: a.count }, (_, i) =>
    Array.from({ length: count }, (_, c) => {
      const at =
        binary +
        (v.byteOffset ?? 0) +
        (a.byteOffset ?? 0) +
        i * (v.byteStride ?? size * count) +
        c * size;
      if (a.componentType === 5126) return view.getFloat32(at, true);
      return size === 2 ? view.getUint16(at, true) : view.getUint32(at, true);
    }),
  );
}
const within = (p: Point, b: Bounds, margin = 0.01) =>
  p.every(
    (v, i) =>
      v >= [b.min.x, b.min.y, b.min.z][i] - margin &&
      v <= [b.max.x, b.max.y, b.max.z][i] + margin,
  );
const near = (a: Bounds, b: Bounds) =>
  a.min.x <= b.max.x + 2.5 &&
  a.max.x >= b.min.x - 2.5 &&
  a.min.y <= b.max.y + 2.5 &&
  a.max.y >= b.min.y - 2.5;
const supports = model.elementBounds.filter(
  (w) =>
    w.categoryName === "Walls" &&
    physical.some(
      (r) =>
        near(w.boundsFeet, r.boundsFeet) &&
        w.boundsFeet.min.z >= r.boundsFeet.min.z - 0.01 &&
        w.boundsFeet.max.z <= r.boundsFeet.max.z + 0.6,
    ),
);
const regions = [...physical, ...supports].map((r) => r.boundsFeet);
const meshes: { index: number; triangles: Triangle[] }[] = [];
for (const [index, mesh] of gltf.meshes.entries()) {
  if (!mesh.name.startsWith("Certified native BRep")) continue;
  const triangles: Triangle[] = [];
  for (const p of mesh.primitives) {
    const vertices = accessor(p.attributes.POSITION),
      indices = accessor(p.indices).flat();
    for (let i = 0; i < indices.length; i += 3) {
      const t: Triangle = indices
        .slice(i, i + 3)
        .map((id) => [
          vertices[id][0] + origin.x,
          vertices[id][1] + origin.y,
          vertices[id][2] + origin.z,
        ]);
      if (regions.some((b) => t.every((p) => within(p, b)))) triangles.push(t);
    }
  }
  if (triangles.length > 0) meshes.push({ index, triangles });
}
const key = (p: Point) => p.map((v) => Math.round(v * 10_000)).join(",");
const edges = (t: Triangle) =>
  t.map((p, i) => [key(p), key(t[(i + 1) % 3])].sort().join("|"));
const upward = ([a, b, c]: Triangle) => {
  const u = b.map((v, i) => v - a[i]),
    v = c.map((p, i) => p - a[i]);
  const n = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  return n[2] / Math.hypot(...n) > 0.5;
};
const envelope = (faces: Triangle[]) => {
  const p = faces.flat();
  return [
    Math.min(...p.map((p) => p[0])),
    Math.min(...p.map((p) => p[1])),
    Math.min(...p.map((p) => p[2])),
    Math.max(...p.map((p) => p[0])),
    Math.max(...p.map((p) => p[1])),
    Math.max(...p.map((p) => p[2])),
  ];
};
function components(faces: Triangle[]) {
  const owners = new Map<string, number[]>();
  faces.forEach((t, i) =>
    edges(t).forEach((k) => owners.set(k, [...(owners.get(k) ?? []), i])),
  );
  const seen = new Set<number>(),
    groups: Triangle[][] = [];
  for (let first = 0; first < faces.length; first++) {
    if (seen.has(first)) continue;
    seen.add(first);
    const pending = [first];
    for (let i = 0; i < pending.length; i++)
      for (const edge of edges(faces[pending[i]]))
        for (const n of owners.get(edge)!) {
          if (!seen.has(n)) {
            seen.add(n);
            pending.push(n);
          }
        }
    groups.push(pending.map((i) => faces[i]));
  }
  return groups;
}
data.rampDisplay ??= {
  version: 1,
  sourceModelSha256: data.source.modelSha256,
  ramps: [],
};
const audit = [];
for (const r of physical) {
  const b = r.boundsFeet,
    expected = [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
  const candidates = meshes
    .flatMap((m) =>
      components(m.triangles.filter((t) => t.every((p) => within(p, b)))).map(
        (faces) => ({ mesh: m.index, faces }),
      ),
    )
    .filter((c) =>
      envelope(c.faces).every((v, i) => Math.abs(v - expected[i]) < 0.02),
    );
  assert.equal(
    candidates.length,
    1,
    `Ramp #${r.elementId}: native solid must match all six source bounds uniquely.`,
  );
  const body = candidates[0].faces;
  const served = data.nativeLevels.filter(
    (l) =>
      l.elevationFeet >= b.min.z - 0.01 && l.elevationFeet <= b.max.z + 0.01,
  );
  const lowest = Math.min(...served.map((l) => l.elevationFeet));
  const top = body.filter(
    (t) => upward(t) && t.every((p) => p[2] >= lowest - 0.01),
  );
  assert(
    top.some(
      (t) =>
        Math.max(...t.map((p) => p[2])) - Math.min(...t.map((p) => p[2])) > 0.1,
    ),
  );
  const zMin = Math.min(...top.flat().map((p) => p[2])),
    zMax = Math.max(...top.flat().map((p) => p[2]));
  const levelIds = data.nativeLevels
    .filter(
      (l) => l.elevationFeet >= zMin - 0.05 && l.elevationFeet <= zMax + 0.05,
    )
    .map((l) => l.id);
  assert(levelIds.length > 0);
  const center = top[0].map((_, i) =>
    top[0].reduce((sum, p) => sum + p[i] / 3, 0),
  ) as Point;
  const touching = data.records.filter(
    (room) =>
      levelIds.includes(room.levelId) &&
      room.ringsFeet[0].some(
        (p) =>
          p[0] >= b.min.x - 3 &&
          p[0] <= b.max.x + 3 &&
          p[1] >= b.min.y - 3 &&
          p[1] <= b.max.y + 3,
      ),
  );
  const nearest = data.records
    .filter((room) => levelIds.includes(room.levelId))
    .sort(
      (a, b) =>
        Math.min(
          ...a.ringsFeet[0].map((p) =>
            Math.hypot(p[0] - center[0], p[1] - center[1]),
          ),
        ) -
        Math.min(
          ...b.ringsFeet[0].map((p) =>
            Math.hypot(p[0] - center[0], p[1] - center[1]),
          ),
        ),
    )[0];
  const buildings = [
    ...new Set(
      (touching.length > 0 ? touching : [nearest])
        .filter(Boolean)
        .map((room) => room.building),
    ),
  ];
  const existing = data.rampDisplay.ramps.find(
    (x) => x.nativeElementId === r.elementId,
  );
  const platforms =
    existing?.platforms ??
    supports
      .filter(
        (w) =>
          near(w.boundsFeet, b) &&
          w.boundsFeet.min.z >= b.min.z - 0.01 &&
          w.boundsFeet.max.z <= b.max.z + 0.6,
      )
      .flatMap((w) => {
        const triangles = meshes
          .flatMap((m) => m.triangles)
          .filter((t) => t.every((p) => within(p, w.boundsFeet)));
        return triangles.length > 0
          ? [{ nativeElementId: w.elementId, trianglesFeet: triangles }]
          : [];
      });
  if (existing) {
    existing.bodyTrianglesFeet = body;
    existing.buildings = buildings;
  } else
    data.rampDisplay.ramps.push({
      displayOnly: true,
      nativeElementId: r.elementId,
      levelIds,
      buildings,
      anchorPointFeet: center,
      trianglesFeet: top,
      bodyTrianglesFeet: body,
      platforms,
    });
  audit.push({
    nativeElementId: r.elementId,
    sourceBoundsFeet: b,
    mesh: candidates[0].mesh,
    topFaces: top.length,
    bodyFaces: body.length,
    levels: levelIds,
    buildings,
    elevationRangeFeet: [zMin, zMax],
    supports: platforms.map((p) => p.nativeElementId),
    navigation: existing?.edgeId ?? "entrances not yet reviewed",
    nearbyAreas: touching.map((r) => ({
      key: r.key,
      number: r.number,
      levelId: r.levelId,
    })),
  });
  console.log(
    `Ramp #${r.elementId}: ${top.length} top faces / ${body.length} solid faces, ${zMin.toFixed(3)} → ${zMax.toFixed(3)} ft`,
  );
}
const native = new Map(model.elementBounds.map((w) => [w.elementId, w]));
const associated = new Map(
  model.nativeAssociatedLevelRelations.map((r) => [r.elementId, r.levelId]),
);
const wallIds = [...new Set(data.walls.map((w) => w.nativeElementId))];
data.wallDisplay = {
  version: 1,
  sourceModelSha256: data.source.modelSha256,
  elements: wallIds.flatMap((id) => {
    const w = native.get(id);
    if (!w) return [];
    const owner = associated.get(id);
    const levelId = data.nativeLevels.some((l) => l.id === owner)
      ? owner!
      : [...data.nativeLevels].sort(
          (a, b) =>
            Math.abs(a.elevationFeet - w.boundsFeet.min.z) -
            Math.abs(b.elevationFeet - w.boundsFeet.min.z),
        )[0].id;
    return [
      {
        nativeElementId: id,
        levelId,
        baseElevationFeet: w.boundsFeet.min.z,
        topElevationFeet: w.boundsFeet.max.z,
      },
    ];
  }),
};
assert.equal(data.rampDisplay.ramps.length, physical.length);
assert(
  !data.rampDisplay.ramps.some((r) =>
    helpers.some((h) => h.elementId === r.nativeElementId),
  ),
);
assert.deepEqual(
  {
    records: data.records,
    nodes: data.nodes,
    edges: data.edges,
    walls: data.walls,
    doors: data.doors,
    floors: data.floors,
    connectors: data.connectors,
    rooms: project.rooms,
  },
  before,
);
validateIndoorDataset(data);
const bytes = await exportIndoorProject(project);
const restored = await readIndoorProject(bytes);
assert.deepEqual(restored.dataset.rampDisplay, data.rampDisplay);
assert.deepEqual(restored.dataset.wallDisplay, data.wallDisplay);
await writeFile(output, bytes);
await writeFile(
  output.replace(/\.zip$/, ".viewer.zip"),
  await exportCampusViewer(project),
);
await writeFile(
  `${output}.ramp-audit.json`,
  JSON.stringify(
    {
      sourceModelSha256: data.source.modelSha256,
      physicalRamps: physical.length,
      excludedHelpers: helpers.map((h) => h.elementId),
      nativeWalls: data.wallDisplay.elements.length,
      ramps: audit,
      graphAndReviewsPreserved: true,
    },
    null,
    2,
  ),
);
console.log(
  `Saved ${output}; all ${physical.length} ramps, ${helpers.length} helpers excluded.`,
);
