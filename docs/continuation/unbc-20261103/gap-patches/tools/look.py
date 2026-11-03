"""Plot a feet-frame window of one native level: walls, doors, cells, walks.
usage: look.py LEVEL CX CY HALF OUT.png [--label]"""
import json, sys
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
C = "/home/user/unbc-work/cand-final"
lv, cx, cy, half, out = int(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
W = json.load(open(f"{C}/walls-native.json"))
D = json.load(open(f"{C}/doors-native.json"))
G = json.load(open(f"{C}/graph-full.json"))
L = json.load(open(f"/home/user/unbc-work/cand-final-preview/data/level-{lv}.json"))
inwin = lambda p: abs(p[0]-cx) < half*1.2 and abs(p[1]-cy) < half*1.2
def rin(r):
    xs=[p[0] for p in r]; ys=[p[1] for p in r]
    return min(xs) < cx+half and max(xs) > cx-half and min(ys) < cy+half and max(ys) > cy-half
fig, ax = plt.subplots(figsize=(10, 10))
for c in L["cells"]:
    for r in c["ringsFeet"]:
        if rin(r):
            ax.plot([p[0] for p in r+[r[0]]], [p[1] for p in r+[r[0]]], color="#bbb", lw=0.6)
for row in W["rows"]:
    if row[0] != lv: continue
    for r in row[3]:
        if rin(r):
            ax.fill([p[0] for p in r], [p[1] for p in r], color="#333", lw=0)
            if "--ids" in sys.argv: ax.text(sum(p[0] for p in r)/len(r), sum(p[1] for p in r)/len(r), str(row[1]), fontsize=6, color="purple", clip_on=True)
for row in D["rows"]:
    if row[0] != lv or not row[3]: continue
    r = row[3]
    if rin(r):
        ax.fill([p[0] for p in r], [p[1] for p in r], color="#e8a", alpha=0.6, lw=0)
nodes = {n["id"]: n for n in G["nodes"]}
for e in G["edges"]:
    if e["kind"] not in ("walk", "door", "opening") or not e["enabled"]: continue
    n = nodes.get(e["from"])
    if not n or n.get("levelId") != lv: continue
    pts = e["pointsFeet"]
    if rin(pts):
        ax.plot([p[0] for p in pts], [p[1] for p in pts], color={"walk": "teal", "door": "red", "opening": "orange"}[e["kind"]], lw=1.2)
recs = {r["key"]: r for r in G["records"]}
for n in G["nodes"]:
    if n.get("levelId") == lv and n["kind"] == "arrival" and inwin(n["pointFeet"]):
        r = recs.get(n["roomKey"], {})
        ax.plot(*n["pointFeet"][:2], "o", color="darkorange", ms=3)
        ax.text(n["pointFeet"][0], n["pointFeet"][1], r.get("number") or r.get("name", "")[:12], fontsize=6, clip_on=True)
if "--patches" in sys.argv:
    for c in json.load(open(sys.argv[sys.argv.index("--patches") + 1]))["candidates"]:
        r = c["patch"]["ringsFeet"][0]
        if c["levelId"] == lv and rin(r): ax.fill([p[0] for p in r], [p[1] for p in r], color="magenta", alpha=0.8, lw=0)
ax.set_xlim(cx-half, cx+half); ax.set_ylim(cy-half, cy+half); ax.set_aspect("equal")
fig.savefig(out, dpi=110, bbox_inches="tight")
