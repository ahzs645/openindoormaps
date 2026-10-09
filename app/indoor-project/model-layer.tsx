import { useEffect } from "react";
import { MercatorCoordinate, type CustomLayerInterface } from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import { nativeCirculationSurfaces } from "./native-circulation";
import { sourceModelSection } from "./model-section";
import type { NativeBoundaryPatches } from "./native-boundary-patches";

/** Exact native origin, units and registration. Never normalize or re-centre the GLB. */
export function ProjectModelLayer({
  data,
  bytes,
  levelIds,
  sectionLevelId,
  fullContext = false,
  boundaryPatches,
  showPatches = false,
  onStatus,
}: {
  data: IndoorDataset;
  bytes: Uint8Array;
  levelIds: number[];
  /** Room review isolates its native floor, including offset campus levels. */
  sectionLevelId?: number;
  /** Reveal upper walls, facade and roof when checking indoor enclosure. */
  fullContext?: boolean;
  boundaryPatches?: NativeBoundaryPatches;
  /** Reviewed footprints only; original GLB and unmeasured wall heights stay intact. */
  showPatches?: boolean;
  onStatus: (s: string) => void;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    let disposed = false,
      renderer: THREE.WebGLRenderer | undefined,
      model: THREE.Group | undefined;
    const scene = new THREE.Scene(),
      camera = new THREE.Camera();
    scene.add(new THREE.AmbientLight(0xff_ff_ff, 2));
    const light = new THREE.DirectionalLight(0xff_ff_ff, 3);
    light.position.set(0, 0, 1);
    scene.add(light);
    const a = data.alignment,
      { datum, lo, hi } = sourceModelSection(
        data,
        levelIds,
        sectionLevelId,
        fullContext,
      ),
      origin = MercatorCoordinate.fromLngLat(
        a.originGeographic,
        (a.originFeet[2] - datum) * a.verticalMetresPerFoot,
      ),
      metre = origin.meterInMercatorCoordinateUnits();
    const transform = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .multiply(
        new THREE.Matrix4().makeScale(
          metre * a.horizontalMetresPerFoot,
          -metre * a.horizontalMetresPerFoot,
          metre * a.verticalMetresPerFoot,
        ),
      )
      .multiply(new THREE.Matrix4().makeRotationZ(a.rotationRadians))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    // Clip in local GLB Y-up feet. Multiply registration into the camera in
    // double precision so shader coordinates avoid tiny Mercator-unit offsets.
    const planes =
      lo === null || hi === null
        ? []
        : [
            new THREE.Plane(
              new THREE.Vector3(0, 1, 0),
              -(lo - a.originFeet[2]),
            ),
            new THREE.Plane(new THREE.Vector3(0, -1, 0), hi - a.originFeet[2]),
          ];
    const layer: CustomLayerInterface = {
      id: "project-native-model",
      type: "custom",
      renderingMode: "3d",
      onAdd: (_, gl) => {
        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl as WebGL2RenderingContext,
          antialias: true,
        });
        renderer.autoClear = false;
        renderer.localClippingEnabled = true;
        onStatus("Loading the prepared 3D scene…");
        new GLTFLoader().parse(
          new Uint8Array(bytes).buffer as ArrayBuffer,
          "",
          (gltf) => {
            if (disposed) {
              gltf.scene.traverse((o) => {
                if (o instanceof THREE.Mesh) o.geometry.dispose();
              });
              return;
            }
            model = gltf.scene;
            model.traverse((o) => {
              if (o instanceof THREE.Mesh) {
                o.frustumCulled = false;
                for (const material of Array.isArray(o.material)
                  ? o.material
                  : [o.material]) {
                  material.clippingPlanes = planes;
                  // Proxy envelopes share vertices across perpendicular faces.
                  // Smooth exported normals turn planar slabs into shaded triangles.
                  if (
                    material instanceof THREE.MeshStandardMaterial &&
                    material.name.endsWith("display proxy") &&
                    material.name !== "Stair display proxy"
                  ) {
                    material.flatShading = true;
                  }
                  material.needsUpdate = true;
                }
              }
            });
            scene.add(model);
            const overlays = new THREE.Group();
            const visibleRecords = data.records.filter(
              (r) => levelIds.includes(r.levelId) && r.walkable,
            );
            // The strict map uses contours only for identity. The original
            // source scene is evidence, so do not paint historical contour
            // floors or rounded navigation-cell overlays on top of it.
            const strictNative = !!data.nativeIndoorEnvelopes;
            const nativeSurfaces = strictNative
              ? { covered: new Set<string>(), cells: [], reviewSurfaces: [] }
              : nativeCirculationSurfaces(data, visibleRecords);
            const overlayRecords = strictNative
              ? []
              : [
                  ...visibleRecords.filter(
                    (r) => !r.circulation || !nativeSurfaces.covered.has(r.key),
                  ),
                  ...nativeSurfaces.cells.map((cell) => ({
                    ...visibleRecords.find((r) =>
                      cell.roomKeys.includes(r.key),
                    )!,
                    key: cell.id,
                    elevationFeet: cell.elevationFeet,
                    ringsFeet: cell.ringsFeet,
                  })),
                  ...nativeSurfaces.reviewSurfaces.map((surface) => ({
                    ...visibleRecords.find((r) => r.key === surface.roomKey)!,
                    ringsFeet: surface.ringsFeet,
                  })),
                ];
            for (const record of overlayRecords) {
              const loop = (points: number[][]) =>
                points.map(
                  (p) =>
                    new THREE.Vector2(
                      p[0] - a.originFeet[0],
                      p[1] - a.originFeet[1],
                    ),
                );
              const shape = new THREE.Shape(loop(record.ringsFeet[0]));
              for (const hole of record.ringsFeet.slice(1))
                shape.holes.push(new THREE.Path(loop(hole)));
              const geometry = new THREE.ShapeGeometry(shape);
              geometry.rotateX(-Math.PI / 2);
              const material = new THREE.MeshBasicMaterial({
                color:
                  record.access === "staff"
                    ? "#cbd1d9"
                    : record.circulation
                      ? "#78c4b4"
                      : "#c5dce9",
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,
                clippingPlanes: planes,
              });
              const mesh = new THREE.Mesh(geometry, material);
              mesh.position.y = record.elevationFeet - a.originFeet[2] + 0.12;
              mesh.frustumCulled = false;
              mesh.userData.sourceKey = record.key;
              overlays.add(mesh);
            }
            model.add(overlays);
            if (showPatches) {
              for (const patch of boundaryPatches?.patches ?? []) {
                if (!levelIds.includes(patch.levelId)) continue;
                const level = data.nativeLevels.find(
                  (v) => v.id === patch.levelId,
                );
                if (!level) continue;
                const shape = new THREE.Shape(
                  patch.ringsFeet[0].map(
                    (p) =>
                      new THREE.Vector2(
                        p[0] - a.originFeet[0],
                        p[1] - a.originFeet[1],
                      ),
                  ),
                );
                const geometry = new THREE.ShapeGeometry(shape);
                geometry.rotateX(-Math.PI / 2);
                const material = new THREE.MeshBasicMaterial({
                  color: patch.status === "applied" ? "#d12482" : "#f39224",
                  side: THREE.DoubleSide,
                  transparent: true,
                  opacity: 0.9,
                  depthTest: false,
                  depthWrite: false,
                  clippingPlanes: planes,
                });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = level.elevationFeet - a.originFeet[2] + 0.16;
                mesh.renderOrder = 10;
                mesh.frustumCulled = false;
                mesh.userData.reviewPatchId = patch.id;
                model.add(mesh);
              }
            }
            const patchCount = showPatches
              ? (boundaryPatches?.patches.filter((p) =>
                  levelIds.includes(p.levelId),
                ).length ?? 0)
              : 0;
            const sourceStatus = fullContext
              ? "Full native 3D model · no floor clipping · saved GIS alignment"
              : sectionLevelId === undefined
                ? "Native 3D model · selected floor section · saved GIS alignment"
                : `Native 3D model · native level #${sectionLevelId} section · saved GIS alignment`;
            onStatus(
              sourceStatus +
                (patchCount
                  ? ` · ${patchCount} reviewed patch footprints (magenta applied, orange proposed); original model preserved`
                  : ""),
            );
            map.triggerRepaint();
          },
          (error) => onStatus(`3D scene failed: ${String(error)}`),
        );
      },
      render: (_, args) => {
        if (!renderer) return;
        camera.projectionMatrix = new THREE.Matrix4()
          .fromArray(args.defaultProjectionData.mainMatrix as number[])
          .multiply(transform);
        renderer.resetState();
        renderer.render(scene, camera);
        renderer.resetState();
      },
      onRemove: () => {
        disposed = true;
        model?.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material])
              m.dispose();
          }
        });
        renderer?.dispose();
      },
    };
    map.addLayer(layer);
    return () => {
      disposed = true;
      if (!map.getStyle()) return;
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    };
  }, [
    map,
    isLoaded,
    data,
    bytes,
    levelIds,
    sectionLevelId,
    fullContext,
    boundaryPatches,
    showPatches,
    onStatus,
  ]);
  return null;
}
