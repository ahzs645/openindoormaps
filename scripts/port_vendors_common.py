#!/usr/bin/env python3
"""Shared helpers for porting vendor demo venues to OpenIndoorMaps fixtures.

Each vendor script converts its capture into the repo's indoor data model
(see docs/viewer-data-models.md and scripts/generate-galleria-fixture.py):

- indoor-map.geojson: floor_outline / corridor / unit / vertical_connection
  polygons plus vertical_detail lines, all with numeric ``level_id``.
- indoor-routes.geojson: corridor LineStrings per floor plus vertical edges
  (stairs cost 60s inaccessible, escalator 45s up-only, elevator 120s
  accessible) whose endpoint XYs exactly match corridor vertices so the
  client-side graph connects across floors.
- pois.geojson: Point features {building_id, floor, id, metadata, name, type}.

Routing graphs here are *synthesized* from real unit/transition geometry
(spine through vertical-transition anchors + spurs to unit centroids);
only names, categories, footprints and transition positions are vendor data.
"""
import json
import math
import os
import sys
from collections import defaultdict

# Root of the saved vendor captures ("indoor map references"). Override with
# OIM_REFERENCE_DIR=/path/to/captures when running the port scripts.
REFERENCE_ROOT = os.environ.get(
    "OIM_REFERENCE_DIR",
    os.path.expanduser("~/Downloads/Indoor Map/indoor map references"),
)


# ---- geo math (local equirectangular approximation) ----

def meters_per_degree(lat):
    return (111320.0 * math.cos(math.radians(lat)), 111320.0)


def dist_m(a, b, lat):
    mx, my = meters_per_degree(lat)
    return math.hypot((a[0] - b[0]) * mx, (a[1] - b[1]) * my)


def centroid(ring):
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    n = max(len(pts), 1)
    return [sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n]


def bbox_of_rings(rings):
    xs = [c[0] for r in rings for c in r]
    ys = [c[1] for r in rings for c in r]
    return (min(xs), min(ys), max(xs), max(ys))


def offset_point(lng, lat, dx_m, dy_m):
    mx, my = meters_per_degree(lat)
    return [lng + dx_m / mx, lat + dy_m / my]


def square_ring(cx, cy, half_m, lat):
    return [
        offset_point(cx, cy, -half_m, -half_m),
        offset_point(cx, cy, half_m, -half_m),
        offset_point(cx, cy, half_m, half_m),
        offset_point(cx, cy, -half_m, half_m),
        offset_point(cx, cy, -half_m, -half_m),
    ]


# ---- feature builders (mirror generate-galleria-fixture.py schema) ----

def polygon_feature(fid, name, feature_type, level_id, ring, **extra):
    props = {"feature_type": feature_type, "level_id": level_id, "name": name}
    props.update(extra)
    return {
        "type": "Feature",
        "id": fid,
        "properties": props,
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def line_feature(coords, level_id, network_type, **extra):
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
        "geometry": {"type": "LineString", "coordinates": coords},
    }


WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
            "Saturday", "Sunday")


def schema_org_hours(specs):
    """Mappedin schema.org OpeningHoursSpecification list -> weekly hours.

    Output is the POI ``metadata.openHours`` shape shared with Pointr:
    ``{"Monday": [["09:00", "20:00"]], ...}``; absent days are closed.
    ``PublicHolidays`` entries are dropped (no holiday calendar client-side).
    """
    weekly = {}
    for spec in specs or []:
        opens, closes = spec.get("opens"), spec.get("closes")
        if not opens or not closes or opens == closes == "00:00":
            continue
        for day in spec.get("dayOfWeek") or []:
            if day in WEEKDAYS:
                weekly.setdefault(day, []).append([opens, closes])
    return {day: weekly[day] for day in WEEKDAYS if day in weekly} or None


def point_feature(pid, name, ptype, building_id, floor, lng, lat, **metadata):
    return {
        "type": "Feature",
        "id": pid,
        "properties": {
            "building_id": building_id,
            "floor": floor,
            "id": pid,
            "metadata": dict(metadata),
            "name": name,
            "type": ptype,
        },
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
    }


# ---- vertical detail decoration (treads / chevrons / cross) ----

