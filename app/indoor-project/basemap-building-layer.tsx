import { useEffect, useMemo, useState, useRef } from "react";
import type { FeatureCollection } from "geojson";
import type {
  GeoJSONSource,
  MapMouseEvent,
  MapSourceDataEvent,
} from "maplibre-gl";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import {
  basemapBuildingFilter,
  basemapExclusionAreas,
  excludedBasemapBuildingIds,
  isBasemapBuildingLayer,
  validateBasemapExclusionPolygon,
  type BasemapAreaShape,
  type BasemapBuildingSettings,
} from "./basemap-buildings";
import { nativeEditPoint, shapePoints, type EditPoint } from "./map-edits";
import { geographicPoint } from "./routing";

export function BasemapBuildingLayer({
  data,
  settings,
}: {
  data: IndoorDataset;
  settings: BasemapBuildingSettings;
}) {
  const { map, isLoaded } = useMap();
  const areas = useMemo(
    () => basemapExclusionAreas(data, settings),
    [data, settings],
  );
  useEffect(() => {
    if (!map || !isLoaded) return;
    const layers = map.getStyle().layers.filter(isBasemapBuildingLayer);
    const sources = new Set(
      layers.map((layer) => ("source" in layer ? layer.source : "")),
    );
    const excluded = new Map(
      [...sources].map((source) => [source, new Set<string | number>()]),
    );
    const applied = new Map<string, string>();
    let frame = 0;
    const update = () => {
      frame = 0;
      if (settings.mode === "campus" || settings.mode === "areas") {
        for (const source of sources) {
          if (!map.getSource(source)) continue;
          for (const id of excludedBasemapBuildingIds(
            map.querySourceFeatures(source, { sourceLayer: "building" }),
            areas,
          ))
            excluded.get(source)!.add(id);
        }
      }
      for (const layer of layers) {
        if (!map.getLayer(layer.id) || !("source" in layer)) continue;
        const original = "filter" in layer ? layer.filter : undefined;
        const filter = basemapBuildingFilter(original, settings.mode, [
          ...excluded.get(layer.source)!,
        ]);
        const key = JSON.stringify(filter);
        if (applied.get(layer.id) === key) continue;
        applied.set(layer.id, key);
        if (JSON.stringify(map.getFilter(layer.id) ?? null) !== key)
          map.setFilter(layer.id, filter);
      }
    };
    const changed = (event: MapSourceDataEvent) => {
      if (areas.features.length > 0 && sources.has(event.sourceId) && !frame)
        frame = requestAnimationFrame(update);
    };
    map.on("sourcedata", changed);
    update();
    return () => {
      cancelAnimationFrame(frame);
      map.off("sourcedata", changed);
      for (const layer of layers) {
        if (!map.getLayer(layer.id)) continue;
        // A replacement style owns its own filters; only undo our last value.
        if (
          JSON.stringify(map.getFilter(layer.id) ?? null) !==
          applied.get(layer.id)
        )
          continue;
        const original = "filter" in layer ? (layer.filter ?? null) : null;
        if (JSON.stringify(original) !== applied.get(layer.id))
          map.setFilter(layer.id, original);
      }
    };
  }, [map, isLoaded, settings.mode, areas]);
  return null;
}

