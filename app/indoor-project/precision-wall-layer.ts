import { MercatorCoordinate, type CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { EXPOSED_WALL_HEIGHT_METRES } from "./display-geometry";
import {
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
  zoomFade,
} from "./zoom-presentation";

/** Exact local wall meshes avoid vector-tile rounding of sub-metre fragments.
 * Polygon depth bias resolves wall/room faces sharing an edge without moving
 * native boundaries or shrinking door openings. One merged mesh per floor. */
export function precisionWallLayer(
  walls: FeatureCollection<MultiPolygon>,
  originGeographic: [number, number],
  options: { id?: string; opacity?: number; windowOpacity?: boolean } = {},
): CustomLayerInterface {
  const origin = MercatorCoordinate.fromLngLat(originGeographic),
    metre = origin.meterInMercatorCoordinateUnits();
  const transform = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, 0)
    .multiply(new THREE.Matrix4().makeScale(metre, -metre, metre));
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
        if (options.windowOpacity)
          colors.push(Number(f.properties?.opacity ?? 1));
      }
      part.dispose();
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, options.windowOpacity ? 4 : 3),
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
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();
  let renderer: THREE.WebGLRenderer | undefined,
    mapInstance: Parameters<NonNullable<CustomLayerInterface["onAdd"]>>[0];
  return {
    id: options.id ?? "project-precision-walls",
    type: "custom",
    renderingMode: "3d",
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
      const fade = zoomFade(
        mapInstance.getZoom(),
        ROOM_DETAIL_START,
        ROOM_DETAIL_END,
      );
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
      renderer.render(scene, camera);
      renderer.resetState();
    },
    onRemove() {
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
    },
  };
}