def _detail_line(vcid, ctype, level, coords):
    return {
        "type": "Feature",
        "properties": {
            "connection_type": ctype,
            "feature_type": "vertical_detail",
            "level_id": level,
            "vertical_connection_id": vcid,
        },
        "geometry": {"type": "LineString", "coordinates": coords},
    }


def detail_for_footprint(vcid, ctype, level, ring):
    """Decorative lines inside a transition footprint (in lng/lat)."""
    x0, y0, x1, y1 = bbox_of_rings([ring])
    lat = (y0 + y1) / 2
    mx, my = meters_per_degree(lat)
    w_m, h_m = (x1 - x0) * mx, (y1 - y0) * my
    if w_m <= 0 or h_m <= 0:
        return []
    # Work in meters relative to footprint center, then convert back.
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    def to_lnglat(dx_m, dy_m):
        return offset_point(cx, cy, dx_m, dy_m)

    lines = []
    if ctype == "stairs":
        for i in range(1, 6):
            x = -w_m / 2 + w_m * i / 6
            lines.append(
                [to_lnglat(x, -h_m / 2 + 0.5), to_lnglat(x, h_m / 2 - 0.5)]
            )
    elif ctype == "escalator":
        for i in range(3):
            x = -w_m / 2 + w_m * (i + 1) / 4
            lines.append(
                [
                    to_lnglat(x - 0.6, -h_m / 2 + 1.0),
                    to_lnglat(x + 0.4, 0),
                    to_lnglat(x - 0.6, h_m / 2 - 1.0),
                ]
            )
    else:  # elevator / fallback cross
        p = 0.4
        lines.append(
            [
                to_lnglat(-w_m / 2 + p, -h_m / 2 + p),
                to_lnglat(w_m / 2 - p, h_m / 2 - p),
            ]
        )
        lines.append(
            [
                to_lnglat(-w_m / 2 + p, h_m / 2 - p),
                to_lnglat(w_m / 2 - p, -h_m / 2 + p),
            ]
        )
    return [_detail_line(vcid, ctype, level, ln) for ln in lines]


# ---- routing synthesis ----

VERTICAL_COST = {"stairs": 60, "escalator": 45, "elevator": 105}
# Elevators: a one-off wait (paid half on boarding, half on leaving) plus a
# short ride per floor, so a 6-floor ride is ~3 min rather than 6 x 2 min.
# One floor = 45 + 15 + 45 = 105 s, close to Pointr's 120 s transition time.
ELEVATOR_BOARD_S = 45
ELEVATOR_RIDE_PER_FLOOR_S = 15
# Elevator stops sit this far (degrees latitude, ~1 cm) from the corridor
# anchor so boarding is its own edge.
ELEVATOR_STOP_EPSILON = 1e-7

# Per-level longitude epsilon (degrees, ~2 cm per level). Route vertices are
# matched by exact coordinate equality, so anchor points shared across floors
# would otherwise let routes change floors without traversing a vertical edge
# (zero-cost "teleporting", which also suppresses floor-change instructions).
# Offsetting each floor's route coordinates keeps within-floor matches exact
# while separating cross-floor vertices. Invisible on the map and in distances.
LEVEL_EPSILON = 2e-7


def level_offset(coord, level):
    return [coord[0] + level * LEVEL_EPSILON, coord[1]]


def solve_affine(pairs):
    """Least-squares fit lng = a*x+b*y+c, lat = d*x+e*y+f.

    pairs: iterable of ((x, y), (lng, lat)). Returns (a, b, c, d, e, f).
    """
    def solve(rows, rhs):
        m = [[0.0] * 3 for _ in range(3)]
        v = [0.0] * 3
        for r, t in zip(rows, rhs):
            for i in range(3):
                v[i] += r[i] * t
                for j in range(3):
                    m[i][j] += r[i] * r[j]
        aug = [m[i] + [v[i]] for i in range(3)]
        for col in range(3):
            piv = max(range(col, 3), key=lambda r: abs(aug[r][col]))
            aug[col], aug[piv] = aug[piv], aug[col]
            pv = aug[col][col] or 1e-12
            aug[col] = [x / pv for x in aug[col]]
            for r in range(3):
                if r != col and aug[r][col]:
                    f = aug[r][col]
                    aug[r] = [a - f * b for a, b in zip(aug[r], aug[col])]
        return [aug[i][3] for i in range(3)]

    rows, lngs, lats = [], [], []
    for (x, y), (lng, lat) in pairs:
        rows.append([x, y, 1.0])
        lngs.append(lng)
        lats.append(lat)
    a, b, c = solve(rows, lngs)
    d, e, f = solve(rows, lats)
    return (a, b, c, d, e, f)


