#!/usr/bin/env python3
"""Port Situm "City Mall" demo venue (building 7033) to a native fixture.

Source capture: <downloads>/Indoor Map/indoor map references/maps.situm.com
  - api.situm.com/api/v1/vectormaps/7033/7033_*.geojson (unit/corridor/
    stairs/elevator footprints, already lng/lat)
  - dashboard.situm.com/api/v1/buildings/7033.html (floors, named indoor
    POIs with pixel + WGS84 positions, and the real paths routing graph)

Output: app/data/city-mall/{indoor-map,indoor-routes,pois}.geojson

Unit names come from the nearest named indoor POI on the same floor
(within 25 m). Routing uses the vendor's real paths graph: path nodes are
mapped from floor pixels to WGS84 with a robust per-floor affine fit derived
from the POIs (which carry both), same-floor links become corridor edges and
cross-floor links become typed vertical edges (nearest stairs / elevator /
scalator evidence).
"""
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from port_vendors_common import (  # noqa: E402
    REFERENCE_ROOT,
    apply_affine,
    bbox_of_rings,
    centroid,
    detail_for_footprint,
    dist_m,
    group_by_proximity,
    level_offset,
    line_feature,
    load_json,
    point_feature,
    polygon_feature,
    repo_path,
    robust_affine,
    write_fixture,
)

REF = os.path.join(REFERENCE_ROOT, "maps.situm.com")
FLOOR_TO_LEVEL = {14466: -1, 14467: 0, 14468: 1}
BUILDING_ID = "city-mall"

UNIT_CATEGORIES = {
    "blue_shop": ("store", "Shop"),
    "restaurants": ("restaurant", "Restaurant"),
    "cafe": ("restaurant", "Cafe"),
    "counter": ("store", "Counter"),
}

POI_TYPE_MAP = {
    "Shops": "store",
    "Cafe": "restaurant",
    "Restaurants": "restaurant",
    "WC": "amenity",
    "ATM": "amenity",
    "Pharmacy": "store",
    "Information": "amenity",
    "Leisure": "amenity",
    "Top promos": "store",
    "Upcoming events": "amenity",
    "Parking": "amenity",
    "No category": "amenity",
    "Stairs": "amenity",
    "Scalator": "amenity",
    "Elevator": "amenity",
}


THEME_FILE = os.path.join(
    REFERENCE_ROOT,
    "maps.situm.com/dashboard.situm.com/api/v1/vectormaps/7033",
    "theme_7033_20250804170422.json",
)
# Vector-map classes ported elsewhere (units, corridors, transitions).
ROUTED_CLASSES = {"blue_shop", "restaurants", "corridor", "stairs", "elevator"}


def load_context_styles():
    """Situm theme styles for non-routed classes, keyed by category."""
    if not os.path.exists(THEME_FILE):
        return {}
    with open(THEME_FILE) as fh:
        theme = json.load(fh)
    return {
        key.lstrip("."): style
        for key, style in theme.items()
        if key.lstrip(".") not in ROUTED_CLASSES and style.get("show", True)
    }


