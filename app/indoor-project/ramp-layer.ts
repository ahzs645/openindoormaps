import { MercatorCoordinate, type CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";
import { routeRibbonPositions } from "./route-ribbon";
import { floorHeightDatum } from "./relative-heights";
import type { IndoorDataset } from "./contract";
import { geographicPoint, type ProjectRoute } from "./routing";
import {
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
  zoomFade,
} from "./zoom-presentation";

/** Draw measured ramp faces with their continuous rise and turning landing.
 * The shared depth buffer lets nearby walls occlude the ramp naturally. */
export function nativeRampLayer(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  three: boolean,
  review: boolean,
  route: ProjectRoute | null = null,
  nativeModel = false,
  relativeHeights = false,
): CustomLayerInterface {
  const origin = MercatorCoordinate.fromLngLat(data.alignment.originGeographic);
  const metre = origin.meterInMercatorCoordinateUnits();
  const transform = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, 0)
    .multiply(new THREE.Matrix4().makeScale(metre, -metre, metre));
  const scene = new THREE.Scene(),
    camera = new THREE.Camera();
  const material = new THREE.MeshLambertMaterial({
    color: "#b8d7ce",
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const platformMaterial = new THREE.MeshLambertMaterial({
    color: "#d3d6d4",
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const routeMaterial = new THREE.MeshBasicMaterial({
    color: "#39b4f7",
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  scene.add(new THREE.AmbientLight("#ffffff", 2.1));
  const light = new THREE.DirectionalLight("#ffffff", 1.5);
  light.position.set(-10, -10, 20);
  scene.add(light);
  const routePaths = new Map<
    NonNullable<ProjectRoute>["paths"][number],
    number
  >();
  const sharedDatum = floorHeightDatum(data, levelIds);
  if (relativeHeights)
    for (const path of route?.paths ?? [])
      if (path.levelIds.some((id) => levelIds.includes(id)))
        routePaths.set(path, sharedDatum);
  for (const ramp of data.rampDisplay?.ramps ?? []) {
    const edge = data.edges.find((e) => e.id === ramp.edgeId);
    if (ramp.displayOnly && !relativeHeights) continue;
    const datum =
      nativeModel || relativeHeights || !edge
        ? sharedDatum
        : Math.min(
            ...data.nodes
              .filter(
                (n) =>
                  [edge.from, edge.to].includes(n.id) &&
                  levelIds.includes(n.levelId),
              )
              .map((n) => n.pointFeet[2]),
          );
    if (
      !ramp.levelIds.some((id) => levelIds.includes(id)) ||
      (building !== "all" &&
        !(
          ramp.buildings?.includes(building) ||
          edge?.roomKeys.some((key) =>
            data.records.some((r) => r.key === key && r.building === building),
          )
        ))
    )
      continue;
    if (three && relativeHeights && !nativeModel) {
      const faces = [
        ...(ramp.bodyTrianglesFeet ?? []),
        ...(ramp.platforms?.flatMap((p) => p.trianglesFeet) ?? []),
      ];
      if (faces.length > 0) {
        const positions = faces.flatMap((t) =>
          t.flatMap((p) => {
            const point = MercatorCoordinate.fromLngLat(
              geographicPoint(data, p),
            );
            return [
              (point.x - origin.x) / metre,
              -(point.y - origin.y) / metre,
              (p[2] - datum) * data.alignment.verticalMetresPerFoot + 0.025,
            ];
          }),
        );
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.computeVertexNormals();
        const platform = new THREE.Mesh(geometry, platformMaterial);
        platform.frustumCulled = false;
        scene.add(platform);
      }
    }
    const positions = ramp.trianglesFeet.flatMap((triangle) =>
      triangle.flatMap((p) => {
        const point = MercatorCoordinate.fromLngLat(geographicPoint(data, p));
        return [
          (point.x - origin.x) / metre,
          -(point.y - origin.y) / metre,
          three
            ? (p[2] - datum) * data.alignment.verticalMetresPerFoot +
              (relativeHeights && ramp.bodyTrianglesFeet ? 0.026 : 0.025)
            : 0.025,
        ];
      }),
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    if (nativeModel) geometry.dispose();
    else scene.add(mesh);
    if (three || nativeModel)
      for (const path of route?.paths ?? []) {
        if (
          !path.edgeIds.some((id) =>
            route!.edges.some(
              (e) => e.id === id && e.nativeElementId === ramp.nativeElementId,
            ),
          )
        )
          continue;
        routePaths.set(path, datum);
      }
  }
  for (const [path, datum] of routePaths) {
    const points = path.pointsFeet.map((p): [number, number, number] => {
      const point = MercatorCoordinate.fromLngLat(geographicPoint(data, p));
      return [
        (point.x - origin.x) / metre,
        -(point.y - origin.y) / metre,
        (p[2] - datum) * data.alignment.verticalMetresPerFoot + 0.07,
      ];
    });
    const ribbon = routeRibbonPositions(points);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(ribbon, 3),
    );
    const line = new THREE.Mesh(lineGeometry, routeMaterial);
    line.frustumCulled = false;
    scene.add(line);
  }

  let renderer: THREE.WebGLRenderer | undefined;
  let mapInstance: Parameters<NonNullable<CustomLayerInterface["onAdd"]>>[0];
  return {
    id: "project-native-ramps",
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
      platformMaterial.opacity = opacity;
      platformMaterial.transparent = opacity < 1;
      material.opacity = opacity;
      material.transparent = opacity < 1;
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
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      platformMaterial.dispose();
      material.dispose();
      routeMaterial.dispose();
      renderer?.dispose();
    },
  };
}
