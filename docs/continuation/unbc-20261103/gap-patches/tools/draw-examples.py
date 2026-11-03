"""Before/after figures of the owner's examples in the map display frame.
usage: draw-examples.py GEOMETRY.json GRAPH-FULL.json FRAME.json FLOOR.json CELLS-DIR CANDIDATES.json KEEP.txt OUT.png ROOM [ROOM...]
Before: native walls, routing cells and the saved walks. After: the same cells
cut by the kept patches (one colour per resulting piece) and the walks that the
patches block (dashed red). New walks need the Reviter regeneration, so none
are drawn."""
import json, sys
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import shapely
from shapely.geometry import Polygon, LineString
geo, graph, frame, floor, cells_dir, cand, keep_path, out, *rooms = sys.argv[1:]
GEO = json.load(open(geo)); G = json.load(open(graph)); F = json.load(open(frame)); FL = json.load(open(floor))
keep = set(open(keep_path).read().split())
lv = FL["levels"][0]["id"]
a, b, c, dd = F["a"], F["b"], F["c"], F["dd"]
tf = lambda p: (a * p[0] - b * p[1] + c, b * p[0] + a * p[1] + dd)
names = {n[0]: n for n in FL["names"]}
L = json.load(open(f"{cells_dir}/level-{lv}.json"))
C = [x for x in json.load(open(cand))["candidates"] if x["levelId"] == lv]
kept = [x for x in C if x["patch"]["id"] in keep]
dropped = [x for x in C if x["patch"]["id"] not in keep]
nodes = {n["id"]: n for n in G["nodes"]}
rec = {r["key"]: r for r in G["records"]}
walks = [e for e in G["edges"] if e["kind"] == "walk" and e["enabled"] and nodes.get(e["from"], {}).get("levelId") == lv]
kp = [Polygon(x["patch"]["ringsFeet"][0]) for x in kept]
kpu = shapely.union_all(kp) if kp else None
blocked = {e["id"] for e in walks if kpu is not None and LineString([p[:2] for p in e["pointsFeet"]]).intersects(kpu.buffer(-1e-4))}
HALF = 16.0
fig, axes = plt.subplots(len(rooms), 2, figsize=(15, 7.6 * len(rooms)))
if len(rooms) == 1: axes = [axes]
cols = plt.cm.tab20.colors
for row, room in zip(axes, rooms):
    cx, cy = names[room][4][0] / 10, names[room][4][1] / 10
    inwin = lambda pts: any(abs(x - cx) < HALF * 1.3 and abs(y - cy) < HALF * 1.3 for x, y in pts)
    for k, ax in enumerate(row):
        for w in GEO["walls"]:
            if w[0] != lv: continue
            r = [tf(p) for p in w[5][0]]
            if inwin(r): ax.fill(*zip(*r), color="#c9c9c9" if w[3] else "#555", lw=0)
        for cell in L["cells"]:
            ring = [tf(p) for p in cell["ringsFeet"][0]]
            if not inwin(ring): continue
            if k == 0:
                ax.plot(*zip(*(ring + ring[:1])), color="#bbb", lw=0.5)
            else:
                poly = shapely.make_valid(Polygon(cell["ringsFeet"][0], cell["ringsFeet"][1:]))
                hit = [p for p in kp if p.intersects(poly)]
                pieces = poly.difference(shapely.union_all(hit)) if hit else poly
                parts = [g for g in getattr(pieces, "geoms", [pieces]) if g.geom_type == "Polygon" and g.area > 0.01]
                for i, g in enumerate(parts):
                    xy = [tf(p) for p in g.exterior.coords]
                    if len(parts) > 1: ax.fill(*zip(*xy), color=cols[(i * 3 + hash(cell["id"])) % 20], alpha=0.35, lw=0)
                    ax.plot(*zip(*xy), color="#999", lw=0.5)
        for e in walks:
            pts = [tf(p) for p in e["pointsFeet"]]
            if not inwin(pts): continue
            if k == 1 and e["id"] in blocked: ax.plot(*zip(*pts), color="#d62728", lw=1.6, ls=(0, (3, 2)))
            else: ax.plot(*zip(*pts), color="#008080", lw=1.6)
        for n in G["nodes"]:
            if n.get("levelId") == lv and n["kind"] == "arrival":
                p = tf(n["pointFeet"])
                if abs(p[0] - cx) < HALF and abs(p[1] - cy) < HALF:
                    ax.plot(*p, "o", color="#ff7f0e", ms=4)
                    r = rec.get(n["roomKey"], {})
                    ax.text(p[0] + 0.2, p[1] + 0.2, r.get("number") or "", fontsize=6, clip_on=True)
        for x in (kept if k == 1 else C):
            r = [tf(p) for p in x["patch"]["ringsFeet"][0]]
            if inwin(r):
                mx, my = sum(p[0] for p in r) / 4, sum(p[1] for p in r) / 4
                ax.fill(*zip(*r), color="magenta", lw=0)
                ax.plot(mx, my, "o", mfc="none", mec="magenta" if x in kept else "#444", ms=14, mew=1.6)
        for x in (dropped if k == 1 else []):
            r = [tf(p) for p in x["patch"]["ringsFeet"][0]]
            if inwin(r):
                mx, my = sum(p[0] for p in r) / 4, sum(p[1] for p in r) / 4
                ax.plot(mx, my, "x", color="#444", ms=10, mew=1.6)
        ax.set_xlim(cx - HALF, cx + HALF); ax.set_ylim(cy - HALF, cy + HALF); ax.set_aspect("equal")
        ax.set_xticks([]); ax.set_yticks([])
        ax.plot([cx - HALF + 1, cx - HALF + 6], [cy - HALF + 1, cy - HALF + 1], color="k", lw=3)
        ax.text(cx - HALF + 1, cy - HALF + 1.4, "5 m", fontsize=8)
        ax.set_title((f"Before: {FL['name']} around {room} (saved walks, circles = gaps found)" if k == 0 else
                      f"After patches (retraced cells; dashed red = walks the patches block)"), fontsize=10)
fig.tight_layout()
fig.savefig(out, dpi=100)
print("wrote", out, len(blocked), "blocked walks on level", lv)
