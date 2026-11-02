"""Common geometric navigation-graph model and metrics for the reference comparison.

Every input (our floor files, Mappedin MVF bundles, Situm building JSON) is
loaded into the same model: straight segments between 2-D points in metres,
with per-node `dest` (destination/arrival) and `door` (door/opening/entrance
connection) marks. All metrics below are computed with one definition for every
dataset. Only the standard library is used. Reference data is read
as JSON only; nothing from a capture is executed.
"""

from __future__ import annotations

import glob
import json
import math
import os
from collections import Counter, defaultdict

# --------------------------------------------------------------------------
# Model


class Graph:
    def __init__(self, label: str):
        self.label = label
        self.pos: dict = {}  # node -> (x, y) metres
        self.edges: set = set()  # frozenset({u, v}) straight segments
        self.dest: set = set()
        self.door: set = set()

    def add_node(self, n, p):
        if n not in self.pos:
            self.pos[n] = (float(p[0]), float(p[1]))

    def add_edge(self, u, v):
        if u != v:
            self.edges.add(frozenset((u, v)))

    def add_polyline(self, key, a, b, pts):
        """Polyline from node a to node b; interior vertices become degree-2 nodes."""
        self.add_node(a, pts[0])
        self.add_node(b, pts[-1])
        prev = a
        for i, p in enumerate(pts[1:-1]):
            n = (key, i)
            self.add_node(n, p)
            self.add_edge(prev, n)
            prev = n
        self.add_edge(prev, b)

    def adjacency(self):
        adj = defaultdict(set)
        for e in self.edges:
            u, v = tuple(e)
            adj[u].add(v)
            adj[v].add(u)
        return adj


def seg_len(g, u, v):
    a, b = g.pos[u], g.pos[v]
    return math.hypot(b[0] - a[0], b[1] - a[1])


# --------------------------------------------------------------------------
# Drawn-network union ("view B"): identical rules for every dataset.


def planarize(g: Graph, grid=0.1, tol=0.15) -> Graph:
    """Snap vertices to a `grid` metre lattice, merge coincident vertices,
    split a segment at any vertex within `tol` of its interior, and drop
    duplicate segments. Crossing segments are NOT given a junction (neither
    routing model has one there); they are counted separately."""
    out = Graph(g.label + " (drawn union)")
    key = {}
    for n, (x, y) in g.pos.items():
        k = (round(x / grid), round(y / grid))
        key[n] = k
        if k not in out.pos:
            out.pos[k] = (x, y)  # first original coordinate represents the merged vertex
        if n in g.dest:
            out.dest.add(k)
        if n in g.door:
            out.door.add(k)
    segs = set()
    for e in g.edges:
        u, v = tuple(e)
        a, b = key[u], key[v]
        if a != b:
            segs.add(frozenset((a, b)))
    # spatial hash of vertices
    cell = 2.0
    buckets = defaultdict(list)
    for k, (x, y) in out.pos.items():
        buckets[(int(math.floor(x / cell)), int(math.floor(y / cell)))].append(k)
    for s in segs:
        a, b = tuple(s)
        (ax, ay), (bx, by) = out.pos[a], out.pos[b]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        on = []
        for cx in range(int(math.floor((min(ax, bx) - tol) / cell)), int(math.floor((max(ax, bx) + tol) / cell)) + 1):
            for cy in range(int(math.floor((min(ay, by) - tol) / cell)), int(math.floor((max(ay, by) + tol) / cell)) + 1):
                for k in buckets.get((cx, cy), ()):
                    if k == a or k == b:
                        continue
                    px, py = out.pos[k]
                    t = ((px - ax) * dx + (py - ay) * dy) / L2
                    if t <= 1e-9 or t >= 1 - 1e-9:
                        continue
                    qx, qy = ax + t * dx, ay + t * dy
                    if math.hypot(px - qx, py - qy) <= tol:
                        on.append((t, k))
        chain = [a] + [k for _, k in sorted(on)] + [b]
        for p, q in zip(chain, chain[1:]):
            out.add_edge(p, q)
    used = {x for e in out.edges for x in e}
    for k in list(out.pos):
        if k not in used:
            del out.pos[k]
            out.dest.discard(k)
            out.door.discard(k)
    return out


