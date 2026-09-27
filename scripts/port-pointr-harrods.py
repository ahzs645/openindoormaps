#!/usr/bin/env python3
"""Port Pointr "Harrods" demo venue to a native fixture.

Source capture: <downloads>/Indoor Map/indoor map references/v9.pointr.express
  - .../published-content/v9/sites/<sid>/pois/latest.json (992 named
    polygon + point features with real lng/lat, lvl, typeCode, rich metadata)
  - .../published-content/v9/taxonomies/latest.json (typeCode -> class/shape)

Output: app/data/harrods/{indoor-map,indoor-routes,pois}.geojson

Transition nodes (escalator/stairs/elevator-node, class=path) become small
footprint polygons + vertical edges; routing is synthesized
(see port-vendors-common.py).
"""
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from port_vendors_common import (  # noqa: E402
    REFERENCE_ROOT,
    bbox_of_rings,
    build_prm_routes,
    centroid,
    detail_for_footprint,
    load_json,
    point_feature,
    polygon_feature,
    repo_path,
    ring_area_m2,
    square_ring,
    write_fixture,
)

REF = (REFERENCE_ROOT +
       "/v9.pointr.express/harrodsv9demov9sa.blob.core.windows.net"
       "/fd109852-0d41-4684-9560-55c509bf8402/published-content/v9")
SITE = "670e2c0d-8794-42f8-9142-7d5b45904036"
BUILDING_ID = "harrods"

TRANSITION_TYPES = {
    "escalator-node": "escalator",
    "stairs-node": "stairs",
    "elevator-node": "elevator",
}

# typeCodes that are walkable infrastructure rather than shoppable units.
NON_UNIT_TYPES = {
    "parking-spot", "entrance-exit", "restrooms", "atm",
    "escalator-node", "stairs-node", "elevator-node",
}

# typeCodes excluded from the indoor map (kept as POIs): street furniture
# outside the building footprint.
EXCLUDE_FROM_MAP = {"bus-station"}

AMENITY_TYPES = {"restrooms", "atm", "entrance-exit"}

# Real vertical-transition positions from the vendor's own route engine
# (route sample in the capture: escalator L-1 -> L0, elevator L0 -> L3).
REAL_ESCALATOR = (-0.16398657, 51.49911020)
REAL_ELEVATOR = (-0.16356643, 51.49905428)


def clean_text(value, limit=500):
    if not value:
        return None
    text = " ".join(str(value).split())
    return text[:limit]


SIGNED_URL = re.compile(r"[?&](sig|se|sv)=", re.IGNORECASE)


def public_url(value):
    """Drop URLs that carry a signed-access query (Azure SAS ``sig=``).

    Some Pointr image/logo URLs embed storage SAS tokens (a few with write
    permissions); those are credentials, not content, and must never be
    written into the fixture. Unsigned URLs pass through unchanged.
    """
    if isinstance(value, str) and SIGNED_URL.search(value):
        return None
    return value


def rich_metadata(props):
    """Card fields the Pointr SDK renders (PoiDetailsView): structured
    weekly ``openHours``, rating, price level, keywords and action buttons.
    The legacy free-text ``openingHours`` string is kept as a fallback."""
    meta = {}
    desc = clean_text(props.get("description"))
    if desc:
        meta["description"] = desc
    for key in ("openHours", "openingHours", "phone", "tags",
                "keywords", "rating", "numberOfRatings"):
        if props.get(key) not in (None, "", [], {}):
            meta[key] = props[key]
    for key in ("logo", "link"):
        url = public_url(props.get(key))
        if url:
            meta[key] = url
    if props.get("price") and props.get("priceSign"):
        meta["priceLevel"] = props["priceSign"] * int(props["price"])
    images = [url for url in map(public_url, props.get("images") or []) if url]
    if images:
        meta["images"] = images[:3]
    buttons = [
        {"name": b["name"], "action": b["action"], "intent": b["intent"]}
        for b in props.get("buttons") or []
        if b.get("name") and b.get("action") in ("tel", "href", "mailto")
        and b.get("intent") and public_url(b["intent"])
    ]
    if buttons:
        meta["buttons"] = buttons
    return meta


