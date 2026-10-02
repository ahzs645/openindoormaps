import { MercatorCoordinate, type CustomLayerInterface } from "maplibre-gl";
import {
  zoomFade,
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
} from "./zoom-presentation";
import * as THREE from "three";
import type { FeatureCollection, MultiPolygon } from "geojson";

/** Selected floor remains at z=0, so routes/labels stay aligned. MapLibre's
 * native extrusions clamp negative bases; use real measured depth here. Input
 * footprints have already been clipped to reviewed apertures, never a complete
 * translucent floor or the full building model. */
export function lowerFloorLayer(
  rooms: FeatureCollection<MultiPolygon>,
  walls: FeatureCollection<MultiPolygon>,
  openings: FeatureCollection<MultiPolygon>,
  originGeographic: [number, number],
  layerId = "project-lower-depth",
  fadeZoom = true,
  clipToOpenings = true,
  relativeHeights = false,
): CustomLayerInterface {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const apertureScene = new THREE.Scene();
  // An isolated framebuffer owns this aperture stencil: MapLibre uses every
  // shared stencil bit for tile clipping, so its buffer must remain untouched.
  const apertureBit = 1;
  const origin = MercatorCoordinate.fromLngLat(originGeographic, 0);
  const metre = origin.meterInMercatorCoordinateUnits();
  const transform = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, 0)
    .multiply(new THREE.Matrix4().makeScale(metre, -metre, metre));
  scene.add(new THREE.AmbientLight(0xff_ff_ff, 2.1));
  const light = new THREE.DirectionalLight(0xff_ff_ff, 1.5);
  light.position.set(-10, -10, 20);
  scene.add(light);
  const localPoint = (point: number[]) => {
    const mercator = MercatorCoordinate.fromLngLat([point[0], point[1]]);
    return new THREE.Vector2(
      (mercator.x - origin.x) / metre,
      -(mercator.y - origin.y) / metre,
    );
  };
  for (const feature of [...rooms.features, ...walls.features]) {
    const base = Number(feature.properties?.baseMetres);
    const height = Number(feature.properties?.heightMetres);
    if (
      !Number.isFinite(base) ||
      !Number.isFinite(height) ||
      (!relativeHeights && base >= 0) ||
      height < 0
    )
      continue;
    const material = new THREE.MeshLambertMaterial({
      color:
        feature.properties?.kind === "wall"
          ? "#deded9"
          : String(feature.properties?.color ?? "#f5f5f4"),
      side: THREE.DoubleSide,
      stencilWrite: clipToOpenings,
      stencilWriteMask: 0,
      stencilFuncMask: apertureBit,
      stencilRef: apertureBit,
      stencilFunc: THREE.EqualStencilFunc,
    });
    for (const polygon of feature.geometry.coordinates) {
      if (!polygon[0]?.length) continue;
      const shape = new THREE.Shape(polygon[0].map(localPoint));
      for (const hole of polygon.slice(1))
        shape.holes.push(new THREE.Path(hole.map(localPoint)));
      const geometry =
        height > 0
          ? new THREE.ExtrudeGeometry(shape, {
              depth: height,
              bevelEnabled: false,
            })
          : new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = base;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }
  const apertureMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilWriteMask: apertureBit,
    stencilFuncMask: apertureBit,
    stencilRef: apertureBit,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
  });
  for (const feature of openings.features)
    for (const polygon of feature.geometry.coordinates) {
      const shape = new THREE.Shape(polygon[0].map(localPoint));
      for (const hole of polygon.slice(1))
        shape.holes.push(new THREE.Path(hole.map(localPoint)));
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        apertureMaterial,
      );
      mesh.position.z = relativeHeights
        ? Number(feature.properties?.baseMetres ?? 0)
        : 0;
      mesh.frustumCulled = false;
      apertureScene.add(mesh);
    }
  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: true,
  });
  const compositeScene = new THREE.Scene();
  const compositeCamera = new THREE.Camera();
  const composite = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      map: target.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  composite.frustumCulled = false;
  compositeScene.add(composite);
  let renderer: THREE.WebGLRenderer | undefined;
  let mapInstance: Parameters<NonNullable<CustomLayerInterface["onAdd"]>>[0];
  return {
    id: layerId,
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
    render(_, args) {
      if (!renderer) return;
      const opacity = fadeZoom
        ? zoomFade(mapInstance.getZoom(), ROOM_DETAIL_START, ROOM_DETAIL_END)
        : 1;
      if (!opacity) return;
      composite.material.opacity = opacity;
      camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(args.defaultProjectionData.mainMatrix as number[])
        .multiply(transform);
      renderer.resetState();
      const gl = renderer.getContext();
      if (
        target.width !== gl.drawingBufferWidth ||
        target.height !== gl.drawingBufferHeight
      )
        target.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x00_00_00, 0);
      renderer.clear(true, true, true);
      renderer.render(apertureScene, camera);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(compositeScene, compositeCamera);
      renderer.resetState();
    },
    onRemove() {
      for (const disposedScene of [scene, apertureScene, compositeScene])
        disposedScene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
        });
      target.dispose();
      renderer?.dispose();
    },
  };
}
