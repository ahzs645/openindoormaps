#!/usr/bin/env python3
"""Port a Mappedin map-gallery venue (MVF v2 bundle) to a native fixture.

    python3 scripts/port-mappedin-mvf.py bowie-state [gallery.har]
    python3 scripts/port-mappedin-mvf.py eaton-centre [gallery.har]
    python3 scripts/port-mappedin-mvf.py bc-hospital /path/to/captured-mvf.zip

Source: the MVF v2 bundle behind mappedin.com/map-gallery/<venue>
(``exports/mvf2/1/bundle`` -> a zip on cdn.mappedin.com). Save the gallery page
as a HAR and pass it once to extract the bundle; later runs read the copy
under <reference root>/www.mappedin.com/<mappedin slug>/mvf-bundle.zip.

Unlike the other vendor ports nothing here is synthesized: the bundle carries
the venue's own navigation graph and connections.

- floorstack.json: optional "Outdoor" stack (campus grounds) + buildings;
  a floor's ``elevation`` is its level_id, so buildings share floor numbers.
- space/<floor>.geojson + enterprise/layers.json + styles.json: footprints,
  typed by layer (Room/Polygon/Kiosk -> unit, Stairs/Elevator/Connection ->
  vertical_connection, outdoor layers -> ``area`` with ``level_id: null``
  under every floor). Untyped "Connection" footprints take the type of the
  connection node inside them.
- node.geojson: walking edges from each node's same-floor ``neighbors``.
- connection.json: stairs (60 s/floor), elevators (45 s board + 15 s/floor)
  and doors joining the outdoor map to each building. Doors are walking
  edges tagged with the building, so directions read "Exit X" / "Enter Y";
  a door that lands on another floor (hillside entrances) is a floor change.
  Escalators stay two-way: the node graph links both directions and the
  node order in connection.json is not a direction (stairs are ordered too).
- enterprise/locations.json: named rooms, tenants, amenities and building
  labels, placed at their space's centre, with the card metadata
  (hours, logo, phone, website/social, tags, state).
"""
import base64
import json
import os
import re
import shutil
from urllib.parse import urlsplit
import sys
import zipfile
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from port_vendors_common import (  # noqa: E402
    REFERENCE_ROOT,
    dist_m,
    line_feature,
    point_in_ring,
    point_feature,
    polygon_feature,
    repo_path,
    schema_org_hours,
)

# Our fixture slug -> Mappedin venue slug.
VENUES = {
    "bowie-state": "bowie-state-university",
    "eaton-centre": "toronto-eaton-centre",
    "bc-hospital": "bc-childrens-hospital",
}
OUTDOOR_VIEW_LEVEL = -100  # Display-only campus overview; graph elevation stays 0.

# Route vertices are keyed by exact coordinates, so floors (and maps that
# share an elevation, e.g. the campus grounds and every ground floor) must
# never share one: shift by level, then nudge any cross-map collision.
LEVEL_EPSILON = 2e-7
COLLISION_EPSILON = 1e-8
ELEVATOR_STOP_EPSILON = 1e-7
ELEVATOR_BOARD_S = 45
ELEVATOR_RIDE_PER_FLOOR_S = 15
STAIRS_PER_FLOOR_S = 60
# A door that changes floor (walking in from a hillside path).
CROSS_FLOOR_DOOR_S = 5

UNIT_LAYERS = {
    "Room", "Washroom", "Non Public", "Lecture Hall", "Store (SC)",
    "Polygon", "Kiosk", "Anchor",
}
FLOOR_LAYERS = {"Floor"}
VERTICAL_LAYERS = {
    "Stairs": "stairs", "Steps": "stairs", "Elevator": "elevator", "Elevators": "elevator",
    "Ramp": "ramp",
    "Connection": None,  # typed from the connection node inside it
}
SKIP_LAYERS = {"Void"}

SIGNED_URL = re.compile(r"[?&](sig|se|sv)=", re.IGNORECASE)


