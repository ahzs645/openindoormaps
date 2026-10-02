/** Prepare the user-identified Agora ramp from the same model's native scene.
 * Run: node --import tsx scripts/indoor/prepare-unbc-ramp.ts input.zip navigation-model.json output.zip
 * This local review adds one specific ramp; it never approves other campus edges. */
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  readIndoorProject,
  exportIndoorProject,
  reviewEdge,
} from "../../app/indoor-project/package";
import {
  geographicPoint,
  findProjectRoute,
} from "../../app/indoor-project/routing";
import { setReviewPins } from "../../app/indoor-project/review-pins";
import type {
  IndoorEdge,
  IndoorNode,
  IndoorRecord,
} from "../../app/indoor-project/contract";

type Point = [number, number, number];
type Solid = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
  baseElevation: number;
  topElevation: number;
};
type NativeRecord = {
  elementId: number;
  categoryId: number;
  boundsFeet: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  loops?: Point[][];
  solid?: Solid;
  solids?: Solid[];
  stairTreads?: Point[][];
};
const [input, modelCache, output] = process.argv.slice(2);
assert(
  input && modelCache && output,
  "Supply input ZIP, same-model navigation cache, and output ZIP.",
);
let project = await readIndoorProject(new Uint8Array(await readFile(input)));
const model: { elementBounds: NativeRecord[] } = JSON.parse(
  await readFile(modelCache, "utf8"),
);
assert.equal(
  project.dataset.source.modelSha256,
  "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
  "This review belongs to the UNBC source model.",
);
assert(project.scene, "Native source scene is required.");
const data = project.dataset,
  native = new Map(model.elementBounds.map((r) => [r.elementId, r]));
const originalEdges = structuredClone(data.edges);
const ramp = native.get(1_622_190)!;
assert.equal(
  ramp.categoryId,
  -2_000_180,
  "The source element must be a native Ramp, never a stair/helper.",
);
const scene = new DataView(
    project.scene.buffer,
    project.scene.byteOffset,
    project.scene.byteLength,
  ),
  jsonLength = scene.getUint32(12, true);
const gltf = JSON.parse(
  new TextDecoder().decode(project.scene.slice(20, 20 + jsonLength)),
);
assert.equal(gltf.extras.sourceFile, project.manifest.model.fileName);
const origin = gltf.extras.originFeet;
const bufferStart = 28 + jsonLength;
const accessor = (index: number): number[][] => {
  const a = gltf.accessors[index],
    v = gltf.bufferViews[a.bufferView],
    size = a.componentType === 5123 ? 2 : 4,
    count = a.type === "VEC3" ? 3 : 1;
  assert([5123, 5125, 5126].includes(a.componentType));
  return Array.from({ length: a.count }, (_, i) =>
    Array.from({ length: count }, (_, c) => {
      const at =
        bufferStart +
        (v.byteOffset ?? 0) +
        (a.byteOffset ?? 0) +
        i * (v.byteStride ?? count * size) +
        c * size;
      if (a.componentType === 5126) return scene.getFloat32(at, true);
      if (size === 2) return scene.getUint16(at, true);
      return scene.getUint32(at, true);
    }),
  );
};
const inside = (p: readonly number[], ring: readonly (readonly number[])[]) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
};
const surfaceHeight = (
  p: readonly number[],
  t: Point[],
): number | undefined => {
  const [a, b, c] = t,
    den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(den) < 1e-8) return undefined;
  const u =
      ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / den,
    v = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / den;
  return Math.min(u, v, 1 - u - v) >= -0.0001
    ? u * a[2] + v * b[2] + (1 - u - v) * c[2]
    : undefined;
};
const candidates: { mesh: number; triangle: Point[] }[] = [];
for (const [mesh, m] of gltf.meshes.entries()) {
  if (!m.name.startsWith("Certified native BRep")) continue;
  for (const p of m.primitives) {
    const vertices = accessor(p.attributes.POSITION),
      indices = accessor(p.indices).flat();
    for (let i = 0; i < indices.length; i += 3) {
      const triangle: Point[] = indices
        .slice(i, i + 3)
        .map((id) => [
          vertices[id][0] + origin.x,
          vertices[id][1] + origin.y,
          vertices[id][2] + origin.z,
        ]);
      if (
        !triangle.every(
          ([x, y, z]) =>
            x >= ramp.boundsFeet.min.x - 0.001 &&
            x <= ramp.boundsFeet.max.x + 0.001 &&
            y >= ramp.boundsFeet.min.y - 0.001 &&
            y <= ramp.boundsFeet.max.y + 0.001 &&
            z >= -0.001 &&
            z <= ramp.boundsFeet.max.z + 0.001,
        )
      )
        continue;
      const [a, b, c] = triangle,
        nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (nz > 0.01) candidates.push({ mesh, triangle });
    }
  }
}
// The matching body must own both slopes and a common turning landing. Nearby
// parapets/floors cannot qualify merely because their bounding boxes overlap.
const slopeMeshes = [
  ...new Set(
    candidates
      .filter(
        ({ triangle: t }) =>
          Math.max(...t.map((p) => p[2])) - Math.min(...t.map((p) => p[2])) >
          0.5,
      )
      .map((t) => t.mesh),
  ),
].filter((mesh) => {
  const points = candidates
    .filter((t) => t.mesh === mesh)
    .flatMap((t) => t.triangle);
  const actual = [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
    Math.min(...points.map((p) => p[2])),
    Math.max(...points.map((p) => p[2])),
  ];
  const expected = [
    ramp.boundsFeet.min.x,
    ramp.boundsFeet.min.y,
    ramp.boundsFeet.max.x,
    ramp.boundsFeet.max.y,
    0,
    ramp.boundsFeet.max.z,
  ];
  return actual.every((v, i) => Math.abs(v - expected[i]) < 0.001);
});
assert.equal(
  slopeMeshes.length,
  1,
  "Ambiguous native ramp body; stop rather than infer a route.",
);
const triangles = candidates
  .filter((t) => t.mesh === slopeMeshes[0])
  .map((t) => t.triangle);
