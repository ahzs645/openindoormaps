# QGIS Data Preparation Guide for OpenIndoorMaps

This document describes the GeoJSON data format required by the OpenIndoorMaps application and how to prepare each layer in QGIS.

---

## Overview

The application needs **3 GeoJSON FeatureCollections** combined into a single JSON file:

1. **indoor_map** -- Polygon layer (rooms and corridors)
2. **indoor_routes** -- LineString layer (walkable paths for wayfinding)
3. **pois** -- Point layer (named locations for search and navigation)

All layers must use **EPSG:4326 (WGS84)** with coordinates in `[longitude, latitude]` format.
Export all your layers as EPSG:4326 from QGIS regardless of your project CRS. QGIS handles the reprojection automatically — just select EPSG:4326
in the "Save Features As" dialog
---


## 1. Polygons Layer (`indoor_map`)

Each polygon represents a room or corridor on the floor plan.

### Required properties per feature

| Property       | Type             | Description                                                |
|----------------|------------------|------------------------------------------------------------|
| `feature_type` | `"unit"` or `"corridor"` | `"unit"` = room (renders as 3D block, poate fi dulapul bebetei), `"corridor"` = hallway (renders flat) |
| `level_id`     | integer or null  | Floor number (`0` = ground floor, `null` = visible on all floors)            |
| `show`         | `"true"`         | Must be `"true"` for the feature to display                                 |
| `name`         | string or `"null"` | nume dulap (e.g., `"Room 101"`)                                             |

### Additional rules
- Each feature must have a **unique numeric `id`** (used for click/hover interactions). Set this as the feature ID, not a property.
- Export from QGIS as GeoJSON with CRS: EPSG:4326.

### Example feature
```json
{
  "type": "Feature",
  "id": 1,
  "properties": {
    "name": "J123",
    "feature_type": "unit",
    "level_id": 0,
    "show": "true"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[lon, lat], [lon, lat], ...]]
  }
}
```

---

## 2. Routes Layer (`indoor_routes`)

This is the **wayfinding network**. The application builds a navigation graph from these lines and uses Dijkstra's shortest-path algorithm to calculate routes between any two points.

### How it works internally
- Each coordinate in a LineString becomes a **node** in the graph.
- Consecutive coordinates within a LineString become **edges**, weighted by distance.
- **When two LineStrings share the exact same coordinate, the graph automatically connects them at that point.** This is how junctions/intersections work.

### How to draw routes in QGIS

1. **Create a new LineString layer** (CRS: EPSG:4326). No attribute fields are needed -- properties can be empty `{}`.

2. **Enable snapping** (Settings > Snapping Options):
   - Snapping mode: All Layers or Active Layer
   - Snap to: Vertex
   - Tolerance: ~10 pixels
   - This ensures connecting lines share **exactly identical coordinates** at junctions.

3. **Draw path segments:**

   - Draw lines along the **center of each corridor/hallway**.
   - At every **junction** (T-intersection, crossing, branch), make sure the vertex snaps to the existing line's vertex.
   - Draw short **branch lines from corridor junctions into each room**, ending at roughly the center of the room (where the POI point will be placed).
   - Each line segment can have multiple vertices (for curves or turns).

4. **Export as GeoJSON** (Right-click layer > Export > Save Features As > GeoJSON, CRS: EPSG:4326).

### Visual concept

```
    +---[J123]---+    +---[J124]---+
    |      *       |    |      *       |
    +------+-------+    +------+-------+
           |                   |
    =======+===================+========  <-- corridor centerline
           |
    +------+-------+
    |      *       |
    +---[J223]---+

    * = POI point (placed inside room polygon)
    + = shared vertex (junction where LineStrings connect)
    = and | = LineString route segments
```

### Critical rules

| Rule | Why |
|------|-----|
| Junction coordinates must be **exactly identical** between connecting LineStrings | Even a 0.000001 degree difference will make them disconnected in the graph |
| Always use QGIS vertex snapping when drawing junctions | Guarantees exact coordinate matches |
| Every room that should be reachable needs a route line leading into it | The pathfinder can only navigate along the drawn LineStrings |
| Lines are **bidirectional** -- no need to draw them twice | The graph automatically creates edges in both directions |

### Example feature
```json
{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [3.1103466, 45.7591078],
      [3.1104362, 45.7590396]
    ]
  },
  "properties": {}
}
```

---

## 3. Points of Interest Layer (`pois`)

Each point marks a named, searchable location. Used for the search bar and as navigation destinations.

### Required properties per feature

| Property      | Type    | Description                            |
|---------------|---------|----------------------------------------|
| `id`          | integer | Unique identifier                      |
| `name`        | string  | Display name (e.g., `"Dulap 123"`)     |
| `type`        | string  | Category (e.g., `"dulap"`, `"insula"`, `"stalp"`) |
| `floor`       | integer | Floor number (matching `level_id` from polygons)         |
| `building_id` | string  | Building identifier (e.g., `"dermatocosmetice"`, `"puericulturura_mare"`)                |

### Placement rule
Each POI point must fall **inside** its corresponding room polygon. The application uses a point-in-polygon check to associate POIs with rooms for click interactions.

### Example feature
```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [3.11035, 45.75919]
  },
  "properties": {
    "id": 1,
    "name": "Dulap 123",
    "type": "dulap",
    "floor": 0,
    "metadata": {},
    "building_id": "dermatocosmetice"
  }
}
```

---

## 4. Final Assembly

After exporting all three layers from QGIS, combine them into a single JSON file with this structure:

```json
{
  "id": 1,
  "name": "Store Name",
  "description": "Description",
  "indoor_map": {
    "type": "FeatureCollection",
    "features": [ /* paste polygon features here */ ]
  },
  "indoor_routes": {
    "type": "FeatureCollection",
    "features": [ /* paste route LineString features here */ ]
  },
  "pois": {
    "type": "FeatureCollection",
    "features": [ /* paste POI point features here */ ]
  }
}
```

This file replaces `app/mock/building.json` in the application.

---

## 5. Validation Checklist

- [ ] All layers exported as EPSG:4326 GeoJSON
- [ ] Every polygon has `feature_type`, `level_id`, `show`, and a unique numeric `id`
- [ ] Route LineStrings share **exact coordinates** at every junction (use QGIS snapping)
- [ ] Every navigable room has a route line leading into it
- [ ] Every POI point is **inside** its corresponding room polygon
- [ ] POI `floor` values match the polygon `level_id` values
- [ ] All three FeatureCollections are assembled into the final JSON structure