def main(_argv):
    taxonomies = {
        t["typeCode"]: t
        for t in load_json(os.path.join(REF, "taxonomies", "latest.json"))
    }
    pois_src = load_json(os.path.join(REF, "sites", SITE, "pois", "latest.json"))

    levels = sorted({
        f["properties"]["lvl"]
        for f in pois_src["features"]
        if isinstance(f.get("properties", {}).get("lvl"), int)
    })

    indoor_map = {"type": "FeatureCollection", "features": []}
    pois = {"type": "FeatureCollection", "features": []}
    units_by_level = defaultdict(list)
    transitions_raw = []
    entrance_pts = []
    restroom_pts = []
    seen_rings = set()  # exact-duplicate footprints (pim + booth doubles)
    dropped_duplicates = 0
    pid = 1
    fid = 1

    for feat in pois_src["features"]:
        props = feat.get("properties", {}) or {}
        geom = feat.get("geometry", {}) or {}
        lvl = props.get("lvl")
        if lvl not in levels:
            continue
        type_code = props.get("typeCode") or "undefined"
        name = (props.get("name") or type_code).strip()
        tax = taxonomies.get(type_code, {})

        if type_code in TRANSITION_TYPES and geom.get("type") == "Point":
            ctype = TRANSITION_TYPES[type_code]
            lng, lat = geom["coordinates"][:2]
            transitions_raw.append((lng, lat, ctype, lvl, name))
            pois["features"].append(
                point_feature(
                    pid, name, "amenity", BUILDING_ID, lvl, lng, lat,
                    category=type_code,
                )
            )
            pid += 1
            continue

        if geom.get("type") == "Polygon" and geom.get("coordinates"):
            ring = geom["coordinates"][0]
            # Concession brands (pim/booth) share their department's exact
            # footprint: one map polygon, but a searchable POI per brand.
            # (MapLibre culls the stacked labels; search finds every brand.)
            key = (lvl, tuple((round(c[0], 6), round(c[1], 6)) for c in ring))
            if key in seen_rings:
                dropped_duplicates += 1
                cx, cy = centroid(ring)
                meta = {"category": type_code, "concession": True}
                desc = clean_text(props.get("description"))
                if desc:
                    meta["description"] = desc
                if public_url(props.get("logo")):
                    meta["logo"] = props["logo"]
                pois["features"].append(
                    point_feature(
                        pid, name, "store", BUILDING_ID, lvl, cx, cy, **meta,
                    )
                )
                pid += 1
                continue
            seen_rings.add(key)
            if type_code in EXCLUDE_FROM_MAP:
                # Street furniture: POI only, no indoor footprint.
                cx, cy = centroid(ring)
                pois["features"].append(
                    point_feature(
                        pid, name, "amenity", BUILDING_ID, lvl, cx, cy,
                        category=type_code,
                    )
                )
                pid += 1
                continue
            if type_code in NON_UNIT_TYPES:
                # Infrastructure polygons render as corridors, not shops,
                # but entrances / restrooms / parking still get POIs.
                indoor_map["features"].append(
                    polygon_feature(
                        fid, name, "corridor", lvl, ring,
                        category=type_code,
                    )
                )
                fid += 1
                if type_code in ("entrance-exit", "restrooms", "parking-spot"):
                    cx, cy = centroid(ring)
                    ptype = (
                        "entrance" if type_code == "entrance-exit"
                        else "amenity"
                    )
                    pois["features"].append(
                        point_feature(
                            pid, name, ptype, BUILDING_ID, lvl, cx, cy,
                            category=type_code,
                        )
                    )
                    pid += 1
                continue
            cx, cy = centroid(ring)
            indoor_map["features"].append(
                polygon_feature(
                    fid, name, "unit", lvl, ring, category=type_code,
                )
            )
            fid += 1
            units_by_level[lvl].append((cx, cy, name))
            meta = {"category": type_code, **rich_metadata(props)}
            pois["features"].append(
                point_feature(
                    pid, name,
                    "restaurant" if tax.get("categories") == "food"
                    or "restaurant" in type_code else "store",
                    BUILDING_ID, lvl, cx, cy, **meta,
                )
            )
            pid += 1
        elif geom.get("type") == "Point":
            lng, lat = geom["coordinates"][:2]
            if type_code == "entrance-exit":
                entrance_pts.append((lng, lat))
            elif type_code == "restrooms":
                restroom_pts.append((lng, lat))
            ptype = "amenity" if type_code in AMENITY_TYPES else "store"
            meta = {"category": type_code, **rich_metadata(props)}
            pois["features"].append(
                point_feature(
                    pid, name, ptype, BUILDING_ID, lvl, lng, lat, **meta,
                )
            )
            pid += 1

    # Transition nodes are not in the POI payload (they live in the vector
    # tiles), so shafts are anchored on real vendor evidence: the escalator
    # and elevator positions from the captured route-engine sample, plus one
    # inferred staircase at the restroom median. The escalator is up-only
    # (L-1 -> L0, matching the vendor "Take Escalator up" message).
    def median_xy(pts, fallback):
        if not pts:
            return fallback
        xs = sorted(p[0] for p in pts)
        ys = sorted(p[1] for p in pts)
        return (xs[len(xs) // 2], ys[len(ys) // 2])

    all_units = [u for lvl in levels for u in units_by_level.get(lvl, [])]
    if all_units:
        fallback_xy = (
            sum(u[0] for u in all_units) / len(all_units),
            sum(u[1] for u in all_units) / len(all_units),
        )
    else:
        fallback_xy = (-0.162, 51.4996)
    transitions = []
    ex, ey = REAL_ESCALATOR
    transitions.append({
        "id": "escalator-1",
        "type": "escalator",
        "direction": "forward",
        "floors": [-1, 0],
        "anchors": {-1: (ex, ey), 0: (ex, ey)},
    })
    vx, vy = REAL_ELEVATOR
    transitions.append({
        "id": "elevator-1",
        "type": "elevator",
        "floors": list(levels),
        "anchors": {lvl: (vx, vy) for lvl in levels},
    })
    sx, sy = median_xy(restroom_pts, fallback_xy)
    transitions.append({
        "id": "stairs-inferred",
        "type": "stairs",
        "floors": list(levels),
        "anchors": {lvl: (sx, sy) for lvl in levels},
    })
    for t in transitions:
        tname = {"stairs": "Staircase", "escalator": "Escalator",
                 "elevator": "Elevator"}[t["type"]]
        suffix = " (inferred)" if t["id"] == "stairs-inferred" else ""
        for lvl in t["floors"]:
            glng, glat = t["anchors"][lvl]
            ring = square_ring(glng, glat, 1.5, glat)
            indoor_map["features"].append(
                polygon_feature(
                    f"{t['id']}-l{lvl}", f"{tname}{suffix}",
                    "vertical_connection", lvl, ring,
                    connection_type=t["type"],
                    vertical_connection_id=t["id"],
                )
            )
            indoor_map["features"].extend(
                detail_for_footprint(t["id"], t["type"], lvl, ring)
            )

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
                    f"outline-{level}", f"Level {level} outline",
                    "floor_outline", level, outline,
                )
            )

    # PRM inputs: small units (kiosks, booths, enclosed rooms) are
    # obstacles; large open-plan departments stay walkable, matching how the
    # store floor actually works. Every POI is a door target. Halo covers
    # units + corridors so the mesh hugs the venue.
    obstacles = defaultdict(list)
    halo = defaultdict(list)
    for f in indoor_map["features"]:
        ft = f["properties"].get("feature_type")
        if ft == "unit":
            ring = f["geometry"]["coordinates"][0]
            halo[f["properties"]["level_id"]].append(ring)
            if ring_area_m2(ring) < 200.0:
                obstacles[f["properties"]["level_id"]].append(ring)
        elif ft == "corridor":
            halo[f["properties"]["level_id"]].append(
                f["geometry"]["coordinates"][0]
            )
    doors = defaultdict(list)
    for f in pois["features"]:
        coords = f["geometry"]["coordinates"]
        doors[f["properties"]["floor"]].append((coords[0], coords[1]))

    routes = build_prm_routes(
        levels, obstacles, doors, transitions, outlines, lat_ref=51.5,
        spacing_m=12.0, max_link_m=60.0, k=3, halo_by_level=halo,
    )
    write_fixture(repo_path("app", "data", "harrods"),
                  indoor_map, routes, pois)
    print("levels:", levels)
    print("transitions:", [(t["id"], t["type"], t["floors"]) for t in transitions])
    print("dropped duplicate footprints:", dropped_duplicates)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
