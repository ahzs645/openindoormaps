#!/usr/bin/env python3
"""Generates the synthetic "campus" demo location for OpenIndoorMaps.

Fully synthetic fixture (invented names/layout) for cross-campus wayfinding:
three buildings with different floor counts, joined by outdoor walkways at
ground level and an enclosed skybridge on Level 2. It follows the route graph
conventions in docs/viewer-data-models.md:

- walking edges carry ``building_id`` / ``building_name``; outdoor walkways
  and the skybridge have ``building_id: null``, which is what lets the
  directions engine say "Exit Science Hall" / "Enter Library".
- each floor's route coordinates are shifted by ``level_offset`` so floors
  never share vertices; stairs 60 s, escalator 45 s, elevators board 45 s +
  15 s per floor.
- campus grounds (lawns, paths, roofs) have ``level_id: null`` so they stay
  visible on every floor.
"""
import math

from port_vendors_common import (
    detail_for_footprint,
    elevator_edges,
    level_offset,
    line_feature,
    point_feature,
    polygon_feature,
    repo_path,
    write_fixture,
)

BASE_LON = -0.1655
BASE_LAT = 51.5065
M_PER_DEG_LAT = 111320.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(BASE_LAT))

OUT = repo_path("app", "data", "campus")


def xy(x_m, y_m):
    return [
        round(BASE_LON + x_m / M_PER_DEG_LON, 7),
        round(BASE_LAT + y_m / M_PER_DEG_LAT, 7),
    ]


def rect(x0, y0, x1, y1):
    return [xy(x0, y0), xy(x1, y0), xy(x1, y1), xy(x0, y1), xy(x0, y0)]


def route_xy(x_m, y_m, level):
    return level_offset(xy(x_m, y_m), level)


# ---- buildings ------------------------------------------------------------
#
# Local metres, x east / y north. Each building is a double-loaded corridor
# (rooms on both sides of a centreline) with one entrance on the side that
# faces the quad.

BUILDINGS = [
    {
        "id": "science",
        "name": "Science Hall",
        "bounds": (20, 110, 100, 150),
        "corridor_y": 130,
        "floors": [0, 1, 2, 3],
        "entrance": (60, 110),
        "connectors": [
            ("science-stairs", "Science Stairs", "stairs", 30),
            ("science-elevator", "Science Elevator", "elevator", 88),
        ],
        "rooms": {
            0: [("Science Lobby & Info Desk", "information", "north"),
                ("Lecture Theatre S100", "lecture-hall", "south"),
                ("Chemistry Lab S110", "laboratory", "north")],
            1: [("Biology Lab S210", "laboratory", "north"),
                ("Seminar Room S220", "classroom", "south"),
                ("Science Restrooms (Level 2)", "restrooms", "north")],
            2: [("Physics Lab S310", "laboratory", "north"),
                ("Classroom S320", "classroom", "south"),
                ("Graduate Lounge", "lounge", "north")],
            3: [("Dean of Science Office", "office", "north"),
                ("Observatory Deck", "observatory", "south")],
        },
    },
    {
        "id": "library",
        "name": "Library",
        "bounds": (180, 110, 260, 150),
        "corridor_y": 130,
        "floors": [0, 1, 2],
        "entrance": (220, 110),
        "connectors": [
            ("library-elevator", "Library Elevator", "elevator", 192),
            ("library-stairs", "Library Stairs", "stairs", 250),
        ],
        "rooms": {
            0: [("Library Service Desk", "information", "north"),
                ("Library Cafe", "cafe", "south"),
                ("Print & Copy Centre", "services", "north")],
            1: [("Reading Room", "study", "north"),
                ("Group Study Rooms", "study", "south"),
                ("Library Restrooms (Level 2)", "restrooms", "north")],
            2: [("Special Collections", "archive", "north"),
                ("Quiet Study Floor", "study", "south")],
        },
    },
    {
        "id": "union",
        "name": "Student Union",
        "bounds": (90, 20, 190, 60),
        "corridor_y": 40,
        "floors": [0, 1],
        "entrance": (140, 60),
        "connectors": [
            ("union-stairs", "Union Stairs", "stairs", 100),
            ("union-escalator", "Union Escalator", "escalator", 125),
            ("union-elevator", "Union Elevator", "elevator", 180),
        ],
        "rooms": {
            0: [("Campus Bookstore", "books", "south"),
                ("Food Court", "food-court", "south"),
                ("Student Services", "services", "north"),
                ("Union Restrooms", "restrooms", "north")],
            1: [("Health & Wellness Centre", "clinic", "north"),
                ("Fitness Centre", "gym", "south"),
                ("Clubs Lounge", "lounge", "north")],
        },
    },
]

# Enclosed skybridge on Level 2 (floor 1): Science Hall east wall to the
# Library west wall.
SKYBRIDGE = {"level": 1, "y": 130, "x0": 100, "x1": 180}

