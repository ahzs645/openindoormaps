"""Plot the saved, read-only corridor experiment; this is not a UI screenshot.
Usage: python3 scripts/indoor/render-corridor-proposal.py proposal.json figure.png
Requires matplotlib and numpy, not the native model or a running map server.
"""
import json
import math
import pathlib
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    data = json.loads(pathlib.Path(sys.argv[1]).read_text())
    ring = data["ringsFeet"][0]
    a, b = max(zip(ring, ring[1:] + ring[:1]),
               key=lambda pair: math.dist(pair[0], pair[1]))
    angle = math.atan2(b[1] - a[1], b[0] - a[0])
    c, s = math.cos(angle), math.sin(angle)
    local = lambda p: (p[0] * c + p[1] * s, -p[0] * s + p[1] * c)
    points = [local(p) for p in ring]
    xmin, xmax = min(p[0] for p in points), max(p[0] for p in points)
    ymin, ymax = min(p[1] for p in points), max(p[1] for p in points)
    transform = lambda ps: list(zip(*(local(p) for p in ps)))
    branch_ids = {b["nodeId"] for b in data["branches"]}
    end_terminals = sorted((t for t in data["terminals"]
                            if local(t["pointFeet"])[0] < xmin + 4),
                           key=lambda t: local(t["pointFeet"])[0])
    fig, axes = plt.subplots(2, 1, figsize=(13, 6.8), facecolor="#f9fafb")
    for index, ax in enumerate(axes):
        ax.set_facecolor("#f9fafb")
        for r in data["ringsFeet"]:
            ax.add_patch(Polygon([local(p) for p in r], closed=True,
                                 facecolor="#c7dfd2", edgecolor="#727c77", linewidth=1.2))
        for terminal in data["terminals"]:
            x, y = local(terminal["pointFeet"])
            pending = index == 1 and terminal["nodeId"] not in branch_ids
            color = "#b53f36" if pending else "#263a35"
            ax.scatter([x], [y], s=35, color=color, zorder=5)
            label = data["labels"][terminal["nodeId"]]
            if pending:
                label += " · approach pending"
            label_y = ymax + 1.55 if y > (ymin + ymax) / 2 else ymin - 1.55
            # End doors are close together; place their labels on opposite sides.
            if x < xmin + 4:
                rank = next(i for i, t in enumerate(end_terminals) if t["nodeId"] == terminal["nodeId"])
                x_label = xmin - 1.8 + rank * 5.5
            else:
                x_label = x
            ax.annotate(label, (x, y), xytext=(x_label, label_y), ha="center", va="center",
                        fontsize=9, color=color, arrowprops={"arrowstyle": "-", "color": color, "lw": 0.6})
        ax.set_xlim(xmin - 3, xmax + 3)
        ax.set_ylim(ymin - 3.3, ymax + 3.3)
        ax.set_aspect("equal")
        ax.axis("off")
    for original in data["originalPaths"]:
        axes[0].plot(*transform(original["pointsFeet"]), color="#379bc5", lw=2, alpha=0.65)
    for run in data["runs"]:
        axes[1].plot(*transform(run["pointsFeet"]), color="#196eaa", lw=4, solid_capstyle="round")
    for branch in data["branches"]:
        axes[1].plot(*transform(branch["pointsFeet"]), color="#d77b14", lw=2.3)
    axes[0].set_title(f"Current stored geometry · {len(data['originalPaths'])} walking branches",
                      loc="left", fontsize=12, color="#263a35", pad=14)
    axes[1].set_title(f"Proposed shared centre path · {len(data['branches'])} of {len(data['terminals'])} door branches pass the saved-face check",
                      loc="left", fontsize=12, color="#263a35", pad=14)
    fig.suptitle(f"Corridor {', '.join(data['roomNumbers'])} · stored paths and centreline proposal",
                 fontsize=18, x=0.055, ha="left", color="#1b302a")
    fig.text(0.055, 0.03,
             "Geometry experiment, not live directions. Door coordinates are unchanged.\n"
             "Red nodes need their own finite doorway-half approaches. Full width, material and policy replay remain required.",
             fontsize=10, color="#56635c", linespacing=1.5)
    fig.subplots_adjust(left=0.055, right=0.98, top=0.87, bottom=0.14, hspace=0.7)
    destination = pathlib.Path(sys.argv[2])
    destination.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(destination, dpi=150)
    print(destination)


if __name__ == "__main__":
    main()
