/** Prepare every physical source staircase for relative-height inspection.
 * Source inventory and geometry never grant navigation permission.
 * node --import tsx scripts/indoor/prepare-unbc-all-stairs.ts input.zip native-cache.json output.zip */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import polygonClipping from "polygon-clipping";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
type Point = [number, number, number];
type Bounds = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};
type Native = {
  elementId: number;
  boundsFeet?: Bounds;
  stairTreads?: Point[][];
  stairTreadThicknessFeet?: number;
};
type Assembly = { stairElementId: number; runAndLandingIds: number[] };
type Flight = NonNullable<
  NonNullable<IndoorDataset["stairDisplay"]>["sourceFlights"]
>[number];
const [input, cache, output] = process.argv.slice(2);
assert(input && cache && output && input !== output);
const project = await readIndoorProject(new Uint8Array(await readFile(input))),
  data = project.dataset;
assert.equal(
  data.source.modelSha256,
  "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
);
assert(project.scene && data.stairDisplay);
const original = structuredClone({
  records: data.records,
  nodes: data.nodes,
  edges: data.edges,
  walls: data.walls,
  doors: data.doors,
  floors: data.floors,
  rooms: project.rooms,
  ramps: data.rampDisplay,
  flights: data.stairDisplay.flights,
});
const model: { elementBounds: Native[]; nativeStairAssemblies: Assembly[] } =
  JSON.parse(await readFile(cache, "utf8"));
const native = new Map(model.elementBounds.map((r) => [r.elementId, r]));
const scene = project.scene,
  view = new DataView(scene.buffer, scene.byteOffset, scene.byteLength),
  jsonLength = view.getUint32(12, true);
const gltf = JSON.parse(
    new TextDecoder().decode(scene.subarray(20, 20 + jsonLength)),
  ),
  origin = gltf.extras.originFeet,
  binary = 28 + jsonLength;
assert.equal(gltf.extras.sourceFile, data.source.modelFileName);
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
const unresolved = model.nativeStairAssemblies.flatMap((a) =>
  a.runAndLandingIds
    .map((id) => native.get(id))
    .filter(
      (r): r is Native => !!r && !r.stairTreads?.length && !!r.boundsFeet,
    ),
);
const faces = new Map(
  unresolved.map((r) => [r.elementId, new Map<string, Point[]>()]),
);
if (unresolved.length > 0) {
  for (const mesh of gltf.meshes) {
    if (!mesh.name.startsWith("Certified native BRep")) continue;
    for (const primitive of mesh.primitives) {
      const positions = accessor(primitive.attributes.POSITION),
        indices = accessor(primitive.indices).flat();
      for (let i = 0; i < indices.length; i += 3) {
        const t: Point[] = indices
          .slice(i, i + 3)
          .map((id) => [
            positions[id][0] + origin.x,
            positions[id][1] + origin.y,
            positions[id][2] + origin.z,
          ]);
        if (
          Math.max(...t.map((p) => p[2])) - Math.min(...t.map((p) => p[2])) >
          0.002
        )
          continue;
        const [a, b, c] = t,
          area =
            ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
        // Large upward faces recover actual treads; thin nosing undersides and rails stay out.
        if (area < 0.2) continue;
        for (const r of unresolved) {
          const b = r.boundsFeet!;
          if (
            t.every(
              (p) =>
                p[0] >= b.min.x - 0.02 &&
                p[0] <= b.max.x + 0.02 &&
                p[1] >= b.min.y - 0.02 &&
                p[1] <= b.max.y + 0.02 &&
                p[2] >= b.min.z - 0.02 &&
                p[2] <= b.max.z + 0.02,
            )
          ) {
            const key = t
              .map((p) => p.map((v) => Math.round(v * 10_000)).join(","))
              .sort()
              .join("|");
            faces.get(r.elementId)!.set(key, t);
          }
        }
      }
    }
  }
}
function recover(run: Native): Flight["treads"] {
  const groups = new Map<number, Point[][]>();
  for (const t of faces.get(run.elementId)?.values() ?? []) {
    const z = Math.round(t[0][2] * 10_000) / 10_000;
    groups.set(z, [...(groups.get(z) ?? []), t]);
  }
  const result: Flight["treads"] = [];
  for (const [z, ts] of groups) {
    const polygons = ts.map((t) => [
      t.map(
        (p) =>
          [Math.round(p[0] * 1e5), Math.round(p[1] * 1e5)] as [number, number],
      ),
    ]);
    if (!polygons.length) continue;
    const parts = polygonClipping.union(polygons[0], ...polygons.slice(1));
    for (const p of parts) {
      assert.equal(p.length, 1);
      result.push({
        runElementId: run.elementId,
        elevationFeet: z,
        thicknessFeet: 0.164_041_994_750_656_17,
        ringFeet: p[0].slice(0, -1).map((p) => [p[0] / 1e5, p[1] / 1e5]),
      });
    }
  }
  return result;
}
const sourceFlights: Flight[] = [],
  audit = [];
