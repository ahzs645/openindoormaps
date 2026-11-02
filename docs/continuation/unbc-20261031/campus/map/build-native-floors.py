"""Build the four visitor floors from native geometry only.

Spaces are the native wall-bounded cells and the plan linework is the native
wall footprints. The old room shapes are used once, to place each room's name
at a point inside it, and are then discarded: no room outline is written.
Paths, crossings and stops come from the pathway export unchanged. Native door
pair proposals and disconnected vestibules are attached as evidence.
"""
import json
import math
import os
import sys
import zipfile

candidate, preview, proposals_path, vestibules_path, out = sys.argv[1:6]
d = json.loads(zipfile.ZipFile(candidate).read("viewer/indoor.json"))
index = json.load(open(os.path.join(preview, "data", "index.json")))
proposals = json.load(open(proposals_path))
vestibules = json.load(open(vestibules_path))
os.makedirs(out, exist_ok=True)

FLOORS = [
    ("campus-floor-1", "Campus Floor 1", "storey:1450417+311+1487816"),
    ("floor-2", "Floor 2", "storey:694"),
    ("campus-floor-3", "Campus Floor 3", "storey:400176+1487353"),
    ("floor-4", "Floor 4", "storey:402367"),
]
levels = {m["id"]: (m, json.load(open(os.path.join(preview, "data", m["url"])))) for m in index["levels"]}

# Same similarity fit as the first map: native feet -> local north-up metres.
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
resid = max(math.hypot(a * x - b * y + c - e, b * x + a * y + dd - q) for x, y, e, q in xs)
FRAME = os.environ.get("MAP_FRAME")
if FRAME:
    # Pinned display frame: keeps map coordinates stable across candidates whose
    # guide polylines (and so the fitted pair mean) differ. Report the residual
    # of this candidate's pairs under the pinned frame.
    fr = json.load(open(FRAME))
    a, b, c, dd = fr["a"], fr["b"], fr["c"], fr["dd"]
    lat0, lon0 = fr["lat0"], fr["lon0"]
    mx = 111320.0 * math.cos(math.radians(lat0))
    xs = [(p[0], p[1], (p[2] - lon0) * mx, (p[3] - lat0) * my) for p in pairs]
    resid = max(math.hypot(a * x - b * y + c - e, b * x + a * y + dd - q) for x, y, e, q in xs)
elif os.environ.get("MAP_FRAME_OUT"):
    json.dump({"a": a, "b": b, "c": c, "dd": dd, "lat0": lat0, "lon0": lon0, "pairs": n}, open(os.environ["MAP_FRAME_OUT"], "w"))


def tf(p):
    return [round((a * p[0] - b * p[1] + c) * 10), round((b * p[0] + a * p[1] + dd) * 10)]


def line(pts):
    flat = []
    for p in pts:
        flat.extend(tf(p))
    return flat


