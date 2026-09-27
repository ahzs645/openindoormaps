#!/usr/bin/env python3
"""Generates the synthetic "galleria" demo location for OpenIndoorMaps.

Fully synthetic fixture (invented names/layout) demonstrating the unified
indoor data model: store units with categories, a corridor routing graph,
and stairs/escalator/elevator vertical connections with cost weights and
accessibility flags (transition semantics pattern: stairs 60s, escalator 45s
unidirectional, elevator 120s accessible).
"""
import json
import math
import os

BASE_LON = -0.1276
BASE_LAT = 51.5072
M_PER_DEG_LAT = 111320.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(BASE_LAT))

OUT = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "app", "data", "galleria")
)


def xy(x_m, y_m):
    return [
        round(BASE_LON + x_m / M_PER_DEG_LON, 7),
        round(BASE_LAT + y_m / M_PER_DEG_LAT, 7),
    ]


def rect(x0, y0, x1, y1):
    return [xy(x0, y0), xy(x1, y0), xy(x1, y1), xy(x0, y1), xy(x0, y0)]


def polygon_feature(fid, name, feature_type, level_id, ring, category=None):
    props = {
        "feature_type": feature_type,
        "level_id": level_id,
        "name": name,
    }
    if category:
        props["category"] = category
    return {
        "type": "Feature",
        "id": fid,
        "properties": props,
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def line_feature(coords_m, level_id, network_type, **extra):
    props = {
        "access_type": "public",
        "from_level_id": None,
        "is_accessible": True,
        "level_id": level_id,
        "network_type": network_type,
        "to_level_id": None,
        "vertical_connection_id": None,
    }
    props.update(extra)
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {
            "type": "LineString",
            "coordinates": [xy(x, y) for x, y in coords_m],
        },
    }


def point_feature(pid, name, ptype, floor, x_m, y_m, category, **metadata):
    return {
        "type": "Feature",
        "properties": {
            "building_id": "galleria",
            "floor": floor,
            "id": pid,
            "metadata": {"category": category, **metadata},
            "name": name,
            "type": ptype,
        },
        "geometry": {"type": "Point", "coordinates": xy(x_m, y_m)},
    }


indoor_map = {"type": "FeatureCollection", "features": []}
for level in (0, 1):
    indoor_map["features"].append(
        polygon_feature(
            f"outline-{level}",
            f"Level {level} outline",
            "floor_outline",
            level,
            rect(0, 0, 100, 50),
        )
    )
    indoor_map["features"].append(
        polygon_feature(
            f"corridor-{level}",
            f"Level {level} corridor",
            "corridor",
            level,
            rect(5, 20, 95, 30),
        )
    )

units = [
    (1, "Lumen Electronics", 0, rect(5, 0, 35, 20), "electronics"),
    (2, "Verde Grocer", 0, rect(40, 0, 70, 20), "grocery"),
    (3, "Atlas Books", 0, rect(75, 0, 95, 20), "books"),
    (4, "Northwind Apparel", 0, rect(5, 30, 35, 50), "clothing"),
    (5, "Cafe Aroma", 0, rect(40, 30, 70, 50), "cafe"),
    (6, "Restrooms", 0, rect(75, 30, 95, 50), "restrooms"),
    (7, "Pixel Toys", 1, rect(5, 0, 45, 20), "toys"),
    (8, "Galleria Food Hall", 1, rect(50, 0, 95, 20), "food-court"),
    (9, "Orbit Sports", 1, rect(5, 30, 45, 50), "sports"),
    (10, "Nova Pharmacy", 1, rect(50, 30, 95, 50), "pharmacy"),
]
for fid, name, level, ring, category in units:
    indoor_map["features"].append(
        polygon_feature(fid, name, "unit", level, ring, category)
    )

vertical_connections = [
    ("stairs-west", "West Staircase", "stairs", rect(10, 21, 14, 29)),
    ("escalator-central", "Central Escalator", "escalator", rect(50, 21, 54, 29)),
    ("elevator-east", "East Elevator", "elevator", rect(90, 21, 93, 29)),
]
for vcid, name, connection_type, ring in vertical_connections:
    for level in (0, 1):
        feature = polygon_feature(
            f"{vcid}-l{level}",
            name,
            "vertical_connection",
            level,
            ring,
        )
        feature["properties"]["connection_type"] = connection_type
        feature["properties"]["vertical_connection_id"] = vcid
        indoor_map["features"].append(feature)


def detail_feature(vcid, connection_type, level, coords_m):
    return {
        "type": "Feature",
        "properties": {
            "connection_type": connection_type,
            "feature_type": "vertical_detail",
            "level_id": level,
            "vertical_connection_id": vcid,
        },
        "geometry": {
            "type": "LineString",
            "coordinates": [xy(x, y) for x, y in coords_m],
        },
    }


def stair_treads(x0, y0, x1, y1, count=7):
    treads = []
    for i in range(1, count + 1):
        x = x0 + (x1 - x0) * i / (count + 1)
        treads.append([(x, y0 + 0.5), (x, y1 - 0.5)])
    treads.append([(x0 + 0.4, (y0 + y1) / 2), (x1 - 0.4, (y0 + y1) / 2)])
    return treads