assert.equal(
  triangles.length,
  7,
  "Expected two native runs and their turning landing.",
);
const z0 = 0,
  z1 = 1.400_980_050_795_347_2,
  z2 = 3.280_839_895_013_123_5;
const lower: Point = [48.217_99, 461.5, z0],
  upper: Point = [55.5, 466.5, z2];
const path: Point[] = [
  lower,
  [33.496_864_884_093_21, 461.5, z1],
  [31, 461.5, z1],
  [31, 466.5, z1],
  [33.496_864_884_093_21, 466.5, z1],
  [53.249_93, 466.5, z2],
  upper,
];
const samples = (points: Point[]) =>
  points.slice(1).flatMap((b, i) => {
    const a = points[i],
      count = Math.max(
        1,
        Math.ceil(Math.hypot(...b.map((v, c) => v - a[c])) / 0.1),
      );
    return Array.from(
      { length: count + 1 },
      (_, j) => a.map((v, c) => v + ((b[c] - v) * j) / count) as Point,
    );
  });
const floorSupports = (p: Point) =>
  [400_238, 1_514_723].some((id) => {
    const r = native.get(id)!,
      rings = r.loops ?? [];
    return (
      Math.abs(p[2] - r.boundsFeet.max.z) < 0.001 &&
      !!rings[0] &&
      inside(p, rings[0]) &&
      !rings.slice(1).some((h) => inside(p, h))
    );
  });
const allTreads = model.elementBounds.flatMap((r) => r.stairTreads ?? []);
const walls = model.elementBounds.filter(
  (r) =>
    r.categoryId === -2_000_011 &&
    r.boundsFeet.min.x < 65 &&
    r.boundsFeet.max.x > 10 &&
    r.boundsFeet.min.y < 469 &&
    r.boundsFeet.max.y > 395,
);
const wallBlocks = (p: Point) =>
  walls.some((r) =>
    (r.solids ?? (r.solid ? [r.solid] : [])).some((s) => {
      if (s.baseElevation > p[2] + 0.1 || s.topElevation < p[2] + 0.1)
        return false;
      const a = [s.start.x, s.start.y],
        b = [s.end.x, s.end.y],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        len2 = dx * dx + dy * dy;
      const f = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
      return (
        f >= 0 &&
        f <= 1 &&
        Math.hypot(p[0] - a[0] - f * dx, p[1] - a[1] - f * dy) < s.thickness / 2
      );
    }),
  );
