"""Render an analytical source crop, never a browser or accepted route screenshot.
Usage: render-door-gap-inspection.py inspection.json OUTPUT.png
"""
import json
import pathlib
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path
from matplotlib.patches import PathPatch

d = json.loads(pathlib.Path(sys.argv[1]).read_text())
fig, axes = plt.subplots(1, 2, figsize=(15, 7), facecolor="#fafbf9",
                         gridspec_kw={"width_ratios": [1.3, 1]})
for ax in axes:
    for room in d["rooms"]:
        vertices, codes = [], []
        for ring in room["ringsFeet"]:
            vertices += [p[:2] for p in ring]+[ring[0][:2]]
            codes += [Path.MOVETO]+[Path.LINETO]*(len(ring)-1)+[Path.CLOSEPOLY]
        ax.add_patch(PathPatch(Path(vertices, codes), facecolor="#c3ddd0" if room["circulation"] else "#e9ede8",
                               edgecolor="#a8b8ad", linewidth=.6))
    for segment in d["paths"]:
        points = segment["pointsFeet"]
        ax.plot([p[0] for p in points], [p[1] for p in points],
                color="#c49a47" if segment["role"] == "approach" else "#287c83",
                ls=":" if segment["role"] == "approach" else "-", lw=1.1)
    door = d["door"]
    x, y = door["pointFeet"]
    ax.scatter([x], [y], color="#b4433e", s=45, zorder=10)
    ax.set_aspect("equal")
    ax.axis("off")

axes[0].set(xlim=(-100, 110), ylim=(470, 565))
axes[0].set_title("Saved hallway network", loc="left", fontsize=15)
for text, point in [("Building 04", (-77, 475)), ("08-360 · Link", (-12, 540)),
                    ("08-316", (44, 540)), ("Building 08", (75, 475))]:
    axes[0].text(*point, text, ha="center", fontsize=10)
ps = d["originalCrossBuildingDoor"]["pointsFeet"]
axes[0].plot([p[0] for p in ps], [p[1] for p in ps], color="#7054a1", lw=3)
axes[0].annotate("Door #2315416 has no graph connection", (x, y), xytext=(-80, 556),
                 arrowprops={"arrowstyle": "->", "color": "#b4433e"}, color="#a03934", fontsize=10)

ax = axes[1]
ax.set(xlim=(24, 50), ylim=(520, 537))
ax.set_title("Native doorway and source-room gap", loc="left", fontsize=15)
for owner in d["material"]:
    if owner["nativeElementId"] != 2315423:
        continue
    for part in owner["partsFeet"]:
        for ring in part:
            ax.fill([p[0] for p in ring], [p[1] for p in ring], color="#bd5147", alpha=.75)
ax.text(26.5, 529, "08-360", fontsize=10, ha="center")
ax.text(42, 529, "08-316", fontsize=10, ha="center")
ax.annotate("50 mm bottom sill\nunder the native door", (x, y), xytext=(35, 534.4),
            fontsize=10, color="#a03934", arrowprops={"arrowstyle": "->", "color": "#b4433e"})
ax.annotate("Unowned approach\nto saved hallway boundary", (33, 528), xytext=(37, 522),
            fontsize=9, arrowprops={"arrowstyle": "->", "color": "#4c6155"}, color="#4c6155")

fig.suptitle("Floor 3 · why Building 04 and Building 08 remain disconnected", fontsize=19,
             x=.04, ha="left", color="#233d31")
fig.text(.04, .025, "Analytical source crop. Teal: saved paths; purple: existing building doorway; red: unmatched doorway / native sill.\n"
         "No route is invented, no source material removed, and no new map is published.", fontsize=9, color="#596d5e")
fig.tight_layout(rect=(.02, .09, .99, .92))
fig.savefig(sys.argv[2], dpi=170)
print(sys.argv[2])
