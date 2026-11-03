"""Classify each walk gap and design a wall-continuation patch where the
geometry supports one. usage: design-patches.py GEOMETRY.json GAPS.json OUT.json

Patch geometry (NativeBoundaryPatch, proposed):
  * cap-to-face (T): the partition's own end cap is carried along its original
    axis (cap outward normal) to the first face of the other body. Each cap
    corner keeps its own measured run, so an oblique face gives a trapezoid.
    The strip starts 0.02 ft back inside the partition and ends 0.02 ft inside
    the target face (the manual tool's contact overlap). Thickness = cap width.
  * aligned caps: two facing, antiparallel caps on one axis are bridged cap to
    cap, each end 0.02 ft inside its own wall.
Nothing else is patched: approximate envelopes, columns, fixtures and corner
joints without a facing cap are reported for review.
"""
import json, math, sys
from shapely.geometry import Polygon, LineString, Point
from shapely.strtree import STRtree
from collections import defaultdict

geo_path, gaps_path, out_path = sys.argv[1:4]
GEO = json.load(open(geo_path)); GAPS = json.load(open(gaps_path))["gaps"]
OVER = 0.02
level_bodies = defaultdict(list)
for lv, eid, kind, approx, patch, rings in GEO["walls"]:
    level_bodies[lv].append((Polygon(rings[0], rings[1:]), eid, kind, approx, patch, rings))
trees = {lv: STRtree([b[0] for b in bs]) for lv, bs in level_bodies.items()}
doors = defaultdict(list)
for lv, eid, did, state, rk, fp, nrm, host in GEO["doors"]:
    if fp: doors[lv].append((Polygon(fp), eid))

def ring_of(rings):
    r = rings[0]
    if len(r) > 3 and r[0] == r[-1]: r = r[:-1]
    return r

def caps(rings):
    """Short end edges of a simple 4-vertex body: [(c1, c2, outward unit normal, width)]."""
    r = ring_of(rings)
    if len(r) != 4: return []
    L = [math.dist(r[i], r[(i + 1) % 4]) for i in range(4)]
    out = []
    cx, cy = sum(p[0] for p in r) / 4, sum(p[1] for p in r) / 4
    for i in range(4):
        if L[i] < 0.05 or L[i] > 2.0 or L[i] * 3 > max(L): continue
        a, b = r[i], r[(i + 1) % 4]
        t = ((b[0] - a[0]) / L[i], (b[1] - a[1]) / L[i]); u = (-t[1], t[0])
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if (m[0] - cx) * u[0] + (m[1] - cy) * u[1] < 0: u = (-u[0], -u[1])
        out.append((tuple(a), tuple(b), u, L[i]))
    return out

def first_hit(lv, p, u, maxd, skip_ids, precise_only=True):
    seg = LineString([p, (p[0] + u[0] * maxd, p[1] + u[1] * maxd)])
    best = (math.inf, None)
    for i in trees[lv].query(seg):
        g, eid, kind, approx, patch, _r = level_bodies[lv][i]
        if eid in skip_ids: continue
        if precise_only and (approx or patch): continue
        x = g.intersection(seg)
        if x.is_empty: continue
        coords = [c for geom in getattr(x, "geoms", [x]) for c in geom.coords]
        s = min((c[0] - p[0]) * u[0] + (c[1] - p[1]) * u[1] for c in coords)
        if s < best[0]: best = (max(0.0, s), level_bodies[lv][i])
    return best

