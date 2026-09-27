#!/usr/bin/env python3
"""Port Mappedin "Demo Mall" venue to a native fixture.

Source capture: <downloads>/Indoor Map/indoor map references/www.mappedin.com
  - api-gateway.mappedin.com/public/1/map/mappedin-demo-mall.html
    (floors + pixel->wgs84 georeference control points)
  - api-gateway.mappedin.com/public/1/polygon/mappedin-demo-mall.html
    (unit/connection footprints in floor-pixel coordinates)
  - api-gateway.mappedin.com/public/1/location/mappedin-demo-mall.html
    (tenant names, descriptions, logos, polygon links)

Output: app/data/mappedin-mall/{indoor-map,indoor-routes,pois}.geojson

Pixel coordinates are converted with an affine least-squares fit of each
floor's georeference points (Mappedin targets are {x: lat, y: lng}).
The capture has no typed stairs/elevators, so two vertical links are
inferred where Connection footprints overlap across floors (first = stairs,
second = elevator) and clearly marked as inferred.
"""
import json
import os
import sys
import zipfile
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from port_vendors_common import (  # noqa: E402
    REFERENCE_ROOT,
    bbox_of_rings,
    build_prm_routes,
    centroid,
    detail_for_footprint,
    dist_m,
    load_json_lenient,
    offset_point,
    point_feature,
    polygon_feature,
    repo_path,
    schema_org_hours,
    square_ring,
    write_fixture,
)

REF = (REFERENCE_ROOT +
       "/www.mappedin.com/api-gateway.mappedin.com/public/1")
BUILDING_ID = "mappedin-mall"

STORE_LAYERS = {"Polygon", "Anchor Stores", "Exterior Stores", "Kiosks"}


def fit_affine(controls):
    """Least-squares fit lng = a*x+b*y+c, lat = d*x+e*y+f."""
    def solve(rows, rhs):
        # Normal equations for 3 unknowns.
        m = [[0.0] * 3 for _ in range(3)]
        v = [0.0] * 3
        for r, t in zip(rows, rhs):
            for i in range(3):
                v[i] += r[i] * t
                for j in range(3):
                    m[i][j] += r[i] * r[j]
        # Gaussian elimination.
        aug = [m[i] + [v[i]] for i in range(3)]
        for col in range(3):
            piv = max(range(col, 3), key=lambda r: abs(aug[r][col]))
            aug[col], aug[piv] = aug[piv], aug[col]
            pivval = aug[col][col] or 1e-12
            aug[col] = [x / pivval for x in aug[col]]
            for r in range(3):
                if r != col and aug[r][col]:
                    f = aug[r][col]
                    aug[r] = [a - f * b for a, b in zip(aug[r], aug[col])]
        return [aug[i][3] for i in range(3)]

    rows, lngs, lats = [], [], []
    for c in controls:
        cp, tp = c["control"], c["target"]
        rows.append([cp["x"], cp["y"], 1.0])
        lats.append(tp["x"])
        lngs.append(tp["y"])
    a, b, c0 = solve(rows, lngs)
    d, e, f0 = solve(rows, lats)
    return lambda x, y: (a * x + b * y + c0, d * x + e * y + f0)


def clean_text(value, limit=400):
    if not value:
        return None
    return " ".join(str(value).split())[:limit]


MVF_BUNDLE = os.path.join(
    REFERENCE_ROOT,
    "www.mappedin.com/cdn.mappedin.com/58347b71031d9c158b000001",
    "8b6b3ce4a8cb0f86d19720489c3244ae056cd278.zip",
)


def mvf_transitions(map_to_level):
    """Escalator/elevator transitions from the MVF bundle, or [] if absent.

    Each connection lists one node per floor (lng/lat). Stairs and portal
    entries in the capture have no nodes, so they are skipped. The bundle
    gives no travel direction, so escalators stay bidirectional.
    """
    if not os.path.exists(MVF_BUNDLE):
        print("MVF bundle not found; inferring vertical links")
        return []
    with zipfile.ZipFile(MVF_BUNDLE) as bundle:
        nodes = {
            f["properties"]["id"]: f
            for f in json.loads(bundle.read("node.geojson"))["features"]
        }
        connections = json.loads(bundle.read("connection.json"))
    transitions = []
    for connection in connections:
        ctype = connection.get("type")
        if ctype not in ("escalator", "elevator", "stairs"):
            continue
        anchors = {}
        for node_id in connection.get("nodes", []):
            node = nodes.get(node_id)
            if not node:
                continue
            level = map_to_level.get(node["properties"]["map"].removeprefix("f_"))
            if level is not None:
                anchors[level] = tuple(node["geometry"]["coordinates"][:2])
        if len(anchors) < 2:
            continue
        index = sum(1 for t in transitions if t["type"] == ctype) + 1
        transitions.append({
            "id": f"{ctype}-{index}",
            "type": ctype,
            "name": (connection.get("details") or {}).get("name")
            or f"{ctype.title()} {index}",
            "floors": sorted(anchors),
            "anchors": anchors,
        })
    return transitions


