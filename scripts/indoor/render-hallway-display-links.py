"""Render saved display diagnostics, never browser screenshots or new routes.
Usage: render-hallway-display-links.py display-links.json OUTPUT_DIRECTORY
"""
import collections
from fractions import Fraction
import json
import math
import pathlib
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path
from matplotlib.patches import PathPatch
from matplotlib.lines import Line2D

source, target = sys.argv[1:]
d = json.loads(pathlib.Path(source).read_text())
out = pathlib.Path(target)
out.mkdir(parents=True, exist_ok=True)


def draw_rooms(ax, floor):
    for room in d["records"]:
        if room["levelId"] not in floor["levelIds"]:
            continue
        vertices, codes = [], []
        for ring in room["ringsFeet"]:
            vertices += [p[:2] for p in ring] + [ring[0][:2]]
            codes += [Path.MOVETO] + [Path.LINETO] * (len(ring) - 1) + [Path.CLOSEPOLY]
        ax.add_patch(PathPatch(Path(vertices, codes), facecolor="#c7ded2" if room["circulation"]
                              else "#eff0ed", edgecolor="#b6c0ba", linewidth=.6))
    ax.set_aspect("equal")
    ax.axis("off")


def draw_line(ax, points, **style):
    ax.plot([p[0] for p in points], [p[1] for p in points], **style)


def draw_overlay(ax, floor, fallback=False):
    for s in floor["segments"]:
        approach = s["role"] == "approach"
        draw_line(ax, s["pointsFeet"], color="#bd852c" if approach else "#287c83",
                  linewidth=1 if approach else 1.5, linestyle=":" if approach else "-", alpha=.9)
    for s in floor["connections"]:
        draw_line(ax, s["pointsFeet"], color="#7054a1" if s["role"] == "transition" else "#287c83",
                  linewidth=1.7)
    if fallback:
        for s in floor["fallbacks"]:
            draw_line(ax, s["pointsFeet"], color="#ce6541", linewidth=2, linestyle="--")


fig, axes = plt.subplots(2, 2, figsize=(13, 11), facecolor="#fafbf9")
for row, entrance in enumerate(d["entrances"]):
    floor = next(f for f in d["floors"] if f["name"] == entrance["floor"])
    for col in range(2):
        ax = axes[row, col]
        draw_rooms(ax, floor)
        draw_overlay(ax, floor, col == 1)
        if col == 1:
            for edge in entrance["walkingEdgesAtMainHallTerminal"]:
                draw_line(ax, edge["pointsFeet"], color="#ce6541", linewidth=2, linestyle="--")
        ax.set_xlim(60, 112)
        ax.set_ylim(743, 795)
        ax.set_title(f"{floor['name']} · " + ("current guide overlay" if col == 0
                                             else "saved-path diagnostic"), loc="left", fontsize=13)
        for number in (["08-159", "10-1080", "10-1060"] if row == 0
                       else ["08-267", "10-2070", "10-2066"]):
            room = next(r for r in d["records"] if r["number"] == number)
            ps = room["ringsFeet"][0]
            cx = sum(p[0] for p in ps)/len(ps)
            cy = sum(p[1] for p in ps)/len(ps)
            if not (60 <= cx <= 112 and 743 <= cy <= 795):
                cx, cy = 70, 746
            ax.text(cx, cy, number, fontsize=9, ha="center", color="#263d34", clip_on=True,
                    bbox={"facecolor": "white", "alpha": .8, "edgecolor": "none", "pad": 1.5})
        point = entrance["mainHallTerminal"]["pointFeet"]
        ax.scatter([point[0]], [point[1]], color="#bb3f3f", s=65, facecolors="none", linewidths=2, zorder=10)
        ax.annotate("No saved walking edge\nfrom this doorway" if row == 0 else
                    "Original path lacks shared guide;\ncell lists offices/labs as owners",
                    xy=point[:2], xytext=(84, 752 if row == 0 else 786), fontsize=9,
                    color="#843a30", arrowprops={"arrowstyle": "->", "color": "#843a30"},
                    bbox={"facecolor": "white", "alpha": .9, "edgecolor": "none"})
fig.suptitle("UNBC · Building 08 to Building 10", x=.05, ha="left", fontsize=20, color="#20352e")
fig.legend([Line2D([0], [0], color="#287c83", lw=2),
            Line2D([0], [0], color="#7054a1", lw=2),
            Line2D([0], [0], color="#ce6541", lw=2, ls="--")],
           ["Displayed shared guide / passage", "Saved building connection", "Saved original fallback"],
           loc="lower center", bbox_to_anchor=(.5, .04), ncol=3, frameon=False)