def extract_from_har(har_path, venue, bundle_path):
    """Save the MVF bundle zip found in a HAR capture of the gallery page."""
    with open(har_path) as fh:
        entries = json.load(fh)["log"]["entries"]
    os.makedirs(os.path.dirname(bundle_path), exist_ok=True)
    bundle_url = None
    for entry in entries:
        url = entry["request"]["url"]
        if "exports/mvf2/1/bundle" in url and f"venue={venue}" in url:
            text = entry["response"]["content"].get("text")
            if text:
                bundle_url = json.loads(text)["perspectives"]["Website"]["url"]
    if not bundle_url:
        raise SystemExit(f"no MVF bundle request for {venue} in {har_path}")
    for entry in entries:
        if entry["request"]["url"] != bundle_url:
            continue
        content = entry["response"]["content"]
        data = content.get("text") or ""
        raw = (
            base64.b64decode(data)
            if content.get("encoding") == "base64"
            else data.encode("latin-1")
        )
        with open(bundle_path, "wb") as fh:
            fh.write(raw)
        print("extracted", bundle_path, len(raw), "bytes")
        return
    raise SystemExit("the HAR lists the bundle URL but not its response body")


def public_url(value):
    if isinstance(value, dict):  # {"original": url, ...}
        value = value.get("original")
    if isinstance(value, str) and not SIGNED_URL.search(value):
        return value
    return None


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def ring_centroid(ring):
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    return [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]