def apply_affine(coef, x, y):
    a, b, c, d, e, f = coef
    return (a * x + b * y + c, d * x + e * y + f)


def robust_affine(pairs, lat_ref, rounds=4, trim=0.1):
    """Iteratively trimmed affine fit; returns (coef, mean_residual_m)."""
    remaining = list(pairs)
    best = None
    for _ in range(rounds):
        coef = solve_affine(remaining)
        scored = []
        for (x, y), (lng, lat) in remaining:
            plng, plat = apply_affine(coef, x, y)
            scored.append(
                (dist_m((plng, plat), (lng, lat), lat_ref), ((x, y), (lng, lat)))
            )
        scored.sort()
        mean = sum(s for s, _ in scored) / len(scored)
        best = (coef, mean)
        keep = max(len(scored) - max(1, int(len(scored) * trim)), 3)
        remaining = [p for _, p in scored[:keep]]
    return best


def ring_area_m2(ring, lat=None):
    if lat is None:
        lat = sum(c[1] for c in ring) / len(ring)
    mx, my = meters_per_degree(lat)
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0] * mx * ring[i + 1][1] * my - ring[i + 1][0] * mx * ring[i][1] * my
    return abs(s) / 2


def point_in_ring(pt, ring):
    x, y = pt
    inside = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        if ((y1 > y) != (y2 > y)) and (
            x < (x2 - x1) * (y - y1) / (y2 - y1) + x1
        ):
            inside = not inside
    return inside


def seg_ring_crossings(a, b, ring):
    """Indices of ring edges properly crossed by segment ab (touching OK)."""
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    hits = []
    for i in range(len(ring) - 1):
        c, d = ring[i], ring[i + 1]
        o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
        if o1 * o2 < 0 and o3 * o4 < 0:
            hits.append(i)
    return hits


def ring_bbox(ring):
    xs = [c[0] for c in ring]
    ys = [c[1] for c in ring]
    return (min(xs), min(ys), max(xs), max(ys))


