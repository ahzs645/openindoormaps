#!/usr/bin/env python3
"""Port Pointr "Harrods" demo venue to a native fixture.

Source capture: <downloads>/Indoor Map/indoor map references/v9.pointr.express
  - .../published-content/v9/sites/<sid>/pois/latest.json (992 named
    polygon + point features with real lng/lat, lvl, typeCode, rich metadata)
  - .../published-content/v9/taxonomies/latest.json (typeCode -> class/shape)

Output: app/data/harrods/{indoor-map,indoor-routes,pois}.geojson

Transition nodes (escalator/stairs/elevator-node, class=path) become small
footprint polygons + vertical edges. Walking routes use a constrained
triangle-portal mesh of source walkways and destination footprints, clipped
to the actual building and constrained by source wall/obstacle material.
Source walkway/circulation boundaries are preserved in the triangulation,
and routing prefers those public spaces over department shortcuts. Captured
connector boarding/arrival nodes replace representative points only where
both endpoints uniquely match source footprints.

The site has two buildings (``buildings/latest.json``): the store and the
Harrods Car Park across the street. Each gets its own route mesh tagged with
``building_id`` / ``building_name``, and the two are joined by outdoor
walkways (as are the nearby bus stops), so directions say "Exit Harrods" /
"Enter Harrods Car Park". The capture has no car park entrances or street
paths, so both are inferred: straight links from the two closest store
doors to the nearest point of the car park outline.

Stairs, escalators, elevators and walls come from the
site's own vector tiles (z18, decoded to ``harrods-tiles/tiles-z18.geojson``
by scripts/decode-pointr-tiles.mjs). Tiles split features at their edges, so
parts are merged by ``fid``. Same-type footprints on adjacent floors that
overlap (or nearly) form one shaft. Parallel escalators are paired one-to-one
between adjacent floors. Only the captured L-1 -> L0 flight is known up-only;
other flight orientations are unknown and retain a two-way routing fallback. Walls
constrain every walking edge, including destination attachments and
visibility shortcuts. Source quantization tolerance is 4 cm for walls and
6 cm for virtual-obstacle strokes, which the captured routes cross. Shafts
and unknown escalator directions remain inferred; the full server-side
walking graph is not captured. Missing tiles stop the import.
"""
import json
import math
import os
import re
import sys
from collections import defaultdict

from shapely.geometry import shape, Polygon, Point
from shapely.affinity import affine_transform
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(__file__))
from port_vendors_common import (  # noqa: E402
    REFERENCE_ROOT,
    dist_m,
    line_feature,
    bbox_of_rings,
    centroid,
    load_json,
    meters_per_degree,
    point_feature,
    polygon_feature,
    repo_path,
    write_fixture,
    elevator_edges,
    level_offset,
)
from walkable_mesh import build_walkable_mesh

REF = (REFERENCE_ROOT +
       "/v9.pointr.express/harrodsv9demov9sa.blob.core.windows.net"
       "/fd109852-0d41-4684-9560-55c509bf8402/published-content/v9")
SITE = "670e2c0d-8794-42f8-9142-7d5b45904036"
BUILDING_ID = "harrods"
CAR_PARK_ID = "harrods-car-park"
# Pointr building fid -> our building id (see buildings/latest.json).
BUILDING_IDS = {
    "c3371b20-e5d0-4e58-856b-7cd529df1c27": BUILDING_ID,
    "a5dfde10": CAR_PARK_ID,  # prefix match, see building_of()
}
OUTDOORS_ID = "outdoors"
# Bus stops further than this from a store door are left unrouted: the
# capture has no street network, and long straight links would cut through
# neighbouring blocks.
MAX_OUTDOOR_LINK_M = 130.0

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

TILES = os.path.join(
    REFERENCE_ROOT, "v9.pointr.express", "harrods-tiles", "tiles-z18.geojson"
)
CAR_PARK_BID_PREFIX = "a5dfde10"
TRANSITION_LAYERS = ("stairs", "escalator", "elevator")
# Max gap (m) between same-type footprints on adjacent floors of one shaft.
SHAFT_TOLERANCE_M = {"stairs": 2.5, "escalator": 1.0, "elevator": 1.0}
OBSTACLE_LAYERS = ("wall", "virtualobstacle", "void")
WALKABLE_LAYERS = ("walkway", "circulation")
# Pointr style `fill_wall_ptr`: hsl(30, 10%, 90%), drawn as a light mass.
WALL_FILL = "#e7e5e2"
WALL_STROKE = "#cfcac4"
# Captured light_osm.json fill_*_ptr defaults. The source draws filled
# footprints and collision-aware icons, without synthetic treads/chevrons.
CONNECTOR_FILL = {"stairs": "#c7ccd1", "escalator": "#c9bfb6",
                  "elevator": "#c9bfb6"}


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