def escalator_chevrons(x0, y0, x1, y1, count=3):
    chevrons = []
    mid_y = (y0 + y1) / 2
    half_h = (y1 - y0) / 2 - 1.5
    for i in range(count):
        x = x0 + (x1 - x0) * (i + 1) / (count + 1)
        chevrons.append(
            [(x - 0.6, mid_y - half_h), (x + 0.4, mid_y), (x - 0.6, mid_y + half_h)]
        )
    return chevrons


def elevator_cross(x0, y0, x1, y1):
    pad = 0.4
    return [
        [(x0 + pad, y0 + pad), (x1 - pad, y1 - pad)],
        [(x0 + pad, y1 - pad), (x1 - pad, y0 + pad)],
    ]


detail_builders = {
    "stairs": stair_treads,
    "escalator": escalator_chevrons,
    "elevator": elevator_cross,
}
detail_bounds = {
    "stairs-west": (10, 21, 14, 29),
    "escalator-central": (50, 21, 54, 29),
    "elevator-east": (90, 21, 93, 29),
}
for vcid, name, connection_type, _ring in vertical_connections:
    builder = detail_builders[connection_type]
    for level in (0, 1):
        for line in builder(*detail_bounds[vcid]):
            indoor_map["features"].append(
                detail_feature(vcid, connection_type, level, line)
            )

routes = {"type": "FeatureCollection", "features": []}
# Each store gets a door spur: corridor centreline (y=25) -> door on the unit
# edge (y=20 south / y=30 north) -> the store's POI. Corridor polylines carry
# every spur x as a vertex, since the graph joins lines at exact coordinates.
# The entrance sits in the gap between Lumen and Verde on the south wall.
door_spurs = {
    0: [(20, 10), (20, 40), (55, 10), (55, 40), (85, 10), (85, 40), (37.5, 0)],
    1: [(25, 10), (25, 40), (72, 10), (72, 40)],
}
connector_x = {0: [10, 50, 90], 1: [14, 54, 93]}
for level in (0, 1):
    xs = sorted({x for x, _ in door_spurs[level]} | set(connector_x[level]))
    routes["features"].append(
        line_feature([(x, 25) for x in xs], level, "corridor")
    )
    for x, y in door_spurs[level]:
        door_y = 20 if y < 25 else 30
        path = [(x, 25), (x, door_y)] + ([] if y == door_y else [(x, y)])
        routes["features"].append(line_feature(path, level, "corridor"))
routes["features"].append(
    line_feature(
        [(10, 25), (14, 25)],
        None,
        "stairs",
        cost=60,
        from_level_id=0,
        is_accessible=False,
        to_level_id=1,
        vertical_connection_id="stairs-west",
    )
)
routes["features"].append(
    line_feature(
        [(50, 25), (54, 25)],
        None,
        "escalator",
        cost=45,
        direction="forward",
        from_level_id=0,
        is_accessible=False,
        to_level_id=1,
        vertical_connection_id="escalator-central",
    )
)
routes["features"].append(
    line_feature(
        [(90, 25), (93, 25)],
        None,
        "elevator",
        cost=105,
        from_level_id=0,
        is_accessible=True,
        to_level_id=1,
        vertical_connection_id="elevator-east",
    )
)

pois = {"type": "FeatureCollection", "features": []}
poi_rows = [
    (1, "Lumen Electronics", "store", 0, 20, 10, "electronics"),
    (2, "Verde Grocer", "store", 0, 55, 10, "grocery"),
    (3, "Atlas Books", "store", 0, 85, 10, "books"),
    (4, "Northwind Apparel", "store", 0, 20, 40, "clothing"),
    (5, "Cafe Aroma", "restaurant", 0, 55, 40, "cafe"),
    (6, "Restrooms", "amenity", 0, 85, 40, "restrooms"),
    (7, "Galleria Main Entrance", "entrance", 0, 37.5, 0, "entrance-exit"),
    (8, "Pixel Toys", "store", 1, 25, 10, "toys"),
    (9, "Galleria Food Hall", "restaurant", 1, 72, 10, "food-court"),
    (10, "Orbit Sports", "store", 1, 25, 40, "sports"),
    (11, "Nova Pharmacy", "store", 1, 72, 40, "pharmacy"),
    (12, "East Elevator", "amenity", 0, 91.5, 25, "elevator"),
    (13, "West Staircase", "amenity", 0, 12, 25, "stairs"),
    (14, "Central Escalator", "amenity", 0, 52, 25, "escalator"),
]
hours = {"mon-sun": "09:00-21:00"}
for pid, name, ptype, floor, x_m, y_m, category in poi_rows:
    extra = {}
    if ptype in ("store", "restaurant"):
        extra = {
            "openingHours": hours,
            "keywords": [name.lower(), category],
        }
    pois["features"].append(
        point_feature(pid, name, ptype, floor, x_m, y_m, category, **extra)
    )

for filename, data in (
    ("indoor-map.geojson", indoor_map),
    ("indoor-routes.geojson", routes),
    ("pois.geojson", pois),
):
    path = os.path.join(OUT, filename)
    with open(path, "w") as fh:
        json.dump(data, fh, indent=2)
    print("wrote", path, len(data["features"]), "features")
