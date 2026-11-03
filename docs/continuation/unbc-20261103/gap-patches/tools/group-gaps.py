"""Group walk squeezes into physical gaps and measure each gap exactly.
usage: group-gaps.py GEOMETRY.json GRAPH-FULL.json SQUEEZES.json OUT.json"""
import json, math, sys
from collections import defaultdict
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import nearest_points

geo, graph, sq, out = sys.argv[1:5]
GEO = json.load(open(geo)); G = json.load(open(graph)); S = json.load(open(sq))["squeezes"]
rec = {r["key"]: r for r in G["records"]}
polys = defaultdict(list)
for lv, eid, kind, approx, patch, rings in GEO["walls"]:
    polys[(lv, eid)].append((Polygon(rings[0], rings[1:]), {"kind": kind, "approximate": approx, "patch": patch, "rings": rings}))

def near_poly(lv, eid, p):
    c = polys.get((lv, eid))
    if not c: return None, None
    return min(c, key=lambda t: t[0].distance(Point(p)))

gaps = []
for s in S:
    lv, p = s["levelId"], s["pointFeet"]
    ids = sorted(b["id"] for b in s["bodies"])
    g = next((g for g in gaps if g["levelId"] == lv and g["bodyIds"] == ids and math.dist(g["pointFeet"], p) < 2.0), None)
    if g is None:
        g = {"levelId": lv, "bodyIds": ids, "pointFeet": p, "squeezes": []}
        gaps.append(g)
    g["squeezes"].append(s)
for i, g in enumerate(gaps):
    lv = g["levelId"]
    (pa, ma), (pb, mb) = (near_poly(lv, e, g["pointFeet"]) for e in g["bodyIds"])
    d = pa.distance(pb)
    a, b = nearest_points(pa, pb)
    g["id"] = f"gap-{lv}-{i:04d}"
    g["bodies"] = [{"id": e, "kind": m["kind"], "approximate": m["approximate"], "reviewPatchId": m["patch"], "ringsFeet": m["rings"]} for e, m in zip(g["bodyIds"], (ma, mb))]
    g["bodyDistanceFeet"] = d
    g["nearestFeet"] = [[a.x, a.y], [b.x, b.y]]
    g["walkWidthFeet"] = min(s["widthFeet"] for s in g["squeezes"])
    g["edgeIds"] = sorted({s["edgeId"] for s in g["squeezes"]})
    g["roomKeys"] = sorted({k for s in g["squeezes"] for k in s["roomKeys"]})
    g["rooms"] = [rec[k]["number"] or rec[k]["name"] for k in g["roomKeys"] if k in rec]
    g["cells"] = sorted({s["nativeCellId"] for s in g["squeezes"] if s["nativeCellId"]})
    del g["squeezes"]
json.dump({"format": "unbc-walk-gap-groups-v1", "gaps": gaps}, open(out, "w"))
print(len(gaps), "gaps")
