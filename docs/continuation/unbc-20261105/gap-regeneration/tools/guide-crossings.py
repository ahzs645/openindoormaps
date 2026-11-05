"""Guides-only crossings without a junction, per catalog, without map floor files.

Same model and definitions as tools/reference-comparison/measure_ours.py
(`guidesOnly.drawnUnion.crossingsWithoutJunction`): every accepted guide on
the four visitor floors is one polyline between its edge's two graph nodes, in
the display frame; each floor is planarized separately and proper crossings
are counted. The floor files are not needed for guides only, so this works on
a graph whose walk ids differ from the published map build.

usage: guide-crossings.py --graph graph-full.json --frame frame.json \
          --catalog label=prepared-routing.json [...] --out OUT.json
"""
import argparse, hashlib, json, os, sys
sys.path.insert(0, os.environ["REFCMP"])
import navgraph as ng  # noqa: E402

FLOORS = {"campus-floor-1": {1450417, 311, 1487816, 1425915}, "floor-2": {694},
          "campus-floor-3": {400176, 1487353}, "floor-4": {402367}}
ap = argparse.ArgumentParser()
ap.add_argument("--graph", required=True); ap.add_argument("--frame", required=True)
ap.add_argument("--catalog", action="append", required=True); ap.add_argument("--out", required=True)
a = ap.parse_args()
G = json.load(open(a.graph)); fr = json.load(open(a.frame))
nodes = {n["id"]: n for n in G["nodes"]}; E = {e["id"]: e for e in G["edges"]}
A, B, C, D = fr["a"], fr["b"], fr["c"], fr["dd"]
tf = lambda p: (A * p[0] - B * p[1] + C, B * p[0] + A * p[1] + D)
import math
from collections import defaultdict


def crossing_points(g):
    """proper_crossings() of navgraph, returning the crossing points."""
    cell, buckets = 4.0, defaultdict(list)
    segs = [tuple(e) for e in g.edges]
    for i, (u, v) in enumerate(segs):
        (ax, ay), (bx, by) = g.pos[u], g.pos[v]
        for cx in range(int(math.floor(min(ax, bx) / cell)), int(math.floor(max(ax, bx) / cell)) + 1):
            for cy in range(int(math.floor(min(ay, by) / cell)), int(math.floor(max(ay, by) / cell)) + 1):
                buckets[(cx, cy)].append(i)
    orient = lambda p, q, r: (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    seen, out = set(), []
    for idx in buckets.values():
        for ii in range(len(idx)):
            for jj in range(ii + 1, len(idx)):
                i, j = idx[ii], idx[jj]
                if (i, j) in seen: continue
                seen.add((i, j))
                a, b = segs[i]; c, d = segs[j]
                if len({a, b, c, d}) < 4: continue
                p1, p2, p3, p4 = g.pos[a], g.pos[b], g.pos[c], g.pos[d]
                d1, d2, d3, d4 = orient(p3, p4, p1), orient(p3, p4, p2), orient(p1, p2, p3), orient(p1, p2, p4)
                eps = 1e-9
                if ((d1 > eps and d2 < -eps) or (d1 < -eps and d2 > eps)) and ((d3 > eps and d4 < -eps) or (d3 < -eps and d4 > eps)):
                    t = d1 / (d1 - d2)
                    out.append([round(p1[0] + t * (p2[0] - p1[0]), 3), round(p1[1] + t * (p2[1] - p1[1]), 3)])
    return out


def seg_dist(q, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L))
    return math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy)


def near_guides(q, levels):
    hits = []
    for x in CUR:
        e = E.get(x["edgeId"])
        if e is None or nodes[e["from"]]["levelId"] not in levels: continue
        pts = [tf(p) for p in x["pointsFeet"]]
        dmin = min(seg_dist(q, pts[k], pts[k + 1]) for k in range(len(pts) - 1))
        if dmin < 0.2:
            hits.append({"edgeId": x["edgeId"], "kind": x.get("kind"), "distanceM": round(dmin, 4)})
    return hits


res = {"format": "guide-only-crossings-v1", "graph": a.graph, "frame": a.frame, "catalogs": {}}
for spec in a.catalog:
    label, path = spec.split("=", 1)
    raw = open(path, "rb").read(); P = json.loads(raw)["guides"]; CUR = P
    per, missing = {}, []
    for fid, levels in FLOORS.items():
        g = ng.Graph(fid)
        for i, x in enumerate(P):
            e = E.get(x["edgeId"])
            if e is None: missing.append(x["edgeId"]); continue
            if nodes[e["from"]]["levelId"] not in levels: continue
            g.add_polyline(("net", i), e["from"], e["to"], [tf(p) for p in x["pointsFeet"]])
        for n in list(g.pos):
            if isinstance(n, str):
                if n.startswith("arrival:"): g.dest.add(n)
                elif n.startswith("door:") or n.startswith("opening:"): g.door.add(n)
        pl = ng.planarize(g)
        per[fid] = {"guides": sum(1 for x in P if x["edgeId"] in E and nodes[E[x["edgeId"]]["from"]]["levelId"] in levels),
                    "crossingsWithoutJunction": ng.proper_crossings(pl)}
        pts = crossing_points(pl)
        assert len(pts) == per[fid]["crossingsWithoutJunction"]
        per[fid]["crossings"] = [{"pointDisplay": q, "guides": near_guides(q, levels)} for q in pts]
    res["catalogs"][label] = {"path": path, "sha256": hashlib.sha256(raw).hexdigest(), "guides": len(P),
                              "guidesWithoutGraphEdge": sorted(set(missing)),
                              "crossingsWithoutJunction": sum(v["crossingsWithoutJunction"] for v in per.values()),
                              "floors": per}
    print(label, res["catalogs"][label]["crossingsWithoutJunction"], {k: v["crossingsWithoutJunction"] for k, v in per.items()})
json.dump(res, open(a.out, "w"), indent=1)