def main(argv):
    if not argv or argv[0] not in VENUES:
        raise SystemExit(f"usage: port-mappedin-mvf.py {{{','.join(VENUES)}}} [har|mvf.zip]")
    venue = VENUES[argv[0]]
    bundle_path = os.path.join(
        REFERENCE_ROOT, "www.mappedin.com", venue, "mvf-bundle.zip"
    )
    out_dir = repo_path("app", "data", argv[0])
    hospital = argv[0] == "bc-hospital"
    if len(argv) > 1 and argv[1].endswith(".zip"):
        bundle_path = os.path.expanduser(argv[1])
    elif len(argv) > 1:
        extract_from_har(os.path.expanduser(argv[1]), venue, bundle_path)
    if not os.path.exists(bundle_path):
        raise SystemExit(
            f"missing {bundle_path}; pass the gallery HAR to extract it"
        )

    def asset_url(value):
        url = public_url(value)
        if hospital and url:
            filename = os.path.basename(urlsplit(url).path)
            source = os.path.join(os.path.dirname(bundle_path), filename)
            if re.fullmatch(r"[a-f0-9]+\.(png|webp|jpg|svg)", filename) and os.path.isfile(source):
                destination = repo_path("public", "assets", "bc-hospital")
                os.makedirs(destination, exist_ok=True)
                shutil.copyfile(source, os.path.join(destination, filename))
                return "/assets/bc-hospital/" + filename
        return url

    bundle = zipfile.ZipFile(bundle_path)

    def read(name, default=None):
        if default is not None and name not in bundle.namelist():
            return default
        return json.loads(bundle.read(name))

    floors = {f["properties"]["id"]: f["properties"]
              for f in read("floor.geojson")["features"]}
    stacks = read("floorstack.json")
    outdoor_maps = set()
    building_of_map = {}
    for stack in stacks:
        for map_id in stack["maps"]:
            if stack["type"] == "Outdoor":
                outdoor_maps.add(map_id)
            else:
                name = stack["name"].strip()
                building_of_map[map_id] = {
                    "id": slugify(stack.get("shortName") or "") or slugify(name),
                    "name": name,
                }

    def level_of(map_id):
        return int(floors[map_id]["elevation"])

    def building_tags(map_id):
        building = building_of_map.get(map_id)
        return {
            "building_id": building["id"] if building else None,
            "building_name": building["name"] if building else None,
        }

    # ---- footprints ------------------------------------------------------
    layer_of_space = {}
    for layer in read("enterprise/layers.json"):
        for ref in layer["spaces"]:
            layer_of_space[ref["spaceId"]] = layer["name"]
    style_of_space = {}
    for style in read("styles.json").values():
        for space_id in style.get("polygons", []):
            style_of_space[space_id] = style

    locations = [
        loc for loc in read("enterprise/locations.json")
        if not loc.get("hidden")
    ]
    categories = read("enterprise/categories.json", []) if hospital else []
    category_by_id = {c["id"]: c for c in categories}
    category_members = {}

    def category_locations(category_id):
        category = category_by_id[category_id]
        members = set(category.get("locations", []))
        for child in category.get("children", []):
            if child in category_by_id:
                members.update(category_locations(child))
        return members

    for category in categories:
        category_members[category["id"]] = category_locations(category["id"])

    located_spaces = {
        ref["id"]
        for loc in locations
        if loc["type"] != "building"
        for ref in loc["polygons"]
    }

    # Untyped "Connection" footprints: type = connection node inside them.
    nodes = {f["properties"]["id"]: f for f in read("node.geojson")["features"]}
    connections = read("connection.json")
    connection_points = defaultdict(list)  # map -> [(lng, lat, type)]
    for connection in connections:
        for node_id in connection["nodes"]:
            node = nodes.get(node_id)
            if node:
                lng, lat = node["geometry"]["coordinates"][:2]
                connection_points[node["properties"]["map"]].append(
                    (lng, lat, connection["type"])
                )

    def connection_type_in(map_id, ring):
        for lng, lat, ctype in connection_points[map_id]:
            if ctype in {"elevator", "stairs", "escalator"} and point_in_ring((lng, lat), ring):
                return ctype
        return None

    background = []  # campus grounds, under every floor
    by_level = defaultdict(list)  # (sort key, feature)
    space_center = {}
    space_entry_nodes = {}
    unit_id = 0
    for map_id in sorted(floors, key=level_of):
        level = level_of(map_id)
        outdoor = map_id in outdoor_maps
        tags = building_tags(map_id)
        for feature in read(f"space/{map_id}.geojson")["features"]:
            props = feature["properties"]
            space_id = props["id"]
            if props.get("center"):
                space_center[space_id] = props["center"]
            if props.get("destinationNodes"):
                space_entry_nodes[space_id] = props["destinationNodes"]
            geometry = feature["geometry"]
            if geometry["type"] != "Polygon":
                continue
            # ~1 cm precision keeps the fixture a manageable size.
            rings = [[[round(x, 9 if hospital else 7), round(y, 9 if hospital else 7)]
                      for x, y in (c[:2] for c in r)]
                     for r in geometry["coordinates"]]
            ring = rings[0]
            space_center.setdefault(space_id, ring_centroid(ring))
            layer = layer_of_space.get(space_id, "")
            if layer in SKIP_LAYERS:
                continue
            style = style_of_space.get(space_id, {})
            name = ((props.get("details") or {}).get("name") or layer).strip()
            order = (style.get("altitude", 0), style.get("height", 0))
            appearance = ({"fill": style.get("color", "#f5f5f5"),
                           "stroke": style.get("color", "#f5f5f5"),
                           "stroke-width": 0,
                           "fill-opacity": style.get("opacity", 1),
                           "extrusion_height": style.get("height", 0),
                           "extrusion_base": max(0, style.get("altitude", 0)),
                           "source_map_id": map_id,
                           "space_id": space_id} if hospital else {})
            if outdoor:
                feature_out = polygon_feature(
                    space_id, name, "area",
                    OUTDOOR_VIEW_LEVEL if hospital and layer.startswith("Dynamic -") else None, ring,
                    layer=layer, fill=style.get("color", "#aab59c"),
                    stroke=style.get("color", "#aab59c"),
                )
                if hospital:
                    feature_out["properties"].update(appearance)
                    feature_out["geometry"]["coordinates"] = rings
                background.append((order, feature_out))
                continue
            connection_type = VERTICAL_LAYERS.get(layer) or (
                connection_type_in(map_id, ring)
                if layer in VERTICAL_LAYERS else None
            )
            if connection_type:
                feature_out = polygon_feature(
                    space_id, connection_type.title(), "vertical_connection",
                    level, ring, connection_type=connection_type,
                    vertical_connection_id=space_id, **tags,
                )
            elif layer in UNIT_LAYERS or space_id in located_spaces:
                unit_id += 1
                feature_out = polygon_feature(
                    unit_id, name, "unit", level, ring,
                    category=layer.lower(), space_id=space_id, **tags,
                )
            elif layer in FLOOR_LAYERS:
                feature_out = polygon_feature(
                    space_id, name, "corridor", level, ring, **tags,
                )
            elif hospital and layer in {"Wall", "Inner Wall", "Entrance"}:
                feature_out = polygon_feature(
                    space_id, name, "wall", level, ring, layer=layer, **tags,
                )
            else:
                # Walls, entrances, furniture, courts: vendor colours.
                feature_out = polygon_feature(
                    space_id, name, "area", level, ring, layer=layer,
                    fill=style.get("color", "#d6d5d1"), **tags,
                )
            if hospital:
                feature_out["properties"].update(appearance)
                feature_out["geometry"]["coordinates"] = rings
                if connection_type:
                    feature_out["properties"].update(connector_style="mappedin", display_label="")
            by_level[level].append((order, feature_out))

    indoor_map = {"type": "FeatureCollection", "features": []}
    indoor_map["features"].extend(f for _, f in sorted(background, key=lambda t: t[0]))
    for level in sorted(by_level):
        indoor_map["features"].extend(
            f for _, f in sorted(by_level[level], key=lambda t: t[0])
        )

    # ---- routing graph ---------------------------------------------------
    coord_owner = {}
    vertex = {}
    for node_id in sorted(nodes):
        props = nodes[node_id]["properties"]
        map_id = props["map"]
        lng, lat = nodes[node_id]["geometry"]["coordinates"][:2]
        lng = round(lng + level_of(map_id) * LEVEL_EPSILON, 9)
        lat = round(lat, 9)
        while ((lng, lat) in coord_owner if hospital else coord_owner.get((lng, lat), map_id) != map_id):
            lat = round(lat + COLLISION_EPSILON, 9)
        coord_owner[(lng, lat)] = map_id
        vertex[node_id] = [lng, lat]

    routes = {"type": "FeatureCollection", "features": []}
    seen_edges = set()
    counts = defaultdict(int)
    if hospital:
        for node_id, node in nodes.items():
            routes["features"].append({"type": "Feature",
                "geometry": {"type": "Point", "coordinates": vertex[node_id]},
                "properties": {"network_type": "destination", "level_id": level_of(node["properties"]["map"]),
                               "source_coordinate": node["geometry"]["coordinates"][:2], "source_node_id": node_id}})
        # Enterprise SDK: same-map weight = distance + pathWeight; cross-map
        # weight = pathWeight. These are preferences, not travel durations.
        # Preserve every directed neighbor, including direct multi-floor rides.
        connection_of_pair = {}
        for connection in connections:
            for a in connection["nodes"]:
                for b in connection["nodes"]:
                    if a != b:
                        connection_of_pair[(a, b)] = connection
        for node_id, node in nodes.items():
            map_a = node["properties"]["map"]
            for neighbor in node["properties"]["neighbors"]:
                other_id = neighbor["id"]
                other = nodes.get(other_id)
                if not other:
                    continue
                map_b = other["properties"]["map"]
                same_map = map_a == map_b
                connection = connection_of_pair.get((node_id, other_id))
                ctype = connection["type"] if connection else "corridor"
                level_a, level_b = level_of(map_a), level_of(map_b)
                tags = building_tags(map_b if map_b in building_of_map else map_a)
                weight = max(0, neighbor.get("weight", 0))
                if same_map:
                    weight += dist_m(node["geometry"]["coordinates"],
                                     other["geometry"]["coordinates"],
                                     node["geometry"]["coordinates"][1])
                    seen_edges.add(tuple(sorted((node_id, other_id))))
                network = ("ramp" if level_a != level_b else "corridor") if ctype == "portal" else ctype
                meta = {"direction": "forward", "routing_cost": weight / 1.2,
                        "source_node_ids": [node_id, other_id],
                        "source_path_weight": neighbor.get("weight", 0),
                        "is_accessible": bool(connection.get("accessible")) if connection else True}
                if connection:
                    meta.update(vertical_connection_id=connection["id"],
                                name=(connection.get("details") or {}).get("name", ctype),
                                active=(connection.get("extra") or {}).get("active", True))
                if ctype == "elevator":
                    meta["ride_time_seconds"] = ELEVATOR_BOARD_S * 2 + ELEVATOR_RIDE_PER_FLOOR_S * abs(level_b-level_a)
                if level_a != level_b:
                    meta.update(from_level_id=level_a, to_level_id=level_b)
                routes["features"].append(line_feature(
                    [vertex[node_id], vertex[other_id]],
                    None if level_a != level_b else level_a,
                    "outdoor" if same_map and map_a in outdoor_maps else network,
                    **meta, **tags))
        counts.update({ctype: sum(c["type"] == ctype and len(c["nodes"]) >= 2 for c in connections)
                       for ctype in {c["type"] for c in connections}})
    else:
        for node_id, node in nodes.items():
            map_id = node["properties"]["map"]
            for neighbor in node["properties"]["neighbors"]:
                other = nodes.get(neighbor["id"])
                if not other or other["properties"]["map"] != map_id:
                    continue  # cross-floor links come from connection.json
                key = tuple(sorted((node_id, neighbor["id"])))
                if key in seen_edges:
                    continue
                seen_edges.add(key)
                routes["features"].append(line_feature(
                    [vertex[node_id], vertex[neighbor["id"]]],
                    level_of(map_id),
                    "outdoor" if map_id in outdoor_maps else "corridor",
                    **building_tags(map_id),
                ))

        for connection in connections:
            ctype = connection["type"]
            name = (connection.get("details") or {}).get("name") or ctype
            # One node per floor, lowest first.
            per_map = {}
            for node_id in connection["nodes"]:
                if node_id in nodes:
                    per_map.setdefault(nodes[node_id]["properties"]["map"], node_id)
            stops = sorted(per_map.items(), key=lambda item: level_of(item[0]))
            if len(stops) < 2:
                continue
            common = {
                "is_accessible": bool(connection.get("accessible")),
                "vertical_connection_id": connection["id"],
                "name": name,
            }
            active = (connection.get("extra") or {}).get("active")
            if isinstance(active, bool):
                # Meaning undocumented (in-service toggle?); kept for reference,
                # the connection stays routable.
                common["active"] = active
            if ctype == "door" or hospital and ctype == "portal":
                (map_a, node_a), (map_b, node_b) = stops[:2]
                inside = map_a if map_a in building_of_map else map_b
                level_a, level_b = level_of(map_a), level_of(map_b)
                if level_a == level_b:
                    routes["features"].append(line_feature(
                        [vertex[node_a], vertex[node_b]], level_a, "door" if ctype == "door" else "corridor",
                        **common, **building_tags(inside),
                    ))
                else:
                    routes["features"].append(line_feature(
                        [vertex[node_a], vertex[node_b]], None, "door" if ctype == "door" else "ramp",
                        cost=CROSS_FLOOR_DOOR_S, from_level_id=level_a,
                        to_level_id=level_b, **common, **building_tags(inside),
                    ))
                counts[f"door{'' if level_a == level_b else ' (changes floor)'}"] += 1
                continue
            tags = building_tags(stops[0][0])
            if ctype == "elevator":
                def stop(node_id):
                    x, y = vertex[node_id]
                    return [x, round(y + ELEVATOR_STOP_EPSILON, 9)]

                for map_id, node_id in stops:
                    routes["features"].append(line_feature(
                        [vertex[node_id], stop(node_id)], None, "elevator",
                        cost=ELEVATOR_BOARD_S, from_level_id=level_of(map_id),
                        to_level_id=level_of(map_id), **common, **tags,
                    ))
                for (map_a, node_a), (map_b, node_b) in zip(stops, stops[1:]):
                    routes["features"].append(line_feature(
                        [stop(node_a), stop(node_b)], None, "elevator",
                        cost=ELEVATOR_RIDE_PER_FLOOR_S
                        * (level_of(map_b) - level_of(map_a)),
                        from_level_id=level_of(map_a),
                        to_level_id=level_of(map_b), **common, **tags,
                    ))
            else:
                for (map_a, node_a), (map_b, node_b) in zip(stops, stops[1:]):
                    routes["features"].append(line_feature(
                        [vertex[node_a], vertex[node_b]], None, ctype,
                        cost=STAIRS_PER_FLOOR_S
                        * max(level_of(map_b) - level_of(map_a), 1),
                        from_level_id=level_of(map_a),
                        to_level_id=level_of(map_b), **common, **tags,
                    ))
            counts[ctype] += 1
    print("connections:", dict(counts))

    # ---- POIs --------------------------------------------------------------
    poi_types = {
        "room": "room", "non public": "room", "tenant": "store",
        "amenities": "amenity", "building": "building", "furniture": "amenity",
        "office": "room", "zone": "landmark",
    }
    hours = {}
    for instance in read("enterprise/locationInstances.json", []):
        weekly = schema_org_hours(instance.get("operationHours"))
        if weekly:
            hours[instance["parent"]] = weekly
    pois = {"type": "FeatureCollection", "features": []}
    pid = 0
    # Locations without a footprint (stadium, track) sit on their node.
    for node_ref in (
        ref for loc in locations if not loc["polygons"] for ref in loc["nodes"]
    ):
        node = nodes.get(node_ref["id"])
        if node:
            space_center[node_ref["id"]] = node["geometry"]["coordinates"]
    # Each floor's main walking network (largest same-floor component).
    parent = {}

    def find(node_id):
        parent.setdefault(node_id, node_id)
        while parent[node_id] != node_id:
            parent[node_id] = parent[parent[node_id]]
            node_id = parent[node_id]
        return node_id

    for a, b in seen_edges:
        parent[find(a)] = find(b)
    component_size = defaultdict(int)
    for node_id in nodes:
        component_size[find(node_id)] += 1
    main_component = {}
    for node_id, node in nodes.items():
        map_id = node["properties"]["map"]
        best = main_component.get(map_id)
        if best is None or component_size[find(node_id)] > component_size[best]:
            main_component[map_id] = find(node_id)

    spurs = set()

    def add_entry_spur(point, map_id, candidates):
        """POI -> its own entry node, so it never snaps to a nearby node
        of another network (a subway exit, a parkade lobby)."""
        # Entry nodes on a floor's detached islands (subway exits, parkade
        # lobbies, a stray lot node) would strand the POI: let it snap to
        # the nearest vertex instead.
        entries = [
            node_id for node_id in candidates
            if node_id in nodes
            and nodes[node_id]["properties"]["map"] == map_id
            and (hospital or find(node_id) == main_component[map_id])
        ]
        if hospital:
            # Use the location's own source entry (including detached wings).
            # A missing entry remains isolated instead of snapping through a
            # wall into another building or floor's nearby corridor.
            entry = min(entries, key=lambda n: dist_m(point, nodes[n]["geometry"]["coordinates"], point[1])) if entries else None
            target = vertex[entry] if entry else [round(point[0] + level_of(map_id)*LEVEL_EPSILON, 9), point[1]]
            routes["features"].append({"type": "Feature", "geometry": {"type": "Point", "coordinates": target},
                "properties": {"network_type": "destination", "level_id": level_of(map_id), "source_coordinate": point,
                               "source_node_id": entry, **building_tags(map_id)}})
            return
        if not entries:
            return
        level = level_of(map_id)
        start = [round(point[0] + level * LEVEL_EPSILON, 9), point[1]]
        if coord_owner.get(tuple(start), map_id) != map_id:
            return  # another floor's vertex; leave the POI to snap
        entry = min(
            entries,
            key=lambda node_id: dist_m(
                point, nodes[node_id]["geometry"]["coordinates"], point[1]
            ),
        )
        key = (tuple(start), entry)
        if key in spurs or start == vertex[entry]:
            return
        spurs.add(key)
        coord_owner[tuple(start)] = map_id
        routes["features"].append(line_feature(
            [start, vertex[entry]], level,
            "outdoor" if map_id in outdoor_maps else "corridor",
            **building_tags(map_id),
        ))

    for loc in sorted(locations, key=lambda l: l["id"]):
        for ref in loc["polygons"] or loc["nodes"][:1]:
            map_id, space_id = ref["map"], ref["id"]
            if map_id not in floors or space_id not in space_center:
                continue
            building = building_of_map.get(map_id)
            meta = {"category": loc["type"]}
            if hospital:
                meta.update(source_location_id=loc["id"], source_map_id=map_id,
                            building_name=building["name"] if building else "Campus",
                            floor_name=floors[map_id]["name"],
                            outdoor=map_id in outdoor_maps)
                primary = category_by_id.get(loc.get("primaryCategory"))
                memberships = [c for c in categories if loc["id"] in category_members[c["id"]]]
                meta["category_ids"] = [c["id"] for c in memberships]
                meta["direct_category_ids"] = [c["id"] for c in categories if loc["id"] in c.get("locations", [])]
                meta["category_names"] = [c["name"] for c in memberships]
                meta["category"] = primary["name"] if primary else (memberships[0]["name"] if memberships else "Location")
                meta["category_color"] = primary.get("color", "#666666") if primary else "#666666"
                meta["category_icon"] = primary.get("iconFromDefaultList", "information") if primary else "information"
                meta["keywords"] = meta["category_names"]
                if map_id in outdoor_maps:
                    meta["display_floor"] = OUTDOOR_VIEW_LEVEL
                    meta["floor_name"] = "Outdoors"
                if loc["name"] == "Breast Health Clinic & Bone Density":
                    meta["keywords"] += ["Breast Health Imaging Center"]
            if loc.get("tags"):
                meta["keywords"] = meta.get("keywords", []) + loc["tags"]
            if loc.get("description"):
                meta["description"] = loc["description"]
            if public_url(loc.get("logo")):
                meta["logo"] = asset_url(loc["logo"])
            if hospital:
                images = [asset_url(loc.get("picture"))] + [asset_url(g.get("image")) for g in loc.get("gallery", [])]
                meta["images"] = list(dict.fromkeys(image for image in images if image))
            if loc.get("phone"):
                meta["phone"] = (loc["phone"] or {}).get("number")
            social = dict(loc.get("social") or {})
            website = public_url(social.pop("website", None))
            if website:
                meta["link"] = website
            social = {k: v for k, v in social.items() if public_url(v)}
            if social:
                meta["social"] = social
            states = [st.get("type") for st in loc.get("states") or []]
            if states and states[0]:
                meta["status"] = states[0]
            weekly = hours.get(loc["id"]) or schema_org_hours(
                loc.get("operationHours")
            )
            if weekly:
                meta["openHours"] = weekly
            meta = {k: v for k, v in meta.items() if v}
            pid += 1
            lng, lat = (round(v, 7) for v in space_center[space_id][:2])
            add_entry_spur(
                [lng, lat], map_id,
                [r["id"] for r in loc["nodes"]]
                + space_entry_nodes.get(space_id, []),
            )
            poi = point_feature(
                pid, loc["name"].strip(), poi_types.get(loc["type"], "room"),
                building["id"] if building else "campus", level_of(map_id),
                lng, lat, **meta,
            )
            if hospital:
                # Source smart labels favour public destinations over dense
                # room numbers; numbered rooms remain searchable/clickable.
                room_number = re.fullmatch(r"[A-Za-z]{0,4}\d[\w. -]*", loc["name"])
                poi["properties"]["map_label"] = loc.get("hidden") is False and not room_number
                if map_id in outdoor_maps:
                    poi["properties"]["display_floor"] = OUTDOOR_VIEW_LEVEL
            pois["features"].append(poi)

    # Compact JSON (and listed in .prettierignore): a real campus is ~10x a
    # mall, and pretty-printing would balloon the bundled fixture.
    os.makedirs(out_dir, exist_ok=True)
    if hospital:
        from shapely.geometry import Polygon, shape, mapping
        from shapely.ops import unary_union
        from shapely import make_valid

        floor_features = {f["properties"]["id"]: f for f in read("floor.geojson")["features"]}
        floor_stacks = []
        context_features = []
        for stack in stacks:
            if stack["type"] != "Building":
                continue
            building_id = building_of_map[stack["maps"][0]]["id"]
            floor_list = []
            for map_id in stack["maps"]:
                floor_shape = shape(floor_features[map_id]["geometry"])
                floor_list.append({"id": map_id, "level": level_of(map_id),
                                   "name": floors[map_id]["name"], "shortName": floors[map_id].get("shortName", ""),
                                   "bounds": list(floor_shape.bounds)})
            floor_stacks.append({"id": building_id, "name": stack["name"], "shortName": stack.get("shortName", ""),
                                 "defaultFloor": level_of(stack["defaultFloor"]), "floors": floor_list})
            for target in floor_list:
                selected = [f for f in indoor_map["features"] if f["properties"].get("source_map_id") == target["id"]]
                openings = unary_union([Polygon(ring) for f in selected if f["properties"]["feature_type"] == "corridor"
                                        for ring in f["geometry"]["coordinates"][1:]])
                if openings.is_empty:
                    continue
                # Trace an opening downward until the nearest actual floor covers it.
                for lower in sorted([f for f in floor_list if f["level"] < target["level"]], key=lambda f: -f["level"]):
                    below = [f for f in indoor_map["features"] if f["properties"].get("source_map_id") == lower["id"]]
                    coverage = []
                    for original in below:
                        props = original["properties"]
                        if props["feature_type"] not in {"unit", "wall", "corridor", "vertical_connection"}:
                            continue
                        geometry = make_valid(shape(original["geometry"]))
                        if props["feature_type"] == "corridor":
                            coverage.append(geometry)
                        clipped = geometry.intersection(openings)
                        parts = [clipped] if clipped.geom_type == "Polygon" else list(getattr(clipped, "geoms", []))
                        for index, part in enumerate(parts):
                            if part.geom_type != "Polygon" or part.area < 1e-16:
                                continue
                            context_features.append({"type": "Feature", "id": f"context-{target['level']}-{original['id']}-{index}",
                                "geometry": mapping(part), "properties": {**props,
                                    "view_context": True, "context_for_level_id": target["level"],
                                    "source_unit_id": original["id"], "context_depth": target["level"] - lower["level"]}})
                    openings = openings.difference(unary_union(coverage))
                    if openings.is_empty:
                        break
        with open(os.path.join(out_dir, "floor-stacks.json"), "w") as fh:
            json.dump(floor_stacks, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        with open(os.path.join(out_dir, "floor-context.geojson"), "w") as fh:
            json.dump({"type": "FeatureCollection", "features": context_features}, fh, separators=(",", ":"))
            fh.write("\n")
        print("floor context:", len(context_features), "clipped source polygons")
        with open(os.path.join(out_dir, "categories.json"), "w") as fh:
            json.dump([{k: c.get(k) for k in ("id", "name", "children", "color", "iconFromDefaultList")} for c in categories], fh, indent=2)
            fh.write("\n")
    for filename, data in (
        ("indoor-map.geojson", indoor_map),
        ("indoor-routes.geojson", routes),
        ("pois.geojson", pois),
    ):
        path = os.path.join(out_dir, filename)
        with open(path, "w") as fh:
            json.dump(data, fh, separators=(",", ":"), ensure_ascii=False)
            fh.write("\n")
        print("wrote", path, len(data["features"]), "features")
    print("floors:", {
        level_of(m): floors[m]["name"].strip()
        for m in sorted(floors, key=level_of)
        if m not in outdoor_maps
    })
    rings = [f["geometry"]["coordinates"][0] for f in indoor_map["features"]]
    xs = [c[0] for ring in rings for c in ring]
    ys = [c[1] for ring in rings for c in ring]
    print("centre:", round((min(xs) + max(xs)) / 2, 6),
          round((min(ys) + max(ys)) / 2, 6),
          f"span {dist_m([min(xs), min(ys)], [max(xs), max(ys)], ys[0]):.0f} m")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
