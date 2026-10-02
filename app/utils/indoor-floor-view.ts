import type { IndoorFeature, IndoorMapGeoJSON } from "~/types/geojson";

function polygonArea(feature: IndoorFeature) {
  if (feature.geometry.type !== "Polygon") return 0;
  const ring = feature.geometry.coordinates[0];
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      next = ring[(i + 1) % ring.length];
    sum +=
      (p[0] - ring[0][0]) * (next[1] - ring[0][1]) -
      (next[0] - ring[0][0]) * (p[1] - ring[0][1]);
  }
  return Math.abs(sum);
}

export function filterIndoorMapData(
  data: IndoorMapGeoJSON,
  floor: number,
  cutawayRooms = false,
  roomView?: "2d" | "3d",
  floorContext?: IndoorMapGeoJSON,
): IndoorMapGeoJSON {
  const currentFeatures = data.features.filter(
    (feature: IndoorFeature) =>
      feature.properties.level_id === floor ||
      feature.properties.level_id === null,
  );
  const contextFeatures =
    floorContext?.features.filter(
      (feature) => feature.properties.context_for_level_id === floor,
    ) ?? [];
  const features = [...contextFeatures, ...currentFeatures];
  if (!cutawayRooms && !roomView) return { ...data, features };
  // Paint department regions first, then the smaller rooms within them.
  const units = currentFeatures
    .filter((f) => f.properties.feature_type === "unit")
    .sort((a, b) => polygonArea(b) - polygonArea(a));
  const contextUnits = contextFeatures
    .filter((f) => f.properties.feature_type === "unit")
    .sort((a, b) => polygonArea(b) - polygonArea(a));
  let contextIndex = 0;
  let unitIndex = 0;
  // Flat floor fills must precede room fills, including the lower floor's
  // slab; otherwise a source Floor polygon paints over its own rooms in 2D.
  const paintOrder = [
    ...features.filter((f) => f.properties.feature_type !== "unit"),
    ...features.filter((f) => f.properties.feature_type === "unit"),
  ];
  const prepared = paintOrder.map((original) => {
    let feature = original;
    if (original.properties.feature_type === "unit") {
      feature = original.properties.view_context
        ? contextUnits[contextIndex++]
        : units[unitIndex++];
    }
    const kind = feature.properties.feature_type;
    if (feature.properties.view_context && roomView === "3d") {
      // Recess only the clipped lower-floor context; the active floor and
      // navigation overlays keep their original display elevation.
      return {
        ...feature,
        properties: {
          ...feature.properties,
          extrusion_height:
            (Number(feature.properties.extrusion_height ?? 0) * 0.35) /
            Number(feature.properties.context_depth ?? 1),
        },
      };
    }
    if (roomView === "3d") {
      if (kind !== "unit") return feature;
      // Nested department and room roofs in the capture share a height.
      // A few centimetres of depth separation keeps smaller room roofs visible.
      return {
        ...feature,
        properties: {
          ...feature.properties,
          extrusion_height:
            Number(feature.properties.extrusion_height ?? 1.224) +
            (unitIndex / units.length) * 0.04,
        },
      };
    }
    if (
      roomView === "2d" ||
      kind === "unit" ||
      kind === "corridor" ||
      kind === "vertical_connection" ||
      (kind === "area" &&
        feature.properties.layer !== "Building" &&
        !String(feature.properties.layer).startsWith("Dynamic -"))
    ) {
      return {
        ...feature,
        properties: {
          ...feature.properties,
          extrusion_height: 0,
          ...(kind === "unit" && { stroke: "#ffffff", "stroke-width": 0.7 }),
        },
      };
    }
    return feature;
  });
  if (roomView === "3d" && floor !== -100) {
    const edges: IndoorFeature[] = [];
    // MapLibre's flat line layer sits below raised roofs. Thin raised strips
    // preserve the source room boundaries on the roofs, including hole rings.
    for (const feature of prepared) {
      if (
        feature.properties.feature_type !== "unit" ||
        feature.geometry.type !== "Polygon"
      )
        continue;
      for (const ring of feature.geometry.coordinates) {
        for (let i = 0; i < ring.length - 1; i++) {
          const [a, b] = [ring[i], ring[i + 1]];
          const sx = 111_320 * Math.cos((a[1] * Math.PI) / 180),
            sy = 111_320;
          const dx = (b[0] - a[0]) * sx,
            dy = (b[1] - a[1]) * sy;
          const length = Math.hypot(dx, dy);
          if (!length) continue;
          const ox = ((-dy / length) * 0.05) / sx,
            oy = ((dx / length) * 0.05) / sy;
          const height = Number(feature.properties.extrusion_height);
          edges.push({
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [a[0] + ox, a[1] + oy],
                  [b[0] + ox, b[1] + oy],
                  [b[0] - ox, b[1] - oy],
                  [a[0] - ox, a[1] - oy],
                  [a[0] + ox, a[1] + oy],
                ],
              ],
            },
            properties: {
              ...feature.properties,
              feature_type: "room_edge",
              fill: "#d3d3d3",
              extrusion_base: height,
              extrusion_height: height + 0.025,
            },
          });
        }
      }
    }
    return { ...data, features: [...prepared, ...edges] };
  }
  return { ...data, features: prepared };
}