fig.text(.05, .015, "Analytical view of unchanged saved source. Dashed originals are diagnostic, not newly approved routes.\n"
         "Doorway/graph connectivity and physical navigation acceptance are separate checks.", fontsize=9, color="#56685f")
fig.tight_layout(rect=(.03, .09, .99, .95))
fig.savefig(out/"building08-building10-diagnostic.png", dpi=160)
plt.close(fig)


def exact_collinear(a, b, c):
    ax, ay, bx, by, cx, cy = map(Fraction, [*a[:2], *b[:2], *c[:2]])
    return (bx-ax)*(cy-ay) == (by-ay)*(cx-ax)


overlap_report = []
example = None
for floor in d["floors"]:
    grouped = collections.defaultdict(list)
    for s in floor["segments"]:
        if s["role"] != "approach":
            grouped[(s.get("nativeCellId", s["edgeId"]), s["pointsFeet"][0][2])].append(s)
    exact_count, roundoff_count, examples = 0, 0, []
    for group in grouped.values():
        for i, first in enumerate(group):
            a, b = first["pointsFeet"]
            ux, uy = b[0]-a[0], b[1]-a[1]
            length = math.hypot(ux, uy)
            if length < 1e-6:
                continue
            for second in group[i+1:]:
                c, e = second["pointsFeet"]
                if max(min(a[0], b[0]), min(c[0], e[0])) > min(max(a[0], b[0]), max(c[0], e[0])) + 1e-9:
                    continue
                if max(min(a[1], b[1]), min(c[1], e[1])) > min(max(a[1], b[1]), max(c[1], e[1])) + 1e-9:
                    continue
                distance = lambda p: abs(ux*(p[1]-a[1])-uy*(p[0]-a[0]))/length
                if max(distance(c), distance(e)) > 1e-9:
                    continue
                t = sorted(((p[0]-a[0])*ux/length + (p[1]-a[1])*uy/length for p in [c, e]))
                overlap = min(length, t[1]) - max(0, t[0])
                if overlap < 1e-6:
                    continue
                exact = exact_collinear(a, b, c) and exact_collinear(a, b, e)
                exact_count += int(exact)
                roundoff_count += int(not exact)
                case = {"first": first, "second": second, "overlapFeet": overlap, "exactIEEECollinear": exact}
                if len(examples) < 5:
                    examples.append(case)
                if example is None or overlap > example[1]["overlapFeet"]:
                    example = (floor, case)
    overlap_report.append({"floor": floor["name"], "exactPartialOverlapPairs": exact_count,
                           "roundoffCollinearOverlapPairs": roundoff_count, "examples": examples})
summary = {"sourceIndoorSha256": d["sourceIndoorSha256"], "floors": overlap_report,
           "limits": ["Pairs, not unique duplicated length or route failures.",
                      "Roundoff-collinear means within 1e-9 ft; those are not certified exact coincidences.",
                      "No coordinates were merged or snapped; different cells/elevations are kept separate."]}
(out/"overlap-check.json").write_text(json.dumps(summary, indent=2)+"\n")
if example:
    floor, case = example
    points = case["first"]["pointsFeet"] + case["second"]["pointsFeet"]
    fig, ax = plt.subplots(figsize=(9, 7), facecolor="#fafbf9")
    draw_rooms(ax, floor)
    draw_overlay(ax, floor)
    draw_line(ax, case["first"]["pointsFeet"], color="#ce6541", linewidth=5, alpha=.65, label="Long segment")
    draw_line(ax, case["second"]["pointsFeet"], color="#2c61a0", linewidth=2, linestyle="--", label="Overlapping segment")
    ax.scatter([p[0] for p in points], [p[1] for p in points], s=45, color="#253e36", zorder=10)
    ax.set_xlim(min(p[0] for p in points)-8, max(p[0] for p in points)+8)
    ax.set_ylim(min(p[1] for p in points)-8, max(p[1] for p in points)+8)
    ax.set_title(f"{floor['name']} · same shared lane drawn in overlapping pieces", loc="left", fontsize=14)
    ax.legend(loc="upper right", frameon=False)
    fig.text(.08, .03, "Analytical source view. Markers show original segment ends; the source paths are unchanged.", fontsize=9)
    fig.tight_layout(rect=(.02, .05, .99, .99))
    fig.savefig(out/"overlapping-guides-diagnostic.png", dpi=160)
    plt.close(fig)
print(json.dumps([{k: v for k, v in r.items() if k != "examples"} for r in overlap_report], indent=2))
