import maplibregl, { type CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { EXPOSED_WALL_HEIGHT_METRES } from "./display-geometry";
import { HALLWAY_COLOR, OVERVIEW_SOLID_COLOR } from "./display-passages";
import {
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
  WALL_DETAIL_START,
  WALL_DETAIL_END,
  zoomFade,
} from "./zoom-presentation";
import { floorDiagnostic, floorDiagnosticsEnabled } from "./floor-diagnostics";

// Default import keeps this module loadable by Node unit tests (CJS build).
const { MercatorCoordinate } = maplibregl;

export type PrecisionWallMesh = {
  /** xyz per vertex, local metres relative to the alignment origin. */
  positions: Float32Array;
  /** rgb (or rgba for window glazing) per vertex. */
  colors: Float32Array;
  /** Grey/circulation colours for a paint-only room reveal on the same mesh. */
  overviewColors?: Float32Array;
  vertices: number;
  colorSize: 3 | 4;
};
// Prepared floor collections are immutable worker results; the same input
// object always produces the same triangles. Keyed weakly so a mesh lives no
// longer than the floor scope that owns its source collection.
const meshes = new WeakMap<
  FeatureCollection<MultiPolygon>,
  Map<string, PrecisionWallMesh>
>();

/** Triangulate exact wall polygons into typed vertex buffers. Polygons, holes,
 * base and height are used unchanged; per-polygon parts are written straight
 * into Float32 chunks (the same float32 rounding as before) instead of growing
 * JS number arrays for a whole campus floor. */
export function precisionWallMesh(
  walls: FeatureCollection<MultiPolygon>,
  originGeographic: [number, number],
  windowOpacity = false,
  overview = false,
  overviewTint = false,
  featureColors = false,
): PrecisionWallMesh {
  const key = `${originGeographic[0]},${originGeographic[1]},${windowOpacity},${overview},${overviewTint},${featureColors}`;
  let byOptions = meshes.get(walls);
  const cached = byOptions?.get(key);
  if (cached) return cached;
  const started = floorDiagnosticsEnabled() ? performance.now() : 0;
  const origin = MercatorCoordinate.fromLngLat(originGeographic),
    metre = origin.meterInMercatorCoordinateUnits();
  const xy = (p: number[]) => {
    const m = MercatorCoordinate.fromLngLat([p[0], p[1]]);
    return new THREE.Vector2(
      (m.x - origin.x) / metre,
      -(m.y - origin.y) / metre,
    );
  };
  const overviewColor = new THREE.Color(OVERVIEW_SOLID_COLOR),
    hallwayColor = new THREE.Color(HALLWAY_COLOR),
    sideColor = new THREE.Color("#a3a3a0"),
    topColor = new THREE.Color("#deded9");
  const colorSize = windowOpacity ? 4 : 3;
  const positionParts: Float32Array[] = [],
    colorParts: Float32Array[] = [],
    overviewColorParts: Float32Array[] = [];
  let vertices = 0;
  for (const f of walls.features) {
    const base = Number(f.properties?.base ?? 0),
      top = Number(f.properties?.height ?? EXPOSED_WALL_HEIGHT_METRES);
    if (
      !overview &&
      (!Number.isFinite(base) || !Number.isFinite(top) || top <= base)
    )
      continue;
    const nativeColor = overview
      ? featureColors
        ? new THREE.Color(String(f.properties?.color ?? OVERVIEW_SOLID_COLOR))
        : overviewTint && f.properties?.circulation === true
          ? hallwayColor
          : overviewColor
      : f.properties?.nativeWindowColor
        ? new THREE.Color(String(f.properties.nativeWindowColor))
        : undefined;
    const opacity = Number(f.properties?.opacity ?? 1);
    for (const polygon of f.geometry.coordinates) {
      const shape = new THREE.Shape(polygon[0].map(xy));
      for (const hole of polygon.slice(1))
        shape.holes.push(new THREE.Path(hole.map(xy)));
      const part = overview
        ? new THREE.ShapeGeometry(shape).toNonIndexed()
        : new THREE.ExtrudeGeometry(shape, {
            depth: top - base,
            bevelEnabled: false,
          });
      const p = part.getAttribute("position"),
        n = part.getAttribute("normal");
      const positions = new Float32Array(p.count * 3),
        colors = new Float32Array(p.count * colorSize),
        overviewColors =
          overview && featureColors ? new Float32Array(p.count * 3) : undefined;
      for (let i = 0; i < p.count; i++) {
        positions[i * 3] = p.getX(i);
        positions[i * 3 + 1] = p.getY(i);
        positions[i * 3 + 2] = overview ? 0 : p.getZ(i) + base;
        const color =
          nativeColor ?? (Math.abs(n.getZ(i)) > 0.5 ? topColor : sideColor);
        colors[i * colorSize] = color.r;
        colors[i * colorSize + 1] = color.g;
        colors[i * colorSize + 2] = color.b;
        if (overviewColors) {
          const low =
            overviewTint && f.properties?.circulation === true
              ? hallwayColor
              : overviewColor;
          overviewColors.set([low.r, low.g, low.b], i * 3);
        }
        if (windowOpacity) colors[i * colorSize + 3] = opacity;
      }
      positionParts.push(positions);
      colorParts.push(colors);
      if (overviewColors) overviewColorParts.push(overviewColors);
      vertices += p.count;
      part.dispose();
    }
  }
  const concat = (parts: Float32Array[], size: number) => {
    const out = new Float32Array(vertices * size);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    parts.length = 0;
    return out;
  };
  const mesh: PrecisionWallMesh = {
    positions: concat(positionParts, 3),
    colors: concat(colorParts, colorSize),
    ...(overview && featureColors
      ? { overviewColors: concat(overviewColorParts, 3) }
      : {}),
    vertices,
    colorSize,
  };
  if (!byOptions) meshes.set(walls, (byOptions = new Map()));
  byOptions.set(key, mesh);
  if (started)
    floorDiagnostic("mesh:precision-walls:build", {
      windowOpacity,
      features: walls.features.length,
      vertices,
      bytes: mesh.positions.byteLength + mesh.colors.byteLength,
      ms: performance.now() - started,
    });
  return mesh;
}

/** Exact local wall meshes avoid vector-tile rounding of sub-metre fragments.
 * Polygon depth bias resolves wall/room faces sharing an edge without moving
 * native boundaries or shrinking door openings. One merged mesh per floor.
 * Vertex buffers are reused for the same immutable collection; GPU buffers,
 * material and renderer state are released on every removal. */
export function precisionWallLayer(
  walls: FeatureCollection<MultiPolygon>,
  originGeographic: [number, number],
  options: {
    id?: string;
    opacity?: number;
    windowOpacity?: boolean;
    overview?: boolean;
    /** Preserve grey/mint native floor tint on the unchanged flat polygons. */
    overviewTint?: boolean;
    /** Flat source-native room colours while a full visitor floor is loading. */
    featureColors?: boolean;
    /** Interpolate grey/circulation to source colours on every zoom frame. */
    revealRoomsWithZoom?: boolean;
    overviewLocked?: boolean;
  } = {},
): CustomLayerInterface {
  const origin = MercatorCoordinate.fromLngLat(originGeographic),
    metre = origin.meterInMercatorCoordinateUnits();
  const transform = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, 0)
    .multiply(new THREE.Matrix4().makeScale(metre, -metre, metre));
  const built = precisionWallMesh(
    walls,
    originGeographic,
    !!options.windowOpacity,
    !!options.overview,
    !!options.overviewTint,
    !!options.featureColors,
  );
  const geometry = new THREE.BufferGeometry();
  // Shared read-only typed arrays: BufferAttribute does not copy them.
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(built.positions, 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(built.colors, built.colorSize),
  );
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const roomReveal = { value: 0 };
  if (options.revealRoomsWithZoom && built.overviewColors) {
    geometry.setAttribute(
      "overviewColor",
      new THREE.BufferAttribute(built.overviewColors, 3),
    );
    material.onBeforeCompile = (shader) => {
      shader.uniforms.roomReveal = roomReveal;
      shader.vertexShader =
        `attribute vec3 overviewColor;\nuniform float roomReveal;\n${shader.vertexShader}`.replace(
          "#include <color_vertex>",
          "#include <color_vertex>\nvColor.rgb = mix(overviewColor, vColor.rgb, roomReveal);",
        );
    };
    material.customProgramCacheKey = () => "visitor-room-reveal-v1";
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();
  let renderer: THREE.WebGLRenderer | undefined,
    mapInstance: Parameters<NonNullable<CustomLayerInterface["onAdd"]>>[0],
    firstFrame = true;
  return {
    id: options.id ?? "project-precision-walls",
    type: "custom",
    renderingMode: options.overview ? "2d" : "3d",
    onAdd(map, gl) {
      mapInstance = map;
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGL2RenderingContext,
      });
      renderer.autoClear = false;
    },
    render(gl, args) {
      if (!renderer) return;
      roomReveal.value = zoomFade(
        mapInstance.getZoom(),
        ROOM_DETAIL_START,
        ROOM_DETAIL_END,
      );
      const detailFade = zoomFade(
        mapInstance.getZoom(),
        options.overview && options.overviewTint
          ? ROOM_DETAIL_START
          : WALL_DETAIL_START,
        options.overview && options.overviewTint
          ? ROOM_DETAIL_END
          : WALL_DETAIL_END,
      );
      const fade = options.overview
        ? options.overviewLocked
          ? 1
          : 1 - detailFade
        : detailFade;
      if (!fade) return;
      material.opacity = fade * (options.opacity ?? 1);
      material.transparent = !!options.windowOpacity || material.opacity < 1;
      material.depthWrite =
        !options.windowOpacity && (!options.opacity || options.opacity === 1);
      camera.projectionMatrix
        .fromArray(args.defaultProjectionData.mainMatrix as number[])
        .multiply(transform);
      const range = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      gl.depthRange(range[0], range[1]);
      const started =
        firstFrame && floorDiagnosticsEnabled() ? performance.now() : 0;
      renderer.render(scene, camera);
      renderer.resetState();
      if (firstFrame) {
        firstFrame = false;
        // First render uploads the vertex buffers to the GPU.
        if (started)
          floorDiagnostic("mesh:precision-walls:first-render", {
            id: options.id ?? "project-precision-walls",
            vertices: built.vertices,
            ms: performance.now() - started,
          });
      }
    },
    onRemove() {
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
      renderer = undefined;
      scene.remove(mesh);
    },
  };
}