const assertSupport = (points: Point[]) => {
  for (const p of samples(points)) {
    assert(
      floorSupports(p) ||
        triangles.some((t) => {
          const z = surfaceHeight(p, t);
          return z !== undefined && Math.abs(z - p[2]) < 0.002;
        }),
      `No native walking surface at ${p}`,
    );
    assert(
      !allTreads.some(
        (t) =>
          inside(p, t) && t.some((v) => v[2] > p[2] + 0.05 && v[2] < p[2] + 6),
      ),
      `Stair intersects ramp at ${p}`,
    );
    assert(!wallBlocks(p), `Native wall intersects ramp at ${p}`);
  }
};
assertSupport(path);
const room = data.records.find(
  (r) => r.number === "07-180" && r.levelId === 311,
)!;
const arrival = data.nodes.find((n) => n.id === room.arrivalNodeId)!;
const oldStair = data.edges.find(
  (e) => e.nativeElementId === 1_620_957 && e.kind === "local-steps",
)!;
const oldUpper = data.nodes.find((n) => n.id === oldStair.to)!;
const approach: Point[] = [
  arrival.pointFeet,
  [16.2, 451, 0],
  [50, 451, 0],
  [50, 461.5, 0],
  lower,
];
const upperApproach: Point[] = [upper, [56, 465, z2], oldUpper.pointFeet];
assertSupport(approach);
assertSupport(upperApproach);
assert.equal(oldStair.accessible, "no");
const lowerKey = "landing:ramp:1622190:lower",
  upperKey = oldUpper.roomKey;
assert(
  !data.edges.some((e) => e.id === "ramp:1622190"),
  "Ramp already prepared.",
);
const generated: IndoorRecord = {
  key: lowerKey,
  number: "",
  name: "Agora ramp approach",
  building: "07",
  levelId: 311,
  elevationFeet: 0,
  elevationEvidence: "Native slab #400238",
  surfaceId: room.surfaceId,
  circulation: true,
  stair: false,
  access: "unknown",
  walkable: true,
  confidence: 1,
  ringsFeet: [
    [
      [48.217_99, 460.3],
      [51, 460.3],
      [51, 462.7],
      [48.217_99, 462.7],
    ],
  ],
  properties: {
    nativeFloorId: 400_238,
    nativeRampId: 1_622_190,
    generatedLanding: true,
  },
};
data.records.push(generated);
const makeNode = (
  id: string,
  pointFeet: Point,
  r: IndoorRecord,
): IndoorNode => ({
  id,
  roomKey: r.key,
  levelId: r.levelId,
  building: r.building,
  surfaceId: r.surfaceId,
  pointFeet,
  geographic: geographicPoint(data, pointFeet),
  kind: "connector",
});
const upperRecord = data.records.find((r) => r.key === upperKey)!;
const lowNode = makeNode("ramp:1622190:lower", lower, generated),
  highNode = makeNode("ramp:1622190:upper", upper, upperRecord);
data.nodes.push(lowNode, highNode);
upperRecord.name = "Conference Centre ramp landing";
upperRecord.arrivalNodeId = oldUpper.id;
const length = (points: Point[]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum + Math.hypot(...p.map((v, c) => v - points[i][c])) * 0.3048,
      0,
    );
const addEdge = (
  id: string,
  from: string,
  to: string,
  kind: IndoorEdge["kind"],
  pointsFeet: Point[],
  roomKeys: string[],
) => {
  data.edges.push({
    id,
    from,
    to,
    kind,
    pointsFeet,
    roomKeys,
    lengthMetres: length(pointsFeet),
    evidence:
      "user-reported wheelchair ramp + continuously checked native walking surfaces and walls",
    nativeElementId: 1_622_190,
    accessible: "unknown",
    enabled: true,
  });
  project = reviewEdge(project, id, {
    accessible: "yes",
    notes:
      "User identifies the separate ramp as the wheelchair alternative. Source category Ramps #1622190; two continuous native BRep slopes and turning landing, supported approaches, no stair treads or wall crossing. This specific review does not certify building-code compliance or other campus routes.",
  });
  // reviewEdge intentionally clones; all subsequent changes use its current dataset.
  Object.assign(data, project.dataset);
  project.dataset = data;
};
addEdge("walk:ramp:1622190:lower", arrival.id, lowNode.id, "walk", approach, [
  room.key,
  lowerKey,
]);
addEdge("ramp:1622190", lowNode.id, highNode.id, "ramp", path, [
  lowerKey,
  upperKey,
]);
addEdge(
  "walk:ramp:1622190:upper",
  highNode.id,
  oldUpper.id,
  "walk",
  upperApproach,
  [upperKey],
);
const pin = project.rooms.reviewPins?.pins.find((p) =>
  p.label.startsWith("Ramp"),
);
const anchor: Point = pin
  ? ([...pin.pointFeet, 0] as Point)
  : [41.788_460_183_837_56, 465.161_337_026_086_47, 0];