def build_prm_routes(levels, obstacles_by_level, doors_by_level, transitions,
                     outlines, lat_ref, spacing_m=12.0, max_link_m=60.0, k=3,
                     halo_by_level=None, mesh_halo_m=25.0):
    """Route graph staying in walkable space (sparse PRM).

    levels: sorted level ids.
    obstacles_by_level: {level: [unit rings]} (lng/lat) — never traversed.
    doors_by_level: {level: [(x, y)]} — POI points; each gets a short link
      from the nearest walkable node (crossing at most its own unit).
    transitions: same format as build_routes (anchors become hub nodes).
    outlines: {level: ring} — samples stay inside.
    halo_by_level: {level: [rings]} used to keep samples near the venue
      (units + corridors); samples far from all venue geometry are dropped
      so the mesh does not blanket empty land. Defaults to obstacles.
    Returns a FeatureCollection like build_routes (corridor edges + typed
    vertical edges with per-level epsilon offsets).
    """
    mx, my = meters_per_degree(lat_ref)
    features = []

    for level in levels:
        obstacles = obstacles_by_level.get(level, [])
        bboxes = [ring_bbox(r) for r in obstacles]
        outline = outlines.get(level)
        if outline is None:
            continue
        ox0, oy0, ox1, oy1 = ring_bbox(outline)
        step_x = spacing_m / mx
        step_y = spacing_m / my

        # 1. Walkable grid samples (near venue geometry only).
        halo_rings = (halo_by_level or {}).get(level, obstacles)
        halo_boxes = [ring_bbox(r) for r in halo_rings]

        def near_halo(x, y):
            for x0, y0, x1, y1 in halo_boxes:
                dx = max(x0 - x, 0.0, x - x1)
                dy = max(y0 - y, 0.0, y - y1)
                if (dx * mx) ** 2 + (dy * my) ** 2 <= mesh_halo_m ** 2:
                    return True
            return False

        samples = []
        y = oy0 + step_y / 2
        row = 0
        while y < oy1:
            # Stagger alternate rows for better coverage.
            x = ox0 + step_x / 2 + (step_x / 2 if row % 2 else 0.0)
            while x < ox1:
                if (
                    near_halo(x, y)
                    and point_in_ring((x, y), outline)
                    and not any(
                        point_in_ring((x, y), ob) for ob in obstacles
                    )
                ):
                    samples.append((x, y))
                x += step_x
            y += step_y
            row += 1

        # 2. Hub nodes: samples + transition anchors on this level.
        # Anchors are always hubs (even inside a unit footprint: the door
        # link below then connects them to the floor network, exactly like
        # a POI, so vertical edges always attach to something).
        hubs = list(samples)
        anchors_here = []
        for t in transitions:
            if level in t["anchors"]:
                anchors_here.append(t["anchors"][level])
        hub_keys = {(round(hx, 7), round(hy, 7)) for hx, hy in hubs}
        for ax, ay in anchors_here:
            if (round(ax, 7), round(ay, 7)) not in hub_keys:
                hubs.append((ax, ay))
                hub_keys.add((round(ax, 7), round(ay, 7)))

        def obstacle_of(pt):
            for idx, ob in enumerate(obstacles):
                if point_in_ring(pt, ob):
                    return idx
            return None

        def crossings(a, b):
            """Obstacle indices whose edges segment ab properly crosses."""
            hit = set()
            minx = min(a[0], b[0])
            maxx = max(a[0], b[0])
            miny = min(a[1], b[1])
            maxy = max(a[1], b[1])
            for idx, ob in enumerate(obstacles):
                x0, y0, x1, y1 = bboxes[idx]
                if maxx < x0 or minx > x1 or maxy < y0 or miny > y1:
                    continue
                if seg_ring_crossings(a, b, ob):
                    hit.add(idx)
            return hit

        def meter_dist2(a, b):
            return ((a[0] - b[0]) * mx) ** 2 + ((a[1] - b[1]) * my) ** 2

        # 3. Hub-to-hub visibility edges (k nearest, open space only).
        parent = list(range(len(hubs)))

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        emitted = set()
        for i, h in enumerate(hubs):
            cands = []
            for j, o in enumerate(hubs):
                if i == j:
                    continue
                d2 = meter_dist2(h, o)
                if d2 <= max_link_m ** 2:
                    cands.append((d2, j))
            cands.sort()
            linked = 0
            for _, j in cands:
                if linked >= k:
                    break
                o = hubs[j]
                if crossings(h, o):
                    continue
                key = (min(i, j), max(i, j))
                if key in emitted:
                    linked += 1
                    continue
                emitted.add(key)
                union(i, j)
                a = level_offset([h[0], h[1]], level)
                b = level_offset([o[0], o[1]], level)
                features.append(line_feature([a, b], level, "corridor"))
                linked += 1

        # 3b. Stitch disconnected components with shortest cross-component
        # links so every floor network is routable.
        stitch_count = 0
        for _ in range(len(hubs)):
            comps = defaultdict(list)
            for i in range(len(hubs)):
                comps[find(i)].append(i)
            if len(comps) <= 1:
                break
            best = None
            comp_lists = list(comps.values())
            for x in range(len(comp_lists)):
                for y in range(x + 1, len(comp_lists)):
                    for i in comp_lists[x]:
                        for j in comp_lists[y]:
                            d2 = meter_dist2(hubs[i], hubs[j])
                            if d2 <= (max_link_m * 3) ** 2 and (
                                best is None or d2 < best[0]
                            ):
                                best = (d2, i, j)
            if best is None:
                break
            _, i, j = best
            union(i, j)
            a = level_offset([hubs[i][0], hubs[i][1]], level)
            b = level_offset([hubs[j][0], hubs[j][1]], level)
            features.append(line_feature([a, b], level, "corridor"))
            stitch_count += 1
        if stitch_count:
            print(f"level {level}: stitched {stitch_count} component links")

        # 4. Door links. POIs sharing a unit walk inside their own shop to a
        # single exit door, which links to the nearest walkable hub (crossing
        # at most that unit). POIs in open space link straight to hubs.
        # Transition anchors join as extra door targets so vertical edges
        # always attach to the floor network.
        door_targets = list(doors_by_level.get(level, [])) + anchors_here
        grouped = defaultdict(list)
        for d in door_targets:
            grouped[obstacle_of(d)].append(d)

        def nearest_hub(ref, allowed):
            cands = sorted(
                ((meter_dist2(ref, h), h) for h in hubs),
                key=lambda t: t[0],
            )[:25]
            for _, h in cands:
                if crossings(ref, h) <= allowed:
                    return h, False
            # Fallback: nearest hub regardless, so every POI stays routable.
            if cands:
                return cands[0][1], True
            return None, False

        skipped_doors = 0
        linked = 0
        fallback_links = 0
        for own, members in grouped.items():
            if own is None:
                for d in members:
                    h, fb = nearest_hub(d, set())
                    if h is None or (h[0] == d[0] and h[1] == d[1]):
                        if h is None:
                            skipped_doors += 1
                        continue
                    fallback_links += 1 if fb else 0
                    a = level_offset([h[0], h[1]], level)
                    features.append(
                        line_feature(
                            [a, level_offset([d[0], d[1]], level)],
                            level, "corridor",
                        )
                    )
                    linked += 1
                continue
            ref = members[0]
            exit_hub, exit_fb = nearest_hub(ref, {own})
            if exit_hub is None:
                skipped_doors += len(members)
                continue
            fallback_links += 1 if exit_fb else 0
            a = level_offset([exit_hub[0], exit_hub[1]], level)
            # Exit vertex: reuse the reference POI point when it is not
            # already a hub, else link straight from the hub.
            if (round(ref[0], 7), round(ref[1], 7)) in hub_keys:
                exit_v = level_offset([ref[0], ref[1]], level)
            else:
                exit_v = level_offset([ref[0], ref[1]], level)
                features.append(
                    line_feature([a, list(exit_v)], level, "corridor")
                )
            for d in members:
                door_v = level_offset([d[0], d[1]], level)
                if crossings((d[0], d[1]), (ref[0], ref[1])) <= {own}:
                    if door_v != exit_v:
                        features.append(
                            line_feature(
                                [list(exit_v), door_v], level, "corridor"
                            )
                        )
                    linked += 1
                else:
                    h, fb = nearest_hub(d, {own})
                    if h is None:
                        skipped_doors += 1
                        continue
                    fallback_links += 1 if fb else 0
                    b = level_offset([h[0], h[1]], level)
                    if h[0] != d[0] or h[1] != d[1]:
                        features.append(
                            line_feature([b, door_v], level, "corridor")
                        )
                    linked += 1
        print(f"level {level}: hubs {len(hubs)}, door links {linked} "
              f"(fallback {fallback_links}), "
              f"skipped doors {skipped_doors}/{len(door_targets)}")

    # 5. Vertical edges (anchors shared per transition, epsilon-separated).
    for t in transitions:
        ttype = t["type"]
        floors = sorted(t["floors"])
        if ttype == "elevator":
            features.extend(elevator_edges(t, floors))
            continue
        for lo, hi in zip(floors[:-1], floors[1:]):
            coords = [
                level_offset(list(t["anchors"][lo]), lo),
                level_offset(list(t["anchors"][hi]), hi),
            ]
            extra = {
                "cost": VERTICAL_COST.get(ttype, 60),
                "from_level_id": lo,
                "is_accessible": False,
                "to_level_id": hi,
                "vertical_connection_id": t["id"],
            }
            # Only vendor evidence makes an escalator one-way.
            if t.get("direction") in ("forward", "backward"):
                extra["direction"] = t["direction"]
            features.append(line_feature(coords, None, ttype, **extra))

    return {"type": "FeatureCollection", "features": features}


