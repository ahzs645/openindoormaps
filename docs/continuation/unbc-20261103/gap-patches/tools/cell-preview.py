"""Independent cross-check of the retrace on the map build's native cells.
usage: cell-preview.py CELLS-DIR GRAPH-FULL.json CANDIDATES.json OUT.json [patch-id-file]
Each native routing cell is cut by the candidate strips that touch it; the
resulting pieces are matched to room arrivals and to the portal nodes of
enabled door/opening/vertical edges. A piece holding a room arrival but no
portal would isolate that room."""
import glob, json, sys
from collections import defaultdict
import shapely
from shapely.geometry import Polygon, Point
cells_dir, graph, cand_path, out = sys.argv[1:5]
keep = set(open(sys.argv[5]).read().split()) if len(sys.argv) > 5 else None
G = json.load(open(graph)); C = json.load(open(cand_path))["candidates"]
if keep is not None: C = [c for c in C if c["patch"]["id"] in keep]
rec = {r["key"]: r for r in G["records"]}
nodes = {n["id"]: n for n in G["nodes"]}
portal_nodes = defaultdict(set)
for e in G["edges"]:
    if e["enabled"] and e["kind"] in ("door", "opening", "elevator", "stairs", "ramp", "local-steps", "escalator"):
        for nid in (e["from"], e["to"]):
            n = nodes.get(nid)
            if n: portal_nodes[n["levelId"]].add(nid)
patches = defaultdict(list)
for c in C: patches[c["levelId"]].append((Polygon(c["patch"]["ringsFeet"][0]), c["patch"]["id"]))
result = {"cells": [], "isolated": [], "separatedPairs": 0}
for path in sorted(glob.glob(f"{cells_dir}/level-*.json")):
    L = json.load(open(path)); lv = L["level"]["id"]
    if lv not in patches: continue
    tree = shapely.STRtree([p for p, _ in patches[lv]])
    arrivals = [n for n in G["nodes"] if n.get("levelId") == lv and n["kind"] == "arrival"]
    for cell in L["cells"]:
        rings = cell["ringsFeet"]
        try:
            poly = shapely.make_valid(Polygon(rings[0], rings[1:]))
        except Exception:
            continue
        hit = [i for i in tree.query(poly) if patches[lv][i][0].intersects(poly)]
        if not hit: continue
        cut = poly.difference(shapely.union_all([patches[lv][i][0] for i in hit]))
        pieces = [g for g in getattr(cut, "geoms", [cut]) if g.area > 0.01]
        def piece_of(pt):
            p = Point(pt[:2]); d = [g.distance(p) for g in pieces]
            j = min(range(len(d)), key=d.__getitem__) if d else None
            return j if j is not None and d[j] < 0.5 else None
        room_piece, portal_piece = {}, defaultdict(set)
        for n in arrivals:
            if n["roomKey"] in cell["roomKeys"]:
                j = piece_of(n["pointFeet"])
                if j is not None: room_piece[n["roomKey"]] = j
        for nid in portal_nodes[lv]:
            j = piece_of(nodes[nid]["pointFeet"])
            if j is not None and poly.distance(Point(nodes[nid]["pointFeet"][:2])) < 0.5: portal_piece[j].add(nid)
        groups = defaultdict(list)
        for k, j in room_piece.items(): groups[j].append(k)
        name = lambda k: (rec[k]["number"] or rec[k]["name"]) if k in rec else k
        row = {"cellId": cell["id"], "levelId": lv, "patches": [patches[lv][i][1] for i in hit],
               "pieces": [{"rooms": sorted(name(k) for k in ks), "roomKeys": sorted(ks), "portals": len(portal_piece[j]), "areaSquareFeet": round(pieces[j].area, 2)} for j, ks in groups.items()]}
        result["cells"].append(row)
        if len(groups) > 1: result["separatedPairs"] += 1
        for j, ks in groups.items():
            if not portal_piece[j]:
                result["isolated"].append({"cellId": cell["id"], "levelId": lv, "rooms": sorted(name(k) for k in ks), "roomKeys": sorted(ks), "patches": row["patches"]})
json.dump(result, open(out, "w"), indent=1)
print("cells touched", len(result["cells"]), "split cells", result["separatedPairs"], "isolated pieces", len(result["isolated"]))
for x in result["isolated"]: print("  ISOLATED", x["levelId"], x["rooms"], x["patches"][:3])