def main(_argv):
    vector = load_json(
        os.path.join(
            REF, "api.situm.com/api/v1/vectormaps/7033",
            "7033_20260429141307.geojson",
        )
    )
    building = load_json(
        os.path.join(REF, "dashboard.situm.com/api/v1/buildings/7033.html")
    )

    levels = sorted(FLOOR_TO_LEVEL.values())
    indoor_map = {"type": "FeatureCollection", "features": []}
    pois = {"type": "FeatureCollection", "features": []}

    # Named POIs by level for unit naming + POI points. POIs carry both
    # floor-pixel (x, y) and WGS84 positions: the pixel pairs calibrate the
    # paths-graph conversion, and transition-category POIs type verticals.
    pois_by_level = defaultdict(list)
    transition_pois = []  # (lng, lat, level, vertical_type)
    pixel_pairs = defaultdict(list)  # floor_id -> [((x, y), (lng, lat))]
    pid = 1
    for poi in building.get("indoor_pois", []):
        pos = poi.get("position", {})
        floor_id = pos.get("floor_id")
        if floor_id not in FLOOR_TO_LEVEL:
            continue
        level = FLOOR_TO_LEVEL[floor_id]
        name = (poi.get("name") or "").strip() or "POI"
        cat = poi.get("category_name") or "No category"
        pois_by_level[level].append(
            (pos.get("lng"), pos.get("lat"), name, cat)
        )
        if pos.get("x") is not None and pos.get("lng") is not None:
            pixel_pairs[floor_id].append(
                ((pos["x"], pos["y"]), (pos["lng"], pos["lat"]))
            )
        if cat == "Scalator":
            transition_pois.append(
                (pos.get("lng"), pos.get("lat"), level, "escalator")
            )
        elif cat == "Elevator":
            transition_pois.append(
                (pos.get("lng"), pos.get("lat"), level, "elevator")
            )
        elif cat == "Stairs":
            transition_pois.append(
                (pos.get("lng"), pos.get("lat"), level, "stairs")
            )
        pois["features"].append(
            point_feature(
                pid, name, POI_TYPE_MAP.get(cat, "amenity"),
                BUILDING_ID, level, pos.get("lng"), pos.get("lat"),
                category=cat,
            )
        )
        pid += 1

    context_styles = load_context_styles()
    units_by_level = defaultdict(list)
    transitions_raw = []  # (lng, lat, type, level, ring)
    corridor_rings = defaultdict(list)
    fid = 1000
    for feat in vector.get("features", []):
        props = feat.get("properties", {}) or {}
        geom = feat.get("geometry", {}) or {}
        if geom.get("type") != "Polygon" or not geom.get("coordinates"):
            continue
        floor_id = props.get("floor_id")
        if floor_id not in FLOOR_TO_LEVEL:
            continue
        level = FLOOR_TO_LEVEL[floor_id]
        category = props.get("category")
        ring = geom["coordinates"][0]
        lat = centroid(ring)[1]
        if category in UNIT_CATEGORIES:
            ptype, fallback = UNIT_CATEGORIES[category]
            cx, cy = centroid(ring)
            best, best_d = fallback, 25.0
            for lng, plat, pname, _cat in pois_by_level[level]:
                d = dist_m((cx, cy), (lng, plat), lat)
                if d < best_d:
                    best, best_d = pname, d
            indoor_map["features"].append(
                polygon_feature(
                    fid, best, "unit", level, ring, category=category,
                )
            )
            fid += 1
            units_by_level[level].append((cx, cy, best))
        elif category == "corridor":
            indoor_map["features"].append(
                polygon_feature(
                    fid, "Corridor", "corridor", level, ring,
                )
            )
            fid += 1
            corridor_rings[level].append(ring)
        elif category in ("stairs", "elevator"):
            ctype = "stairs" if category == "stairs" else "elevator"
            cx, cy = centroid(ring)
            transitions_raw.append((cx, cy, ctype, level, ring))
        elif category in context_styles:
            # Parking bays, roads, walls, voids, furniture...: flat context
            # areas in the vendor's own theme colours (no routing role).
            style = context_styles[category]
            extra = {"fill": style.get("fillColor", "#e5e7eb")}
            if style.get("fillOpacity") is not None:
                extra["fill-opacity"] = style["fillOpacity"]
            if style.get("strokeColor"):
                extra["stroke"] = style["strokeColor"]
                extra["stroke-width"] = min(style.get("strokeWidth", 1), 2)
            indoor_map["features"].insert(
                0,
                polygon_feature(
                    fid, category.replace("-", " ").title(), "area", level,
                    ring, category=category, **extra,
                ),
            )
            fid += 1

    # Group transition footprints across floors by proximity, per type.
    transitions = []
    typed = {}
    for x, y, t, lvl, ring in transitions_raw:
        typed.setdefault(t, []).append((x, y, (lvl, ring)))
    for ttype, items in sorted(typed.items()):
        tname = "Staircase" if ttype == "stairs" else "Elevator"
        groups = group_by_proximity(items, 2.0)
        for i, group in enumerate(groups):
            members = [(p[2][0], p[0], p[1], p[2][1]) for p in group]
            # (level, lng, lat, ring)
            vcid = f"{ttype}-{len(transitions) + 1}"
            anchors = {}
            seen_levels = {}
            for lvl, lng, lat, _ring in members:
                # One footprint polygon per floor in the group.
                ring = next(
                    q[2][1] for q in group if q[2][0] == lvl
                )
                seen_levels[lvl] = seen_levels.get(lvl, 0) + 1
                suffix = (
                    f"-{seen_levels[lvl]}" if seen_levels[lvl] > 1 else ""
                )
                indoor_map["features"].append(
                    polygon_feature(
                        f"{vcid}-l{lvl}{suffix}",
                        f"{tname} {len(transitions) + 1}",
                        "vertical_connection", lvl, ring,
                        connection_type=ttype,
                        vertical_connection_id=vcid,
                    )
                )
                indoor_map["features"].extend(
                    detail_for_footprint(vcid, ttype, lvl, ring)
                )
                anchors[lvl] = (lng, lat)
            glng = sum(m[1] for m in members) / len(members)
            glat = sum(m[2] for m in members) / len(members)
            transitions.append(
                {
                    "id": vcid,
                    "type": ttype,
                    "floors": sorted(anchors),
                    "anchors": {lvl: (glng, glat) for lvl in anchors},
                }
            )

    # Floor outlines from all geometry per level.
    for level in levels:
        rings = []
        for f in indoor_map["features"]:
            if f["properties"].get("level_id") == level:
                g = f["geometry"]
                if g["type"] == "Polygon":
                    rings.extend(g["coordinates"])
        if rings:
            x0, y0, x1, y1 = bbox_of_rings(rings)
            indoor_map["features"].append(
                polygon_feature(
                    f"outline-{level}", f"Level {level} outline",
                    "floor_outline", level,
                    [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]],
                )
            )

    routes = build_real_routes(
        building, pixel_pairs, transitions, transition_pois,
        pois_by_level, units_by_level, levels,
    )

    write_fixture(repo_path("app", "data", "city-mall"),
                  indoor_map, routes, pois)
    print("levels:", levels)
    print("transitions:", len(transitions),
          sorted({(t['type']) for t in transitions}))
    return 0


