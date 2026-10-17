import type { FeatureCollection, Polygon } from "geojson";
import maplibregl, { type CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
import { HALLWAY_COLOR } from "./display-passages";
const { MercatorCoordinate } = maplibregl;

/** Draw only original displayed walking triangles, never the ramp's bounding
 * polygon, underside or neighbouring floor opening. Navigation is unchanged. */
export function nativeRampPlanDrawing(
  data: IndoorDataset,
  levelIds: readonly number[],
  building: string,
): FeatureCollection<Polygon> {
  const result: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [],
  };
  if (data.rampDisplay?.sourceModelSha256 !== data.source.modelSha256)
    return result;
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  const rooms = new Map(data.records.map((r) => [r.key, r]));
  for (const ramp of data.rampDisplay.ramps) {
    const edge = ramp.edgeId ? edges.get(ramp.edgeId) : undefined;
    if (
      !ramp.levelIds.some((id) => levelIds.includes(id)) ||
      (building !== "all" &&
        !ramp.buildings?.includes(building) &&
        !edge?.roomKeys.some((key) => rooms.get(key)?.building === building))
    )
      continue;
    const circulation = !!ramp.circulation || !!edge;
    for (const triangle of ramp.displayTrianglesFeet ?? ramp.trianglesFeet) {
      if (
        triangle.length !== 3 ||
        triangle.some(
          (p) => p.length !== 3 || p.some((n) => !Number.isFinite(n)),
        )
      )
        throw new Error("Ramp plan contains an invalid source triangle.");
      const [a, b, c] = triangle;
      // A vertical original face has no plan area. Retain all other original
      // triangles, including narrow ones; no numerical widening or hull fill.
      if ((b[0] - a[0]) * (c[1] - a[1]) === (b[1] - a[1]) * (c[0] - a[0]))
        continue;
      const ring = triangle.map((p) => geographicPoint(data, p));
      result.features.push({
        type: "Feature",
        properties: {
          nativeElementId: ramp.nativeElementId,
          edgeId: ramp.edgeId,
          levelIds: ramp.levelIds,
          circulation,
          color: circulation ? HALLWAY_COLOR : "#d3d6d4",
          sourceModelSha256: data.source.modelSha256,
        },
        geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
      });
    }
  }
  return result;
}

export function rampPlanBuffers(
  drawing: FeatureCollection<Polygon>,
  originGeographic: [number, number],
) {
  const origin = MercatorCoordinate.fromLngLat(originGeographic),
    unit = origin.meterInMercatorCoordinateUnits();
  const positions = new Float32Array(drawing.features.length * 9),
    colors = new Float32Array(positions.length);
  drawing.features.forEach((feature, index) => {
    const color = new THREE.Color(feature.properties?.color);
    feature.geometry.coordinates[0].slice(0, 3).forEach((p, vertex) => {
      const point = MercatorCoordinate.fromLngLat([p[0], p[1]]),
        offset = index * 9 + vertex * 3;
      positions.set(
        [(point.x - origin.x) / unit, -(point.y - origin.y) / unit, 0],
        offset,
      );
      colors.set([color.r, color.g, color.b], offset);
    });
  });
  return { positions, colors };
}

/** The 2D source ramp remains visible at every zoom, including while room
 * details load. Unlit paint and no depth writes avoid pale/occluded ramps. */
export function nativeRampPlanLayer(
  drawing: FeatureCollection<Polygon>,
  originGeographic: [number, number],
): CustomLayerInterface {
  const origin = MercatorCoordinate.fromLngLat(originGeographic),
    unit = origin.meterInMercatorCoordinateUnits();
  const transform = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, 0)
    .multiply(new THREE.Matrix4().makeScale(unit, -unit, unit));
  const { positions, colors } = rampPlanBuffers(drawing, originGeographic);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();
  let renderer: THREE.WebGLRenderer | undefined;
  return {
    id: "project-overview-ramp-plan",
    type: "custom",
    renderingMode: "2d",
    onAdd(map, gl) {
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGL2RenderingContext,
      });
      renderer.autoClear = false;
    },
    render(gl, args) {
      if (!renderer) return;
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
