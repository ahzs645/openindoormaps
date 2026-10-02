/** Source-supported display enrichment. No routing/accessibility edits.
 * node --import tsx scripts/indoor/prepare-unbc-platforms.ts input.zip navigation-model.json output.zip */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  readIndoorProject,
  exportIndoorProject,
} from "../../app/indoor-project/package";
import {
  validateIndoorDataset,
  findProjectRoute,
} from "../../app/indoor-project/routing";
type Point = [number, number, number];
type Triangle = Point[];
type Bounds = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};
type Native = {
  elementId: number;
  categoryName: string;
  boundsFeet: Bounds;
  stairTreads?: Point[][];
  stairTreadThicknessFeet?: number;
  loops?: Point[][];
};
const [input, cache, output] = process.argv.slice(2);
assert(
  input && cache && output && input !== output,
  "Supply distinct input/output ZIPs and the native model cache.",
);
const project = await readIndoorProject(new Uint8Array(await readFile(input)));
const data = project.dataset,
  scene = project.scene!;
assert(
  scene &&
    data.source.modelSha256 ===
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
  "UNBC native scene and source model required.",
);
const model: {
  elementBounds: Native[];
  nativeStairAssemblies: {
    stairElementId: number;
    runAndLandingIds: number[];
  }[];
} = JSON.parse(await readFile(cache, "utf8"));
const native = new Map(model.elementBounds.map((r) => [r.elementId, r]));
const before = structuredClone({
  records: data.records,
  nodes: data.nodes,
  edges: data.edges,
  floors: data.floors,
  walls: data.walls,
  doors: data.doors,
  connectors: data.connectors,
  reviews: project.rooms.indoorReviews,
});
const view = new DataView(scene.buffer, scene.byteOffset, scene.byteLength),
  jsonLength = view.getUint32(12, true);
const gltf = JSON.parse(
  new TextDecoder().decode(scene.subarray(20, 20 + jsonLength)),
);
assert.equal(gltf.extras.sourceFile, data.source.modelFileName);
const origin = gltf.extras.originFeet,
  binary = 28 + jsonLength;