def load_tile_features():
    """Tile features merged across tile edges: [{layer, fid, lvl, bid, geom}]."""
    if not os.path.exists(TILES):
        return None
    with open(TILES) as fh:
        raw = json.load(fh)["features"]
    parts = defaultdict(list)
    meta = {}
    for feature in raw:
        props = feature["properties"]
        layer = props["_layer"]
        if layer not in TRANSITION_LAYERS + OBSTACLE_LAYERS + WALKABLE_LAYERS:
            continue
        key = (layer, props.get("fid"), int(props["lvl"]))
        parts[key].append(shape(feature["geometry"]).buffer(0))
        meta[key] = props.get("bid", "")
    merged = []
    for (layer, fid, lvl), geoms in parts.items():
        geom = unary_union(geoms)
        if geom.is_empty:
            continue
        merged.append({
            "layer": layer, "fid": fid, "lvl": lvl,
            "building": CAR_PARK_ID
            if meta[(layer, fid, lvl)].startswith(CAR_PARK_BID_PREFIX)
            else BUILDING_ID,
            "geom": geom,
        })
    return merged


def exterior_rings(geom):
    """Exterior rings (lng/lat lists) of a Polygon or MultiPolygon."""
    polygons = getattr(geom, "geoms", [geom])
    return [
        [[round(x, 8), round(y, 8)] for x, y in poly.exterior.coords]
        for poly in polygons
        if poly.geom_type == "Polygon" and not poly.is_empty
    ]


def polygon_rings(geom, precision=8):
    """[[exterior, *holes], ...] (lng/lat) of a Polygon or MultiPolygon."""
    def ring(coords):
        return [[round(x, precision), round(y, precision)] for x, y in coords]

    return [
        [ring(poly.exterior.coords), *(ring(h.coords) for h in poly.interiors)]
        for poly in getattr(geom, "geoms", [geom])
        if poly.geom_type == "Polygon" and not poly.is_empty
    ]


def match_escalator_lanes(items, projected, references):
    """One-to-one floor pairing, retaining separate parallel escalator lanes.

    Proximity unioning collapses side-by-side lanes into one bank. Prefer
    observed pairings, then overlapping/nearby footprints, with each footprint
    used at most once on either side of each adjacent-floor pair. Unmatched
    footprints remain visible; no floor link is invented to fill a gap.
    Pairings without a captured observation are still inferred.
    """
    pairs = []
    mx, my = meters_per_degree(51.5)
    project = lambda g: affine_transform(g, [mx, 0, 0, my, .164 * mx, -51.499 * my])
    for building in sorted({m["building"] for m in items}):
        levels = sorted({m["lvl"] for m in items if m["building"] == building})
        for lo, hi in zip(levels, levels[1:]):
            if hi != lo + 1:
                continue
            lower = [i for i, m in enumerate(items) if m["building"] == building and m["lvl"] == lo]
            upper = [i for i, m in enumerate(items) if m["building"] == building and m["lvl"] == hi]
            used_lo, used_hi = set(), set()
            for reference in references:
                for observed in reference["transitions"]:
                    if observed["type"] != "escalator" or {observed["from_level"], observed["to_level"]} != {lo, hi}:
                        continue
                    nodes = {observed["from_level"]: observed["from_coordinate"],
                             observed["to_level"]: observed["to_coordinate"]}
                    matches = [[i for i in side if projected[i].buffer(.1).covers(project(Point(nodes[level])))]
                               for side, level in ((lower, lo), (upper, hi))]
                    if any(len(ms) != 1 for ms in matches):
                        continue  # Other buildings cannot contain these observations.
                    i, j = matches[0][0], matches[1][0]
                    if i in used_lo or j in used_hi:
                        raise ValueError("Conflicting observed escalator pairings")
                    pairs.append((i, j))
                    used_lo.add(i)
                    used_hi.add(j)
            candidates = []
            for i in lower:
                for j in upper:
                    a, b = projected[i], projected[j]
                    gap = a.distance(b)
                    if gap > SHAFT_TOLERANCE_M["escalator"]:
                        continue
                    overlap = a.intersection(b).area / min(a.area, b.area)
                    candidates.append((-overlap, a.centroid.distance(b.centroid), gap,
                                       items[i]["fid"], items[j]["fid"], i, j))
            for *_, i, j in sorted(candidates):
                if i not in used_lo and j not in used_hi:
                    pairs.append((i, j))
                    used_lo.add(i)
                    used_hi.add(j)
    return pairs


