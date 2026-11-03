"""Independent inventory: every enabled walk edge that squeezes through a
clearance narrower than a real doorway between two native bodies.

usage: walk-squeezes.py GEOMETRY.json GRAPH-FULL.json OUT.json [max-width-ft=2.0]

GEOMETRY.json is the plain table dump written by scan-all-levels.ts from the
validated master (walls with kind/approximate/patch tags, doors, fixtures).
Free width at a sample point is the shortest chord through it, over a fan of
directions within 60 degrees of the walk normal, between two body hits.
A squeeze is a run of samples narrower than max-width, bounded on both sides
by wider samples (a recess at a walk end is not a squeeze). Samples inside a
measured door footprint (+0.25 ft) or within 1 ft of an opening edge are
excluded. Diagnostic only: no geometry is changed.
"""
import json, math, sys
from collections import defaultdict
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point
from shapely.strtree import STRtree

geo_path, graph_path, out_path = sys.argv[1:4]
MAXW = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
STEP, RAY = 0.1, MAXW + 0.5
FAN = [math.radians(a) for a in range(-60, 61, 5)]
GEO = json.load(open(geo_path))
G = json.load(open(graph_path))
nodes = {n["id"]: n for n in G["nodes"]}

def poly(rings):
    try:
        p = Polygon(rings[0], rings[1:])
        return p if p.is_valid else p.buffer(0)
    except Exception:
        return None

bodies = defaultdict(list)  # level -> [(geom, meta)]
for lv, eid, kind, approx, patch, rings in GEO["walls"]:
    p = poly(rings)
    if p is not None and not p.is_empty:
        bodies[lv].append((p, {"id": eid, "kind": kind or "wall", "approximate": approx, "patch": patch}))
for levels, eid, rings in GEO["fixtures"]:
    p = poly(rings)
    if p is None or p.is_empty: continue
    for lv in levels:
        bodies[lv].append((p, {"id": eid, "kind": "fixture", "approximate": False, "patch": None}))
doorzone = defaultdict(list)
for lv, eid, did, state, rk, fp, nrm, host in GEO["doors"]:
    if fp: doorzone[lv].append(Polygon(fp).buffer(0.25))
for e in G["edges"]:
    if e["kind"] == "opening" and e["enabled"]:
        n = nodes.get(e["from"])
        if n: doorzone[n["levelId"]].append(LineString([p[:2] for p in e["pointsFeet"]]).buffer(1.0))
trees = {lv: STRtree([b[0] for b in bs]) for lv, bs in bodies.items()}
dz = {lv: shapely.union_all(z) for lv, z in doorzone.items()}

def hits(lv, p, d):
    """Distance along ray p + s*d (0..RAY) to the first body, and its index."""
    seg = LineString([p, (p[0] + d[0] * RAY, p[1] + d[1] * RAY)])
    best = (math.inf, None)
    for i in trees[lv].query(seg):
        g = bodies[lv][i][0]
        x = g.intersection(seg)
        if x.is_empty: continue
        s = min(math.hypot(c[0] - p[0], c[1] - p[1]) for c in shapely.get_coordinates(x))
        if s < best[0]: best = (s, int(i))
    return best

def width_at(lv, p, t):
    nx, ny = -t[1], t[0]
    best = (math.inf, None, None, None)
    for a in FAN:
        c, s = math.cos(a), math.sin(a)
        d = (nx * c - ny * s, nx * s + ny * c)
        d1, i1 = hits(lv, p, d)
        if i1 is None: continue
        d2, i2 = hits(lv, p, (-d[0], -d[1]))
        if i2 is None or i2 == i1: continue
        if d1 + d2 < best[0]:
            best = (d1 + d2, i1, i2, ((p[0] + d[0] * d1, p[1] + d[1] * d1), (p[0] - d[0] * d2, p[1] - d[1] * d2)))
    return best

records = {r["key"]: r for r in G["records"]}
squeezes = []
walks = [e for e in G["edges"] if e["kind"] == "walk" and e["enabled"]]
for k, e in enumerate(walks):
    n = nodes.get(e["from"])
    lv = n and n.get("levelId")
    if lv not in trees: continue
    pts = [tuple(p[:2]) for p in e["pointsFeet"]]
    line = LineString(pts)
    if line.length == 0: continue
    m = max(2, int(line.length / STEP) + 1)
    ss = np.linspace(0, line.length, m)
    samples = [line.interpolate(s) for s in ss]
    near = trees[lv].query_nearest(samples, max_distance=MAXW, all_matches=False, return_distance=True)
    close = set(near[0][0].tolist())
    zone = dz.get(lv)
    rows = []
    for j, s in enumerate(ss):
        if j not in close:
            rows.append((s, math.inf, None)); continue
        p = samples[j]
        if zone is not None and zone.contains(p):
            rows.append((s, math.inf, "door")); continue
        a = line.interpolate(max(0, s - 0.05)); b = line.interpolate(min(line.length, s + 0.05))
        L = math.hypot(b.x - a.x, b.y - a.y) or 1
        w = width_at(lv, (p.x, p.y), ((b.x - a.x) / L, (b.y - a.y) / L))
        rows.append((s, w[0], w))
    j = 0
    while j < len(rows):
        if rows[j][1] < MAXW:
            i = j
            while j < len(rows) and rows[j][1] < MAXW: j += 1
            bounded = i > 0 and j < len(rows) and rows[i - 1][2] != "door" and rows[j][2] != "door"
            if bounded:
                r = min(rows[i:j], key=lambda q: q[1])
                w, i1, i2, ends = r[2]
                b1, b2 = bodies[lv][i1][1], bodies[lv][i2][1]
                squeezes.append({"edgeId": e["id"], "levelId": lv, "nativeCellId": e["nativeCellId"],
                                 "roomKeys": e["roomKeys"], "widthFeet": w, "alongFeet": [rows[i][0], rows[j - 1][0]],
                                 "pointFeet": [line.interpolate(r[0]).x, line.interpolate(r[0]).y], "chordFeet": ends,
                                 "bodies": [b1, b2]})
        else:
            j += 1
    if k % 500 == 0: print(k, len(walks), len(squeezes), flush=True)
json.dump({"format": "unbc-walk-squeeze-inventory-v1", "maxWidthFeet": MAXW, "stepFeet": STEP,
           "masterSha256": GEO.get("masterSha256"), "walks": len(walks), "squeezes": squeezes}, open(out_path, "w"))
print("squeezes", len(squeezes))