def main(_argv):
    maps = load_json_lenient(os.path.join(REF, "map", "mappedin-demo-mall.html"))
    polys = load_json_lenient(
        os.path.join(REF, "polygon", "mappedin-demo-mall.html")
    )
    locations = load_json_lenient(
        os.path.join(REF, "location", "mappedin-demo-mall.html")
    )

    # Floor order by elevation; map id -> level index.
    ordered = sorted(maps, key=lambda m: m.get("elevation", 0))
    map_to_level = {m["id"] if "id" in m else m.get("mapId"): i
                    for i, m in enumerate(ordered)}
    # Payload uses 'map' ids; resolve from polygon references instead.
    map_ids = sorted({p.get("map") for p in polys if p.get("map")})
    # Match map ids to floors by polygon count order (Lower first).
    level_names = {}
    for i, m in enumerate(ordered):
        mid = map_ids[i] if i < len(map_ids) else None
        if mid:
            map_to_level[mid] = i
            level_names[i] = m.get("name", f"Level {i}")
    project = {m.get("id", m.get("name")): m for m in ordered}
    _ = project
    levels = sorted(map_to_level.values())
    converters = {}
    for m in ordered:
        for mid, lvl in map_to_level.items():
            if lvl == ordered.index(m):
                converters[lvl] = fit_affine(m["georeference"])

    loc_by_polygon = {}
    for loc in locations:
        for poly in loc.get("polygons", []) or []:
            loc_by_polygon[poly.get("id")] = loc

    indoor_map = {"type": "FeatureCollection", "features": []}
    pois = {"type": "FeatureCollection", "features": []}
    units_by_level = defaultdict(list)
    connections_by_level = defaultdict(list)
    pid, fid = 1, 1

    for p in polys:
        mid = p.get("map")
        if mid not in map_to_level:
            continue
        level = map_to_level[mid]
        convert = converters[level]
        ring = []
        for v in p.get("vertexes", []) or []:
            lng, lat = convert(v["x"], v["y"])
            ring.append([lng, lat])
        if len(ring) < 3:
            continue
        ring.append(list(ring[0]))
        layer = p.get("layer") or "Polygon"
        loc = loc_by_polygon.get(p.get("id"))
        name = (loc.get("name") if loc else None) or p.get(
            "externalId") or layer
        name = " ".join(str(name).split())
        cx, cy = centroid(ring)

        if layer in STORE_LAYERS:
            category = "store"
            indoor_map["features"].append(
                polygon_feature(fid, name, "unit", level, ring,
                                category=category)
            )
            fid += 1
            units_by_level[level].append((cx, cy, name))
            meta = {"category": category, "mappedin_layer": layer}
            if loc:
                desc = clean_text(loc.get("description"))
                if desc:
                    meta["description"] = desc
                logo = (loc.get("logo") or {}).get("original")
                if logo:
                    meta["logo"] = logo
                hours = schema_org_hours(loc.get("operationHours"))
                if hours:
                    meta["openHours"] = hours
                phone = (loc.get("phone") or {}).get("number")
                if phone:
                    meta["phone"] = phone
                social = dict(loc.get("social") or {})
                website = social.pop("website", None)
                if website:
                    meta["link"] = website
                social = {k: v for k, v in social.items() if v}
                if social:
                    meta["social"] = social
                if loc.get("tags"):
                    meta["tags"] = loc["tags"]
                states = [s.get("type") for s in loc.get("states") or []]
                if states and states[0]:
                    meta["status"] = states[0]
            pois["features"].append(
                point_feature(pid, name, "store", BUILDING_ID, level,
                              cx, cy, **meta)
            )
            pid += 1
        elif layer == "Connections":
            indoor_map["features"].append(
                polygon_feature(fid, name, "corridor", level, ring)
            )
            fid += 1
            connections_by_level[level].append((cx, cy, ring))
        elif layer in ("Entrance", "Washroom"):
            ptype = "entrance" if layer == "Entrance" else "amenity"
            pois["features"].append(
                point_feature(pid, name, ptype, BUILDING_ID, level,
                              cx, cy, category=layer.lower())
            )
            pid += 1
        else:
            # Walls, voids, parking structures: keep as non-unit context.
            indoor_map["features"].append(
                polygon_feature(fid, name, "corridor", level, ring,
                                category=layer)
            )
            fid += 1

    # Real vertical connections from the captured MVF v2 bundle
    # (connection.json + node.geojson): escalators and elevators with node
    # positions per floor. Fall back to inference if the bundle is missing.
    transitions = mvf_transitions(map_to_level)
    for t in transitions:
        for lvl, (gx, gy) in t["anchors"].items():
            ring = square_ring(gx, gy, 1.5, gy)
            indoor_map["features"].append(
                polygon_feature(
                    f"{t['id']}-l{lvl}", t["name"], "vertical_connection",
                    lvl, ring, connection_type=t["type"],
                    vertical_connection_id=t["id"],
                )
            )
            indoor_map["features"].extend(
                detail_for_footprint(t["id"], t["type"], lvl, ring)
            )
    if not transitions and len(levels) >= 2:
        # Fallback: infer links where Connection footprints overlap.
        lower, upper = levels[0], levels[1]
        pairs = []
        for clng, clat, _ring in connections_by_level.get(lower, []):
            for ulng, ulat, _r in connections_by_level.get(upper, []):
                d = dist_m((clng, clat), (ulng, ulat), 43.86)
                pairs.append((d, (clng + ulng) / 2, (clat + ulat) / 2))
        pairs.sort()
        chosen, seen = [], []
        for d, gx, gy in pairs:
            if d > 12.0 or len(chosen) >= 2:
                continue
            if all(dist_m((gx, gy), s, 43.86) > 15.0 for s in seen):
                chosen.append((gx, gy))
                seen.append((gx, gy))
        if len(chosen) == 1:
            # Guarantee an accessible (elevator) link: offset from stairs.
            gx, gy = chosen[0]
            ex, ey = offset_point(gx, gy, 25.0, 0.0)
            chosen.append((ex, ey))
        for i, (gx, gy) in enumerate(chosen):
            ttype = "stairs" if i == 0 else "elevator"
            tname = "Stairs (inferred)" if i == 0 else "Elevator (inferred)"
            vcid = f"{ttype}-inferred-{i + 1}"
            anchors = {}
            for lvl in (lower, upper):
                ring = square_ring(gx, gy, 2.0, gy)
                indoor_map["features"].append(
                    polygon_feature(
                        f"{vcid}-l{lvl}", tname, "vertical_connection",
                        lvl, ring, connection_type=ttype,
                        vertical_connection_id=vcid,
                    )
                )
                indoor_map["features"].extend(
                    detail_for_footprint(vcid, ttype, lvl, ring)
                )
                anchors[lvl] = (gx, gy)
            transitions.append({"id": vcid, "type": ttype,
                                "floors": [lower, upper], "anchors": anchors})

    outlines = {}
    for level in levels:
        rings = []
        for f in indoor_map["features"]:
            if f["properties"].get("level_id") == level:
                g = f["geometry"]
                if g["type"] == "Polygon":
                    rings.extend(g["coordinates"])
        if rings:
            x0, y0, x1, y1 = bbox_of_rings(rings)
            outline = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
            outlines[level] = outline
            indoor_map["features"].append(
                polygon_feature(
                    f"outline-{level}", level_names.get(level, f"Level {level}"),
                    "floor_outline", level, outline,
                )
            )

    obstacles = defaultdict(list)
    halo = defaultdict(list)
    for f in indoor_map["features"]:
        ft = f["properties"].get("feature_type")
        if ft in ("unit", "corridor"):
            halo[f["properties"]["level_id"]].append(
                f["geometry"]["coordinates"][0]
            )
            if ft == "unit":
                obstacles[f["properties"]["level_id"]].append(
                    f["geometry"]["coordinates"][0]
                )
    doors = defaultdict(list)
    for f in pois["features"]:
        coords = f["geometry"]["coordinates"]
        doors[f["properties"]["floor"]].append((coords[0], coords[1]))

    routes = build_prm_routes(
        levels, obstacles, doors, transitions, outlines, lat_ref=43.86,
        spacing_m=10.0, max_link_m=50.0, k=3, halo_by_level=halo,
    )
    write_fixture(repo_path("app", "data", "mappedin-mall"),
                  indoor_map, routes, pois)
    print("levels:", levels, level_names)
    print("transitions:", [(t["id"], t["type"]) for t in transitions])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