for (const a of model.nativeStairAssemblies) {
  const runs = a.runAndLandingIds
    .map((id) => native.get(id))
    .filter((r): r is Native => !!r);
  let recovered = false;
  const treads = runs.flatMap((r) => {
    if (r.stairTreads?.length)
      return r.stairTreads.map((t) => ({
        runElementId: r.elementId,
        elevationFeet: t[0][2],
        ...(r.stairTreadThicknessFeet
          ? { thicknessFeet: r.stairTreadThicknessFeet }
          : {}),
        ringFeet: t.map((p) => [p[0], p[1]] as [number, number]),
      }));
    const t = recover(r);
    if (t.length > 0) recovered = true;
    return t;
  });
  assert(
    treads.length,
    `No native tread geometry for stair ${a.stairElementId}`,
  );
  const seen = new Set<string>(),
    unique = treads.filter((t) => {
      const key = JSON.stringify([t.runElementId, t.elevationFeet, t.ringFeet]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const points = unique.flatMap((t) => t.ringFeet),
    z = unique.map((t) => t.elevationFeet);
  const bottom =
    native.get(a.stairElementId)?.boundsFeet?.min.z ??
    Math.min(
      ...runs.filter((r) => r.boundsFeet).map((r) => r.boundsFeet!.min.z),
    );
  const low = [...data.nativeLevels].sort(
    (a, b) =>
      Math.abs(a.elevationFeet - bottom) - Math.abs(b.elevationFeet - bottom),
  )[0];
  const high = [...data.nativeLevels].sort(
    (a, b) =>
      Math.abs(a.elevationFeet - Math.max(...z)) -
      Math.abs(b.elevationFeet - Math.max(...z)),
  )[0];
  const levelIds = data.nativeLevels
    .filter(
      (l) =>
        l.elevationFeet >= low.elevationFeet - 0.01 &&
        l.elevationFeet <= high.elevationFeet + 0.01,
    )
    .map((l) => l.id);
  assert(levelIds.length);
  const center: [number, number] = [
    (Math.min(...points.map((p) => p[0])) +
      Math.max(...points.map((p) => p[0]))) /
      2,
    (Math.min(...points.map((p) => p[1])) +
      Math.max(...points.map((p) => p[1]))) /
      2,
  ];
  const nearby = data.records
    .filter((r) => levelIds.includes(r.levelId))
    .map((r) => ({
      r,
      dist: pointInPolygon(center, {
        type: "Polygon",
        coordinates: r.ringsFeet.map((r) => [...r, r[0]]),
      })
        ? 0
        : Math.min(
            ...r.ringsFeet
              .flat()
              .map((p) => Math.hypot(p[0] - center[0], p[1] - center[1])),
          ),
    }))
    .sort((a, b) => a.dist - b.dist);
  const buildings = [
    ...new Set(
      nearby
        .filter((n) => n.dist <= Math.max(15, nearby[0]?.dist ?? 0))
        .map((n) => n.r.building),
    ),
  ];
  sourceFlights.push({
    stairElementId: a.stairElementId,
    levelIds,
    buildings,
    floorElevationFeet: low.elevationFeet,
    sourceGeometry: recovered ? "native-brep" : "native-cache",
    treads: unique,
  });
  audit.push({
    stairElementId: a.stairElementId,
    runIds: runs.map((r) => r.elementId),
    levelIds,
    buildings,
    treadPolygons: unique.length,
    stepElevations: [...new Set(z)].sort((a, b) => a - b),
    previouslyDisplayed: data.stairDisplay.flights.some(
      (f) => f.stairElementId === a.stairElementId,
    ),
    sourceGeometry: recovered ? "native-brep" : "native-cache",
    routeEdges: data.edges
      .filter(
        (e) =>
          e.nativeElementId === a.stairElementId &&
          ["stairs", "local-steps"].includes(e.kind),
      )
      .map((e) => ({
        id: e.id,
        enabled: e.enabled,
        accessible: e.accessible,
      })),
    nearbyAreas: nearby.slice(0, 3).map((n) => ({
      key: n.r.key,
      number: n.r.number,
      levelId: n.r.levelId,
      distanceFeet: n.dist,
    })),
  });
}
data.stairDisplay.sourceFlights = sourceFlights;
assert.equal(sourceFlights.length, 82);
assert.equal(
  sourceFlights.find((f) => f.stairElementId === 1_430_244)!.treads.length,
  7,
);
validateIndoorDataset(data);
assert.deepEqual(
  {
    records: data.records,
    nodes: data.nodes,
    edges: data.edges,
    walls: data.walls,
    doors: data.doors,
    floors: data.floors,
    rooms: project.rooms,
    ramps: data.rampDisplay,
    flights: data.stairDisplay.flights,
  },
  original,
);
await writeFile(output, await exportIndoorProject(project));
await writeFile(
  output.replace(/\.zip$/u, ".viewer.zip"),
  await exportCampusViewer(project),
);
await writeFile(
  output + ".stair-audit.json",
  JSON.stringify(
    {
      sourceModelSha256: data.source.modelSha256,
      physicalStairs: sourceFlights.length,
      previouslyDisplayed: audit.filter((a) => a.previouslyDisplayed).length,
      added: audit.filter((a) => !a.previouslyDisplayed).length,
      graphAndReviewsPreserved: true,
      assemblies: audit,
    },
    null,
    2,
  ),
);
const restored = await readIndoorProject(
  new Uint8Array(await readFile(output)),
);
assert.deepEqual(restored.dataset.stairDisplay, data.stairDisplay);
console.log(
  JSON.stringify(
    {
      output,
      physicalStairs: sourceFlights.length,
      added: audit.filter((a) => !a.previouslyDisplayed).length,
      brepRecovered: audit
        .filter((a) => a.sourceGeometry === "native-brep")
        .map((a) => a.stairElementId),
      pinExample: sourceFlights.find((f) => f.stairElementId === 1_588_220),
    },
    null,
    2,
  ),
);