# Outdoor walkways at ground level: a spine along y=85 with one spur to each
# building entrance and one to the bus loop.
QUAD_Y = 85
OUTDOOR_POIS = [
    ("Main Quad", "landmark", 140, 95),
    ("Campus Bus Loop", "transit", 290, 85),
    ("Visitor Parking P1", "parking", 0, 85),
]

FLOOR_NAMES = {0: "Ground Floor", 1: "Level 2", 2: "Level 3", 3: "Level 4"}

indoor_map = {"type": "FeatureCollection", "features": []}
routes = {"type": "FeatureCollection", "features": []}
pois = {"type": "FeatureCollection", "features": []}


def add_area(fid, name, ring, fill, stroke, level=None, **extra):
    indoor_map["features"].append(
        polygon_feature(
            fid, name, "area", level, ring,
            fill=fill, stroke=stroke, **extra,
        )
    )


# Campus grounds, drawn first so everything else sits on top.
add_area("campus-lawn", "Campus grounds", rect(-20, -10, 310, 175),
         "#dcebd5", "#b7d3ab")
add_area("campus-walk-spine", "Quad walkway", rect(-10, QUAD_Y - 3, 300, QUAD_Y + 3),
         "#e8e2d4", "#cfc6b0")
add_area("campus-quad", "Main Quad", rect(120, 72, 160, 102),
         "#c9e2bf", "#a9c99c")
for building in BUILDINGS:
    x, y = building["entrance"]
    y0, y1 = sorted((y, QUAD_Y))
    add_area(f"walk-{building['id']}", f"{building['name']} walkway",
             rect(x - 2.5, y0, x + 2.5, y1), "#e8e2d4", "#cfc6b0")
    x0, by0, x1, by1 = building["bounds"]
    # Roof/footprint shown on every floor, so floors a building doesn't have
    # still read as a building rather than empty lawn.
    add_area(f"footprint-{building['id']}", building["name"],
             rect(x0, by0, x1, by1), "#cbd5e1", "#94a3b8",
             building_id=building["id"])
add_area("walk-bus", "Bus loop walkway", rect(284, 78, 300, 92),
         "#e8e2d4", "#cfc6b0")


poi_id = 0


def next_poi_id():
    global poi_id
    poi_id += 1
    return poi_id


unit_id = 0