def proper_crossings(g: Graph) -> int:
    """Segment pairs that cross in their interiors without a shared vertex."""
    cell = 4.0
    buckets = defaultdict(list)
    segs = [tuple(e) for e in g.edges]
    for i, (u, v) in enumerate(segs):
        (ax, ay), (bx, by) = g.pos[u], g.pos[v]
        for cx in range(int(math.floor(min(ax, bx) / cell)), int(math.floor(max(ax, bx) / cell)) + 1):
            for cy in range(int(math.floor(min(ay, by) / cell)), int(math.floor(max(ay, by) / cell)) + 1):
                buckets[(cx, cy)].append(i)

    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    seen = set()
    count = 0
    for idx in buckets.values():
        for ii in range(len(idx)):
            for jj in range(ii + 1, len(idx)):
                i, j = idx[ii], idx[jj]
                if (i, j) in seen:
                    continue
                seen.add((i, j))
                a, b = segs[i]
                c, d = segs[j]
                if len({a, b, c, d}) < 4:
                    continue
                p1, p2, p3, p4 = g.pos[a], g.pos[b], g.pos[c], g.pos[d]
                d1, d2 = orient(p3, p4, p1), orient(p3, p4, p2)
                d3, d4 = orient(p1, p2, p3), orient(p1, p2, p4)
                eps = 1e-9
                if ((d1 > eps and d2 < -eps) or (d1 < -eps and d2 > eps)) and (
                    (d3 > eps and d4 < -eps) or (d3 < -eps and d4 > eps)
                ):
                    count += 1
    return count


# --------------------------------------------------------------------------
# Metrics


def quantiles(xs, qs=(0.1, 0.25, 0.5, 0.75, 0.9)):
    if not xs:
        return None
    s = sorted(xs)
    out = {}
    for q in qs:
        k = (len(s) - 1) * q
        f = math.floor(k)
        c = min(f + 1, len(s) - 1)
        out[f"p{int(q * 100)}"] = round(s[f] + (s[c] - s[f]) * (k - f), 3)
    out["n"] = len(s)
    out["mean"] = round(sum(s) / len(s), 3)
    return out


def heading(p, q):
    return math.atan2(q[1] - p[1], q[0] - p[0])


def turn_deg(h1, h2):
    d = math.degrees(h2 - h1)
    while d > 180:
        d -= 360
    while d <= -180:
        d += 360
    return d


def components(nodes, adj):
    seen, comps = set(), []
    for s in nodes:
        if s in seen:
            continue
        stack, size = [s], 0
        seen.add(s)
        while stack:
            x = stack.pop()
            size += 1
            for y in adj[x]:
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
        comps.append(size)
    return comps


def chains(g: Graph, adj):
    """Maximal degree-2 chains between anchors (degree != 2) plus pure rings."""
    deg = {n: len(adj[n]) for n in g.pos}
    anchors = [n for n in g.pos if deg[n] != 2 and deg[n] > 0]
    used = set()
    out = []
    for a in anchors:
        for nb in adj[a]:
            e = frozenset((a, nb))
            if e in used:
                continue
            path = [a, nb]
            used.add(e)
            while deg[path[-1]] == 2:
                nxt = [x for x in adj[path[-1]] if x != path[-2]]
                if not nxt:
                    break
                e2 = frozenset((path[-1], nxt[0]))
                if e2 in used:
                    break
                used.add(e2)
                path.append(nxt[0])
            out.append(path)
    # rings of degree-2 nodes only
    for e in g.edges:
        if e in used:
            continue
        u, v = tuple(e)
        path = [u, v]
        used.add(e)
        while path[-1] != u:
            nxt = [x for x in adj[path[-1]] if x != path[-2]]
            e2 = frozenset((path[-1], nxt[0]))
            if e2 in used:
                break
            used.add(e2)
            path.append(nxt[0])
        out.append(path)
    return out