VERTICAL_COST = {"stairs": 60, "escalator": 45, "elevator": 105}
ESCALATOR_MIN_SPAN_M = 5.0
ACCESSIBLE_SPUR_MAX_M = 30.0


def main_accessible_component(features):
    """Vertex keys of the largest component using accessible edges only."""
    parent = {}

    def find(key):
        parent.setdefault(key, key)
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key

    for feature in features:
        if not feature["properties"].get("is_accessible", True):
            continue
        coords = feature["geometry"]["coordinates"]
        keys = [(round(c[0], 9), round(c[1], 9)) for c in coords]
        for a, b in zip(keys, keys[1:]):
            parent[find(a)] = find(b)
    groups = defaultdict(set)
    for key in list(parent):
        groups[find(key)].add(key)
    return max(groups.values(), key=len) if groups else set()


def build_real_routes(building, pixel_pairs, transitions, transition_pois,
                      pois_by_level, units_by_level, levels):
    """Build routes from the vendor's real paths graph.

    Path nodes (floor pixels) convert to WGS84 via a robust per-floor affine
    fit from POI pixel/WGS84 pairs. Same-floor links become corridor edges
    (keeping the vendor accessible flag); cross-floor links become vertical
    edges typed by the nearest transition evidence (footprint anchors, then
    Scalator/Elevator/Stairs POIs). POIs and unit centroids get spur edges to
    their nearest same-floor node. Level epsilon keeps cross-floor vertices
    distinct so routes must traverse vertical edges.
    """
    coef_by_floor = {}
    for floor_id, pairs in pixel_pairs.items():
        coef, mean_res = robust_affine(pairs, lat_ref=43.35)
        coef_by_floor[floor_id] = coef
        print(f"floor {floor_id}: {len(pairs)} pairs, mean residual "
              f"{mean_res:.2f} m")

    nodes = {}
    for node in building.get("paths", {}).get("nodes", []):
        floor_id = node.get("floor_id")
        if floor_id not in FLOOR_TO_LEVEL or floor_id not in coef_by_floor:
            continue
        lng, lat = apply_affine(coef_by_floor[floor_id], node["x"], node["y"])
        level = FLOOR_TO_LEVEL[floor_id]
        nodes[node["id"]] = (level_offset([lng, lat], level), level)

    # Transition evidence for typing verticals: footprint anchors + POIs.
    evidence = []  # (lng, lat, vertical_type)
    for t in transitions:
        for lvl, (gx, gy) in t["anchors"].items():
            evidence.append((gx, gy, t["type"]))
    for lng, lat, _lvl, vtype in transition_pois:
        evidence.append((lng, lat, vtype))

    def nearest_shaft(mx, my):
        """Elevator vs stairs for a short (shaft-like) link."""
        best_type, best_d = "stairs", 12.0
        for ex, ey, etype in evidence:
            if etype == "escalator":
                continue
            d = dist_m((mx, my), (ex, ey), my)
            if d < best_d:
                best_type, best_d = etype, d
        return best_type

    features = []
    vertical_count = defaultdict(int)
    for link in building.get("paths", {}).get("links", []):
        a, b = nodes.get(link.get("source")), nodes.get(link.get("target"))
        if not a or not b:
            continue
        (ax, ay), la = a[0], a[1]
        (bx, by), lb = b[0], b[1]
        if la == lb:
            features.append(
                line_feature(
                    [list((ax, ay)), list((bx, by))], la, "corridor",
                    is_accessible=bool(link.get("accessible", True)),
                )
            )
        else:
            mx, my = (ax + bx) / 2, (ay + by) / 2
            # Situm links carry no type and are all "accessible". Horizontal
            # span separates them: lifts and stairwells stay in place,
            # escalators travel ~11-14 m between floors.
            span = dist_m((ax, ay), (bx, by), my)
            vtype = (
                "escalator" if span >= ESCALATOR_MIN_SPAN_M
                else nearest_shaft(mx, my)
            )
            vertical_count[vtype] += 1
            lo, hi = (la, lb) if la < lb else (lb, la)
            coords = (
                [list((ax, ay)), list((bx, by))]
                if la < lb else [list((bx, by)), list((ax, ay))]
            )
            props = {
                "cost": VERTICAL_COST[vtype],
                "from_level_id": lo,
                "is_accessible": vtype == "elevator",
                "to_level_id": hi,
                "vertical_connection_id": f"{vtype}-{vertical_count[vtype]}",
            }
            features.append(line_feature(coords, None, vtype, **props))

    # Spurs: POIs and unit centroids to nearest same-floor node.
    node_pts = defaultdict(list)
    for coord, level in nodes.values():
        node_pts[level].append(coord)

    def nearest_node(lng, lat, level):
        best, best_d = None, float("inf")
        for nx, ny in node_pts.get(level, []):
            d = (nx - lng) ** 2 + (ny - lat) ** 2
            if d < best_d:
                best, best_d = (nx, ny), d
        return best

    # The vendor marks a few same-floor links inaccessible, which strands
    # POIs whose nearest node sits behind one (the Elevator POI included).
    # Situm's ONLY_ACCESSIBLE mode snaps to the nearest accessible node, so
    # such POIs also get a spur into the main accessible network.
    accessible_nodes = main_accessible_component(features)

    def nearest_accessible_node(lng, lat, level):
        best, best_d = None, ACCESSIBLE_SPUR_MAX_M
        for nx, ny in node_pts.get(level, []):
            if (round(nx, 9), round(ny, 9)) not in accessible_nodes:
                continue
            d = dist_m((lng, lat), (nx, ny), lat)
            if d < best_d:
                best, best_d = (nx, ny), d
        return best

    rescued = 0
    endpoints = [
        (lng, lat, level)
        for level, entries in pois_by_level.items()
        for lng, lat, _name, _cat in entries
    ] + [
        (ux, uy, level)
        for level, units in units_by_level.items()
        for ux, uy, _name in units
    ]
    for lng, lat, level in endpoints:
        target = nearest_node(lng, lat, level)
        if target and (target[0] != lng or target[1] != lat):
            features.append(
                line_feature([list(target), [lng, lat]], level, "corridor")
            )
        if target and (round(target[0], 9), round(target[1], 9)) not in accessible_nodes:
            fallback = nearest_accessible_node(lng, lat, level)
            if fallback:
                features.append(
                    line_feature([list(fallback), [lng, lat]], level, "corridor")
                )
                rescued += 1
    print("accessible fallback spurs:", rescued)

    print("real graph: nodes", len(nodes), "edges", len(features),
          "verticals", dict(vertical_count))
    return {"type": "FeatureCollection", "features": features}


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
