"""Add the complete walking network to the native floor files.

The earlier map drew only the hallway view (walks whose ends are both passage
areas), so walks the router uses through rooms such as 04-259 Rotunda or the
08-246/08-248/08-249 office suite were missing. Here every ENABLED walk edge
on each visitor floor is drawn: with its accepted shared-guide geometry when
one exists, otherwise its original saved geometry. Nothing is invented and no
edge is dropped.

net entries: [flat decimetre line, category, edge index]
  category 0 = hallway, simplified   1 = hallway, original
           2 = through rooms, simplified   3 = through rooms, original
"""
import json
import math
import os
import sys

graph_path, guides_path, preview, floors_dir = sys.argv[1:5]
g = json.load(open(graph_path))
guides = {x["edgeId"]: x["pointsFeet"] for x in json.load(open(guides_path))["guides"]}
index = json.load(open(os.path.join(preview, "data", "index.json")))
levels = {m["id"]: (m, json.load(open(os.path.join(preview, "data", m["url"])))) for m in index["levels"]}

# Same similarity fit as build-native-floors.py.
pairs = []
for _, data in levels.values():
    for layer in data["network"].values():
        for f in layer["features"]:
            pts = f["properties"].get("pointsFeet")
            if f["geometry"]["type"] == "LineString" and pts and len(pts) == len(f["geometry"]["coordinates"]):
                pairs.extend((p[0], p[1], c[0], c[1]) for p, c in zip(pts, f["geometry"]["coordinates"]))
lat0 = sum(p[3] for p in pairs) / len(pairs)
lon0 = sum(p[2] for p in pairs) / len(pairs)
mx, my = 111320.0 * math.cos(math.radians(lat0)), 110540.0
xs = [(p[0], p[1], (p[2] - lon0) * mx, (p[3] - lat0) * my) for p in pairs]
n = len(xs)
sx, sy = sum(p[0] for p in xs) / n, sum(p[1] for p in xs) / n
se, sn = sum(p[2] for p in xs) / n, sum(p[3] for p in xs) / n
na = nb = den = 0.0
for x, y, e, q in xs:
    x, y, e, q = x - sx, y - sy, e - se, q - sn
    na += x * e + y * q
    nb += x * q - y * e
    den += x * x + y * y
a, b = na / den, nb / den
c, dd = se - a * sx + b * sy, sn - b * sx - a * sy


def line(pts):
    flat = []
    for p in pts:
        flat.extend([round((a * p[0] - b * p[1] + c) * 10), round((b * p[0] + a * p[1] + dd) * 10)])
    return flat


rec = {r["key"]: r for r in g["records"]}
node_level = {nd["id"]: nd.get("levelId") for nd in g["nodes"]}
node_room = {nd["id"]: nd.get("roomKey") for nd in g["nodes"]}
passage = lambda k: k in rec and (rec[k]["circulation"] or rec[k]["stair"])

STOREYS = {
    "campus-floor-1": "storey:1450417+311+1487816",
    "floor-2": "storey:694",
    "campus-floor-3": "storey:400176+1487353",
    "floor-4": "storey:402367",
}
report = {}
for fid, storey in STOREYS.items():
    lids = {lid for lid, (m, _) in levels.items() if any(cf["id"] == storey for cf in m.get("campusFloors", []))}
    path = os.path.join(floors_dir, f"{fid}.json")
    fl = json.load(open(path))
    net, edges_meta = [], []
    counts = [0, 0, 0, 0]
    for e in g["edges"]:
        if e["kind"] != "walk" or not e["enabled"]:
            continue
        if node_level.get(e["from"]) not in lids and node_level.get(e["to"]) not in lids:
            continue
        pts = guides.get(e["id"]) or e.get("pointsFeet") or []
        if len(pts) < 2:
            continue
        # Classify by the places at each end, as the app's hallway view does.
        ends = [node_room.get(e["from"]), node_room.get(e["to"])]
        through_room = not all(passage(k) for k in ends if k)
        cat = (2 if through_room else 0) + (0 if e["id"] in guides else 1)
        counts[cat] += 1
        net.append([line(pts), cat, len(edges_meta)])
        edges_meta.append([e["from"], e["to"]])
    fl["net"] = net
    fl["netNodes"] = edges_meta
    json.dump(fl, open(path, "w"), separators=(",", ":"))
    report[fid] = {"hallwaySimplified": counts[0], "hallwayOriginal": counts[1], "roomSimplified": counts[2], "roomOriginal": counts[3], "bytes": os.path.getsize(path)}
print(json.dumps(report, indent=1))