function accessor(index: number): number[][] {
  const a = gltf.accessors[index],
    v = gltf.bufferViews[a.bufferView],
    size = a.componentType === 5123 ? 2 : 4,
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
function within(p: Point, b: Bounds, margin = 0.01) {
  return p.every(
    (v, i) =>
      v >= [b.min.x, b.min.y, b.min.z][i] - margin &&
      v <= [b.max.x, b.max.y, b.max.z][i] + margin,
  );
}
const rampBounds = data.rampDisplay!.ramps.map(
  (r) => native.get(r.nativeElementId)!.boundsFeet,
);
const supportWalls = model.elementBounds.filter(
  (w) =>
    w.categoryName === "Walls" &&
    rampBounds.some(
      (b) =>
        w.boundsFeet.min.z >= b.min.z - 0.01 &&
        w.boundsFeet.max.z <= b.max.z + 0.6 &&
        w.boundsFeet.min.x <= b.max.x + 2.5 &&
        w.boundsFeet.max.x >= b.min.x - 2.5 &&
        w.boundsFeet.min.y <= b.max.y + 2.5 &&
        w.boundsFeet.max.y >= b.min.y - 2.5,
    ),
);
const regions = [...rampBounds, ...supportWalls.map((w) => w.boundsFeet)];
const meshes: { index: number; triangles: Triangle[] }[] = [];
for (const [index, mesh] of gltf.meshes.entries()) {
  if (!mesh.name.startsWith("Certified native BRep")) continue;
  const triangles: Triangle[] = [];
  for (const primitive of mesh.primitives) {
    const vertices = accessor(primitive.attributes.POSITION),
      indices = accessor(primitive.indices).flat();
    for (let i = 0; i < indices.length; i += 3) {
      const t: Triangle = indices
        .slice(i, i + 3)
        .map((id: number) => [
          vertices[id][0] + origin.x,
          vertices[id][1] + origin.y,
          vertices[id][2] + origin.z,
        ]);
      if (regions.some((b) => t.every((p) => within(p, b)))) triangles.push(t);
    }
  }
  if (triangles.length > 0) meshes.push({ index, triangles });
}
const pointKey = (p: Point) => p.map((v) => Math.round(v * 10_000)).join(",");
const triangleKey = (t: Triangle) =>
  t
    .map((p) => pointKey(p))
    .sort()
    .join(";");
const edgeKeys = (t: Triangle) =>
  t.map((p, i) => [pointKey(p), pointKey(t[(i + 1) % 3])].sort().join("|"));
const audit: unknown[] = [];
for (const ramp of data.rampDisplay!.ramps) {
  const b = native.get(ramp.nativeElementId)!.boundsFeet;
  const topKeys = new Set(ramp.trianglesFeet.map((t) => triangleKey(t)));
  const matching = meshes.filter((m) =>
    ramp.trianglesFeet.every((top) =>
      m.triangles.some((t) => triangleKey(t) === triangleKey(top)),
    ),
  );
  assert.equal(
    matching.length,
    1,
    "Native ramp body must match all prepared slope/landing faces unambiguously.",
  );
  const faces = matching[0].triangles.filter((t) =>
    t.every((p) => within(p, b)),
  );
  const owners = new Map<string, number[]>();
  faces.forEach((t, i) =>
    edgeKeys(t).forEach((key) =>
      owners.set(key, [...(owners.get(key) ?? []), i]),
    ),
  );
  const body = new Set(
    faces.flatMap((t, i) => (topKeys.has(triangleKey(t)) ? [i] : [])),
  );
  const pending = [...body];
  for (let i = 0; i < pending.length; i++)
    for (const edge of edgeKeys(faces[pending[i]]))
      for (const neighbour of owners.get(edge)!) {
        if (!body.has(neighbour)) {
          body.add(neighbour);
          pending.push(neighbour);
        }
      }
  ramp.bodyTrianglesFeet = [...body].map((i) => faces[i]);
  assert(ramp.bodyTrianglesFeet.length > ramp.trianglesFeet.length);
  assert(ramp.bodyTrianglesFeet.flat().some((p) => p[2] < 0));
  ramp.platforms = supportWalls
    .filter(
      (w) =>
        w.boundsFeet.min.x <= b.max.x + 2.5 &&
        w.boundsFeet.max.x >= b.min.x - 2.5 &&
        w.boundsFeet.min.y <= b.max.y + 2.5 &&
        w.boundsFeet.max.y >= b.min.y - 2.5,
    )
    .flatMap((wall) => {
      const triangles = meshes
        .flatMap((m) => m.triangles)
        .filter((t) => t.every((p) => within(p, wall.boundsFeet)));
      const unique = [
        ...new Map(triangles.map((t) => [triangleKey(t), t])).values(),
      ];
      return unique.length > 0
        ? [{ nativeElementId: wall.elementId, trianglesFeet: unique }]
        : [];
    });
  audit.push({
    ramp: ramp.nativeElementId,
    topFaces: ramp.trianglesFeet.length,
    bodyFaces: ramp.bodyTrianglesFeet.length,
    supports: ramp.platforms.map((p) => ({
      id: p.nativeElementId,
      faces: p.trianglesFeet.length,
    })),
  });
}
const addedFlights = [];
for (const edge of data.edges.filter(
  (e) => e.kind === "stairs" || e.kind === "local-steps",
)) {
  if (
    !edge.nativeElementId ||
    data.stairDisplay?.flights.some(
      (f) => f.stairElementId === edge.nativeElementId,
    )
  )
    continue;
  const assembly = model.nativeStairAssemblies.find(
    (a) => a.stairElementId === edge.nativeElementId,
  );
  if (!assembly) continue;
  const runs = assembly.runAndLandingIds.flatMap((id) =>
    native.get(id)?.stairTreads?.length ? [native.get(id)!] : [],
  );
  if (runs.length === 0) continue;
  const bottom = Math.min(
    ...runs.flatMap((run) => run.stairTreads!.flat().map((p) => p[2])),
  );
  const room = data.records
    .filter(
      (r) =>
        edge.roomKeys.includes(r.key) &&
        r.walkable &&
        project.rooms.annotations.some((a) => a.key === r.key),
    )
    .sort(
      (a, b) =>
        Math.abs(a.elevationFeet - bottom) - Math.abs(b.elevationFeet - bottom),
    )[0];
  if (!room) continue;
  const treads = runs.flatMap((run) =>
    run.stairTreads!.map((t) => ({
      runElementId: run.elementId,
      elevationFeet: t[0][2],
      thicknessFeet: run.stairTreadThicknessFeet,
      ringFeet: t.map((p) => [p[0], p[1]] as [number, number]),
    })),
  );
  assert(treads.every((t) => t.ringFeet.length >= 3));
  data.stairDisplay!.flights.push({
    roomKey: room.key,
    levelId: room.levelId,
    floorElevationFeet: room.elevationFeet,
    sourceGeometryKey: JSON.stringify([
      room.levelId,
      room.elevationFeet,
      room.ringsFeet,
    ]),
    stairElementId: edge.nativeElementId,
    ...(room.stair ? {} : { displayOnly: true as const }),
    treads,
  });
  if (!room.stair) {
    const annotation = project.rooms.annotations.find(
      (a) => a.key === room.key,
    )!;
    const existing = Array.isArray(annotation.stairDisplayOnlyFlightIds)
      ? annotation.stairDisplayOnlyFlightIds
      : [];
    annotation.stairDisplayOnlyFlightIds = [
      ...new Set([...existing, edge.nativeElementId]),
    ];
  }
  addedFlights.push({
    stair: edge.nativeElementId,
    room: room.key,
    treads: treads.length,
  });
}
validateIndoorDataset(data);
assert.deepEqual(
  {
    records: data.records,
    nodes: data.nodes,
    edges: data.edges,
    floors: data.floors,
    walls: data.walls,
    doors: data.doors,
    connectors: data.connectors,
    reviews: project.rooms.indoorReviews,
  },
  before,
);
assert(data.stairDisplay!.flights.some((f) => f.stairElementId === 1_620_957));
assert.deepEqual(
  findProjectRoute(
    data,
    "rm-311-86e02816d8fe",
    "landing:local:07:311:08:1487816:1620957:1",
    "accessible",
  )!.edges.map((e) => e.kind),
  ["walk", "ramp", "walk"],
);
const bytes = await exportIndoorProject(project),
  restored = await readIndoorProject(bytes);
assert.deepEqual(restored.dataset.rampDisplay, data.rampDisplay);
assert.deepEqual(restored.dataset.stairDisplay, data.stairDisplay);
await writeFile(output, bytes);
await writeFile(
  output + ".display-audit.json",
  JSON.stringify(
    {
      sourceModelSha256: data.source.modelSha256,
      input,
      output,
      ramps: audit,
      addedFlights,
      navigationUnchanged: true,
      reviewApprovalsUnchanged: true,
      roundtripPassed: true,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ output, ramps: audit, addedFlights }, null, 2));
