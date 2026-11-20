#!/usr/bin/env python3
"""Plot exact saved guides for the accepted B10 doorway-station adjustment.

Run from any directory:
  python plot-accepted-station.py

All default inputs/outputs are relative to this script. Inputs must match the
pinned guide-file checksums. The optional receipt records current report hashes
without requiring compiler-binding metadata to remain unchanged after a rerun.
This figure is a compiler-geometry comparison, never a navigation admission.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Arc
from matplotlib.ticker import MultipleLocator
import numpy as np

BASE = Path(__file__).resolve().parent
EXPECTED_CONTROL_SHA256 = "283e947c94f516b8fa07e837c443b246d376e9be3d0f182040bfe5fdaafae2a2"
EXPECTED_CANDIDATE_SHA256 = "7684aa5006b2122f7d69ac0f77f53ac80e9b3f859f8cb64081363c209913e764"
EDGE_ID = "native-cell:24.278215:918:walk:arrival:rm-400176-0470be83f680|door:400176:2263214:1"
DOOR_POINT = [151.36124794567425, 855.2048334454364, 24.278215223097114]
METRES_PER_FOOT = 0.3048


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_input(path, expected):
    actual = sha256(path)
    if actual != expected:
        raise ValueError(f"Guide checksum mismatch for {path}: {actual}")
    value = json.loads(path.read_text())
    guides = {g["edgeId"]: g for g in value["guides"]}
    assert len(guides) == len(value["guides"])
    return value, guides


def compact(points):
    return [p for i, p in enumerate(points) if not i or p != points[i - 1]]


def branch_geometry(guide):
    a, b = guide["hallwayJoins"]
    points = guide["pointsFeet"]
    assert points[-1] == DOOR_POINT
    approach = compact(points[b:][::-1])
    core = compact(points[a:b + 1][::-1])
    u = np.asarray(approach[-1][:2]) - approach[-2][:2]
    v = np.asarray(core[1][:2]) - core[0][:2]
    cosine = abs(float(np.dot(u, v))) / (float(np.linalg.norm(u)) * float(np.linalg.norm(v)))
    angle = math.degrees(math.acos(min(1, max(0, cosine))))
    length = sum(math.dist(p[:2], q[:2]) for p, q in zip(approach, approach[1:]))
    return approach, core, angle, length * METRES_PER_FOOT


def core_bends(guides):
    count = 0
    for guide in guides.values():
        a, b = guide["hallwayJoins"]
        points = compact(guide["pointsFeet"][a:b + 1])
        for p, q, r in zip(points, points[1:], points[2:]):
            u = [q[i] - p[i] for i in range(2)]
            v = [r[i] - q[i] for i in range(2)]
            if math.hypot(*u) and math.hypot(*v):
                angle = abs(math.degrees(math.atan2(u[0] * v[1] - u[1] * v[0], sum(x * y for x, y in zip(u, v)))))
                count += angle > 5
    return count


def unique_segments(guides, only_core=False):
    segments = set()
    for guide in guides.values():
        points = guide["pointsFeet"]
        if only_core:
            a, b = guide["hallwayJoins"]
            points = points[a:b + 1]
        for p, q in zip(points, points[1:]):
            if p != q:
                segments.add(tuple(sorted((tuple(p), tuple(q)))))
    return sorted(segments)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--control", type=Path, default=Path("cell-918-control/prepared-routing.json"))
    parser.add_argument("--candidate", type=Path, default=Path("cell-918-retained/prepared-routing.json"))
    parser.add_argument("--output", type=Path, default=Path("accepted-station-comparison.png"))
    parser.add_argument("--receipt", type=Path, help="Optional receipt; omit until final compiler runs are frozen")
    args = parser.parse_args()
    control_path, candidate_path, output = (BASE / args.control, BASE / args.candidate, BASE / args.output)
    control, before = checked_input(control_path, EXPECTED_CONTROL_SHA256)
    candidate, after = checked_input(candidate_path, EXPECTED_CANDIDATE_SHA256)
    assert before.keys() == after.keys() and len(before) == 69
    assert control["sourceModelSha256"] == candidate["sourceModelSha256"]
    assert control["sourceGeometryKey"] == candidate["sourceGeometryKey"]
    report_paths = [p.parent / "report.json" for p in (control_path, candidate_path)]
    reports = [json.loads(p.read_text()) for p in report_paths]
    cell = reports[1]["cells"][0]
    assert cell["straightRunsWithdrawn"] is False
    assert cell["straightRunsComparison"]["newContactCount"] == 0
    assert cell["straightRunsComparison"]["missingGuideIds"] == []
    assert set(cell["guideIds"]) == after.keys()
    assert reports[0]["binding"]["compilerBinding"] == reports[1]["binding"]["compilerBinding"]
    geometry = [branch_geometry(guides[EDGE_ID]) for guides in (before, after)]
    direction = np.asarray(geometry[1][1][1][:2]) - geometry[1][1][0][:2]
    direction /= np.linalg.norm(direction)
    normal = np.asarray([-direction[1], direction[0]])
    basis = np.stack((direction, normal))
    origin = np.asarray(DOOR_POINT[:2])

    def local(points):
        return (np.asarray(points, dtype=float)[:, :2] - origin) @ basis.T * METRES_PER_FOOT

    plt.rcParams.update({
        "font.family": "DejaVu Sans", "font.size": 11,
        "axes.edgecolor": "#BAC4CD", "axes.labelcolor": "#465361",
        "xtick.color": "#66717E", "ytick.color": "#66717E",
        "savefig.facecolor": "white", "figure.facecolor": "white",
    })
    fig = plt.figure(figsize=(13.6, 8.4))
    fig.text(0.07, 0.945, "B10: accepted doorway branch adjustment", fontsize=22, weight="bold", color="#183343")
    fig.text(0.07, 0.905, "Same original doorway point  •  Terminal 2263214:1  •  Native cell 918", fontsize=12, color="#536474")
    colors = ["#B56825", "#007C86"]
    headings = ["Fresh control · straight runs off", "Accepted candidate · retained-path constraints"]
    axes = [fig.add_axes([x, 0.31, 0.40, 0.43]) for x in (0.07, 0.55)]
    for i, (ax, guides, geom, color) in enumerate(zip(axes, (before, after), geometry, colors)):
        x = (0.07, 0.55)[i]
        approach, core, angle, length = geom
        fig.text(x, 0.837, headings[i], fontsize=12.5, weight="bold", color="#394C5B")
        angle_label = f"{angle:.2f}°" if i == 0 else f"{angle:.0f}°"
        fig.text(x, 0.792, f"{angle_label} to the corridor  ·  {length:.3f} m branch", fontsize=17, weight="bold", color=color)
        for segments, line_color, width, z in [
            (unique_segments(guides), "#CDD6DD", 1.3, 1),
            (unique_segments(guides, True), "#7D929E", 2.0, 2),
        ]:
            for segment in segments:
                xy = local(segment)
                if max(xy[:, 0]) < -1.05 or min(xy[:, 0]) > 1.55 or max(xy[:, 1]) < -0.25 or min(xy[:, 1]) > 1.60:
                    continue
                ax.plot(xy[:, 0], xy[:, 1], color=line_color, linewidth=width, zorder=z, solid_capstyle="round")
        xy = local(approach)
        station = xy[-1]
        ax.plot(xy[:, 0], xy[:, 1], color=color, linewidth=3.4, zorder=5, solid_capstyle="round")
        ax.scatter(*station, s=98, facecolor="white", edgecolor=color, linewidth=2.8, zorder=8)
        ax.scatter(0, 0, s=58, facecolor="#233A49", edgecolor="white", linewidth=1.3, zorder=9)
        ax.annotate("Doorway point\nunchanged", xy=(0, 0), xytext=(0.25, -0.11), ha="left", va="top", fontsize=10.5, color="#304856")
        ax.annotate("Mapped station", xy=station, xytext=(station[0] + 0.12, 1.43), ha="center", va="bottom", fontsize=11, weight="bold", color=color,
                    arrowprops={"arrowstyle": "-", "color": color, "linewidth": 1.0, "shrinkA": 4, "shrinkB": 8})
        radius = 0.23
        if i == 0:
            ax.add_patch(Arc(station, 2 * radius, 2 * radius, theta1=180, theta2=180 + angle, color=color, linewidth=1.6, zorder=7))
        else:
            marker = np.asarray([[-radius, 0], [-radius, -radius], [0, -radius]]) + station
            ax.plot(marker[:, 0], marker[:, 1], color=color, linewidth=1.5, zorder=7)
        theta = math.radians(180 + angle / 2)
        label = station + 0.39 * np.asarray([math.cos(theta), math.sin(theta)])
        ax.text(*label, angle_label, ha="center", va="center", color=color, fontsize=12, weight="bold", bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.86, "pad": 1.8}, zorder=10)
        ax.set(xlim=(-1.05, 1.55), ylim=(-0.25, 1.60), xlabel="Local x (m)")
        if i == 0:
            ax.set_ylabel("Local y (m)")
        ax.set_aspect("equal", adjustable="box")
        ax.xaxis.set_major_locator(MultipleLocator(0.5))
        ax.yaxis.set_major_locator(MultipleLocator(0.5))
        ax.tick_params(labelsize=9.5, length=3)
        ax.grid(color="#E8EDF0", linewidth=0.7, zorder=0)
        ax.spines[["top", "right"]].set_visible(False)
    handles = [
        Line2D([], [], color="#CDD6DD", linewidth=2, label="Other saved guide paths"),
        Line2D([], [], color="#7D929E", linewidth=2.5, label="Saved corridor cores"),
        Line2D([], [], color="#233A49", marker="o", linestyle="none", markersize=6, label="Fixed doorway point"),
        Line2D([], [], color="#007C86", marker="o", markerfacecolor="white", linestyle="none", markersize=7, label="Mapped station"),
    ]
    fig.legend(handles=handles, loc="center", bbox_to_anchor=(0.5, 0.228), ncol=4, frameon=False, fontsize=10.5, columnspacing=2.1)
    bends = [core_bends(guides) for guides in (before, after)]
    fig.text(0.07, 0.164, f"Core bends > 5°: {bends[0]} → {bends[1]} across the same 69 guides. One doorway branch becomes perpendicular.", fontsize=12, weight="bold", color="#263E4D")
    fig.text(0.07, 0.117, "Full-source compiler geometry only — no current worker or browser qualification.", fontsize=11.5, color="#485F6E")
    fig.text(0.07, 0.075, "Same scale in both panels. Coordinates are translated to the fixed doorway and rotated together; no walls or enclosures are inferred.", fontsize=9.5, color="#667884")
    output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output, dpi=200, metadata={"Software": "matplotlib; plot-accepted-station.py"})
    plt.close(fig)
    summary = {
        "status": "compiler-geometry-figure-only", "navigationAuthority": False,
        "inputs": {str(p.relative_to(BASE)): sha256(p) for p in [control_path, candidate_path, *report_paths]},
        "scriptSha256": sha256(Path(__file__)), "outputSha256": sha256(output),
        "originalDoorPointFeet": DOOR_POINT, "localBasisRows": basis.tolist(),
        "control": {"angleDegrees": geometry[0][2], "branchMetres": geometry[0][3], "coreBendsOver5Degrees": bends[0]},
        "candidate": {"angleDegrees": geometry[1][2], "branchMetres": geometry[1][3], "coreBendsOver5Degrees": bends[1]},
        "sameGuideInventory": True, "currentWorkerOrBrowserQualification": False,
    }
    if args.receipt:
        (BASE / args.receipt).write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"output": str(output), **summary}, indent=2))


if __name__ == "__main__":
    main()