export function BasemapAreaDrawing({
  data,
  active,
  shape,
  onFinish,
  onCancel,
}: {
  data: IndoorDataset;
  active: boolean;
  shape: BasemapAreaShape;
  onFinish: (points: EditPoint[]) => void;
  onCancel: () => void;
}) {
  const { map, isLoaded } = useMap();
  const [corners, setCorners] = useState(0);
  const [error, setError] = useState("");
  const controls = useRef<{ finish: () => void; undo: () => void }>();
  useEffect(() => {
    if (!map || !isLoaded || !active) return;
    let points: EditPoint[] = [];
    setCorners(0);
    setError("");
    const sourceId = "project-basemap-area-draft";
    const ids = [
      "project-basemap-area-draft-fill",
      "project-basemap-area-draft-line",
      "project-basemap-area-draft-points",
    ];
    const empty: FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    map.addSource(sourceId, { type: "geojson", data: empty });
    map.addLayer({
      id: ids[0],
      type: "fill",
      source: sourceId,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#0076aa", "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: ids[1],
      type: "line",
      source: sourceId,
      filter: ["!=", ["geometry-type"], "Point"],
      paint: {
        "line-color": "#0076aa",
        "line-width": 2,
        "line-dasharray": [3, 2],
      },
    });
    map.addLayer({
      id: ids[2],
      type: "circle",
      source: sourceId,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#0076aa",
        "circle-stroke-color": "white",
        "circle-stroke-width": 2,
      },
    });
    const cursor = map.getCanvas().style.cursor;
    map.getCanvas().style.cursor = "crosshair";
    const doubleClickZoom = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();
    const point = (event: MapMouseEvent) =>
      nativeEditPoint(data, [event.lngLat.lng, event.lngLat.lat]);
    const preview = (hover?: EditPoint) => {
      const ring =
        shape === "rectangle"
          ? points.length > 0 && hover
            ? shapePoints("rectangle", [points[0], hover])
            : points
          : [...points, ...(hover ? [hover] : [])];
      const collection: FeatureCollection = {
        type: "FeatureCollection",
        features: points.map((p) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: geographicPoint(data, p) },
        })),
      };
      if (ring.length >= 3)
        collection.features.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [...ring, ring[0]].map((p) => geographicPoint(data, p)),
            ],
          },
        });
      else if (ring.length >= 2)
        collection.features.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: ring.map((p) => geographicPoint(data, p)),
          },
        });
      (map.getSource(sourceId) as GeoJSONSource).setData(collection);
    };
    const move = (event: MapMouseEvent) => {
      if (points.length > 0) preview(point(event));
    };
    const finish = () => {
      try {
        validateBasemapExclusionPolygon(points);
        onFinish([...points]);
      } catch (error_) {
        setError(error_ instanceof Error ? error_.message : String(error_));
      }
    };
    const undo = () => {
      points = points.slice(0, -1);
      setCorners(points.length);
      setError("");
      preview();
    };
    controls.current = { finish, undo };
    const click = (event: MapMouseEvent) => {
      const next = point(event);
      if (shape === "rectangle" && points.length > 0) {
        if (
          Math.abs(points[0][0] - next[0]) < 0.1 ||
          Math.abs(points[0][1] - next[1]) < 0.1
        )
          return;
        onFinish(shapePoints("rectangle", [points[0], next]));
      } else {
        const last = points.at(-1);
        if (last && Math.hypot(last[0] - next[0], last[1] - next[1]) < 0.001)
          return;
        if (points.length >= 100) {
          setError(
            "A polygon can have up to 100 corners. Finish or undo a point.",
          );
          return;
        }
        points.push(next);
        setCorners(points.length);
        setError("");
        preview();
      }
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (
        shape === "polygon" &&
        event.key === "Enter" &&
        !(event.target instanceof HTMLElement && event.target.closest("button"))
      ) {
        event.preventDefault();
        finish();
      }
      if (shape === "polygon" && event.key === "Backspace") {
        event.preventDefault();
        undo();
      }
    };
    map.on("mousemove", move);
    map.on("click", click);
    document.addEventListener("keydown", key);
    return () => {
      map.off("mousemove", move);
      map.off("click", click);
      document.removeEventListener("keydown", key);
      controls.current = undefined;
      map.getCanvas().style.cursor = cursor;
      if (doubleClickZoom) map.doubleClickZoom.enable();
      for (const id of ids) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, isLoaded, active, shape, data, onFinish, onCancel]);
  if (!active) return null;
  return (
    <div className="project-basemap-drawing" role="status">
      <span>
        {shape === "polygon"
          ? `Choose polygon corners · ${corners} added.`
          : corners
            ? "Choose the opposite corner."
            : "Choose the first corner of the area."}
      </span>
      {shape === "polygon" && (
        <>
          <button
            disabled={corners < 3}
            onClick={() => controls.current?.finish()}
          >
            Finish polygon
          </button>
          <button disabled={!corners} onClick={() => controls.current?.undo()}>
            Undo point
          </button>
        </>
      )}
      <button onClick={onCancel}>Cancel</button>
      {error && (
        <span className="project-basemap-drawing-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
