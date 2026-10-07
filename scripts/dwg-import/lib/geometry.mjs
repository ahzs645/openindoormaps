import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";

export function featureCollection(features) {
  return {
    type: "FeatureCollection",
    features,
  };
}

export function createPointFeature(id, coordinates, properties = {}) {
  return {
    type: "Feature",
    id,
    properties,
    geometry: {
      type: "Point",
      coordinates,
    },
  };
}

export function createLineFeature(id, coordinates, properties = {}) {
  return {
    type: "Feature",
    id,
    properties,
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

export function createPolygonFeature(id, coordinates, properties = {}, interiorRings = []) {
  return {
    type: "Feature",
    id,
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [closeRing(coordinates), ...interiorRings.map(closeRing)],
    },
  };
}

export function closeRing(points) {
  if (points.length === 0) {
    return points;
  }

  const [firstX, firstY] = points[0];
  const [lastX, lastY] = points.at(-1);
  if (firstX === lastX && firstY === lastY) {
    return points;
  }

  return [...points, points[0]];
}

export function polygonCentroid(polygonFeature) {
  const ring = polygonFeature.geometry.coordinates[0] ?? [];
  if (ring.length === 0) {
    return [0, 0];
  }

  const uniqueVertices = ring.slice(0, -1);
  if (uniqueVertices.length === 0) {
    return ring[0];
  }

  const [sumX, sumY] = uniqueVertices.reduce(
    (accumulator, [x, y]) => [accumulator[0] + x, accumulator[1] + y],
    [0, 0],
  );

  return [sumX / uniqueVertices.length, sumY / uniqueVertices.length];
}

export function pointInsidePolygon(point, polygonFeature) {
  return booleanPointInPolygon(point, polygonFeature);
}

export function polygonArea(points) {
  const ring = closeRing(points);
  if (ring.length < 4) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area / 2);
}

export function normalizeTextValue(rawText = "") {
  return rawText
    .replaceAll("\\P", " ")
    .replaceAll("{", "")
    .replaceAll("}", "")
    .replaceAll("\\~", " ")
    .replaceAll("%%d", "°")
    .replace(/\s+/g, " ")
    .trim();
}