def elevator_edges(transition, floors):
    """Boarding edges (anchor -> stop, per floor) plus per-floor hops."""
    edges = []

    def stop(level):
        x, y = level_offset(list(transition["anchors"][level]), level)
        return [x, y + ELEVATOR_STOP_EPSILON]

    common = {
        "is_accessible": True,
        "vertical_connection_id": transition["id"],
    }
    for level in floors:
        anchor = level_offset(list(transition["anchors"][level]), level)
        edges.append(line_feature(
            [anchor, stop(level)], None, "elevator",
            cost=ELEVATOR_BOARD_S, from_level_id=level, to_level_id=level,
            **common,
        ))
    for lo, hi in zip(floors[:-1], floors[1:]):
        edges.append(line_feature(
            [stop(lo), stop(hi)], None, "elevator",
            cost=ELEVATOR_RIDE_PER_FLOOR_S, from_level_id=lo, to_level_id=hi,
            **common,
        ))
    return edges


def group_by_proximity(items, tol_m):
    """Cluster (lng, lat, payload) items; returns list of groups.

    Greedy single-link clustering on geographic distance.
    """
    groups = []
    for lng, lat, payload in items:
        placed = False
        for g in groups:
            glng = sum(p[0] for p in g) / len(g)
            glat = sum(p[1] for p in g) / len(g)
            if dist_m((lng, lat), (glng, glat), glat) <= tol_m:
                g.append((lng, lat, payload))
                placed = True
                break
        if not placed:
            groups.append([(lng, lat, payload)])
    return groups


