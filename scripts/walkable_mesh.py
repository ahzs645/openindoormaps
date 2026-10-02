"""Constrained floor meshes for captured polygon geometry (Shapely >= 2.1).

Triangle portals preserve narrow passages; visibility shortcuts reduce turns.
Every emitted walking edge is checked against the source obstacle cores.
Disconnected rooms stay disconnected. Destination points, including blocked
ones, are retained so the viewer cannot silently snap them into another room.
"""
from collections import defaultdict
import math

import shapely
from shapely.affinity import affine_transform
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree

from port_vendors_common import level_offset, line_feature, meters_per_degree


def build_walkable_mesh(allowed_by_level, blocked_by_level, endpoints_by_level,
                        lat_ref, origin, shortcut_m=25,
                        preferred_by_level=None, aisle_penalty=4,
                        axis_preference=0):
    """Return (GeoJSON, diagnostics). Inputs use unshifted WGS84 coordinates.

    Obstacles may be (geometry, tolerance_metres) tuples. Layer unions are
    inset by that documented source tolerance before meshing. A 1 cm margin
    then permits 2 mm topology-preserving simplification. The obstacle cores
    are still checked after output-coordinate rounding.
    No component stitching, unconstrained spurs, or obstacle exceptions.
    Optional preferred areas keep their own triangle boundaries/portals;
    routing_cost_factor prefers their aisles while preserving department
    access. The default penalty is 4 (fully off-aisle edges cost 5x).
    Optional axis_preference adds wall-checked right-angle links inside
    public aisles and penalizes diagonals relative to their dominant floor
    orientation. It is a selection preference; walking time stays physical.
    """
    mx, my = meters_per_degree(lat_ref)
    ox, oy = origin

    def project(g):
        return affine_transform(g, [mx, 0, 0, my, -ox * mx, -oy * my])

    def coord(p, level):
        return level_offset([round(ox + p[0] / mx, 9),
                             round(oy + p[1] / my, 9)], level)

    features, diagnostics = [], []
    for level in sorted(allowed_by_level):
        allowed = unary_union([project(g) for g in allowed_by_level[level]])
        layers = defaultdict(list)
        for obstacle in blocked_by_level.get(level, []):
            g, tolerance = obstacle if isinstance(obstacle, tuple) else (obstacle, 0)
            layers[tolerance].append(project(g))
        blocked = unary_union([
            unary_union(parts).buffer(-tolerance, join_style="mitre")
            if tolerance else unary_union(parts)
            for tolerance, parts in layers.items()
        ])
        free = allowed.simplify(.002, preserve_topology=True).difference(
            blocked.buffer(.01, join_style="mitre").simplify(
                .002, preserve_topology=True)
        ).simplify(.002, preserve_topology=True)
        # Tolerance only covers coordinate rounding (~0.1 mm), not walls.
        area_check = prep(free.buffer(.001))
        obstacle_check = prep(blocked)
        preferred = unary_union([project(g) for g in
                                 (preferred_by_level or {}).get(level, [])])
        # Infer the floor's own orientation, rather than snapping to compass
        # north. Quantized tile boundaries vary slightly; long aisle edges
        # dominate the angle estimate. Both perpendicular axes share a bin.
        directions = defaultdict(list)
        if axis_preference and not preferred.is_empty:
            for poly in getattr(preferred, "geoms", [preferred]):
                if poly.geom_type != "Polygon":
                    continue
                for ring in [poly.exterior, *poly.interiors]:
                    for a, b in zip(ring.coords, list(ring.coords)[1:]):
                        length = math.dist(a, b)
                        if length < 1:
                            continue
                        angle = math.atan2(b[1] - a[1], b[0] - a[0]) % (math.pi / 2)
                        directions[round(math.degrees(angle)) % 90].append((angle, length))
        axis = None
        if directions:
            peak = max(directions, key=lambda k: sum(l for _, l in directions[k]))
            near = [v for k, values in directions.items()
                    if min((k - peak) % 90, (peak - k) % 90) <= 2 for v in values]
            axis = math.atan2(sum(math.sin(a * 4) * l for a, l in near),
                              sum(math.cos(a * 4) * l for a, l in near)) / 4
        cosine, sine = math.cos(axis or 0), math.sin(axis or 0)

        def rotate(p):
            return (p[0] * cosine + p[1] * sine, -p[0] * sine + p[1] * cosine)

        def unrotate(p):
            return (p[0] * cosine - p[1] * sine, p[0] * sine + p[1] * cosine)
        if preferred.is_empty:
            triangles = list(shapely.constrained_delaunay_triangles(free).geoms)
        else:
            # Preserve aisle boundaries even where department footprints
            # overlap them. Otherwise unioning all spaces erases the aisles
            # and leaves no graph vertices along the public walking network.
            preferred = free.intersection(preferred.simplify(.02, preserve_topology=True))
            triangles = [tri for area in (preferred, free.difference(preferred))
                         for tri in shapely.constrained_delaunay_triangles(area).geoms]
        nodes, node_index = [], {}
        emitted, edge_count = set(), 0

        def node(p):
            key = (round(p[0], 6), round(p[1], 6))
            if key not in node_index:
                node_index[key] = len(nodes)
                nodes.append(key)
            return node_index[key]

        def visible(a, b):
            line = LineString([a, b])
            return (area_check.covers(line)
                    and not obstacle_check.intersects(line))

        def edge(i, j):
            nonlocal edge_count
            if i == j:
                return
            key = tuple(sorted((i, j)))
            if key in emitted or not visible(nodes[i], nodes[j]):
                return
            coords = [coord(nodes[i], level), coord(nodes[j], level)]
            if coords[0] == coords[1]:
                return
            # Validate what the viewer will receive, not just mesh precision.
            rounded = [( (c[0] - level * 2e-7 - ox) * mx,
                         (c[1] - oy) * my) for c in coords]
            if not visible(*rounded):
                return
            emitted.add(key)
            feature = line_feature(coords, level, "corridor", inferred=True)
            if not preferred.is_empty:
                line = LineString(rounded)
                outside = line.difference(preferred).length
                # A preference affects route selection, not walking time.
                # Keep departmental access possible where no aisle is mapped.
                factor = 1 + aisle_penalty * outside / line.length
                if axis is not None:
                    a, b = rounded
                    angle = math.atan2(b[1] - a[1], b[0] - a[0]) - axis
                    factor += axis_preference * math.sin(2 * angle) ** 2 * (1 - outside / line.length)
                if factor > 1.001:
                    feature["properties"]["routing_cost_factor"] = round(factor, 5)
            # Nullable connector fields are irrelevant to ordinary walking
            # edges. Keep the generated mesh compact for browser loading.
            feature["properties"] = {k: v for k, v in feature["properties"].items()
                                     if v is not None}
            features.append(feature)
            edge_count += 1

        # A portal is shared only when two triangles share a complete edge.
        # This does not bridge rooms touching at one point.
        sides = defaultdict(list)
        portals = defaultdict(list)
        for i, tri in enumerate(triangles):
            ring = list(tri.exterior.coords)
            for a, b in zip(ring, ring[1:]):
                sides[tuple(sorted((a, b)))].append(i)
        for (a, b), owners in sides.items():
            if len(owners) != 2:
                continue
            idx = node(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
            for owner in owners:
                portals[owner].append(idx)
        for i, tri in enumerate(triangles):
            points = portals[i]
            if not points:
                p = tri.representative_point()
                points.append(node((p.x, p.y)))
            for a in points:
                for b in points:
                    edge(a, b)

        # Attach each known destination to portals of its own triangle only.
        # Points behind walls or outside the source walkable area are isolated.
        tree = STRtree(triangles)
        attached, isolated = 0, 0
        for lng, lat in sorted(set(endpoints_by_level.get(level, []))):
            p = project(Point(lng, lat))
            idx = node((p.x, p.y))
            before = len(emitted)
            for owner in tree.query(p, predicate="covered_by"):
                for portal in portals[int(owner)]:
                    edge(idx, portal)
            linked = len(emitted) > before or any(idx in e for e in emitted)
            attached += int(linked)
            isolated += int(not linked)
            # Also retain unreachable endpoints; their graph vertices have no
            # edges, which produces an explicit no-route result in the viewer.
            features.append({"type": "Feature", "properties": {
                "level_id": level, "network_type": "destination",
                "is_routable": linked,
                "source_coordinate": [lng, lat],
            }, "geometry": {"type": "Point", "coordinates":
                             coord(nodes[idx], level)}})

        # Longer visible links straighten paths while retaining the complete
        # portal topology. One farthest link in each quadrant avoids a dense
        # all-to-all graph; every shortcut uses the same strict geometry check.
        active = sorted({i for pair in emitted for i in pair})
        node_tree = STRtree([Point(nodes[i]) for i in active])
        for i in active:
            a = nodes[i]
            candidates = defaultdict(list)
            for candidate in node_tree.query(Point(a), predicate="dwithin",
                                             distance=shortcut_m):
                j = active[int(candidate)]
                if i == j:
                    continue
                b = nodes[j]
                dx, dy = b[0] - a[0], b[1] - a[1]
                octant = int((math.atan2(dy, dx) + math.pi) / (math.pi / 2)) % 4
                candidates[octant].append((dx * dx + dy * dy, j))
            for cands in candidates.values():
                orthogonal = False
                for _, j in sorted(cands, reverse=True):
                    direct = visible(a, nodes[j])
                    if axis is not None and not orthogonal:
                        # A clear right-angle turn may exist even when the
                        # diagonal cuts across the inside corner's wall.
                        ar, br = rotate(a), rotate(nodes[j])
                        for bend in (unrotate((ar[0], br[1])), unrotate((br[0], ar[1]))):
                            if (math.dist(a, bend) > .1 and math.dist(nodes[j], bend) > .1
                                    and visible(a, bend) and visible(bend, nodes[j])
                                    and preferred.covers(LineString([a, bend, nodes[j]]))):
                                k = node(bend)
                                edge(i, k)
                                edge(k, j)
                                orthogonal = True
                                break
                    if direct:
                        edge(i, j)
                        break
        diagnostics.append({"level": level, "triangles": len(triangles),
                            "walking_edges": edge_count,
                            "attached_endpoints": attached,
                            "isolated_endpoints": isolated,
                            "preferred_axis_degrees": round(math.degrees(axis) % 90, 2)
                            if axis is not None else None})
    return {"type": "FeatureCollection", "features": features}, diagnostics
