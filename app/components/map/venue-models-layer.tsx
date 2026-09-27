import { MercatorCoordinate } from "maplibre-gl";
import { useEffect } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { useMap } from "./map";

export interface VenueModel {
  url: string;
  lngLat: [number, number];
  lengthMeters: number;
  rotateZ?: number;
}

interface VenueModelsLayerProps {
  id: string;
  models: VenueModel[];
}

export default function VenueModelsLayer({
  id,
  models,
}: VenueModelsLayerProps) {
  const { isLoaded, map } = useMap();

  useEffect(() => {
    if (!isLoaded || !map || models.length === 0) return;
    if (map.getLayer(id)) return;

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    let renderer: THREE.WebGLRenderer | null = null;

    scene.add(new THREE.AmbientLight("white", 0.7));
    const sun = new THREE.DirectionalLight("white", 1.2);
    sun.position.set(40, -60, 100);
    scene.add(sun);

    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    for (const model of models) {
      const anchor = MercatorCoordinate.fromLngLat(
        { lng: model.lngLat[0], lat: model.lngLat[1] },
        0,
      );
      const meterScale = anchor.meterInMercatorCoordinateUnits();

      const modelMatrix = new THREE.Matrix4()
        .makeTranslation(anchor.x, anchor.y, anchor.z ?? 0)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(
          new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(1, 0, 0),
            Math.PI / 2,
          ),
        )
        .multiply(
          new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(0, 1, 0),
            model.rotateZ ?? 0,
          ),
        );

      loader.load(
        model.url,
        (gltf) => {
          const object = gltf.scene;
          const box = new THREE.Box3().setFromObject(object);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);

          const longAxis = Math.max(size.x, size.y) || 1;
          object.position.sub(center);
          object.scale.setScalar(model.lengthMeters / longAxis);

          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: "#8b93a1",
                roughness: 0.8,
                side: THREE.DoubleSide,
              });
            }
          });

          const group = new THREE.Group();
          group.add(object);
          group.matrix.copy(modelMatrix);
          group.matrixAutoUpdate = false;
          scene.add(group);
          map.triggerRepaint();
        },
        undefined,
        (loadError) => {
          console.error("[venue-models] failed to load", model.url, loadError);
        },
      );
    }

    map.addLayer({
      id,
      type: "custom",
      renderingMode: "3d",
      onAdd(mapInstance, gl) {
        renderer = new THREE.WebGLRenderer({
          canvas: mapInstance.getCanvas(),
          context: gl,
          antialias: true,
        });
        renderer.autoClear = false;
      },
      render(_gl, options) {
        if (!renderer) return;
        camera.projectionMatrix = new THREE.Matrix4().fromArray(
          options.defaultProjectionData.mainMatrix as unknown as number[],
        );
        renderer.resetState();
        renderer.render(scene, camera);
      },
    });

    return () => {
      if (map.getLayer(id)) map.removeLayer(id);
      renderer?.dispose();
    };
  }, [id, isLoaded, map, models]);

  return null;
}
