"""Analytical path figures from preserved source and actual/refined routes.
These are not browser screenshots. Geometry is never written back to the map.
Usage: render-path-repairs.py SOURCE.json REPLAYS.json OUTPUT_DIRECTORY
"""
import json
import math
import pathlib
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.lines import Line2D

source, replays, destination = sys.argv[1:]
d = json.loads(pathlib.Path(source).read_text())
proof = json.loads(pathlib.Path(replays).read_text())
out = pathlib.Path(destination)
out.mkdir(parents=True, exist_ok=True)
records = {r["key"]: r for r in d["records"]}
edges = {e["id"]: e for e in d["edges"]}
guides = {g["edgeId"]: g for g in d["preparedRouting"]["guides"]}

def bounds(points):
    return (min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points))

def draw_area(ax, rings, transform=lambda p: p, color="#c2dcd0", lw=0.6):
    for i, ring in enumerate(rings):
        ax.add_patch(Polygon([transform(p) for p in ring], closed=True,
                             facecolor=color if i == 0 else "#f5f5f1", edgecolor="#8c9993", linewidth=lw))

def line(ax, points, transform=lambda p: p, **kwargs):
    ps = [transform(p) for p in points]
    ax.plot([p[0] for p in ps], [p[1] for p in ps], **kwargs)

fig, axes = plt.subplots(1, 3, figsize=(14, 5), facecolor="#fafbf9")
for ax, number in zip(axes, ["04-122", "04-202", "04-301"]):
    room = next(r for r in d["records"] if r["number"] == number)
    case = next(r for r in proof["results"] if r["id"].startswith(number+":through:") and not r["id"].endswith("true"))
    a, b = case["paths"][0]["pointsFeet"][0], case["paths"][-1]["pointsFeet"][-1]
    angle = math.atan2(b[1]-a[1], b[0]-a[0])
    c, s = math.cos(angle), math.sin(angle)
    transform = lambda p: ((p[0]-a[0])*c+(p[1]-a[1])*s, -(p[0]-a[0])*s+(p[1]-a[1])*c)
    draw_area(ax, room["ringsFeet"], transform)
    for index, eid in enumerate(case["edgeIds"]):
        edge, guide = edges[eid], guides[eid]
        ps = guide["pointsFeet"] if edge["from"] == case["nodeIds"][index] else list(reversed(guide["pointsFeet"]))
        line(ax, ps, transform, color="#cf7a26", lw=2, alpha=0.8, linestyle="--")
    for p in case["paths"]:
        line(ax, p["pointsFeet"], transform, color="#1687c6", lw=3.6, solid_capstyle="round")
    for p in [a, b]:
        x, y = transform(p)
        ax.scatter([x], [y], s=42, color="#174d68", zorder=5)
    lo = bounds([transform(p) for ring in room["ringsFeet"] for p in ring])
    ax.set_xlim(lo[0]-1.2, lo[2]+1.2)
    ax.set_ylim(lo[1]-1.2, lo[3]+1.2)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(number+" vestibule", loc="left", fontsize=14, color="#263d34", pad=14)
fig.suptitle("Building 04 · straight paths through vestibules", fontsize=20, x=0.05, ha="left", color="#20352e")
fig.legend([Line2D([0],[0],color="#cf7a26",ls="--",lw=2),Line2D([0],[0],color="#1687c6",lw=3)], ["Earlier saved guide", "New clearance-checked path"], loc="lower center", bbox_to_anchor=(0.5,0.09),ncol=2, frameon=False)
fig.text(0.05,0.025,"Analytical view from the complete map. Original door endpoints, graph, source floor holes and access rules are preserved.\nStraightening is refused where the continuous two-foot strip or original crossing policy fails.",fontsize=9,color="#56685f")
fig.subplots_adjust(left=.05,right=.98,top=.84,bottom=.23,wspace=.25)
fig.savefig(out/"building04-vestibules.png",dpi=160)
plt.close(fig)

floors=d["floors"]
fig,axes=plt.subplots(2,3,figsize=(15,10),facecolor="#fafbf9")
node_map={n["id"]:n for n in d["nodes"]}
for ax,floor in zip(axes.flat,floors):
    level_ids=set(floor["levelIds"])
    selected=[r for r in d["records"] if r["levelId"] in level_ids]
    for r in selected:
        draw_area(ax,r["ringsFeet"],color="#d5e6dc" if r["circulation"] else "#e7e9e5",lw=.12)
    for eid,g in guides.items():
        e=edges[eid]
        if not e["enabled"] or e["kind"]!="walk" or node_map[e["from"]]["levelId"] not in level_ids: continue
        if g.get("kind")!="shared-corridor":continue
        ps=g["pointsFeet"]
        if "hallwayJoins" in g: ps=ps[g["hallwayJoins"][0]:g["hallwayJoins"][1]+1]
        line(ax,ps,color="#287c83",lw=.65,alpha=.85)
    ax.set_title(floor["name"],loc="left",fontsize=13,color="#20352e")
    ax.set_aspect("equal")
    ax.autoscale_view()
    ax.axis("off")
for ax in list(axes.flat)[len(floors):]:ax.axis("off")
fig.suptitle("UNBC · hallway guides by floor",fontsize=21,x=.05,ha="left",color="#20352e")
fig.text(.05,.025,"Analytical overview of saved shared hallway guides, with source room outlines. Held stair links are omitted.\nThese guides show the planar network; directions still check access, original doorways and each selected profile. This is not a step-free coverage map.",fontsize=10,color="#56685f")
fig.subplots_adjust(left=.04,right=.98,top=.93,bottom=.10,hspace=.13,wspace=.10)
fig.savefig(out/"floor-hallway-guides.png",dpi=160)
plt.close(fig)
print(out)