anchor[2] = triangles
  .map((t) => surfaceHeight(anchor, t))
  .find((z) => z !== undefined)!;
assert(Number.isFinite(anchor[2]));
data.rampDisplay = {
  version: 1,
  sourceModelSha256: data.source.modelSha256,
  ramps: [
    {
      edgeId: "ramp:1622190",
      nativeElementId: 1_622_190,
      levelIds: [311, 1_487_816],
      anchorPointFeet: anchor,
      trianglesFeet: triangles,
    },
  ],
};
project.rooms.indoorRamps = {
  version: 1,
  sourceModelSha256: data.source.modelSha256,
  ramps: [
    {
      id: "ramp:1622190",
      nativeRampId: 1_622_190,
      floorElementIds: [400_238, 1_514_723],
      evidence: "user-reported + native-supported",
      accessible: "yes",
      pointsFeet: path,
      trianglesFeet: triangles,
      notes:
        "Separate wheelchair alternative beside local steps #1620957. Native ramp category, two sloped runs with turning landing. Preserve this distinct path during regeneration.",
    },
  ],
};
if (pin)
  project = setReviewPins(
    project,
    project.rooms.reviewPins!.pins.map((p) =>
      p.id === pin.id
        ? {
            ...p,
            label: "Ramp · wheelchair route",
            notes:
              "Native ramp #1622190 beside stairs #1620957. Prepared as a separate wheelchair connection with both sloping runs and its turning landing; the stair connection remains non-accessible.",
          }
        : p,
    ),
  );
const next = project.dataset;
next.report.recordCount = next.records.length;
next.report.routableArrivals = next.records.filter(
  (r) => r.arrivalNodeId,
).length;
const route = findProjectRoute(next, room.key, upperKey, "accessible"),
  reverse = findProjectRoute(next, upperKey, room.key, "accessible");
assert(route && reverse);
assert(route.edges.some((e) => e.kind === "ramp"));
assert(!route.edges.some((e) => ["stairs", "local-steps"].includes(e.kind)));
assert.equal(route.unknownAccessibilityEdges, 0);
const bytes = await exportIndoorProject(project),
  restored = await readIndoorProject(bytes);
assert.deepEqual(restored.scene, project.scene);
assert.deepEqual(restored.dataset.connectors, project.dataset.connectors);
assert.deepEqual(
  restored.dataset.edges.find((e) => e.id === oldStair.id),
  oldStair,
);
const originalEdgeIds = new Set(originalEdges.map((e) => e.id));
assert.deepEqual(
  restored.dataset.edges.filter((e) => originalEdgeIds.has(e.id)),
  originalEdges,
);
await writeFile(output, bytes);
const audit = {
  input,
  output,
  nativeRampId: 1_622_190,
  nativeCategory: "Ramps",
  nativeFaces: triangles.length,
  riseMetres: z2 * 0.3048,
  pathMetres: length(path),
  maximumSourceSlopePercent:
    (100 * (z2 - z1)) / (53.249_93 - 33.496_864_884_093_21),
  sourceChecks:
    "0.1 ft samples on native ramp/slab faces; no walls or stair treads intersect",
  wheelchairRoute: {
    from: room.number,
    to: upperRecord.name,
    distanceMetres: route.distanceMetres,
    edgeIds: route.edges.map((e) => e.id),
    unknownAccessibilityEdges: route.unknownAccessibilityEdges,
    reverseWorks: !!reverse,
  },
  preservedElevators: restored.dataset.connectors?.length,
  otherEdgesChanged: 0,
};
await writeFile(output + ".audit.json", JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2));