def T_patch(lv, src_id, src_rings, cap, gap_point):
    c1, c2, u, w = cap
    mid = ((c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2)
    if math.dist(mid, gap_point) > 2.5: return None
    # a hair inside the source cap so a touching target is still found
    eps = 1e-9
    h1 = first_hit(lv, (c1[0] - u[0] * eps, c1[1] - u[1] * eps), u, 6.5, {src_id})
    h2 = first_hit(lv, (c2[0] - u[0] * eps, c2[1] - u[1] * eps), u, 6.5, {src_id})
    if h1[1] is None or h2[1] is None or h1[1][1] != h2[1][1]: return None
    tgt = h1[1]
    g1, g2 = max(0.0, h1[0] - eps), max(0.0, h2[0] - eps)
    if max(g1, g2) > 6: return None
    ring = [[c1[0] - u[0] * OVER, c1[1] - u[1] * OVER], [c2[0] - u[0] * OVER, c2[1] - u[1] * OVER],
            [c2[0] + u[0] * (g2 + OVER), c2[1] + u[1] * (g2 + OVER)], [c1[0] + u[0] * (g1 + OVER), c1[1] + u[1] * (g1 + OVER)]]
    return {"shape": "cap-to-face", "sourceId": src_id, "targetId": tgt[1], "targetKind": tgt[2], "targetRings": tgt[5],
            "sourceRings": src_rings, "capFeet": [list(c1), list(c2)], "capWidthFeet": w, "cornerRunsFeet": [g1, g2], "gapFeet": max(g1, g2), "ringFeet": ring}

designs = []
for g in GAPS:
    lv = g["levelId"]; A, B = g["bodies"]; gp = g["pointFeet"]
    kinds = {A["kind"], B["kind"]}
    rec = {"gapId": g["id"], "levelId": lv, "rooms": g["rooms"], "roomKeys": g["roomKeys"], "edgeIds": g["edgeIds"],
           "cells": g["cells"], "bodyIds": g["bodyIds"], "bodyDistanceFeet": g["bodyDistanceFeet"],
           "walkWidthFeet": g["walkWidthFeet"], "pointFeet": gp,
           "bodyKinds": [[b["id"], b["kind"], b["approximate"], b["reviewPatchId"]] for b in (A, B)]}
    options = []
    for S, O in ((A, B), (B, A)):
        if S["kind"] != "wall" or S["approximate"] or S["reviewPatchId"]: continue
        for cap in caps(S["ringsFeet"]):
            d = T_patch(lv, S["id"], S["ringsFeet"], cap, gp)
            if d: options.append(d)
    # aligned caps: both bodies have facing antiparallel caps, collinear
    aligned = None
    for ca in caps(A["ringsFeet"]) if A["kind"] == "wall" and not A["approximate"] else []:
        for cb in caps(B["ringsFeet"]) if B["kind"] == "wall" and not B["approximate"] else []:
            if ca[2][0] * cb[2][0] + ca[2][1] * cb[2][1] > -0.9999: continue
            ma = ((ca[0][0] + ca[1][0]) / 2, (ca[0][1] + ca[1][1]) / 2); mb = ((cb[0][0] + cb[1][0]) / 2, (cb[0][1] + cb[1][1]) / 2)
            d = (mb[0] - ma[0]) * ca[2][0] + (mb[1] - ma[1]) * ca[2][1]
            lat = abs((mb[0] - ma[0]) * -ca[2][1] + (mb[1] - ma[1]) * ca[2][0])
            if d <= 0 or d > 6 or lat > 0.05 or math.dist(ma, gp) > 3: continue
            u, v = ca[2], cb[2]
            # pair corners by lateral position
            t = (-u[1], u[0]); lp = lambda p: (p[0] - ma[0]) * t[0] + (p[1] - ma[1]) * t[1]
            a1, a2 = sorted([ca[0], ca[1]], key=lp); b1, b2 = sorted([cb[0], cb[1]], key=lp)
            ring = [[a1[0] - u[0] * OVER, a1[1] - u[1] * OVER], [a2[0] - u[0] * OVER, a2[1] - u[1] * OVER],
                    [b2[0] - v[0] * OVER, b2[1] - v[1] * OVER], [b1[0] - v[0] * OVER, b1[1] - v[1] * OVER]]
            aligned = {"shape": "aligned-caps", "sourceId": A["id"], "targetId": B["id"], "targetKind": "wall", "sourceRings": A["ringsFeet"], "targetRings": B["ringsFeet"],
                       "capFeet": [list(ca[0]), list(ca[1])], "targetCapFeet": [list(cb[0]), list(cb[1])],
                       "capWidthFeet": min(ca[3], cb[3]), "gapFeet": d, "lateralOffsetFeet": lat, "ringFeet": ring}
    if aligned: options = [aligned]
    # prefer the option whose target is the other gap body, then the smallest run
    options.sort(key=lambda o: (o["targetId"] not in g["bodyIds"], o["gapFeet"]))
    approx = A["approximate"] or B["approximate"]
    choice = options[0] if options else None
    if choice and choice["targetId"] not in g["bodyIds"]:
        # Curtain joint: the gap body is an approximate envelope, which is never
        # patch support. Only a precise member behind it, on the partition's own
        # axis, can be. Keep the envelope gap (normal width) and the cap run apart.
        if approx and choice["sourceId"] in g["bodyIds"]:
            choice = dict(choice, curtainJoint=True, envelopeGapFeet=g["bodyDistanceFeet"])
        else:
            choice = None
    # Classification. A designed strip always ends on a precise original
    # face; the approximate envelope only matters when no precise face exists.
    if not choice:
        if approx: cls, why = "b", "partition stops at an approximate curtain/facade envelope; no precise original face on its axis within 6 ft"
        elif "column" in kinds: cls, why = "d", "wall-to-column joint; a column contact needs a source continuation proof"
        else: cls, why = "d", "no facing original cap on the gap (corner joint or irregular body)"
    elif choice["gapFeet"] > 2.0:
        cls, why = "c", "the partition's own axis runs more than 2 ft to the next face: an opening, not a joint"
    elif choice["gapFeet"] >= 1.0:
        cls, why = "d", "1-2 ft between the cap and the next face: could be a real narrow passage"
    else:
        cls = "a"
        why = "wall end not closed against its neighbour" + ("; walk then runs along the approximate facade envelope" if approx else "")
    rec.update({"class": cls, "reason": why, "design": choice})
    designs.append(rec)
json.dump({"format": "unbc-gap-patch-designs-v1", "designs": designs}, open(out_path, "w"))
from collections import Counter
print(Counter((d["class"], d["design"]["shape"] if d["design"] else None) for d in designs))
