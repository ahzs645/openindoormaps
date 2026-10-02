import { MercatorCoordinate, type CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";
import type { FeatureCollection, Polygon } from "geojson";
import {
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
  zoomFade,
} from "./zoom-presentation";

/** Signed steps draw into MapLibre's shared depth buffer, so walls and upper
 * flights can occlude them. Never composite a depth-free image over the map. */
export function descendingStairLayer(
  treads: FeatureCollection<Polygon>,
  originGeographic: [number, number],
  review: boolean,
): CustomLayerInterface {
  const origin = MercatorCoordinate.fromLngLat(originGeographic);
  const metre = origin.meterInMercatorCoordinateUnits();
  const transform = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, 0)
    .multiply(new THREE.Matrix4().makeScale(metre, -metre, metre));
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const materials: THREE.MeshLambertMaterial[] = [];
  scene.add(new THREE.AmbientLight("#ffffff", 2.1));
  const light = new THREE.DirectionalLight("#ffffff", 1.5);
  light.position.set(-10, -10, 20);
  scene.add(light);
  // Terminal risers use signed native endpoints, including flights above ground.
  for (const f of treads.features)
    for (const r of f.properties?.endpointRisers ?? []) {
      if (
        r.top <= r.bottom ||
        Math.hypot(r.a[0] - r.b[0], r.a[1] - r.b[1]) < 1e-12
      )
        continue;
      const xy = [r.a, r.b].map((p) => {
        const m = MercatorCoordinate.fromLngLat([p[0], p[1]]);
        return [(m.x - origin.x) / metre, -(m.y - origin.y) / metre];
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            ...xy[0],
            r.bottom,
            ...xy[1],
            r.bottom,
            ...xy[1],
            r.top,
            ...xy[0],
            r.top,
          ],
          3,
        ),
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({
        color: String(f.properties?.color ?? "#c7d3df"),
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: true,
      });
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  for (const f of treads.features.filter((f) => f.properties?.descending)) {
    const top = Number(f.properties?.topMetres);
    const base = Number(
      f.properties?.displayBaseMetres ?? f.properties?.baseMetres,
    );
    if (!Number.isFinite(top) || !Number.isFinite(base) || top <= base)
      continue;
    const points = f.geometry.coordinates[0].map((p) => {
      const m = MercatorCoordinate.fromLngLat([p[0], p[1]]);
      return new THREE.Vector2(
        (m.x - origin.x) / metre,
        -(m.y - origin.y) / metre,
      );
    });
    const shape = new THREE.Shape(points);
    for (const ring of f.geometry.coordinates.slice(1)) {
      const hole = ring.map((p) => {
        const m = MercatorCoordinate.fromLngLat([p[0], p[1]]);
        return new THREE.Vector2(
          (m.x - origin.x) / metre,
          -(m.y - origin.y) / metre,
        );
      });
      shape.holes.push(new THREE.Path(hole));
    }
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: top - base,
      bevelEnabled: false,
    });
    const material = new THREE.MeshLambertMaterial({
      color: String(f.properties?.color ?? "#c7d3df"),
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = base;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  let renderer: THREE.WebGLRenderer | undefined;
  let mapInstance: Parameters<NonNullable<CustomLayerInterface["onAdd"]>>[0];
  return {
    id: "project-descending-stairs",
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
      const opacity = review
        ? 1
        : zoomFade(mapInstance.getZoom(), ROOM_DETAIL_START, ROOM_DETAIL_END);
      if (!opacity) return;
      for (const material of materials) {
        material.opacity = opacity;
        material.transparent = opacity < 1;
      }
      camera.projectionMatrix
        .fromArray(args.defaultProjectionData.mainMatrix as number[])
        .multiply(transform);
      // Three resets GL state; retain MapLibre's 3D depth range for comparison
      // with its extruded walls. Do not clear the shared framebuffer or stencil.
      const range = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      gl.depthRange(range[0], range[1]);
      renderer.render(scene, camera);
      renderer.resetState();
    },
    onRemove() {
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const material of materials) material.dispose();
      renderer?.dispose();
    },
  };
}
