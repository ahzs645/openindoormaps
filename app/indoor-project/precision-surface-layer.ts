import maplibregl, { type CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";
import type {
  FeatureCollection,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";
import { requestPrecisionSurfaceUnion } from "./precision-surface-union-worker-bridge";
import {
  HALLWAY_COLOR,
  OVERVIEW_SOLID_COLOR,
  RESTRICTED_AREA_COLOR,
} from "./display-passages";
import {
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
  zoomFade,
} from "./zoom-presentation";

type SurfaceKind = "floor" | "room";
type SurfaceProperties = {
  nativeFloor?: boolean;
  circulation?: boolean;
  access?: string;
  key?: string;
  color?: string;
};
type GeometryOptions = {
  kind: SurfaceKind;
  relativeHeights?: boolean;
  circulationOnly?: boolean;
  perimeters?: FeatureCollection<MultiLineString>;
};
export type PrecisionSurfaceMesh = {
  positions: Float32Array;
  vertices: number;
  ranges: {
    start: number;
    count: number;
    base: number;
    top: number;
    properties: SurfaceProperties;
  }[];
  sides: {
    positions: Float32Array;
    topVertices: Uint8Array;
    vertices: number;
    ranges: PrecisionSurfaceMesh["ranges"];
  };
};
/** Draw backing color before the named area, then restore backing depth.
 * Source bases stay ordered so a raised slab still occludes a lower floor. */
export function precisionFloorDepthPasses(mesh: PrecisionSurfaceMesh) {
  const passes: {
    base: number;
    source: "physical" | "area";
    depthWrite: boolean;
    colorWrite: boolean;
  }[] = [];
  const bases = [...new Set(mesh.ranges.map((range) => range.base))].sort(
    (a, b) => a - b,
  );
  for (const base of bases) {
    const ranges = mesh.ranges.filter((range) => range.base === base),
      physical = ranges.some((range) => range.properties.nativeFloor === true),
      area = ranges.some((range) => range.properties.nativeFloor !== true);
    if (physical)
      passes.push({
        base,
        source: "physical",
        depthWrite: !area,
        colorWrite: true,
      });
    if (area)
      passes.push({ base, source: "area", depthWrite: true, colorWrite: true });
    if (physical && area)
      passes.push({
        base,
        source: "physical",
        depthWrite: true,
        colorWrite: false,
      });
  }
  return passes;
}
type Surfaces = FeatureCollection<Polygon | MultiPolygon>;
const meshes = new WeakMap<Surfaces, Map<string, PrecisionSurfaceMesh>>();
const perimeterScopes = new WeakMap<
  FeatureCollection<MultiLineString>,
  number
>();
let nextPerimeterScope = 0;
const { MercatorCoordinate } = maplibregl;

/** Keep neighbouring contained pieces on the same projected edge. A vertex
 * may divide one side of a shared edge while earcut removes it from the other
 * side. After projection/float32 conversion that T-junction can expose a
 * subpixel strip of the physical slab below. Only add samples on the original
 * geographic segment; never move its endpoints, merge parts or close holes. */
function surfaceEdgeSamples(parts: number[][][][]) {
  const unique = new Map<string, number[]>();
  for (const part of parts)
    for (const ring of part)
      for (const p of ring) unique.set(`${p[0]},${p[1]}`, p);
  const vertices = [...unique.values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  );
  // Coordinate arithmetic only: four IEEE rounding units, not a physical
  // gap-closing distance. Interpolated samples still lie on their own edge.
  let magnitude = 1;
  for (const p of vertices)
    magnitude = Math.max(magnitude, Math.abs(p[0]), Math.abs(p[1]));
  const roundoff = Number.EPSILON * magnitude * 4;
  const lower = (x: number) => {
    let a = 0,
      b = vertices.length;
    while (a < b) {
      const middle = (a + b) >>> 1;
      if (vertices[middle][0] < x) a = middle + 1;
      else b = middle;
    }
    return a;
  };
  return (first: number[], last: number[]) => {
    // Canonical endpoint order gives shared triangle edges identical samples.
    const forward =
      first[0] < last[0] || (first[0] === last[0] && first[1] <= last[1]);
    const a = forward ? first : last,
      b = forward ? last : first,
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return [];
    const axis = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;
    const parameters: number[] = [];
    for (
      let i = lower(Math.min(a[0], b[0]) - roundoff);
      i < vertices.length && vertices[i][0] <= Math.max(a[0], b[0]) + roundoff;
      i++
    ) {
      const q = vertices[i];
      if (
        q[1] < Math.min(a[1], b[1]) - roundoff ||
        q[1] > Math.max(a[1], b[1]) + roundoff
      )
        continue;
      const t = (q[axis] - a[axis]) / (b[axis] - a[axis]);
      if (
        t > 0 &&
        t < 1 &&
        Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) <=
          roundoff * (Math.abs(dx) + Math.abs(dy))
      )
        parameters.push(t);
    }
    const samples = [...new Set(parameters)]
      .sort((a, b) => a - b)
      .map((t) => [a[0] + dx * t, a[1] + dy * t]);
    return forward ? samples : samples.reverse();
  };
}

/** Exact local cap transport. Original contained parts and holes remain
 * separate; do not extrude their artificial internal edges into tiny walls. */
export function precisionSurfaceMesh(
  surfaces: Surfaces,
  originGeographic: [number, number],
  options: GeometryOptions,
): PrecisionSurfaceMesh {
  let perimeterScope = 0;
  if (options.perimeters) {
    perimeterScope =
      perimeterScopes.get(options.perimeters) ?? ++nextPerimeterScope;
    perimeterScopes.set(options.perimeters, perimeterScope);
  }
  const key = `${originGeographic.join(",")}:${options.kind}:${!!options.relativeHeights}:${!!options.circulationOnly}:${perimeterScope}`;
  const cached = meshes.get(surfaces)?.get(key);
  if (cached) return cached;
  const origin = MercatorCoordinate.fromLngLat(originGeographic),
    metre = origin.meterInMercatorCoordinateUnits();
  const xy = (p: number[]) => {
    const q = MercatorCoordinate.fromLngLat([p[0], p[1]]);
    return new THREE.Vector2(
      (q.x - origin.x) / metre,
      -(q.y - origin.y) / metre,
    );
  };
  const chunks: Float32Array[] = [],
    ranges: PrecisionSurfaceMesh["ranges"] = [],
    sideValues: number[] = [],
    sideTopVertices: number[] = [],
    sideRanges: PrecisionSurfaceMesh["ranges"] = [];
  let vertices = 0;
  for (const [featureIndex, feature] of surfaces.features.entries()) {
    const p = feature.properties ?? {};
    if (
      options.circulationOnly &&
      (options.kind === "floor" ? p.circulation !== true : p.height !== 0)
    )
      continue;
    const base = options.relativeHeights ? Number(p.base ?? 0) : 0;
    const top = Number(
      options.kind === "room"
        ? p.height
        : options.relativeHeights
          ? (p.floorTop ?? 0.025)
          : p.nativeFloor === true
            ? 0.005
            : 0.025,
    );
    if (!Number.isFinite(base) || !Number.isFinite(top) || top < base) continue;
    const start = vertices,
      sideStart = sideTopVertices.length;
    const parts =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    const samples = surfaceEdgeSamples(parts);
    for (const polygon of parts) {
      const rings = polygon.map((ring) => {
        const copy = ring.slice();
        while (copy.length > 1 && xy(copy[0]).equals(xy(copy.at(-1)!)))
          copy.pop();
        return copy;
      });
      if (!rings[0]?.length) continue;
      const points = rings.flat(),
        projected = rings.map((ring) => ring.map(xy)),
        faces = THREE.ShapeUtils.triangulateShape(
          projected[0],
          projected.slice(1),
        ),
        values: number[] = [];
      const write = (p: number[]) => {
        const q = xy(p);
        values.push(q.x, q.y, top);
      };
      for (const face of faces) {
        const triangle = face.map((i) => points[i]),
          edgeSamples = triangle.map((a, i) =>
            samples(a, triangle[(i + 1) % 3]),
          );
        if (edgeSamples.every((edge) => edge.length === 0)) {
          for (const p of triangle) write(p);
          continue;
        }
        // Split after triangulation so collinear junctions cannot be pruned
        // again. The centre stays inside the original geographic triangle.
        const [a, b, c] = triangle,
          centre = [
            a[0] + (b[0] - a[0]) / 3 + (c[0] - a[0]) / 3,
            a[1] + (b[1] - a[1]) / 3 + (c[1] - a[1]) / 3,
          ],
          boundary = triangle.flatMap((p, i) => [p, ...edgeSamples[i]]);
        for (let i = 0; i < boundary.length; i++) {
          write(centre);
          write(boundary[i]);
          write(boundary[(i + 1) % boundary.length]);
        }
      }
      const positions = new Float32Array(values);
      chunks.push(positions);
      vertices += positions.length / 3;
    }
    if (options.kind === "room" && top > base && vertices > start) {
      const perimeter = options.perimeters?.features[featureIndex],
        boundaryProperties = perimeter?.properties,
        matches =
          perimeter &&
          (feature.id !== undefined ||
            typeof p.key === "string" ||
            typeof p.nativeRegionId === "string") &&
          perimeter.id === feature.id &&
          boundaryProperties?.key === p.key &&
          boundaryProperties?.nativeRegionId === p.nativeRegionId,
        // The existing perimeter transport carries this surface's own true
        // boundary AFTER visibility cuts. Numeric contained paint pieces can
        // have tiny internal partitions; those are never physical side walls.
        sideRings = matches ? perimeter.geometry.coordinates : parts.flat(),
        sideSamples = matches ? surfaceEdgeSamples([sideRings]) : samples;
      for (const originalRing of sideRings) {
        const ring = originalRing.slice();
        while (ring.length > 1 && xy(ring[0]).equals(xy(ring.at(-1)!)))
          ring.pop();
        const boundary = ring.flatMap((p, i) => [
          p,
          ...sideSamples(p, ring[(i + 1) % ring.length]),
        ]);
        for (let i = 0; i < boundary.length; i++) {
          const a = xy(boundary[i]),
            b = xy(boundary[(i + 1) % boundary.length]);
          if (a.equals(b)) continue;
          for (const [q, upper] of [
            [a, false],
            [b, false],
            [b, true],
            [a, false],
            [b, true],
            [a, true],
          ] as const) {
            sideValues.push(q.x, q.y, upper ? top : base);
            sideTopVertices.push(Number(upper));
          }
        }
      }
    }
    if (vertices > start)
      ranges.push({
        start,
        count: vertices - start,
        base,
        top,
        properties: {
          nativeFloor: p.nativeFloor,
          circulation: p.circulation,
          access: p.access,
          key: p.key,
          color: p.color,
        },
      });
    if (sideTopVertices.length > sideStart)
      sideRanges.push({
        ...ranges.at(-1)!,
        start: sideStart,
        count: sideTopVertices.length - sideStart,
      });
  }
  const positions = new Float32Array(vertices * 3);
  let offset = 0;
  for (const chunk of chunks) {
    positions.set(chunk, offset);
    offset += chunk.length;
  }
  const result = {
    positions,
    vertices,
    ranges,
    sides: {
      positions: new Float32Array(sideValues),
      topVertices: new Uint8Array(sideTopVertices),
      vertices: sideTopVertices.length,
      ranges: sideRanges,
    },
  };
  let variants = meshes.get(surfaces);
  if (!variants) meshes.set(surfaces, (variants = new Map()));
  variants.set(key, result);
  return result;
}

/** Match the existing visitor surface expression, including CSS RGB
 * interpolation and access/circulation taking priority over selection. */
export function precisionSurfaceColor(
  p: SurfaceProperties,
  kind: SurfaceKind,
  selected: string,
  progress: number,
) {
  const overview =
    p.nativeFloor === true
      ? "#faf9f5"
      : kind === "floor" && p.circulation === true
        ? HALLWAY_COLOR
        : OVERVIEW_SOLID_COLOR;
  const detail =
    p.nativeFloor === true
      ? "#faf9f5"
      : p.access === "staff"
        ? RESTRICTED_AREA_COLOR
        : kind === "floor" && p.circulation === true
          ? HALLWAY_COLOR
          : typeof p.key === "string" && p.key === selected
            ? "#ffe09d"
            : (p.color ?? OVERVIEW_SOLID_COLOR);
  const a = new THREE.Color(overview),
    b = new THREE.Color(detail);
  a.getRGB(a, THREE.SRGBColorSpace);
  b.getRGB(b, THREE.SRGBColorSpace);
  return a.setRGB(
    a.r + (b.r - a.r) * progress,
    a.g + (b.g - a.g) * progress,
    a.b + (b.b - a.b) * progress,
    THREE.SRGBColorSpace,
  );
}

/** Precise floors and room volumes at the original source planes. Vector
 * layers retain picking while local room sides avoid tile-rounded cell walls. */
export function precisionSurfaceLayer(
  surfaces: Surfaces,
  originGeographic: [number, number],
  options: GeometryOptions & {
    id?: string;
    selected?: string;
    opacity?: number;
  },
): CustomLayerInterface & {
  readonly unionStatus: string;
  readonly whenReady: Promise<void>;
} {
  let built = precisionSurfaceMesh(surfaces, originGeographic, options),
    floorPasses = precisionFloorDepthPasses(built),
    positions =
      options.kind === "room" ? built.positions.slice() : built.positions,
    colors = new Float32Array(built.vertices * 3);
  let sidePositions = built.sides.positions.slice(),
    sideColors = new Float32Array(built.sides.vertices * 3);
  const geometry = new THREE.BufferGeometry(),
    sideGeometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  sideGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(sidePositions, 3),
  );
  sideGeometry.setAttribute("color", new THREE.BufferAttribute(sideColors, 3));
  sideGeometry.computeVertexNormals();
  // Keep physical support beneath named native area caps even when depth
  // quantization rounds their original 5/25 mm tops to the same depth value.
  // This raster bias never changes either source height or any polygon ring.
  // Room caps cover their exact local side edges at the same source height.
  const bases =
      options.kind === "floor"
        ? [...new Set(built.ranges.map((range) => range.base))].sort(
            (a, b) => a - b,
          )
        : [0],
    materials = bases
      .flatMap(() => [1, 8])
      .map(
        (bias) =>
          new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: -bias,
            polygonOffsetUnits: -bias,
          }),
      );
  const surfaceGroups = () => {
    geometry.clearGroups();
    for (const range of built.ranges) {
      const materialIndex =
          (options.kind === "floor" ? bases.indexOf(range.base) * 2 : 0) +
          (range.properties.nativeFloor === true ? 0 : 1),
        last = geometry.groups.at(-1);
      if (
        last &&
        last.materialIndex === materialIndex &&
        last.start + last.count === range.start
      )
        last.count += range.count;
      else geometry.addGroup(range.start, range.count, materialIndex);
    }
  };
  surfaceGroups();
  const mesh = new THREE.Mesh(geometry, materials),
    scene = new THREE.Scene(),
    camera = new THREE.Camera(),
    sideMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    }),
    sideMesh = new THREE.Mesh(sideGeometry, sideMaterial);
  mesh.frustumCulled = false;
  sideMesh.frustumCulled = false;
  scene.add(mesh);
  if (built.sides.vertices > 0) scene.add(sideMesh);
  scene.add(new THREE.AmbientLight(0xff_ff_ff, 0.7));
  const light = new THREE.DirectionalLight(0xff_ff_ff, 0.3);
  light.position.set(-3, -4, 6);
  scene.add(light);
  const origin = MercatorCoordinate.fromLngLat(originGeographic),
    metre = origin.meterInMercatorCoordinateUnits(),
    transform = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, 0)
      .multiply(new THREE.Matrix4().makeScale(metre, -metre, metre));
  let renderer: THREE.WebGLRenderer | undefined,
    mapInstance: Parameters<NonNullable<CustomLayerInterface["onAdd"]>>[0],
    previousProgress = -1,
    active = false,
    cancelUnion: (() => void) | undefined,
    unionStatus = "pending",
    ready: () => void;
  const whenReady = new Promise<void>((resolve) => {
    ready = resolve;
  });
  return {
    get unionStatus() {
      return unionStatus;
    },
    whenReady,
    id:
      options.id ??
      (options.kind === "floor"
        ? "project-precision-floors"
        : "project-precision-room-roofs"),
    type: "custom",
    renderingMode: "3d",
    onAdd(map, gl) {
      active = true;
      mapInstance = map;
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGL2RenderingContext,
      });
      renderer.autoClear = false;
      {
        // Exact set-union removes redundant contained-piece edges in a worker.
        // Room sides must follow the exterior/hole boundaries of that same set,
        // rather than extruding every internal cap partition into a thin wall.
        // Keep the original surface until the derived mesh is ready.
        const request = requestPrecisionSurfaceUnion(surfaces, {
          kind: options.kind,
          relativeHeights: options.relativeHeights,
          circulationOnly: options.circulationOnly,
          originGeographic,
        });
        cancelUnion = request.cancel;
        void request.promise
          .then((drawing) => {
            if (!active) return;
            if (!drawing || drawing === surfaces) {
              unionStatus = drawing ? "original" : "fallback";
              return;
            }
            const replacement = precisionSurfaceMesh(
              drawing,
              originGeographic,
              options,
            );
            // Release the prior GPU attributes; immutable CPU buffers stay cached.
            geometry.dispose();
            built = replacement;
            floorPasses = precisionFloorDepthPasses(built);
            positions =
              options.kind === "room"
                ? built.positions.slice()
                : built.positions;
            colors = new Float32Array(built.vertices * 3);
            geometry.setAttribute(
              "position",
              new THREE.BufferAttribute(positions, 3),
            );
            geometry.setAttribute(
              "color",
              new THREE.BufferAttribute(colors, 3),
            );
            surfaceGroups();
            sideGeometry.dispose();
            sidePositions = built.sides.positions.slice();
            sideColors = new Float32Array(built.sides.vertices * 3);
            sideGeometry.setAttribute(
              "position",
              new THREE.BufferAttribute(sidePositions, 3),
            );
            sideGeometry.setAttribute(
              "color",
              new THREE.BufferAttribute(sideColors, 3),
            );
            sideGeometry.deleteAttribute("normal");
            sideGeometry.computeVertexNormals();
            sideMesh.visible = built.sides.vertices > 0;
            if (sideMesh.visible && sideMesh.parent !== scene)
              scene.add(sideMesh);
            previousProgress = -1;
            unionStatus = "ready";
            mapInstance.triggerRepaint();
          })
          .catch(() => {
            if (active) unionStatus = "fallback";
          })
          .finally(() => ready());
      }
    },
    render(gl, args) {
      if (!renderer) return;
      const progress = zoomFade(
        mapInstance.getZoom(),
        ROOM_DETAIL_START,
        ROOM_DETAIL_END,
      );
      const opacity = progress * (options.opacity ?? 1);
      if (!opacity) return;
      if (progress !== previousProgress) {
        for (const range of built.ranges) {
          const color = precisionSurfaceColor(
            range.properties,
            options.kind,
            options.selected ?? "",
            progress,
          );
          const z = range.base + (range.top - range.base) * progress;
          for (let i = range.start; i < range.start + range.count; i++) {
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            if (options.kind === "room") positions[i * 3 + 2] = z;
          }
        }
        geometry.getAttribute("color").needsUpdate = true;
        if (options.kind === "room")
          geometry.getAttribute("position").needsUpdate = true;
        for (const range of built.sides.ranges) {
          const color = precisionSurfaceColor(
              range.properties,
              options.kind,
              options.selected ?? "",
              progress,
            ),
            z = range.base + (range.top - range.base) * progress;
          for (let i = range.start; i < range.start + range.count; i++) {
            sideColors[i * 3] = color.r;
            sideColors[i * 3 + 1] = color.g;
            sideColors[i * 3 + 2] = color.b;
            sidePositions[i * 3 + 2] = built.sides.topVertices[i]
              ? z
              : range.base;
          }
        }
        if (built.sides.vertices > 0) {
          sideGeometry.getAttribute("position").needsUpdate = true;
          sideGeometry.getAttribute("color").needsUpdate = true;
        }
        previousProgress = progress;
      }
      for (const material of materials) {
        material.opacity = opacity;
        material.transparent = material.opacity < 1;
      }
      sideMaterial.opacity = opacity;
      sideMaterial.transparent = opacity < 1;
      camera.projectionMatrix
        .fromArray(args.defaultProjectionData.mainMatrix as number[])
        .multiply(transform);
      const range = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      gl.depthRange(range[0], range[1]);
      if (options.kind === "floor") {
        // Color the physical backing before its named area. Then restore
        // backing depth without overwriting the area color. This avoids thin
        // physical triangles winning individual MSAA samples while retaining
        // opaque floor depth for descending geometry and genuine apertures.
        // Ascending source bases preserve raised slabs in relative mode.
        for (const pass of floorPasses) {
          for (const material of materials) material.visible = false;
          const index =
              bases.indexOf(pass.base) * 2 +
              (pass.source === "physical" ? 0 : 1),
            material = materials[index];
          material.visible = true;
          material.depthWrite = pass.depthWrite;
          material.colorWrite = pass.colorWrite;
          renderer.render(scene, camera);
        }
        for (const material of materials) {
          material.visible = true;
          material.depthWrite = true;
          material.colorWrite = true;
        }
      } else renderer.render(scene, camera);
      renderer.resetState();
    },
    onRemove() {
      active = false;
      unionStatus = "cancelled";
      cancelUnion?.();
      ready();
      geometry.dispose();
      sideGeometry.dispose();
      sideMaterial.dispose();
      for (const material of materials) material.dispose();
      renderer?.dispose();
      renderer = undefined;
      scene.remove(mesh, sideMesh);
    },
  };
}