def tile_shafts(features, references=()):
    """Pair source connector footprints across floors; preserve escalator lanes."""
    mx, my = meters_per_degree(51.5)
    items = [f for f in features if f["layer"] in TRANSITION_LAYERS]
    projected = [affine_transform(m["geom"], [mx, 0, 0, my, .164 * mx, -51.499 * my])
                 for m in items]
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, a in enumerate(items):
        for j, b in enumerate(items):
            if (
                j <= i or a["layer"] != b["layer"]
                or a["layer"] == "escalator"
                or a["building"] != b["building"]
                or abs(a["lvl"] - b["lvl"]) != 1
            ):
                continue
            gap = projected[i].distance(projected[j])
            if gap <= SHAFT_TOLERANCE_M[a["layer"]]:
                parent[find(i)] = find(j)

    escalator_indices = [i for i, m in enumerate(items) if m["layer"] == "escalator"]
    for a, b in match_escalator_lanes([items[i] for i in escalator_indices],
                                     [projected[i] for i in escalator_indices], references):
        parent[find(escalator_indices[a])] = find(escalator_indices[b])

    groups = defaultdict(list)
    for i, item in enumerate(items):
        groups[find(i)].append(item)
    shafts = []
    counters = defaultdict(int)
    for members in sorted(
        groups.values(),
        key=lambda m: (m[0]["layer"], min(x["lvl"] for x in m),
                       m[0]["geom"].centroid.x),
    ):
        layer = members[0]["layer"]
        counters[layer] += 1
        shaft_id = f"{layer}-{counters[layer]}"
        anchors = {}
        for lvl in sorted({m["lvl"] for m in members}):
            biggest = max(
                (m for m in members if m["lvl"] == lvl),
                key=lambda m: m["geom"].area,
            )
            point = biggest["geom"].representative_point()
            anchors[lvl] = (round(point.x, 8), round(point.y, 8))
        shafts.append({
            "id": shaft_id,
            "type": layer,
            "building": members[0]["building"],
            "floors": sorted(anchors),
            "anchors": anchors,
            "members": members,
        })
    return shafts


def load_buildings():
    """Pointr building outlines: {our id: {name, ring, color, opacity}}."""
    buildings = {}
    for f in load_json(os.path.join(REF, "buildings", "latest.json"))["features"]:
        p = f["properties"]
        if p.get("typeCode") != "building-outline":
            continue
        bid = building_of(p.get("fid"))
        buildings[bid] = {
            "name": p.get("name"),
            "ring": f["geometry"]["coordinates"][0],
            "color": p.get("color") or "#D9E9CF",
            "opacity": float(p.get("opacity") or 0.9),
        }
    return buildings


def apply_captured_landings(shafts, references):
    """Use observed transition endpoints only when both source footprints fit.

    The server route exposes boarding nodes and a connector group id, but
    not the walking graph. Require a unique same-type shaft containing both
    endpoints (with 10 cm tile precision tolerance). Other landings retain
    inferred representative points. Do not copy captured walking polylines.
    """
    mx, my = meters_per_degree(51.5)
    project = lambda g: affine_transform(g, [mx, 0, 0, my, .164 * mx, -51.499 * my])
    for reference in references:
        for observed in reference["transitions"]:
            landings = [(observed["from_level"], observed["from_coordinate"]),
                        (observed["to_level"], observed["to_coordinate"])]
            matches = []
            for shaft in shafts:
                if shaft["type"] != observed["type"]:
                    continue
                if all(any(member["lvl"] == level and
                           project(member["geom"]).buffer(.1).covers(project(Point(c)))
                           for member in shaft["members"])
                       for level, c in landings):
                    matches.append(shaft)
            if len(matches) != 1:
                raise ValueError("Captured connector does not match one source shaft: "
                                 + observed["source_group_id"])
            shaft = matches[0]
            shaft["source_group_id"] = observed["source_group_id"]
            if observed["type"] == "escalator":
                a, b = observed["from_level"], observed["to_level"]
                shaft.setdefault("flight_directions", {})[min(a, b), max(a, b)] = (
                    "forward" if b > a else "backward")
            for level, c in landings:
                shaft["anchors"][level] = tuple(round(v, 9) for v in c[:2])
                shaft.setdefault("observed_landings", set()).add(level)