def inside(x, y, ring):
    hit = False
    for i in range(len(ring)):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % len(ring)][0], ring[(i + 1) % len(ring)][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def label_point(rings):
    """A point inside the outer ring and outside its holes: centroid if valid,
    otherwise the middle of the widest horizontal span through the shape."""
    outer = rings[0]
    cx = sum(p[0] for p in outer) / len(outer)
    cy = sum(p[1] for p in outer) / len(outer)
    ok = lambda x, y: inside(x, y, outer) and not any(inside(x, y, h) for h in rings[1:])
    if ok(cx, cy):
        return cx, cy
    ys = sorted(p[1] for p in outer)
    best = None
    for k in range(1, 20):
        yy = ys[0] + (ys[-1] - ys[0]) * k / 20
        hits = []
        for i in range(len(outer)):
            x1, y1 = outer[i][0], outer[i][1]
            x2, y2 = outer[(i + 1) % len(outer)][0], outer[(i + 1) % len(outer)][1]
            if (y1 > yy) != (y2 > yy):
                hits.append(x1 + (yy - y1) * (x2 - x1) / (y2 - y1))
        hits.sort()
        for j in range(0, len(hits) - 1, 2):
            w = hits[j + 1] - hits[j]
            mxp = (hits[j] + hits[j + 1]) / 2
            if (best is None or w > best[0]) and ok(mxp, yy):
                best = (w, mxp, yy)
    return (best[1], best[2]) if best else (cx, cy)


rec = {r["key"]: r for r in d["records"]}
prop_by_level = {}
for p in proposals["proposals"]:
    prop_by_level.setdefault(p["levelId"], []).append(p)
doors_by_level = {}
for door in d["doors"]:
    doors_by_level.setdefault(door["levelId"], []).append(door)
walls_by_level = {}
for w in d["walls"]:
    walls_by_level.setdefault(w["levelId"], []).append(w)
disconnected = {v["key"] for v in vestibules if not v["inMain"]}

summary = []
for fid, name, storey in FLOORS:
    lids = [lid for lid, (m, _) in levels.items() if any(cf["id"] == storey for cf in m.get("campusFloors", []))]
    lids.sort(key=lambda i: levels[i][0]["elevationFeet"])
    fl = {"id": fid, "name": name, "levels": [], "names": [], "cells": [], "walls": [], "doors": [], "guides": [], "walks": [], "links": [], "stops": [], "held": [], "vertical": [], "seams": [], "approaches": [], "proposals": [], "vestibules": []}
    name_index = {}
    seen_edges, seen_nodes = set(), set()
    seen_cells = set()
    for lid in lids:
        meta, data = levels[lid]
        fl["levels"].append({"id": lid, "name": meta["name"]})
        # Names from the old room shapes: one interior point each, shape discarded.
        for r in data["rooms"]:
            if not r["ringsFeet"]:
                continue
            x, y = label_point(r["ringsFeet"])
            flags = (1 if r.get("circulation") else 0) | (2 if r.get("stair") else 0) | (4 if r.get("access") == "staff" else 0) | (16 if r.get("access") == "public" else 0) | (32 if r["key"] in disconnected else 0)
            name_index[r["key"]] = len(fl["names"])
            fl["names"].append([r.get("number") or "", r.get("name") or "", r.get("building") or "", flags, tf((x, y))])
        for cell in data["cells"]:
            if cell["id"] in seen_cells:
                continue
            seen_cells.add(cell["id"])
            owners = [name_index[k] for k in cell["roomKeys"] if k in name_index]
            fl["cells"].append([cell["id"], owners, [line(rg) for rg in cell["ringsFeet"] if len(rg) >= 3]])
        for w in walls_by_level.get(lid, []):
            for rg in w["ringsFeet"]:
                if len(rg) >= 3:
                    fl["walls"].append(line(rg))
        for door in doors_by_level.get(lid, []):
            if door.get("footprintFeet"):
                fl["doors"].append([line(door["footprintFeet"]), door["nativeElementId"], {"connected": 0, "unmatched": 1}.get(door.get("state"), 2)])
        for f in data["network"]["hallwayPaths"]["features"]:
            pts = f["properties"].get("pointsFeet")
            if pts and len(pts) >= 2:
                (fl["guides"] if f["properties"].get("source") == "shared-guide" else fl["walks"]).append(line(pts))
        for f in data["network"]["pathConnections"]["features"]:
            p = f["properties"]
            role, kind = p.get("role"), p.get("kind")
            if f["geometry"]["type"] == "Point":
                # Markers carry pointFeet. One per node: lift, ramp and step
                # ends, held stair ends and missing walking approaches.
                node, pt = p.get("nodeId"), p.get("pointFeet")
                if not pt or node in seen_nodes:
                    continue
                seen_nodes.add(node)
                fl["stops"].append([tf(pt), "gap" if role == "gap" else kind, role, p.get("label") or "", p.get("toFloors") or []])
                continue
            pts = p.get("pointsFeet") or []
            eid = p.get("edgeId") or ""
            if len(pts) < 2 or eid in seen_edges:
                continue
            seen_edges.add(eid)
            if role == "held":
                fl["held"].append([line(pts), p.get("nativeElementId")])
            elif kind in ("ramp", "local-steps", "stairs", "escalator"):
                fl["vertical"].append([line(pts), p.get("nativeElementId"), kind])
            elif kind == "door":
                fl["links"].append([line(pts), p.get("nativeElementId"), kind, 1 if role == "transition" else 0])
            elif kind == "opening" and eid.startswith("opening:"):
                # Seams and open joins inside one native space continue the path.
                fl["seams"].append(line(pts))
            elif kind in ("opening", "walk"):
                # Native approach walks (to ramp landings, across building lines):
                # walking lines, not doorway crossings.
                fl["approaches"].append(line(pts))
            # Lift shafts are drawn by their stop markers only.
        for p in prop_by_level.get(lid, []):
            door = next(x for x in doors_by_level[lid] if x["nativeElementId"] == p["door"])
            fl["proposals"].append([tf(door["pointFeet"]), p["door"], p["sideA"]["nearestOwner"], p["sideB"]["nearestOwner"], p["sideA"]["gapFeet"], p["sideB"]["gapFeet"], p["existing"]])
    for v in vestibules:
        if not v["inMain"] and v["key"] in name_index:
            fl["vestibules"].append(name_index[v["key"]])
    path = os.path.join(out, f"{fid}.json")
    json.dump(fl, open(path, "w"), separators=(",", ":"))
    summary.append({k: (len(v) if isinstance(v, list) else v) for k, v in fl.items() if k not in ("id",)} | {"id": fid, "bytes": os.path.getsize(path)})
print(json.dumps({"metresPerFoot": math.hypot(a, b), "maxResidualMetres": resid}))
for s in summary:
    print(json.dumps(s))
