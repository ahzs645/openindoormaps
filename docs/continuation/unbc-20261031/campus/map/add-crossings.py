"""Add every enabled door and opening crossing (portal to portal) to the floor files."""
import json, math, os, sys
graph_path, preview, floors_dir = sys.argv[1:4]
g = json.load(open(graph_path))
index = json.load(open(os.path.join(preview, "data", "index.json")))
levels = {m["id"]: (m, json.load(open(os.path.join(preview, "data", m["url"])))) for m in index["levels"]}
pairs = []
for _, data in levels.values():
    for layer in data["network"].values():
        for f in layer["features"]:
            pts = f["properties"].get("pointsFeet")
            if f["geometry"]["type"] == "LineString" and pts and len(pts) == len(f["geometry"]["coordinates"]):
                pairs.extend((p[0], p[1], c[0], c[1]) for p, c in zip(pts, f["geometry"]["coordinates"]))
lat0 = sum(p[3] for p in pairs) / len(pairs); lon0 = sum(p[2] for p in pairs) / len(pairs)
mx, my = 111320.0 * math.cos(math.radians(lat0)), 110540.0
xs = [(p[0], p[1], (p[2] - lon0) * mx, (p[3] - lat0) * my) for p in pairs]
n = len(xs); sx = sum(p[0] for p in xs) / n; sy = sum(p[1] for p in xs) / n; se = sum(p[2] for p in xs) / n; sn = sum(p[3] for p in xs) / n
na = nb = den = 0.0
for x, y, e, q in xs:
    x, y, e, q = x - sx, y - sy, e - se, q - sn
    na += x * e + y * q; nb += x * q - y * e; den += x * x + y * y
a, b = na / den, nb / den; c, dd = se - a * sx + b * sy, sn - b * sx - a * sy
if __import__("os").environ.get("MAP_FRAME"):
    # Pinned display frame shared with build-native-floors.py.
    _fr = __import__("json").load(open(__import__("os").environ["MAP_FRAME"]))
    a, b, c, dd = _fr["a"], _fr["b"], _fr["c"], _fr["dd"]
line = lambda pts: [v for p in pts for v in (round((a * p[0] - b * p[1] + c) * 10), round((b * p[0] + a * p[1] + dd) * 10))]
node_level = {nd["id"]: nd.get("levelId") for nd in g["nodes"]}
node_pt = {nd["id"]: nd["pointFeet"] for nd in g["nodes"]}
ST = {"campus-floor-1": "storey:1450417+311+1487816", "floor-2": "storey:694", "campus-floor-3": "storey:400176+1487353", "floor-4": "storey:402367"}
for fid, storey in ST.items():
    lids = {lid for lid, (m, _) in levels.items() if any(cf["id"] == storey for cf in m.get("campusFloors", []))}
    path = os.path.join(floors_dir, f"{fid}.json"); fl = json.load(open(path))
    out = []
    for e in g["edges"]:
        if e["kind"] not in ("door", "opening") or not e["enabled"]:
            continue
        if node_level.get(e["from"]) not in lids:
            continue
        pts = e.get("pointsFeet") or [node_pt.get(e["from"]), node_pt.get(e["to"])]
        if len(pts) < 2 or None in pts:
            continue
        out.append([line(pts), e.get("nativeElementId"), e["kind"], e["from"], e["to"]])
    fl["crossings"] = out
    json.dump(fl, open(path, "w"), separators=(",", ":"))
    print(fid, len(out))