def path_len(g, path):
    return sum(seg_len(g, path[i], path[i + 1]) for i in range(len(path) - 1))


def point_along(g, path, dist):
    """Direction from path[0] toward the point `dist` metres along the path."""
    acc = 0.0
    p0 = g.pos[path[0]]
    for i in range(len(path) - 1):
        a, b = g.pos[path[i]], g.pos[path[i + 1]]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if acc + L >= dist and L > 0:
            t = (dist - acc) / L
            return heading(p0, (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
        acc += L
    last = g.pos[path[-1]]
    if last == p0:
        return None
    return heading(p0, last)


def polyline_stats(g, path, min_seg=0.05):
    """Turns > 5 deg, straight runs (>= 5 m, < 3 deg from run start heading),
    zigzags (turn > 120 deg with an adjacent segment <= 2 m)."""
    segs = []
    for i in range(len(path) - 1):
        a, b = g.pos[path[i]], g.pos[path[i + 1]]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L >= min_seg:
            segs.append((heading(a, b), L))
    turns5 = 0
    zig = 0
    for (h1, l1), (h2, l2) in zip(segs, segs[1:]):
        t = abs(turn_deg(h1, h2))
        if t > 5:
            turns5 += 1
        if t > 120 and (l1 <= 2 or l2 <= 2):
            zig += 1
    straight = 0.0
    i = 0
    while i < len(segs):
        h0 = segs[i][0]
        run = 0.0
        j = i
        while j < len(segs) and abs(turn_deg(h0, segs[j][0])) < 3:
            run += segs[j][1]
            j += 1
        if run >= 5:
            straight += run
        i = j if j > i else i + 1
    return turns5, zig, straight, sum(L for _, L in segs)


def jogs(g, path, min_seg=0.05):
    """Net-zero jogs: two consecutive turns > 5 deg of opposite sign, at most
    3 m apart along the path, whose sum is < 5 deg (a sideways offset, as
    opposed to a rounded corner, whose turns share one sign)."""
    segs = []
    for i in range(len(path) - 1):
        a, b = g.pos[path[i]], g.pos[path[i + 1]]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L >= min_seg:
            segs.append((heading(a, b), L))
    turns = []  # (distance along, signed turn)
    acc = 0.0
    for (h1, l1), (h2, _l2) in zip(segs, segs[1:]):
        acc += l1
        t = turn_deg(h1, h2)
        if abs(t) > 5:
            turns.append((acc, t))
    n = 0
    i = 0
    while i < len(turns) - 1:
        (d1, t1), (d2, t2) = turns[i], turns[i + 1]
        if t1 * t2 < 0 and d2 - d1 <= 3 and abs(t1 + t2) < 5:
            n += 1
            i += 2
        else:
            i += 1
    return n


def strokes(g, adj, spine_paths):
    """Join spine chains through junctions by the straightest continuation
    (deflection < 30 deg, greedy best-first), giving corridor-like strokes."""
    ends = defaultdict(list)  # junction -> [(chain idx, which end, outgoing heading)]
    for ci, p in enumerate(spine_paths):
        for which, pp in ((0, p), (1, p[::-1])):
            h = point_along(g, pp, 1.0)
            if h is not None:
                ends[pp[0]].append((ci, which, h))
    link = {}
    for j, lst in ends.items():
        cands = []
        for x in range(len(lst)):
            for y in range(x + 1, len(lst)):
                if lst[x][0] == lst[y][0]:
                    continue
                dev = abs(180 - abs(turn_deg(lst[x][2], lst[y][2])))
                if dev < 30:
                    cands.append((dev, x, y))
        taken = set()
        for dev, x, y in sorted(cands):
            if x in taken or y in taken:
                continue
            taken.update((x, y))
            a, b = lst[x][:2], lst[y][:2]
            link[a] = b
            link[b] = a
    seen = set()
    out = []
    for ci in range(len(spine_paths)):
        if ci in seen:
            continue
        # walk to one end of the stroke
        cur, which = ci, 0
        visited = {ci}
        while (cur, which) in link and link[(cur, which)][0] not in visited:
            nc, nw = link[(cur, which)]
            visited.add(nc)
            cur, which = nc, 1 - nw
        # now traverse from (cur, which) outward through the other end
        nodes = []
        start_end = which
        c, w = cur, start_end
        while True:
            seen.add(c)
            p = spine_paths[c] if w == 0 else spine_paths[c][::-1]
            nodes.extend(p if not nodes else p[1:])
            nxt = link.get((c, 1 - w))
            if not nxt or nxt[0] in seen:
                break
            c, w = nxt
        out.append(nodes)
    return out


def measure(g: Graph, with_crossings=True):
    adj = g.adjacency()
    nodes = [n for n in g.pos if adj[n]]
    deg = {n: len(adj[n]) for n in nodes}
    E = len(g.edges)
    V = len(nodes)
    comps = components(nodes, adj)
    total = sum(seg_len(g, *tuple(e)) for e in g.edges)
    dh = Counter(min(d, 6) for d in deg.values())
    junction = {n for n in nodes if deg[n] >= 3}
    dead = [n for n in nodes if deg[n] == 1]
    dest_dead = [n for n in dead if n in g.dest or n in g.door]
    ch = chains(g, adj)
    spine, branch, iso, ring = [], [], [], []
    for p in ch:
        a, b = p[0], p[-1]
        da, db = deg[a], deg[b]
        if a == b and da == 2:
            ring.append(p)
        elif da >= 3 and db >= 3:
            spine.append(p)
        elif (da >= 3 and db == 1) or (da == 1 and db >= 3):
            branch.append(p if da >= 3 else p[::-1])
        else:
            iso.append(p)
    dest_branch = [p for p in branch if p[-1] in g.dest or p[-1] in g.door]
    # spines and rings form the corridor structure
    spine_like = spine + ring
    st = strokes(g, adj, spine)
    st += ring
    t5 = zz = jg = 0
    straight = slen = 0.0
    for p in st:
        a, z, s, L = polyline_stats(g, p)
        jg += jogs(g, p)
        t5 += a
        zz += z
        straight += s
        slen += L
    # zigzags and turns along every chain (spines and branches)
    zig_all = t5_all = 0
    len_all = 0.0
    for p in ch:
        a, z, _s, L = polyline_stats(g, p)
        zig_all += z
        t5_all += a
        len_all += L
    stubs = 0
    for n in dead:
        if n in g.dest or n in g.door:
            continue
        if seg_len(g, n, next(iter(adj[n]))) < 0.5:
            stubs += 1
    # branch attachment angles
    spine_end_dirs = defaultdict(list)
    for p in spine_like:
        for pp in (p, p[::-1]):
            h = point_along(g, pp, 1.0)
            if h is not None:
                spine_end_dirs[pp[0]].append(h)
    angles = []
    branch_at = Counter()
    for p in branch:
        j = p[0]
        hb = point_along(g, p, 1.0)
        dirs = spine_end_dirs.get(j)
        if hb is None or not dirs:
            continue
        branch_at[j] += 1
        if len(dirs) >= 2:
            best = None
            for x in range(len(dirs)):
                for y in range(x + 1, len(dirs)):
                    dev = abs(180 - abs(turn_deg(dirs[x], dirs[y])))
                    if best is None or dev < best[0]:
                        best = (dev, dirs[x])
            axis = best[1]
        else:
            axis = dirs[0]
        a = abs(turn_deg(axis, hb)) % 180
        a = min(a, 180 - a)
        angles.append(a)
    # branch spacing along strokes: distances between consecutive
    # branch-bearing junctions along each stroke
    spacing = []
    for p in st:
        acc = 0.0
        last = None
        for i, n in enumerate(p):
            if i:
                acc += seg_len(g, p[i - 1], n)
            if branch_at.get(n):
                if last is not None and acc - last > 1e-6:
                    spacing.append(acc - last)
                last = acc
    ang_dev = [abs(90 - a) for a in angles]
    res = {
        "nodes": V,
        "edges": E,
        "lengthM": round(total, 1),
        "nodesPer100m": round(100 * V / total, 1) if total else None,
        "meanSegmentM": round(total / E, 2) if E else None,
        "degreeHistogram": {str(k) if k < 6 else "6+": v for k, v in sorted(dh.items())},
        "junctions": len(junction),
        "junctionsPer100m": round(100 * len(junction) / total, 2) if total else None,
        "deadEnds": len(dead),
        "destinationDeadEnds": len(dest_dead),
        "bareDeadEnds": len(dead) - len(dest_dead),
        "bareDeadEndsPer100m": round(100 * (len(dead) - len(dest_dead)) / total, 2) if total else None,
        "bareDeadEndStubsUnder0_5m": stubs,
        "destinationOrDoorNodes": len({n for n in nodes if n in g.dest or n in g.door}),
        "cyclomatic": E - V + len(comps),
        "loopsPer100m": round(100 * (E - V + len(comps)) / total, 2) if total else None,
        "components": len(comps),
        "largestComponentShare": round(max(comps) / V, 3) if comps else None,
        "chains": {
            "spine": len(spine),
            "branch": len(branch),
            "destinationBranch": len(dest_branch),
            "isolated": len(iso),
            "ring": len(ring),
        },
        "spineChainLengthM": quantiles([path_len(g, p) for p in spine]),
        "branchLengthM": quantiles([path_len(g, p) for p in branch]),
        "spineShareOfLength": round(sum(path_len(g, p) for p in spine_like) / total, 3) if total else None,
        "branchAttachmentAngleDeg": quantiles(angles),
        "branchAttachmentWithin10DegOf90": round(sum(1 for d in ang_dev if d <= 10) / len(ang_dev), 3) if ang_dev else None,
        "branchAttachmentWithin5DegOf90": round(sum(1 for d in ang_dev if d <= 5) / len(ang_dev), 3) if ang_dev else None,
        "branchSpacingAlongSpineM": quantiles(spacing),
        "spineStrokes": len(st),
        "spineStrokeLengthM": quantiles([path_len(g, p) for p in st]),
        "spineTurnsOver5DegPer100m": round(100 * t5 / slen, 2) if slen else None,
        "spineStraightRunShare": round(straight / slen, 3) if slen else None,
        "spineJogsPer100m": round(100 * jg / slen, 2) if slen else None,
        "zigzagsOnSpines": zz,
        "zigzagsAll": zig_all,
        "zigzagsPer100m": round(100 * zig_all / total, 3) if total else None,
        "allChainTurnsOver5DegPer100m": round(100 * t5_all / len_all, 2) if len_all else None,
    }
    if with_crossings:
        res["crossingsWithoutJunction"] = proper_crossings(g)
    return res


# --------------------------------------------------------------------------
# Loaders


def lonlat_projector(points):
    lat0 = sum(p[1] for p in points) / len(points)
    lon0 = sum(p[0] for p in points) / len(points)
    mx = 111320.0 * math.cos(math.radians(lat0))
    my = 110540.0

    def f(p):
        return ((p[0] - lon0) * mx, (p[1] - lat0) * my)

    return f


def load_mvf(bundle_dir):
    """Mappedin MVF v2: node.geojson neighbours, space destinationNodes,
    connection.json. Returns per-map graphs plus venue facts."""
    nodes = json.load(open(os.path.join(bundle_dir, "node.geojson")))["features"]
    conns = json.load(open(os.path.join(bundle_dir, "connection.json")))
    floors = {
        f["properties"]["id"]: f["properties"]
        for f in json.load(open(os.path.join(bundle_dir, "floor.geojson")))["features"]
    }
    flags = json.load(open(os.path.join(bundle_dir, "navigationFlags.json")))
    proj = lonlat_projector([n["geometry"]["coordinates"] for n in nodes])
    nmap = {n["properties"]["id"]: n["properties"]["map"] for n in nodes}
    dest = set()
    spaces = defaultdict(list)
    for fp in glob.glob(os.path.join(bundle_dir, "space", "*.geojson")):
        mid = os.path.basename(fp)[: -len(".geojson")]
        for ft in json.load(open(fp))["features"]:
            dest.update(ft["properties"].get("destinationNodes") or [])
            geom = ft["geometry"]
            rings = []
            if geom["type"] == "Polygon":
                rings = geom["coordinates"]
            elif geom["type"] == "MultiPolygon":
                rings = [r for poly in geom["coordinates"] for r in poly]
            for r in rings:
                spaces[mid].append([proj(p) for p in r])
    door_nodes = {x for c in conns if c["type"] == "door" for x in c["nodes"]}
    graphs = {}
    directed = set()
    for n in nodes:
        p = n["properties"]
        for nb in p["neighbors"]:
            directed.add((p["id"], nb["id"]))
    for n in nodes:
        p = n["properties"]
        g = graphs.setdefault(p["map"], Graph(floors.get(p["map"], {}).get("name", p["map"])))
        g.add_node(p["id"], proj(n["geometry"]["coordinates"]))
        if p["id"] in dest:
            g.dest.add(p["id"])
        if p["id"] in door_nodes:
            g.door.add(p["id"])
    for a, b in directed:
        if nmap.get(a) == nmap.get(b) and b in nmap:
            graphs[nmap[a]].add_edge(a, b)
    # weights by kind for cross-map edges
    weights = Counter()
    conn_of = {x: c["type"] for c in conns for x in c["nodes"]}
    wmap = {}
    for n in nodes:
        for nb in n["properties"]["neighbors"]:
            wmap[(n["properties"]["id"], nb["id"])] = nb["weight"]
    for (a, b), w in wmap.items():
        if nmap.get(a) != nmap.get(b):
            weights[(conn_of.get(a), w)] += 1
    one_way = [(a, b) for a, b in directed if (b, a) not in directed]
    facts = {
        "nodes": len(nodes),
        "maps": len(floors),
        "connections": dict(Counter(c["type"] for c in conns)),
        "connectionAccessible": {f"{k[0]}:{k[1]}": v for k, v in Counter((c["type"], c.get("accessible")) for c in conns).items()},
        "connectionNodeCounts": {f"{k[0]}:{k[1]}": v for k, v in Counter((c["type"], len(c["nodes"])) for c in conns).items()},
        "connectionsWithActiveField": sum(1 for c in conns if isinstance(c.get("extra"), dict) and "active" in c["extra"]),
        "connectionsWithWaitTime": sum(1 for c in conns if isinstance(c.get("extra"), dict) and "waitTime" in c["extra"]),
        "navigationFlags": {
            "count": len(flags),
            "accessibleBit": "accessible" in flags,
            "filterFlags": sum(1 for k in flags if "filter-flag" in k),
        },
        "nodeFlagValues": dict(Counter(json.dumps(n["properties"].get("flags")) for n in nodes)),
        "nodesWithSpace": sum(1 for n in nodes if n["properties"].get("space")),
        "destinationNodes": len(dest),
        "directedNeighbourEntries": len(directed),
        "oneWayEdges": len(one_way),
        "oneWayEdgesTouchingConnection": dict(Counter(conn_of.get(a) or conn_of.get(b) for a, b in one_way)),
        "crossMapWeightsByConnectionType": {f"{k[0]}:{k[1]}": v for k, v in sorted(weights.items(), key=lambda kv: str(kv[0]))},
    }
    return graphs, floors, spaces, facts


def load_situm(building_json):
    d = json.load(open(building_json))
    P = d["paths"]
    floors = {f["id"]: f for f in d["floors"]}
    fl = {n["id"]: n["floor_id"] for n in P["nodes"]}
    graphs = {}
    for n in P["nodes"]:
        g = graphs.setdefault(n["floor_id"], Graph(f"Situm floor {floors[n['floor_id']]['name']}"))
        g.add_node(n["id"], (n["x"], n["y"]))
    inter = 0
    for l in P["links"]:
        if fl[l["source"]] == fl[l["target"]]:
            graphs[fl[l["source"]]].add_edge(l["source"], l["target"])
        else:
            inter += 1
    # Situm binds destinations at run time (nearest graph point to a POI);
    # approximate: a node within 3 m of an indoor POI on the same floor.
    pois = [(p["position"]["floor_id"], p["position"]["x"], p["position"]["y"]) for p in d.get("indoor_pois", []) if p.get("position", {}).get("x") is not None]
    for fid, g in graphs.items():
        for n, (x, y) in g.pos.items():
            if any(f == fid and math.hypot(px - x, py - y) <= 3 for f, px, py in pois):
                g.dest.add(n)
    facts = {
        "nodes": len(P["nodes"]),
        "links": len(P["links"]),
        "interFloorLinks": inter,
        "linkAccessible": dict(Counter(str(l["accessible"]) for l in P["links"])),
        "linkOrigin": dict(Counter(l["origin"] for l in P["links"])),
        "linkTags": dict(Counter(t for l in P["links"] for t in l["tags"])),
        "floors": [(f["name"], f["level"]) for f in d["floors"]],
        "geofences": len(d.get("geofences", [])),
        "indoorPois": len(d.get("indoor_pois", [])),
        "buildingJsonBytes": os.path.getsize(building_json),
    }
    return graphs, facts


def load_ours(floor_json, precise=None):
    """Our map floor file: net (accepted guides cat 0/2, original saved walks
    cat 1/3) between netNodes, plus door/opening crossings as edges.

    The floor file stores display decimetres. Rounding to 0.1 m adds up to
    ~5 deg of heading noise on a 1 m segment, so when `precise` is given
    (graph edges, prepared guides, display frame) the same edges are rebuilt
    from their full-precision feet geometry in the same display frame."""
    d = json.load(open(floor_json))
    g = Graph(d["name"])
    if precise:
        edges, guides, fr = precise
        a, b, c, dd = fr["a"], fr["b"], fr["c"], fr["dd"]

        def tf(p):
            return (a * p[0] - b * p[1] + c, b * p[0] + a * p[1] + dd)

    for line, cat, ei in d["net"]:
        na, nb = d["netNodes"][ei]
        if precise:
            eid = d["netEdgeIds"][ei]
            src = guides.get(eid) if cat in (0, 2) else None
            pts = [tf(p) for p in (src or edges[eid])["pointsFeet"]]
            # orient like the exported line
            if math.hypot(pts[0][0] - line[0] / 10, pts[0][1] - line[1] / 10) > math.hypot(
                pts[-1][0] - line[0] / 10, pts[-1][1] - line[1] / 10
            ):
                pts = pts[::-1]
        else:
            pts = [(line[i] / 10.0, line[i + 1] / 10.0) for i in range(0, len(line), 2)]
        g.add_polyline(("net", ei), na, nb, pts)
    for n in list(g.pos):
        if isinstance(n, str):
            if n.startswith("arrival:"):
                g.dest.add(n)
            elif n.startswith("door:") or n.startswith("opening:"):
                g.door.add(n)
    for pts, _eid, kind, u, v in d["crossings"]:
        pu, pv = (pts[0] / 10.0, pts[1] / 10.0), (pts[-2] / 10.0, pts[-1] / 10.0)
        g.add_node(u, pu)
        g.add_node(v, pv)
        g.door.update((u, v))
        g.add_edge(u, v)
    cats = Counter(c for _, c, _ in d["net"])
    facts = {
        "netLines": len(d["net"]),
        "netCategories": {str(k): v for k, v in sorted(cats.items())},
        "crossings": dict(Counter(c[2] for c in d["crossings"])),
        "stops": {f"{k[0]}:{k[1]}": v for k, v in Counter((s[1], s[2]) for s in d["stops"]).items()},
        "cells": len(d["cells"]),
        "geometry": "full-precision feet in display frame" if precise else "display decimetres",
    }
    return g, d, facts
