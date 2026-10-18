"""Render the actual selected-floor overlay output as analytical figures.
Usage: render-path-network-floors.py network.json OUTPUT_DIRECTORY
"""
import json
import math
import pathlib
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path
from matplotlib.patches import PathPatch
from matplotlib.collections import LineCollection
from matplotlib.lines import Line2D

source, output = sys.argv[1:]
d = json.loads(pathlib.Path(source).read_text())
out = pathlib.Path(output)
out.mkdir(parents=True, exist_ok=True)
alignment = d["alignment"]
c, s = math.cos(alignment["rotationRadians"]), math.sin(alignment["rotationRadians"])


def feet(p):
    east = (p[0]-alignment["originGeographic"][0])*math.pi/180*6378137*math.cos(alignment["projectionLatitude"]*math.pi/180)
    north = (p[1]-alignment["originGeographic"][1])*math.pi/180*6378137
    return [(east*c+north*s)/alignment["horizontalMetresPerFoot"]+alignment["originFeet"][0],
            (-east*s+north*c)/alignment["horizontalMetresPerFoot"]+alignment["originFeet"][1]]


def draw(ax, floor):
    for room in d["records"]:
        if room["levelId"] not in floor["levelIds"]:
            continue
        vertices, codes = [], []
        for ring in room["ringsFeet"]:
            vertices += [p[:2] for p in ring]+[ring[0][:2]]
            codes += [Path.MOVETO]+[Path.LINETO]*(len(ring)-1)+[Path.CLOSEPOLY]
        ax.add_patch(PathPatch(Path(vertices, codes), facecolor="#d3e4da" if room["circulation"] else "#e9ede8", edgecolor="#cad1cb", linewidth=.18))
    for source_kind, color, width in [("saved-walk", "#687a85", .55), ("shared-guide", "#287c83", .65)]:
        lines = [[p[:2] for p in f["properties"]["pointsFeet"]] for f in floor["paths"]["features"] if f["properties"]["source"] == source_kind and f["properties"]["role"] != "approach"]
        ax.add_collection(LineCollection(lines, colors=color, linewidths=width))
    for feature in floor["connections"]["features"]:
        p, g = feature["properties"], feature["geometry"]
        if p.get("role") == "held":
            continue
        if g["type"] == "LineString":
            ax.add_collection(LineCollection([[feet(q) for q in g["coordinates"]]], colors="#7054a1" if p["role"] == "transition" else "#287c83", linewidths=.8))
        elif g["type"] == "Point":
            x, y = feet(g["coordinates"])
            ax.scatter([x], [y], s=12, color="#b44b47" if p.get("approachStatus") == "missing-walking-approach" else "#7054a1", zorder=5)
    ax.autoscale_view()
    ax.margins(.035)
    ax.set_aspect("equal")
    ax.axis("off")
    gaps = floor["status"].get("missing-walking-approach", 0)
    ax.set_title(f"{floor['name']} · {floor['summary']['originalWalkingEdgesShown']:,} saved walking edges · {gaps} missing approaches", fontsize=12, loc="left", pad=10)


fig, axes = plt.subplots(2, 2, figsize=(15, 13), facecolor="#fafbf9")
for ax, floor in zip(axes.flat, d["floors"]):
    draw(ax, floor)
fig.suptitle("UNBC · pathway network across the four defined floors", fontsize=21, x=.04, ha="left", color="#20352e")
fig.legend([Line2D([0], [0], color=color, lw=2) for color in ["#287c83", "#687a85", "#7054a1", "#b44b47"]],
           ["Shared hallway guides", "Saved fallback paths", "Lift, ramp and local stair links", "Missing lateral approaches"],
           ncol=2, frameon=False, loc="lower center", bbox_to_anchor=(.5, .035))
fig.text(.04, .015, "Analytical rendering of the candidate viewer functions. Held full-stair links remain omitted.\n"
         "This is saved network coverage, not proof of all-pair navigation, physical clearance or step-free access.", fontsize=9, color="#56685f")
fig.tight_layout(rect=(.02, .09, .99, .95))
fig.savefig(out/"four-floor-pathways.png", dpi=170)
plt.close(fig)
for floor in d["floors"]:
    fig, ax = plt.subplots(figsize=(11, 13), facecolor="#fafbf9")
    draw(ax, floor)
    fig.text(.05, .015, "Candidate analytical view · held full stairs omitted · source graph and geometry unchanged", fontsize=9, color="#56685f")
    fig.tight_layout(rect=(.02, .04, .99, .99))
    fig.savefig(out/(floor["name"].lower().replace(" ", "-")+"-pathways.png"), dpi=170)
    plt.close(fig)
print(out)