for building in BUILDINGS:
    bid, bname = building["id"], building["name"]
    x0, y0, x1, y1 = building["bounds"]
    cy = building["corridor_y"]
    walk = {"building_id": bid, "building_name": bname}
    connector_xs = [x for *_rest, x in building["connectors"]]

    for level in building["floors"]:
        indoor_map["features"].append(
            polygon_feature(f"{bid}-outline-{level}", f"{bname} outline",
                            "floor_outline", level, rect(x0, y0, x1, y1),
                            building_id=bid)
        )
        indoor_map["features"].append(
            polygon_feature(f"{bid}-corridor-{level}", f"{bname} corridor",
                            "corridor", level, rect(x0 + 2, cy - 4, x1 - 2, cy + 4),
                            building_id=bid)
        )

        # Rooms fill each side of the corridor left to right.
        rooms = building["rooms"].get(level, [])
        sides = {"north": [], "south": []}
        for room in rooms:
            sides[room[2]].append(room)
        door_xs = []
        for side, side_rooms in sides.items():
            if not side_rooms:
                continue
            span = (x1 - x0 - 4) / len(side_rooms)
            for index, (name, category, _side) in enumerate(side_rooms):
                rx0 = x0 + 2 + index * span
                rx1 = rx0 + span - 1
                ry0, ry1 = (cy + 4, y1 - 1) if side == "north" else (y0 + 1, cy - 4)
                # Keep the entrance lobby clear on the ground floor.
                entrance_x, entrance_y = building["entrance"]
                if level == 0 and side == ("south" if entrance_y == y0 else "north"):
                    if rx0 <= entrance_x <= rx1:
                        if entrance_x - rx0 > rx1 - entrance_x:
                            rx1 = entrance_x - 4
                        else:
                            rx0 = entrance_x + 4
                unit_id += 1
                indoor_map["features"].append(
                    polygon_feature(unit_id, name, "unit", level,
                                    rect(rx0, ry0, rx1, ry1),
                                    category=category, building_id=bid)
                )
                door_x = round((rx0 + rx1) / 2, 2)
                door_y = cy + 4 if side == "north" else cy - 4
                poi_y = (ry0 + ry1) / 2
                door_xs.append(door_x)
                routes["features"].append(line_feature(
                    [route_xy(door_x, cy, level),
                     route_xy(door_x, door_y, level),
                     route_xy(door_x, poi_y, level)],
                    level, "corridor", **walk,
                ))
                ptype = {
                    "restrooms": "amenity",
                    "cafe": "restaurant",
                    "food-court": "restaurant",
                    "books": "store",
                }.get(category, "room")
                pois["features"].append(point_feature(
                    next_poi_id(), name, ptype, bid, level,
                    *xy(door_x, poi_y),
                    category=category,
                    building=bname,
                    keywords=[bname.lower(), category],
                ))

        # Corridor spine through every door, connector anchor, the entrance
        # (ground floor) and the skybridge wall (Level 2).
        spine_xs = set(door_xs) | set(connector_xs) | {x0 + 2, x1 - 2}
        if level == 0:
            spine_xs.add(building["entrance"][0])
        if level == SKYBRIDGE["level"] and bid in ("science", "library"):
            spine_xs.add(x1 if bid == "science" else x0)
        routes["features"].append(line_feature(
            [route_xy(x, cy, level) for x in sorted(spine_xs)],
            level, "corridor", **walk,
        ))

    # Entrance: corridor -> door -> outdoor spur, all on the ground floor.
    ex, ey = building["entrance"]
    routes["features"].append(line_feature(
        [route_xy(ex, cy, 0), route_xy(ex, ey, 0)], 0, "corridor", **walk,
    ))
    pois["features"].append(point_feature(
        next_poi_id(), f"{bname} Main Entrance", "entrance", bid, 0,
        *xy(ex, ey),
        category="entrance-exit",
        building=bname,
        keywords=[bname.lower(), "entrance", "door"],
    ))

    # Vertical connectors.
    for vcid, vname, ctype, cx in building["connectors"]:
        ring = rect(cx - 2, cy - 3.5, cx + 2, cy + 3.5)
        for level in building["floors"]:
            feature = polygon_feature(f"{vcid}-l{level}", vname,
                                      "vertical_connection", level, ring,
                                      connection_type=ctype,
                                      vertical_connection_id=vcid,
                                      building_id=bid)
            indoor_map["features"].append(feature)
            indoor_map["features"].extend(
                detail_for_footprint(vcid, ctype, level, ring)
            )
        pois["features"].append(point_feature(
            next_poi_id(), vname, "amenity", bid, 0, *xy(cx, cy),
            category=ctype, building=bname,
        ))
        floors = building["floors"]
        if ctype == "elevator":
            for edge in elevator_edges(
                {"id": vcid, "anchors": {lvl: xy(cx, cy) for lvl in floors}},
                floors,
            ):
                edge["properties"].update(walk)
                routes["features"].append(edge)
            continue
        for lo, hi in zip(floors[:-1], floors[1:]):
            routes["features"].append(line_feature(
                [route_xy(cx, cy, lo), route_xy(cx, cy, hi)],
                None, ctype,
                cost=60 if ctype == "stairs" else 45,
                from_level_id=lo,
                to_level_id=hi,
                is_accessible=False,
                vertical_connection_id=vcid,
                **walk,
            ))

# Skybridge: enclosed, accessible, Level 2 only.
sky = SKYBRIDGE
indoor_map["features"].append(
    polygon_feature("skybridge", "Science–Library Skybridge", "corridor",
                    sky["level"],
                    rect(sky["x0"], sky["y"] - 3, sky["x1"], sky["y"] + 3),
                    fill="#bfdbfe", stroke="#60a5fa")
)
routes["features"].append(line_feature(
    [route_xy(sky["x0"], sky["y"], sky["level"]),
     route_xy(sky["x1"], sky["y"], sky["level"])],
    sky["level"], "skybridge",
    building_id=None, building_name="Science–Library Skybridge",
))

# Outdoor walkways (ground floor, no building).
outdoor = {"building_id": None, "building_name": None}
spine = {poi_x for _n, _t, poi_x, poi_y in OUTDOOR_POIS if poi_y == QUAD_Y}
spine |= {b["entrance"][0] for b in BUILDINGS}
spine |= {140}
routes["features"].append(line_feature(
    [route_xy(x, QUAD_Y, 0) for x in sorted(spine)], 0, "outdoor", **outdoor,
))
for building in BUILDINGS:
    ex, ey = building["entrance"]
    routes["features"].append(line_feature(
        [route_xy(ex, QUAD_Y, 0), route_xy(ex, ey, 0)], 0, "outdoor", **outdoor,
    ))
for name, category, px, py in OUTDOOR_POIS:
    if py != QUAD_Y:
        routes["features"].append(line_feature(
            [route_xy(px, QUAD_Y, 0), route_xy(px, py, 0)], 0, "outdoor",
            **outdoor,
        ))
    pois["features"].append(point_feature(
        next_poi_id(), name, "landmark" if category == "landmark" else category,
        "campus", 0, *xy(px, py),
        category=category, building="Outdoors",
        keywords=["outdoor", "campus", category],
    ))

write_fixture(OUT, indoor_map, routes, pois)
print("floors:", FLOOR_NAMES)