def build_routes(levels, units_by_level, transitions, lat_ref):
    """Synthesize a connected routing graph.

    levels: sorted level ids. units_by_level: {level: [(cx, cy, name)]}.
    transitions: list of dicts {id, type, floors:[levels], anchors:{level:(x,y)}}.
    Returns a FeatureCollection of corridor + vertical LineStrings where every
    vertical endpoint exactly matches a corridor vertex.
    """
    features = []
    spine_points = {}  # level -> list of anchor coords (exact objects reused)
    for level in levels:
        anchors = []
        for t in transitions:
            if level in t["anchors"]:
                anchors.append(t["anchors"][level])
        anchors.sort(key=lambda c: (round(c[0], 7), round(c[1], 7)))
        units = units_by_level.get(level, [])
        if anchors:
            spine = [level_offset(list(c), level) for c in anchors]
        elif units:
            cx = sum(u[0] for u in units) / len(units)
            cy = sum(u[1] for u in units) / len(units)
            spine = [level_offset([cx, cy], level)]
        else:
            continue
        spine_points[level] = spine
        if len(spine) > 1:
            features.append(line_feature(spine, level, "corridor"))
        for (ux, uy, _name) in units:
            target = level_offset([ux, uy], level)
            nearest = min(spine, key=lambda s: (s[0] - ux) ** 2 + (s[1] - uy) ** 2)
            if nearest[0] == target[0] and nearest[1] == target[1]:
                continue
            features.append(
                line_feature([list(nearest), target], level, "corridor")
            )
    for t in transitions:
        ttype = t["type"]
        for a, b in zip(sorted(t["floors"])[:-1], sorted(t["floors"])[1:]):
            if a not in spine_points or b not in spine_points:
                continue
            pa, pb = t["anchors"][a], t["anchors"][b]
            # 'forward' geometry direction runs lower -> upper (up-only escalator).
            lo, hi = (a, b) if a < b else (b, a)
            plo, phi = (pa, pb) if a < b else (pb, pa)
            coords = [level_offset(list(plo), lo), level_offset(list(phi), hi)]
            extra = {
                "cost": VERTICAL_COST.get(ttype, 60),
                "from_level_id": lo,
                "is_accessible": ttype == "elevator",
                "to_level_id": hi,
                "vertical_connection_id": t["id"],
            }
            if ttype == "escalator":
                extra["direction"] = "forward"
            features.append(line_feature(coords, None, ttype, **extra))
    return {"type": "FeatureCollection", "features": features}


def write_fixture(out_dir, indoor_map, routes, pois):
    os.makedirs(out_dir, exist_ok=True)
    for filename, data in (
        ("indoor-map.geojson", indoor_map),
        ("indoor-routes.geojson", routes),
        ("pois.geojson", pois),
    ):
        path = os.path.join(out_dir, filename)
        with open(path, "w") as fh:
            json.dump(data, fh, indent=2)
        print("wrote", path, len(data["features"]), "features")


def repo_path(*parts):
    return os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", *parts)
    )


def load_json(path):
    with open(path) as fh:
        return json.load(fh)


def load_json_lenient(path):
    """Parse JSON payloads saved as *.html that may contain control chars."""
    with open(path) as fh:
        return json.loads(fh.read(), strict=False)


def main(argv):
    raise NotImplementedError


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
