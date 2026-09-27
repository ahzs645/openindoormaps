#!/usr/bin/env python3
"""Floor-by-floor routing audit for the ported venues.

Mirrors the client routing graph (app/indoor-directions: exact-coordinate
vertices, `cost` seconds for connectors, walking at 1.2 m/s, one-way
`direction`, `is_accessible`) and reports, per venue:

- per floor: units, POIs, route vertices, connected components
- vertical connectors per floor pair (type, direction, cost, XY shift)
- POI snap distance to the floor's route network
- POIs unreachable from each floor, normal and accessible-only

Usage: python3 scripts/audit-venue-routing.py [venue ...]
"""
import json, math, heapq, collections, sys


VENUES = sys.argv[1:] or ["galleria", "city-mall", "harrods", "mappedin-mall"]

def dist_m(a, b):
    lat = math.radians((a[1] + b[1]) / 2)
    return math.hypot((a[0]-b[0]) * 111320 * math.cos(lat), (a[1]-b[1]) * 110540)

def load(v):
    j = lambda n: json.load(open(f"app/data/{v}/{n}.geojson"))
    return j("indoor-map"), j("indoor-routes"), j("pois")

def build(routes):
    adj = collections.defaultdict(list); vlev = collections.defaultdict(set)
    for f in routes["features"]:
        if f["geometry"]["type"] != "LineString": continue
        p = f["properties"]; cs = f["geometry"]["coordinates"]; nt = (p.get("network_type") or "").lower()
        acc = p["is_accessible"] if isinstance(p.get("is_accessible"), bool) else nt not in ("stairs","escalator")
        d = p.get("direction", "both"); lvl = p.get("level_id") if isinstance(p.get("level_id"), (int,float)) else None
        for c in cs: vlev[json.dumps(c)].add(lvl)
        for a, b in zip(cs, cs[1:]):
            cost = p.get("cost")
            if isinstance(cost, (int,float)) and cost > 0: w = cost / (len(cs)-1)
            else: w = dist_m(a, b) / 1.2  # walking seconds, as in the engine
            e = dict(w=w, acc=acc, nt=nt, lvl=lvl, fl=p.get("from_level_id"), tl=p.get("to_level_id"), vc=p.get("vertical_connection_id"))
            ka, kb = json.dumps(a), json.dumps(b)
            if d != "backward": adj[ka].append((kb, e))
            if d != "forward": adj[kb].append((ka, e))
    return adj, vlev

def snap(pt, level, vlev):
    best = None
    for k, ls in vlev.items():
        if level is not None and level not in ls and not (ls == {None}): continue
        c = json.loads(k); dd = dist_m(pt, c)
        if best is None or dd < best[0]: best = (dd, k)
    return best

def dijkstra(adj, src, acc_only=False):
    dist = {src: 0}; prev = {}; pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]: continue
        for v, e in adj[u]:
            if acc_only and not e["acc"]: continue
            nd = d + e["w"]
            if nd < dist.get(v, math.inf): dist[v] = nd; prev[v] = (u, e); heapq.heappush(pq, (nd, v))
    return dist, prev

for v in VENUES:
    imap, routes, pois = load(v)
    adj, vlev = build(routes)
    floors = sorted({f["properties"]["floor"] for f in pois["features"]} | {l for s in vlev.values() for l in s if l is not None})
    print(f"\n==================== {v} ==================== floors {floors}")
    # per-floor stats
    units = collections.Counter(f["properties"].get("level_id") for f in imap["features"] if f["properties"].get("feature_type") == "unit")
    pcount = collections.Counter(f["properties"]["floor"] for f in pois["features"])
    # components per floor (corridor edges only)
    for fl in floors:
        nodes = [k for k, ls in vlev.items() if fl in ls]
        ns = set(nodes); seen = set(); comps = []
        for n in nodes:
            if n in seen: continue
            stack = [n]; seen.add(n); size = 0
            while stack:
                u = stack.pop(); size += 1
                for w_, e in adj[u]:
                    if e["lvl"] == fl and w_ in ns and w_ not in seen: seen.add(w_); stack.append(w_)
                # undirected for components
            comps.append(size)
        comps.sort(reverse=True)
        xs = [json.loads(k) for k in nodes]
        bbox = (min(c[0] for c in xs), min(c[1] for c in xs), max(c[0] for c in xs), max(c[1] for c in xs)) if xs else None
        print(f"  floor {fl:>4}: units {units.get(fl,0):>4}  pois {pcount.get(fl,0):>4}  route-vertices {len(nodes):>5}  components {len(comps)} {comps[:5]}")
    # vertical connectors
    vc = collections.defaultdict(list)
    for f in routes["features"]:
        p = f["properties"]
        if (p.get("network_type") or "") in ("stairs","escalator","elevator","ramp"):
            cs = f["geometry"]["coordinates"]
            vc[(p.get("from_level_id"), p.get("to_level_id"))].append(f"{p['network_type']}[{p.get('direction','both')}{',acc' if p.get('is_accessible') else ''}]{p.get('cost')}s xy-shift {dist_m(cs[0], cs[-1]):.1f}m id={p.get('vertical_connection_id')}")
    print("  vertical connectors:")
    for k in sorted(vc, key=lambda t: (t[0] if t[0] is not None else -99)):
        print(f"    {k[0]} -> {k[1]}: " + "; ".join(sorted(set(vc[k]))))
    # POI snap distances
    snaps = []
    for f in pois["features"]:
        p = f["properties"]; s = snap(f["geometry"]["coordinates"], p["floor"], vlev)
        snaps.append((s[0] if s else math.inf, p["id"], p["name"], p["floor"], s[1] if s else None))
    snaps.sort(reverse=True)
    far = [s for s in snaps if s[0] > 15]
    print(f"  POI snap distance: median {sorted(s[0] for s in snaps)[len(snaps)//2]:.1f}m  max {snaps[0][0]:.1f}m  >15m: {len(far)}")
    for s in far[:8]: print(f"    {s[0]:6.1f}m  #{s[1]} {s[2]!r} floor {s[3]}")
    # reachability matrix: one hub POI per floor (most central) -> every POI
    by_floor = collections.defaultdict(list)
    for s in snaps:
        if s[4]: by_floor[s[3]].append(s)
    for acc in (False, True):
        bad = collections.Counter(); total = 0; examples = []
        for fl, lst in by_floor.items():
            src = lst[len(lst)//2]
            dist, _ = dijkstra(adj, src[4], acc)
            for tgt in snaps:
                if tgt[4] is None: continue
                total += 1
                if tgt[4] not in dist:
                    bad[(fl, tgt[3])] += 1
                    if len(examples) < 4: examples.append(f"#{src[1]} {src[2]!r}(f{fl}) -> #{tgt[1]} {tgt[2]!r}(f{tgt[3]})")
        print(f"  unreachable ({'accessible' if acc else 'normal'}): {sum(bad.values())}/{total}  by floor-pair {dict(bad) if bad else ''}")
        for e in examples: print("    e.g.", e)
