"""Same similarity fit as build-native-floors.py: native feet -> decimetre plan."""
import json, math, os


def load_fit(preview):
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
    n = len(xs); sx = sum(p[0] for p in xs) / n; sy = sum(p[1] for p in xs) / n
    se = sum(p[2] for p in xs) / n; sn = sum(p[3] for p in xs) / n
    na = nb = den = 0.0
    for x, y, e, q in xs:
        x, y, e, q = x - sx, y - sy, e - se, q - sn
        na += x * e + y * q; nb += x * q - y * e; den += x * x + y * y
    a, b = na / den, nb / den
    c, dd = se - a * sx + b * sy, sn - b * sx - a * sy
    if os.environ.get("MAP_FRAME"):
        # Pinned display frame (see build-native-floors.py): stable coordinates
        # across candidates whose guide polylines differ.
        fr = json.load(open(os.environ["MAP_FRAME"]))
        a, b, c, dd = fr["a"], fr["b"], fr["c"], fr["dd"]

    def line(pts):
        return [v for p in pts for v in (round((a * p[0] - b * p[1] + c) * 10), round((b * p[0] + a * p[1] + dd) * 10))]
    return line, levels, (a, b, c, dd)

STOREYS = {"campus-floor-1": "storey:1450417+311+1487816", "floor-2": "storey:694",
           "campus-floor-3": "storey:400176+1487353", "floor-4": "storey:402367"}


def floor_levels(levels, storey):
    lids = [lid for lid, (m, _) in levels.items() if any(cf["id"] == storey for cf in m.get("campusFloors", []))]
    lids.sort(key=lambda i: levels[i][0]["elevationFeet"])
    return lids