def building_of(pointr_bid):
    for prefix, building_id in BUILDING_IDS.items():
        if pointr_bid and pointr_bid.startswith(prefix):
            return building_id
    return BUILDING_ID


def nearest_on_ring(point, ring, lat):
    """Closest point to ``point`` on the ring's edges (local planar)."""
    mx, my = meters_per_degree(lat)
    best = None
    for a, b in zip(ring, ring[1:]):
        ax, ay = (a[0] - point[0]) * mx, (a[1] - point[1]) * my
        bx, by = (b[0] - point[0]) * mx, (b[1] - point[1]) * my
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        t = 0.0 if length2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length2))
        px, py = ax + t * dx, ay + t * dy
        d2 = px * px + py * py
        if best is None or d2 < best[0]:
            best = (d2, [point[0] + px / mx, point[1] + py / my])
    return [round(best[1][0], 8), round(best[1][1], 8)]


def main(_argv):
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=repo_path("app", "data", "harrods"))
    output = parser.parse_args(_argv).output
    taxonomies = {
        t["typeCode"]: t
        for t in load_json(os.path.join(REF, "taxonomies", "latest.json"))
    }
    pois_src = load_json(os.path.join(REF, "sites", SITE, "pois", "latest.json"))
    buildings = load_buildings()
    style_path = os.path.join(REF.rsplit("/published-content/v9", 1)[0],
                              "styles/v9/9.8/light_osm.json")
    surface_colors = {}
    if os.path.exists(style_path):
        for layer in load_json(style_path)["layers"]:
            paint = layer.get("paint", {})
            color = paint.get("fill-color", paint.get("fill-extrusion-color"))
            # The last branch is the captured style's ordinary fill default;
            # hover/edit overrides do not apply to this static import.
            if isinstance(color, list):
                color = color[-1]
            if isinstance(color, str) and color.startswith(("hsl(", "rgb(", "#")):
                surface_colors[layer["id"].removeprefix("fill_").removesuffix("_ptr")] = color

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
        building_id = building_of(props.get("bid"))
        if type_code in EXCLUDE_FROM_MAP:
            building_id = OUTDOORS_ID
        tax = taxonomies.get(type_code, {})

        if type_code in TRANSITION_TYPES and geom.get("type") == "Point":
            ctype = TRANSITION_TYPES[type_code]
            lng, lat = geom["coordinates"][:2]
            transitions_raw.append((lng, lat, ctype, lvl, name))
            pois["features"].append(
                point_feature(
                    pid, name, "amenity", building_id, lvl, lng, lat,
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
                        pid, name, "store", building_id, lvl, cx, cy, **meta,
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
                        pid, name, "amenity", building_id, lvl, cx, cy,
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
                        category=type_code, building_id=building_id,
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
                            pid, name, ptype, building_id, lvl, cx, cy,
                            category=type_code,
                        )
                    )
                    pid += 1
                continue
            cx, cy = centroid(ring)
            indoor_map["features"].append(
                polygon_feature(
                    fid, name, "unit", lvl, ring, category=type_code,
                    building_id=building_id,
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
                    building_id, lvl, cx, cy, **meta,
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
                    pid, name, ptype, building_id, lvl, lng, lat, **meta,
                )
            )
            pid += 1

    tile_features = load_tile_features()
    if not tile_features:
        raise SystemExit("Harrods requires decoded source tiles; refusing to "
                         "generate unconstrained routes without them.")
    transitions = []
    references = load_json(repo_path("tests", "fixtures",
                                    "harrods-reference-routes.json"))
    if tile_features:
        shafts = tile_shafts(tile_features, references)
        apply_captured_landings(shafts, references)
        names = {"stairs": "Stairs", "escalator": "Escalator",
                 "elevator": "Elevator"}
        for shaft in shafts:
            for member in shaft["members"]:
                for index, rings in enumerate(polygon_rings(member["geom"], precision=9)):
                    fid_suffix = f"-{index}" if index else ""
                    footprint = polygon_feature(
                        f"{shaft['id']}-l{member['lvl']}-{member['fid'][:8]}"
                        f"{fid_suffix}",
                        names[shaft["type"]], "vertical_connection",
                        member["lvl"], rings[0],
                        connection_type=shaft["type"],
                        vertical_connection_id=shaft["id"],
                        building_id=shaft["building"],
                        source_fid=member["fid"], source_layer=shaft["type"],
                        connector_style="pointr", display_label="",
                        fill=CONNECTOR_FILL[shaft["type"]],
                        **{"fill-opacity": 1},
                    )
                    footprint["geometry"]["coordinates"] = rings
                    indoor_map["features"].append(footprint)
            if len(shaft["floors"]) > 1:
                transitions.append(shaft)
        for feature in tile_features:
            if feature["layer"] in WALKABLE_LAYERS:
                for index, rings in enumerate(polygon_rings(feature["geom"], precision=9)):
                    aisle = polygon_feature(
                        f"aisle-{feature['layer']}-{feature['fid']}-{feature['lvl']}-{index}",
                        "Aisle", "corridor", feature["lvl"], rings[0],
                        building_id=feature["building"], source_layer=feature["layer"],
                        source_fid=feature["fid"], fill="#ffffff", stroke="#ffffff",
                        **{"stroke-width": 0, "extrusion_height": 0},
                    )
                    aisle["geometry"]["coordinates"] = rings
                    indoor_map["features"].append(aisle)
            if feature["layer"] != "wall":
                continue
            # Walls are rings around spaces: keep their holes, or they
            # render as solid blocks.
            for index, rings in enumerate(polygon_rings(feature["geom"], precision=9)):
                wall = polygon_feature(
                    f"wall-{feature['fid'][:8]}-{feature['lvl']}-{index}",
                    "Wall", "wall", feature["lvl"], rings[0],
                    building_id=feature["building"], fill=WALL_FILL,
                    stroke=WALL_STROKE, source_layer="wall", source_fid=feature["fid"],
                    **{"extrusion_height": .75, "stroke-width": .5},
                )
                wall["geometry"]["coordinates"] = rings
                indoor_map["features"].append(wall)
        print("tile shafts:", {
            kind: sum(1 for t in transitions if t["type"] == kind)
            for kind in TRANSITION_LAYERS
        }, "single-floor footprints:",
            sum(1 for t in shafts if len(t["floors"]) == 1))
        print("observed escalator flight directions:", [
            (t["id"], t["flight_directions"]) for t in transitions if t.get("flight_directions")
        ])
    def in_building(feature, building_id):
        return feature["properties"].get("building_id") == building_id

    # Store floors: bbox of the store's own polygons per level. The car park
    # uses its real building outline (single level).
    outlines = {}
    for level in levels:
        rings = []
        for f in indoor_map["features"]:
            if (
                f["properties"].get("level_id") == level
                and in_building(f, BUILDING_ID)
            ):
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
                    building_id=BUILDING_ID,
                )
            )
    car_park = buildings[CAR_PARK_ID]
    indoor_map["features"].append(
        polygon_feature(
            "car-park-outline-0", f"{car_park['name']} outline",
            "floor_outline", 0, car_park["ring"], building_id=CAR_PARK_ID,
        )
    )

    # Building footprints under every floor (Pointr's own colours), drawn
    # first so floor plans sit on top.
    footprints = [
        polygon_feature(
            f"footprint-{building_id}", building["name"], "area", None,
            building["ring"], building_id=building_id,
            fill=building["color"], stroke="#9fb7a0",
            **{"fill-opacity": building["opacity"]},
        )
        for building_id, building in buildings.items()
    ]
    indoor_map["features"][:0] = footprints

    # Departments are floor surfaces, not solid roof-height blocks. Raised
    # massing hides interior partitions and aisles in the pitched view. The
    # source's low wall rings supply the floor plan's vertical structure.
    for feature in indoor_map["features"]:
        p = feature["properties"]
        if p.get("feature_type") in ("unit", "corridor"):
            p["extrusion_height"] = 0
            p.setdefault("fill", surface_colors.get(p.get("category"),
                "#f5f5f5" if p["feature_type"] == "unit" else "#ffffff"))
            p.setdefault("stroke", "#d8d5d0")
            p.setdefault("stroke-width", .5)

    # The car park has no entrance in the capture: infer one on its outline,
    # facing the nearest store doors.
    store_doors = [
        (f["geometry"]["coordinates"], f["properties"]["name"])
        for f in pois["features"]
        if f["properties"]["building_id"] == BUILDING_ID
        and f["properties"]["floor"] == 0
        and f["properties"]["metadata"].get("category") == "entrance-exit"
    ]

    def door_distance(point):
        return min(dist_m(point, v, 51.5) for v in car_park["ring"])

    # One entrance per facing store door, at the closest point of the car
    # park outline, so each street crossing is as short as possible.
    nearest_doors = sorted(store_doors, key=lambda d: door_distance(d[0]))[:2]
    car_park_entrances = []
    for door, door_name in nearest_doors:
        entrance = nearest_on_ring(door, car_park["ring"], 51.5)
        car_park_entrances.append((door, door_name, entrance))
        pois["features"].append(
            point_feature(
                pid, f"{car_park['name']} Entrance facing {door_name} "
                "(inferred)", "entrance", CAR_PARK_ID, 0, *entrance,
                category="entrance-exit",
            )
        )
        pid += 1

    routes = {"type": "FeatureCollection", "max_snap_distance_m": .15,
              "walking_geometry_source": "source-floor-polygons",
              "routing_preference_source": "source-walkway-and-circulation",
              "features": []}
    constraints = {"type": "FeatureCollection", "features": []}
    diagnostics = []

    def mesh(building_id):
        allowed, blocked, endpoints = (defaultdict(list) for _ in range(3))
        preferred = defaultdict(list)
        for f in tile_features:
            if f["building"] != building_id:
                continue
            if f["layer"] in OBSTACLE_LAYERS:
                # z18 tile quantization shifts doorway boundaries by a few
                # cm; virtual-obstacle strokes (~11 cm wide) are crossed by
                # the captured vendor routes. Keep their solid cores, without
                # treating those border strokes as sealed department walls.
                tolerance = .04 if f["layer"] == "wall" else .06
                blocked[f["lvl"]].append((f["geom"], tolerance))
                constraints["features"].append({
                    "type": "Feature", "properties": {
                        "level_id": f["lvl"], "building_id": building_id,
                        "source_layer": f["layer"],
                        "geometry_tolerance_m": tolerance,
                    }, "geometry": f["geom"].__geo_interface__,
                })
            elif f["layer"] in WALKABLE_LAYERS + TRANSITION_LAYERS:
                allowed[f["lvl"]].append(f["geom"])
                preferred[f["lvl"]].append(f["geom"])
        for f in indoor_map["features"]:
            p = f["properties"]
            if (p.get("building_id") == building_id
                    and p.get("feature_type") in ("unit", "corridor")
                    and p.get("source_layer") not in WALKABLE_LAYERS):
                allowed[p["level_id"]].append(shape(f["geometry"]).buffer(0))
        if building_id == CAR_PARK_ID:
            allowed[0].append(Polygon(car_park["ring"]))
        # Keep source floor/department geometry inside the actual building,
        # rather than routing inside rectangular floor bounding boxes.
        envelope = Polygon(buildings[building_id]["ring"])
        for level, parts in allowed.items():
            allowed[level] = [g.intersection(envelope) for g in parts]
        for f in pois["features"]:
            if f["properties"]["building_id"] == building_id:
                endpoints[f["properties"]["floor"]].append(
                    tuple(f["geometry"]["coordinates"][:2]))
        for t in transitions:
            if t["building"] == building_id:
                for level, anchor in t["anchors"].items():
                    endpoints[level].append(tuple(anchor))
        # Captured vendor endpoints are known valid targets, also used by
        # independent regression tests. Their polylines do not seed the mesh.
        if building_id == BUILDING_ID:
            for reference in references:
                for endpoint in (reference["nodes"][0], reference["nodes"][-1]):
                    endpoints[endpoint["level"]].append(tuple(endpoint["coordinate"]))
        result, info = build_walkable_mesh(
            allowed, blocked, endpoints, lat_ref=51.5,
            origin=centroid(buildings[building_id]["ring"]),
            preferred_by_level=preferred if building_id == BUILDING_ID else None,
            axis_preference=.6 if building_id == BUILDING_ID else 0,
        )
        diagnostics.extend({"building_id": building_id, **d} for d in info)
        # Vertical links are separately sourced from the connector footprints.
        # A blocked/unattached landing cannot become routable through a lift.
        attached = {tuple(f["geometry"]["coordinates"])
                    for f in result["features"]
                    if f["geometry"]["type"] == "Point"
                    and f["properties"].get("is_routable")}
        for t in transitions:
            if t["building"] != building_id:
                continue
            floors = sorted(t["floors"])
            for lo, hi in zip(floors, floors[1:]):
                if not all(tuple(level_offset(list(t["anchors"][l]), l)) in attached
                           for l in (lo, hi)):
                    continue
                if t["type"] == "elevator":
                    edges = elevator_edges(t, [lo, hi], fixed_ride_seconds=float(
                        taxonomies["elevator-node"]["transitionTravelTime"]))
                else:
                    direction = t.get("flight_directions", {}).get((lo, hi))
                    edges = [line_feature(
                        [level_offset(list(t["anchors"][lo]), lo),
                         level_offset(list(t["anchors"][hi]), hi)],
                        None, t["type"], cost=float(taxonomies[t["type"] + "-node"]["transitionTravelTime"]),
                        from_level_id=lo, to_level_id=hi, is_accessible=False,
                        # A new escalator must be boarded after each floor;
                        # it is not one continuous multi-floor elevator ride.
                        vertical_connection_id=(f"{t['id']}-flight-{lo}-{hi}"
                                                if t["type"] == "escalator" else t["id"]),
                        **({"direction": direction} if direction else {}),
                    )]
                for edge in edges:
                    edge["properties"].update({
                        "inferred": True,
                        "geometry_source": "source-connector-footprints",
                        "direction_source": "captured-route" if (t.get("flight_directions", {}).get((lo, hi)))
                        else "unknown" if t["type"] == "escalator" else "bidirectional",
                        "source_direction_constraint": taxonomies[t["type"] + "-node"]["transitionDirection"],
                        "shaft_id": t["id"],
                        "pairing_source": "one-to-one-adjacent-footprints"
                        if t["type"] == "escalator" else "adjacent-footprint-proximity",
                    })
                    if t.get("source_group_id"):
                        edge["properties"]["source_group_id"] = t["source_group_id"]
                    for side in ("from", "to"):
                        level = edge["properties"][f"{side}_level_id"]
                        edge["properties"][f"{side}_landing_source"] = (
                            "captured-route" if level in t.get("observed_landings", ())
                            else "source-footprint-representative-point")
                result["features"].extend(edges)
        return result

    store_routes = mesh(BUILDING_ID)
    car_park_routes = mesh(CAR_PARK_ID)
    for building_id, part in (
        (BUILDING_ID, store_routes), (CAR_PARK_ID, car_park_routes),
    ):
        for feature in part["features"]:
            feature["properties"]["building_id"] = building_id
            feature["properties"]["building_name"] = (
                buildings[building_id]["name"]
            )
            routes["features"].append(feature)

    # Outdoor walkways (ground floor, no building): store doors -> car park
    # entrance, and the nearest store door -> each bus stop in reach.
    def walkway(a, b):
        return line_feature(
            [list(a), list(b)], 0, "outdoor",
            building_id=None, building_name=None, inferred=True,
        )

    for door, door_name, entrance in car_park_entrances:
        routes["features"].append(walkway(door, entrance))
        print(f"walkway: {door_name} -> car park entrance "
              f"({dist_m(door, entrance, 51.5):.0f} m)")
    for f in pois["features"]:
        if f["properties"]["building_id"] != OUTDOORS_ID:
            continue
        stop = f["geometry"]["coordinates"]
        door, door_name = min(
            store_doors, key=lambda d: dist_m(d[0], stop, 51.5)
        )
        length = dist_m(door, stop, 51.5)
        if length <= MAX_OUTDOOR_LINK_M:
            routes["features"].append(walkway(door, stop))
            print(f"walkway: {door_name} -> {f['properties']['name']} "
                  f"({length:.0f} m)")

    write_fixture(output,
                  indoor_map, routes, pois, compact_routes=True)
    with open(os.path.join(output, "navigation-constraints.geojson"),
              "w") as fh:
        json.dump(constraints, fh, separators=(",", ":"))
        fh.write("\n")
    print("geometry mesh:", diagnostics)
    print("levels:", levels)
    print("transitions:", [(t["id"], t["type"], t["floors"]) for t in transitions])
    print("dropped duplicate footprints:", dropped_duplicates)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
